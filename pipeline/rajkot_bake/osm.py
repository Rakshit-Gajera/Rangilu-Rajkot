"""Stage 2: clip the OSM extract to the bake bbox and split it into GeoParquet layers.

Every row keeps `osm_type` (n/w/r) and `osm_id`, plus the full tag set as JSON,
so later stages and corrections.yaml can always refer back to OSM.
"""

from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import geopandas as gpd
import osmium
import shapely
from shapely import wkb

from . import config as C

CLIPPED = "rajkot.osm.pbf"

# Columns promoted out of the tag JSON for convenient filtering.
COMMON_KEYS = ["name", "name:gu", "name:en", "wikidata"]


def clip(cfg: C.Config) -> Path:
    """Write a referentially complete extract of everything touching the bbox."""
    src = C.RAW / cfg["fetch"]["sources"]["osm"]["file"]
    out = C.RAW / "osm" / CLIPPED
    lon0, lat0, lon1, lat1 = cfg.bbox

    def inside(loc: osmium.osm.Location) -> bool:
        return loc.valid() and lon0 <= loc.lon <= lon1 and lat0 <= loc.lat <= lat1

    nodes: set[int] = set()
    ways: set[int] = set()
    with osmium.BackReferenceWriter(str(out), ref_src=str(src), overwrite=True,
                                    remove_tags=True, relation_depth=1) as writer:
        for obj in osmium.FileProcessor(str(src)).with_locations():
            if obj.is_node():
                if inside(obj.location):
                    nodes.add(obj.id)
                    writer.add(obj)
            elif obj.is_way():
                if any(n.ref in nodes for n in obj.nodes):
                    ways.add(obj.id)
                    writer.add(obj)
            elif obj.is_relation():
                if any((m.type == "n" and m.ref in nodes) or (m.type == "w" and m.ref in ways)
                       for m in obj.members):
                    writer.add(obj)
    print(f"  clipped -> {out} ({out.stat().st_size / 1e6:.1f} MB, {len(nodes)} nodes, {len(ways)} ways in bbox)")
    return out


def _layer_for(tags: dict[str, str], kind: str) -> list[str]:
    """Which layers an OSM object belongs to. `kind` is point, line or area."""
    layers = []
    if kind == "area":
        if "building" in tags or "building:part" in tags:
            layers.append("buildings")
        if (tags.get("natural") == "water" or "water" in tags or tags.get("landuse") in ("reservoir", "basin")
                or tags.get("waterway") == "riverbank"):
            layers.append("water_areas")
        if any(k in tags for k in ("landuse", "leisure", "natural", "amenity", "tourism", "aeroway")) \
                and "building" not in tags:
            layers.append("landuse")
        if tags.get("boundary") == "administrative" or "place" in tags:
            layers.append("boundaries")
        if tags.get("highway") == "pedestrian" or tags.get("area:highway"):
            layers.append("road_areas")
    if kind == "line":
        if "highway" in tags and tags.get("area") != "yes":
            layers.append("roads")
        if "railway" in tags:
            layers.append("rail")
        if "waterway" in tags:
            layers.append("waterways")
        if tags.get("natural") == "tree_row":
            layers.append("tree_rows")
        if "barrier" in tags:
            layers.append("barriers")
        if tags.get("man_made") in ("embankment", "dyke") or tags.get("waterway") == "dam":
            layers.append("embankments")
    if kind == "point":
        if tags.get("natural") == "tree":
            layers.append("trees")
        if "place" in tags:
            layers.append("places")
        if tags.get("highway") in ("traffic_signals", "crossing", "bus_stop", "street_lamp", "speed_camera") \
                or "traffic_calming" in tags:
            layers.append("road_points")
    # POIs: anything named or with a POI key, as a point (areas use their centroid later).
    if kind in ("point", "area") and any(k in tags for k in (
            "amenity", "shop", "tourism", "historic", "leisure", "office", "craft", "healthcare",
            "public_transport", "railway", "man_made", "religion")):
        if not (kind == "area" and "building" not in tags and "name" not in tags):
            layers.append("pois")
    return layers


def extract(cfg: C.Config) -> None:
    pbf = C.RAW / "osm" / CLIPPED
    wkbf = osmium.geom.WKBFactory()
    rows: dict[str, list[dict]] = defaultdict(list)

    def emit(layers: list[str], osm_type: str, osm_id: int, tags: dict[str, str], geom_wkb: str) -> None:
        g = wkb.loads(geom_wkb, hex=True)
        rec = {"osm_type": osm_type, "osm_id": osm_id,
               **{k.replace(":", "_"): tags.get(k) for k in COMMON_KEYS},
               "tags": json.dumps(tags, ensure_ascii=False), "geometry": g}
        for layer in layers:
            rows[layer].append(rec)

    fp = osmium.FileProcessor(str(pbf)).with_areas()
    for obj in fp:
        if not obj.tags:
            continue
        tags = {t.k: t.v for t in obj.tags}
        try:
            if obj.is_node():
                layers = _layer_for(tags, "point")
                if layers:
                    emit(layers, "n", obj.id, tags, wkbf.create_point(obj))
            elif obj.is_way():
                layers = _layer_for(tags, "line")
                if layers and len(obj.nodes) >= 2:
                    emit(layers, "w", obj.id, tags, wkbf.create_linestring(obj))
            elif obj.is_area():
                layers = _layer_for(tags, "area")
                if layers:
                    emit(layers, "w" if obj.from_way() else "r", obj.orig_id(), tags,
                         wkbf.create_multipolygon(obj))
        except (osmium.InvalidLocationError, RuntimeError):
            continue  # incomplete geometry at the clip edge

    for layer, recs in rows.items():
        gdf = gpd.GeoDataFrame(recs, geometry="geometry", crs="EPSG:4326").to_crs(cfg.crs)
        gdf["geometry"] = shapely.make_valid(gdf.geometry.values)
        out = C.interim(f"osm_{layer}.parquet")
        gdf.to_parquet(out)
        print(f"  {layer:12s} {len(gdf):8d} -> {out.name}")


def run(cfg: C.Config) -> None:
    stamp = C.RAW / "osm" / (CLIPPED + ".json")
    want = {"bbox": list(cfg.bbox), "source": cfg["fetch"]["sources"]["osm"]["file"]}
    if not (C.RAW / "osm" / CLIPPED).exists() or not stamp.exists() or C.read_json(stamp) != want:
        clip(cfg)
        C.write_json(stamp, want)
    extract(cfg)
