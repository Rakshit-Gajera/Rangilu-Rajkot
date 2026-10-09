"""Stage 3: building clean + conflate (PROMPT §7.4).

Overture is the primary set; OSM tags are re-attached by OSM id (Overture keeps
the OSM record id) or by overlap. Output: data/interim/buildings.parquet.
"""

from __future__ import annotations

import json

import duckdb
import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely import STRtree

from . import config as C
from . import geom

DRIVABLE = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
            "living_street", "service", "pedestrian", "road",
            "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}
ARTERIAL = {"motorway", "trunk", "primary", "secondary",
            "motorway_link", "trunk_link", "primary_link", "secondary_link"}
SRC_CODE = {"OpenStreetMap": "osm", "Microsoft ML Buildings": "ms", "Google Open Buildings": "gob"}


def _load_overture(cfg: C.Config, playable: shapely.Geometry) -> gpd.GeoDataFrame:
    con = duckdb.connect()
    con.sql("INSTALL spatial; LOAD spatial;")
    src = (C.RAW / cfg["fetch"]["sources"]["overture_buildings"]["file"]).as_posix()
    df = con.sql(f"""
        select id as overture_id, sources[1].dataset as dataset, sources[1].record_id as record_id,
               height as ov_height, num_floors as ov_floors, subtype as ov_subtype, class as ov_class,
               roof_shape as ov_roof, names.primary as ov_name, ST_AsWKB(geometry) as wkb
        from read_parquet('{src}') where not coalesce(is_underground, false)""").df()
    g = gpd.GeoDataFrame(df.drop(columns="wkb"), geometry=shapely.from_wkb(df.wkb.map(bytes)),
                         crs="EPSG:4326").to_crs(cfg.crs)
    g = g[g.representative_point().within(playable)]
    g["src"] = g.dataset.map(SRC_CODE).fillna("other")
    rid = g.record_id.fillna("").str.extract(r"^([nwr])(\d+)")
    is_osm = g.dataset.eq("OpenStreetMap") & rid[0].notna()
    g["osm_type"] = rid[0].where(is_osm)
    g["osm_id"] = pd.to_numeric(rid[1].where(is_osm)).astype("Int64")
    return g


def _explode_clean(g: gpd.GeoDataFrame, min_area: float) -> gpd.GeoDataFrame:
    g = g.copy()
    g["geometry"] = shapely.make_valid(g.geometry.values)
    g = g.explode(index_parts=True)
    g = g[g.geom_type == "Polygon"]
    tagged = g.osm_id.notna()
    g = g[(g.area >= min_area) | tagged]
    # Unique, stable building id: source + record + part index.
    part = g.index.get_level_values(1)
    base = np.where(g.osm_id.notna(), g.osm_type.fillna("") + g.osm_id.astype(str), g.overture_id)
    g["bid"] = [b if p == 0 else f"{b}_{p}" for b, p in zip(base, part)]
    return g.reset_index(drop=True)


