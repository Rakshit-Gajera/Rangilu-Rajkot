"""Stage: trees as points (PROMPT §7.9). Output data/interim/trees.parquet (x, n, species, scale).

Placement:
  * OSM natural=tree nodes and tree_row ways, exactly;
  * parks and gardens: Poisson-disc spacing 8-12 m;
  * street trees along residential/tertiary/unclassified roads: every 12-25 m on both sides,
    40-70 % of spots filled, skipping junctions, road surfaces and buildings;
  * a scatter of babool/prosopis along farm edges in the outskirts (zone 7).
Species: neem by default; peepal/banyan near temples and in the old city; gulmohar mixed in;
ashoka at schools/colleges/hospitals; palms in bungalow societies; prosopis (babool) in the outskirts.
"""

from __future__ import annotations

import json

import geopandas as gpd
import numpy as np
import shapely
from shapely import STRtree

from . import config as C

SPECIES = ["neem", "peepal", "banyan", "gulmohar", "ashoka", "palm", "prosopis"]
S = {k: v for v, k in enumerate(SPECIES)}
STREET_CLASSES = {"residential", "tertiary", "unclassified", "living_street", "secondary"}
PARKS = {("leisure", "park"), ("leisure", "garden"), ("landuse", "recreation_ground"), ("landuse", "grass"),
         ("leisure", "recreation_ground"), ("landuse", "village_green")}


