"""Stage 10 (early): resolve landmarks.yaml refs to positions/outlines."""

from __future__ import annotations

import re

import geopandas as gpd
import shapely
import yaml
from pyproj import Transformer
from shapely.geometry import Point

from . import config as C

LAYERS = ["landuse", "buildings", "pois", "boundaries", "water_areas", "roads", "rail"]


def run(cfg: C.Config) -> None:
    spec = yaml.safe_load((C.PIPELINE_DIR / "landmarks.yaml").read_text(encoding="utf-8"))["landmarks"]
    to_utm = Transformer.from_crs("EPSG:4326", cfg.crs, always_xy=True)
    osm = {L: gpd.read_parquet(C.interim(f"osm_{L}.parquet")) for L in LAYERS}
    lakes = gpd.read_parquet(C.interim("lakes.parquet"))
    bounds = gpd.read_parquet(C.interim("bounds.parquet"))
    playable = bounds.loc[bounds.kind == "playable", "geometry"].iloc[0]

    rows = []
    for lm in spec:
        geoms = []
        for ref in lm.get("refs") or []:
            if "osm" in ref:
                t, i = ref["osm"][0], int(ref["osm"][1:])
                for g in osm.values():
                    hit = g[(g.osm_type == t) & (g.osm_id == i)]
                    if len(hit):
                        geoms.append(hit.geometry.iloc[0])
                        break
            elif "overture" in ref or "point" in ref:
                geoms.append(Point(*to_utm.transform(*(ref.get("overture") or ref["point"]))))
            elif "lake" in ref:
                hit = lakes[lakes.name == ref["lake"]]
                if len(hit):
                    geoms.append(hit.geometry.iloc[0])
            elif "osm_road_name" in ref:
                r = osm["roads"]
                hit = r[r.name.fillna("").str.contains(ref["osm_road_name"], flags=re.I)]
                if len(hit):
                    geoms.append(shapely.union_all(hit.geometry.values))
        if geoms and lm.get("ambiguous"):
            g, status = shapely.union_all(geoms), "ambiguous"
        elif geoms:
            g = shapely.union_all(geoms)
            status = "located" if lm["confidence"] == "high" else "approx"
        else:
            g, status = None, "missing"
        rows.append({"id": lm["id"], "name": lm["name"], "confidence": lm["confidence"], "status": status,
                     "in_playable": bool(g is not None and g.intersects(playable)),
                     "note": lm.get("note", ""), "geometry": g})
    out = gpd.GeoDataFrame(rows, geometry="geometry", crs=cfg.crs)
    out.to_parquet(C.interim("landmarks.parquet"))
    for s in ("located", "approx", "ambiguous", "missing"):
        ids = out.loc[out.status == s, "id"].tolist()
        print(f"  {s:8s} {len(ids):2d}: {', '.join(ids)}")
    outside = out.loc[(out.status != "missing") & ~out.in_playable, "id"].tolist()
    if outside:
        print(f"  outside playable area: {outside}")