def _attach_osm(g: gpd.GeoDataFrame, osm: gpd.GeoDataFrame, iou_min: float) -> gpd.GeoDataFrame:
    osm = osm.copy()
    osm["geometry"] = shapely.make_valid(osm.geometry.values)
    osm = osm.explode(index_parts=False)
    osm = osm[osm.geom_type == "Polygon"].reset_index(drop=True)
    key = osm.osm_type + osm.osm_id.astype(str)
    tags_by_key = dict(zip(key, osm.tags))
    gkey = g.osm_type.fillna("") + g.osm_id.astype("string").fillna("")
    g["tags"] = gkey.map(tags_by_key)

    # Overlap match for buildings without an OSM id.
    tree = STRtree(osm.geometry.values)
    no_tag = np.flatnonzero(g.tags.isna().values)
    gi, oi = tree.query(g.geometry.values[no_tag], predicate="intersects")
    best: dict[int, tuple[float, int]] = {}
    for a, b in zip(no_tag[gi], oi):
        v = geom.iou(g.geometry.values[a], osm.geometry.values[b])
        if v > iou_min and v > best.get(a, (0, -1))[0]:
            best[a] = (v, b)
    for a, (_, b) in best.items():
        g.at[a, "tags"] = osm.tags.values[b]
        g.at[a, "osm_type"], g.at[a, "osm_id"] = osm.osm_type.values[b], osm.osm_id.values[b]
    print(f"  OSM tags: {int(g.tags.notna().sum())} by id/overlap ({len(best)} by overlap)")

    # OSM buildings Overture doesn't have at all.
    used = set(gkey) | {f"{g.osm_type[a]}{g.osm_id[a]}" for a in best}
    missing = osm[~key.isin(used)]
    gtree = STRtree(g.geometry.values)
    mi, gj = gtree.query(missing.geometry.values, predicate="intersects")
    covered = {i for i, j in zip(mi, gj) if geom.iou(missing.geometry.values[i], g.geometry.values[j]) > iou_min}
    add = missing.iloc[[i for i in range(len(missing)) if i not in covered]]
    if len(add):
        extra = gpd.GeoDataFrame({
            "bid": add.osm_type + add.osm_id.astype(str), "src": "osm", "osm_type": add.osm_type,
            "osm_id": add.osm_id.astype("Int64"), "tags": add.tags, "geometry": add.geometry}, crs=g.crs)
        g = pd.concat([g, extra], ignore_index=True)
    print(f"  added {len(add)} OSM-only buildings")
    return g


def _dedupe(g: gpd.GeoDataFrame, iou_min: float) -> gpd.GeoDataFrame:
    tree = STRtree(g.geometry.values)
    a, b = tree.query(g.geometry.values, predicate="intersects")
    keep = a < b
    a, b = a[keep], b[keep]
    geoms = g.geometry.values
    inter = shapely.area(shapely.intersection(geoms[a], geoms[b]))
    union = shapely.area(geoms[a]) + shapely.area(geoms[b]) - inter
    dup = inter / union > iou_min
    is_osm = g.tags.notna().values
    drop = set()
    for i, j in zip(a[dup], b[dup]):
        # Keep the OSM-tagged one, else the larger.
        loser = j if (is_osm[i] and not is_osm[j]) or (is_osm[i] == is_osm[j] and geoms[i].area >= geoms[j].area) else i
        drop.add(loser)
    # Also report remaining overlap share for the QA check.
    g = g.drop(index=list(drop)).reset_index(drop=True)
    print(f"  removed {len(drop)} duplicates")
    return g


def _resolve_overlaps(g: gpd.GeoDataFrame, min_area: float) -> gpd.GeoDataFrame:
    """Neighbouring AI outlines often overlap slightly. Drop near-duplicates and
    clip the lower-priority outline (non-OSM, then smaller) so the pair shares a wall."""
    geoms = g.geometry.values.copy()
    is_osm = g.tags.notna().values
    i, j = STRtree(geoms).query(geoms, predicate="intersects")
    keep = i < j
    i, j = i[keep], j[keep]
    drop = np.zeros(len(g), bool)
    clipped = 0
    # Process larger overlaps first so later clips see updated geometry.
    for a, b in zip(i, j):
        if drop[a] or drop[b]:
            continue
        ga, gb = geoms[a], geoms[b]
        inter = ga.intersection(gb).area
        if inter <= 0.05:
            continue
        win, lose = (a, b) if (is_osm[a] and not is_osm[b]) or (is_osm[a] == is_osm[b] and ga.area >= gb.area) else (b, a)
        if inter / min(ga.area, gb.area) > 0.5:
            drop[lose] = True
            continue
        rest = shapely.make_valid(geoms[lose].difference(geoms[win]))
        polys = [p for p in getattr(rest, "geoms", [rest]) if p.geom_type == "Polygon"]
        if not polys or max(p.area for p in polys) < min_area:
            drop[lose] = True
        else:
            geoms[lose] = max(polys, key=lambda p: p.area)
            clipped += 1
    g = g.copy()
    g["geometry"] = geoms
    print(f"  overlaps: clipped {clipped}, dropped {int(drop.sum())}")
    return g[~drop].reset_index(drop=True)