def poisson(poly, spacing: float, rng: np.random.Generator) -> np.ndarray:
    """Bridson-style dart throwing inside a polygon (good enough for parks)."""
    x0, y0, x1, y1 = poly.bounds
    n_try = int(poly.area / (spacing * spacing) * 3) + 1
    cand = np.column_stack([rng.uniform(x0, x1, n_try), rng.uniform(y0, y1, n_try)])
    cand = cand[shapely.contains_xy(poly, cand[:, 0], cand[:, 1])]
    keep: list[np.ndarray] = []
    grid: dict[tuple, list] = {}
    cell = spacing / np.sqrt(2)
    for p in cand:
        gi, gj = int(p[0] // cell), int(p[1] // cell)
        ok = True
        for di in (-2, -1, 0, 1, 2):
            for dj in (-2, -1, 0, 1, 2):
                for q in grid.get((gi + di, gj + dj), ()):
                    if (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < spacing * spacing:
                        ok = False
                        break
                if not ok:
                    break
            if not ok:
                break
        if ok:
            keep.append(p)
            grid.setdefault((gi, gj), []).append(p)
    return np.array(keep).reshape(-1, 2)


def run(cfg: C.Config) -> None:
    rng = np.random.default_rng(20261010)
    bounds = gpd.read_parquet(C.interim("bounds.parquet")).set_index("kind").geometry
    playable = bounds["playable"]
    roads = gpd.read_parquet(C.interim("roads.parquet"))
    b = gpd.read_parquet(C.interim("buildings_c.parquet"))
    pts: list[np.ndarray] = []
    kinds: list[np.ndarray] = []

    # 1. OSM trees and tree rows.
    t = gpd.read_parquet(C.interim("osm_trees.parquet"))
    if len(t):
        pts.append(shapely.get_coordinates(t.geometry.values))
        kinds.append(np.full(len(t), -1))
    tr = gpd.read_parquet(C.interim("osm_tree_rows.parquet")) if C.interim("osm_tree_rows.parquet").exists() else []
    for line in getattr(tr, "geometry", []):
        n = max(2, int(line.length // 8))
        pts.append(shapely.get_coordinates(shapely.line_interpolate_point(line, np.linspace(0, line.length, n))))
        kinds.append(np.full(n, -1))

    # 2. Parks and gardens.
    lu = gpd.read_parquet(C.interim("osm_landuse.parquet"))
    lt = lu.tags.map(json.loads)
    parks = lu[lt.map(lambda d: any((k, d.get(k)) in PARKS for k in ("leisure", "landuse")))]
    for poly in parks.geometry.values:
        for part in getattr(poly, "geoms", [poly]):
            if part.area < 200:
                continue
            p = poisson(part.buffer(-3), rng.uniform(8, 12), rng)
            if len(p):
                pts.append(p)
                kinds.append(np.full(len(p), -2))

    # 3. Street trees on both sides of smaller roads.
    st = roads[roads.highway.isin(STREET_CLASSES) & ~roads.bridge]
    for line, w in zip(st.geometry.values, st.width.values):
        L = line.length
        if L < 30:
            continue
        step = rng.uniform(12, 25)
        s = np.arange(10, L - 10, step)  # keep 10 m clear of each end (junctions)
        if not len(s):
            continue
        p = shapely.get_coordinates(shapely.line_interpolate_point(line, s))
        q = shapely.get_coordinates(shapely.line_interpolate_point(line, np.minimum(s + 1, L)))
        d = q - p
        d /= np.maximum(np.hypot(d[:, 0], d[:, 1]), 1e-6)[:, None]
        nrm = np.column_stack([-d[:, 1], d[:, 0]])
        off = w / 2 + rng.uniform(1.5, 2.8, len(s))
        fill = rng.uniform(0.4, 0.7)
        for side in (1, -1):
            keep = rng.random(len(s)) < fill
            pts.append(p[keep] + side * nrm[keep] * off[keep, None])
            kinds.append(np.full(int(keep.sum()), -3))

    xy = np.vstack(pts)
    source = np.concatenate(kinds)
    inside = shapely.contains_xy(playable, xy[:, 0], xy[:, 1])
    xy, source = xy[inside], source[inside]

    # Never inside a building or on a road surface (OSM trees excepted: they are surveyed).
    surf = shapely.union_all(shapely.buffer(roads.geometry.values, roads.width.values / 2 + 0.8, cap_style="flat"))
    on_road = shapely.contains_xy(surf, xy[:, 0], xy[:, 1])
    btree = STRtree(b.geometry.values)
    hit, _ = btree.query(shapely.buffer(shapely.points(xy), 1.2), predicate="intersects")
    in_bldg = np.zeros(len(xy), bool)
    in_bldg[hit] = True
    ok = (source == -1) | (~on_road & ~in_bldg)
    xy, source = xy[ok], source[ok]

    # Species from surroundings.
    zone_of = np.full(len(xy), 3)
    near_b, bi = btree.query_nearest(shapely.points(xy), max_distance=40, all_matches=False)
    zone_of[near_b] = b.zone.values[bi]
    use_of = np.full(len(xy), "", object)
    use_of[near_b] = b.use.values[bi]
    r = rng.random(len(xy))
    species = np.full(len(xy), S["neem"])
    species[r < 0.12] = S["gulmohar"]
    temple = use_of == "religious"
    species[temple & (r < 0.6)] = S["peepal"]
    species[temple & (r >= 0.6) & (r < 0.8)] = S["banyan"]
    old = zone_of == 1
    species[old & (r > 0.75)] = S["peepal"]
    inst = np.isin(use_of, ["educational", "healthcare", "civic"])
    species[inst & (r < 0.45)] = S["ashoka"]
    bungalow = (zone_of == 3) & (source == -3)
    species[bungalow & (r > 0.97)] = S["palm"]
    species[(zone_of == 7) & (r < 0.65)] = S["prosopis"]
    species[(source == -2) & (r > 0.85)] = S["banyan"]
    scale = np.clip(rng.normal(1.0, 0.18, len(xy)), 0.6, 1.5)
    scale[species == S["banyan"]] *= 1.35

    g = gpd.GeoDataFrame({"species": species.astype("uint8"), "scale": scale.astype("float32")},
                         geometry=shapely.points(xy), crs=cfg.crs)
    g.to_parquet(C.interim("trees.parquet"))
    counts = {SPECIES[k]: int(v) for k, v in zip(*np.unique(species, return_counts=True))}
    print(f"  trees: {len(g):,} (OSM {int((source == -1).sum())}, parks {int((source == -2).sum()):,}, "
          f"street {int((source == -3).sum()):,}); species {counts}")