def _square_and_simplify(g: gpd.GeoDataFrame, tol: float, ang: float) -> gpd.GeoDataFrame:
    geoms = g.geometry.values
    tree = STRtree(geoms)
    a, b = tree.query(geoms, predicate="dwithin", distance=0.05)
    touching = np.zeros(len(g), bool)
    touching[a[a != b]] = True
    squared = np.zeros(len(g), bool)
    out = geoms.copy()
    ai = g.tags.isna().values  # AI-detected outlines only
    for k in np.flatnonzero(ai & ~touching):
        sq = geom.square_polygon(geoms[k], ang)
        if sq is not None:
            out[k], squared[k] = sq, True
    iso = ~touching & ~squared
    out[iso] = shapely.simplify(out[iso], tol, preserve_topology=True)
    # Touching buildings: simplify as a coverage so shared walls stay identical.
    idx = np.flatnonzero(touching)
    if len(idx):
        simp = shapely.coverage_simplify(out[idx], tol, simplify_boundary=True)
        ok = shapely.is_valid(simp) & (shapely.area(simp) > 0.8 * shapely.area(out[idx]))
        out[idx[ok]] = simp[ok]
    g = g.copy()
    g["geometry"] = out
    g["squared"] = squared
    g["touching"] = touching
    print(f"  squared {squared.sum()}, touching (shared-wall) {touching.sum()}")
    return g


def _metrics(g: gpd.GeoDataFrame, roads: gpd.GeoDataFrame, front_d: float) -> gpd.GeoDataFrame:
    geoms = g.geometry.values
    g["area"] = shapely.area(geoms)
    g["perimeter"] = shapely.length(geoms)
    g["compactness"] = 4 * np.pi * g.area / g.perimeter ** 2
    g["orientation"] = [round(np.degrees(geom.dominant_angle(p)), 1) for p in geoms]

    # Road surfaces: centreline buffered by half the carriageway width.
    rtags = roads.tags.map(json.loads)
    roads = roads[rtags.map(lambda t: t.get("highway") in DRIVABLE)].copy()
    rt = roads.tags.map(json.loads)
    roads["half_w"] = [geom.road_width(t)[0] / 2 for t in rt]
    road_poly = shapely.buffer(roads.geometry.values, roads.half_w.values, cap_style="flat")
    road_dir = []
    for line in roads.geometry.values:
        c = np.asarray(line.coords)
        d = c[-1] - c[0]
        road_dir.append(np.degrees(np.arctan2(d[1], d[0])) % 180)
    road_dir = np.asarray(road_dir)
    road_tree = STRtree(road_poly)

    # Explode exterior edges.
    owner, segs, mids, dirs = [], [], [], []
    for k, p in enumerate(geoms):
        c = np.asarray(p.exterior.coords)
        a, b = c[:-1], c[1:]
        owner.extend([k] * len(a))
        mids.append((a + b) / 2)
        dirs.append(np.degrees(np.arctan2(b[:, 1] - a[:, 1], b[:, 0] - a[:, 0])) % 180)
        segs.append(np.hypot(*(b - a).T))
    owner = np.asarray(owner)
    mids = np.vstack(mids)
    dirs = np.concatenate(dirs)
    segs = np.concatenate(segs)
    pts = shapely.points(mids)

    # Shared walls: edge midpoint on another building's boundary.
    btree = STRtree(shapely.boundary(geoms))
    e, o = btree.query(pts, predicate="dwithin", distance=0.3)
    shared = np.zeros(len(pts), bool)
    shared[e[o != owner[e]]] = True

    # Frontage: edge near a road surface and roughly parallel to it.
    e, r = road_tree.query_nearest(pts, max_distance=front_d, all_matches=False)
    dd = np.abs(dirs[e] - road_dir[r])
    parallel = np.minimum(dd, 180 - dd) < 30
    front = np.zeros(len(pts), bool)
    front_road = np.full(len(pts), -1)
    sel = e[parallel & ~shared[e]]
    front[sel] = True
    front_road[sel] = r[parallel & ~shared[e]]

    kinds = np.where(shared, "S", np.where(front, "F", "B"))
    starts = np.r_[0, np.cumsum(np.bincount(owner, minlength=len(g)))[:-1]]
    counts = np.bincount(owner, minlength=len(g))
    g["edge_kinds"] = ["".join(kinds[s:s + n]) for s, n in zip(starts, counts)]
    g["frontage_m"] = np.bincount(owner, weights=segs * front, minlength=len(g)).round(1)
    corner = np.zeros(len(g), bool)
    for k, s, n in zip(range(len(g)), starts, counts):
        rr = front_road[s:s + n]
        ds = dirs[s:s + n][rr >= 0]
        if len(ds) >= 2:
            diff = np.abs(ds[:, None] - ds[None, :])
            corner[k] = (np.minimum(diff, 180 - diff) > 45).any()
    g["corner"] = corner

    art = roads[rt.map(lambda t: t.get("highway") in ARTERIAL)]
    atree = STRtree(art.geometry.values)
    cent = shapely.centroid(geoms)
    _, dist = atree.query_nearest(cent, return_distance=True, all_matches=False)
    g["dist_arterial"] = dist.round(1)
    return g


def run(cfg: C.Config) -> None:
    bc = cfg["buildings"]
    bounds = gpd.read_parquet(C.interim("bounds.parquet"))
    playable = bounds.loc[bounds.kind == "playable", "geometry"].iloc[0]

    g = _load_overture(cfg, playable)
    print(f"  overture in playable: {len(g)} ({g.src.value_counts().to_dict()})")
    osm = gpd.read_parquet(C.interim("osm_buildings.parquet"))
    osm = osm[osm.representative_point().within(playable)]
    g = _explode_clean(g, bc["min_area"])
    g = _attach_osm(g, osm, bc["iou_match"])
    g = _dedupe(g, bc["iou_match"])
    g = _resolve_overlaps(g, bc["min_area"])
    g = _square_and_simplify(g, bc["simplify_tolerance"], bc["square_angle_tolerance"])
    g = g[shapely.is_valid(g.geometry.values) & (g.area > 0)].reset_index(drop=True)

    tags = g.tags.map(lambda t: json.loads(t) if isinstance(t, str) else {})
    btype = tags.map(lambda t: t.get("building", ""))
    g["giant"] = (g.area > bc["giant_area"]) & ~btype.isin(["industrial", "warehouse", "university",
                                                            "college", "school", "hospital"])
    roads = gpd.read_parquet(C.interim("osm_roads.parquet"))
    g = _metrics(g, roads, bc["frontage_distance"])
    g["seed"] = g.bid.map(geom.seed_of).astype("uint32")
    g["tags"] = g.tags.fillna("{}")
    cols = ["bid", "src", "osm_type", "osm_id", "overture_id", "tags", "ov_height", "ov_floors", "ov_subtype",
            "ov_class", "ov_roof", "ov_name", "area", "perimeter", "compactness", "orientation", "edge_kinds",
            "frontage_m", "corner", "touching", "squared", "giant", "dist_arterial", "seed", "geometry"]
    g = gpd.GeoDataFrame(g[cols], geometry="geometry", crs=cfg.crs)
    g.to_parquet(C.interim("buildings.parquet"))
    print(f"  buildings: {len(g)}; giant flagged: {int(g.giant.sum())}; "
          f"with frontage: {int((g.frontage_m > 0).sum())}; corner: {int(g.corner.sum())}")
