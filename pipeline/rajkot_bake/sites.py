"""Landmark model sites (PROMPT §7.11, §13 P3): where each hand-built landmark model stands.

Called by the tiler. For each landmark with a model:
  * building-like models (museum, station, palace, temple, ...) take the footprint of the real building at
    the landmark (the mapped outline, the building containing the point, or the nearest within 40 m):
    its centre, size and orientation; that generic building is dropped from the tiles;
  * gates (parks, campuses) stand on the edge of the site nearest a main road, facing it;
  * with no building found, a default-sized model faces the nearest road.
Output: data/interim/landmark_sites.json — [{id, model, name, x, n, w, d, angle, fx, fn}] relative to the origin;
angle = long axis (radians, from +x towards +n); (fx, fn) = unit vector the front faces.
"""

from __future__ import annotations

import math

import geopandas as gpd
import numpy as np
import shapely
import shapely.ops
from shapely.strtree import STRtree

from . import config as C

# id -> (model, default width, default depth). Width runs along the front.
MODELS: dict[str, tuple[str, float, float]] = {
    "watson_museum": ("museum", 40, 22),
    "gandhi_museum": ("colonial_school", 60, 18),
    "rajkumar_college": ("palace", 70, 24),
    "rajkot_junction": ("station", 90, 16),
    "bhaktinagar_station": ("station", 50, 12),
    "kaba_gandhi_no_delo": ("haveli", 16, 14),
    "darbargadh": ("palace_gate", 30, 18),
    "dolls_museum": ("dolls", 24, 16),
    "baps_kalawad": ("temple", 40, 40),
    "trimandir": ("temple", 36, 36),
    "darshan_university": ("campus", 70, 22),
    "cricket_ground": ("pavilion", 40, 14),
    "old_airport": ("terminal", 60, 20),
    "bal_bhavan": ("gate", 12, 3),
    "jubilee_garden": ("gate", 10, 3),
    "saurashtra_university": ("gate", 16, 3),
    "pradyuman_park": ("gate", 12, 3),
    "ishwariya_park": ("gate", 12, 3),
    "atal_sarovar": ("ferris", 30, 10),
    "race_course": ("gate", 10, 3),
}
GATE_LIKE = {"gate", "ferris"}


def _rect(poly: shapely.Geometry) -> tuple[float, float, float, float, float]:
    """Centre x, y, width (long side), depth, angle of the long side."""
    r = shapely.minimum_rotated_rectangle(poly)
    c = np.asarray(r.exterior.coords)[:4]
    e0, e1 = c[1] - c[0], c[2] - c[1]
    l0, l1 = float(np.hypot(*e0)), float(np.hypot(*e1))
    long_edge = e0 if l0 >= l1 else e1
    cen = r.centroid
    return cen.x, cen.y, max(l0, l1), min(l0, l1), math.atan2(long_edge[1], long_edge[0])


def compute(cfg: C.Config, buildings: gpd.GeoDataFrame, roads: gpd.GeoDataFrame, ox: float, oy: float) -> tuple[list[dict], set[int]]:
    lm = gpd.read_parquet(C.interim("landmarks.parquet"))
    btree = STRtree(buildings.geometry.values)
    main = roads[(roads["rank"] >= 4) & ~roads.bridge & ~roads.tunnel]
    rtree = STRtree(main.geometry.values)
    sites, drop = [], set()
    for _, m in lm.iterrows():
        spec = MODELS.get(m["id"])
        g = m.geometry
        if spec is None or g is None or g.is_empty or not m.in_playable:
            continue
        model, dw, dd = spec
        anchor = g.representative_point() if g.geom_type not in ("Point", "MultiPoint") else shapely.centroid(g)
        road = main.geometry.values[rtree.nearest(anchor)]
        if model in GATE_LIKE:
            # On the site's edge nearest the road (or at the point), facing the road.
            area = g if g.geom_type in ("Polygon", "MultiPolygon") else anchor
            p_site, p_road = shapely.ops.nearest_points(area.boundary if area.geom_type != "Point" else area, road)
            fx, fn = p_road.x - p_site.x, p_road.y - p_site.y
            d = math.hypot(fx, fn) or 1.0
            fx, fn = fx / d, fn / d
            if model == "ferris":  # a little inside the park
                x, y = p_site.x - fx * 30, p_site.y - fn * 30
            else:  # just inside the boundary, clear of the carriageway
                x, y = p_site.x - fx * 2, p_site.y - fn * 2
                if d < 6:
                    x, y = p_road.x - fx * 8, p_road.y - fn * 8
            w, dep, ang = dw, dd, math.atan2(-fx, fn)  # long axis across the facing direction
            for k in btree.query(shapely.Point(x, y).buffer(max(w, dep) * 0.7)):
                drop.add(int(k))
        else:
            # Fit to the real building.
            cand = []
            if g.geom_type in ("Polygon", "MultiPolygon"):
                cand = [int(k) for k in btree.query(g, predicate="intersects")]
            if not cand:
                cand = [int(k) for k in btree.query(anchor, predicate="intersects")]
            if not cand:
                near = btree.query(anchor.buffer(40))
                cand = sorted((int(k) for k in near), key=lambda k: buildings.geometry.values[k].distance(anchor))[:1]
            if cand:
                k = max(cand, key=lambda k: buildings.geometry.values[k].area)
                x, y, w, dep, ang = _rect(buildings.geometry.values[k])
                w, dep = min(max(w, dw * 0.5), dw * 2.5), min(max(dep, dd * 0.5), dd * 2.5)
                drop.add(k)
                for j in btree.query(buildings.geometry.values[k].buffer(1.0), predicate="intersects"):
                    if buildings.geometry.values[int(j)].centroid.within(buildings.geometry.values[k].buffer(2.0)):
                        drop.add(int(j))
            else:
                p_road = shapely.ops.nearest_points(anchor, road)[1]
                vx, vy = anchor.x - p_road.x, anchor.y - p_road.y
                d = math.hypot(vx, vy) or 1.0
                x, y = p_road.x + vx / d * (dd / 2 + 10), p_road.y + vy / d * (dd / 2 + 10)
                w, dep, ang = dw, dd, math.atan2(vx / d, -vy / d)
            # Front faces the nearest main road (perpendicular to the long axis).
            nx, ny = -math.sin(ang), math.cos(ang)
            p_road = shapely.ops.nearest_points(shapely.Point(x, y), road)[1]
            if (p_road.x - x) * nx + (p_road.y - y) * ny < 0:
                nx, ny = -nx, -ny
            fx, fn = nx, ny
        sites.append({"id": m["id"], "model": model, "name": m["name"], "x": round(x - ox, 1), "n": round(y - oy, 1),
                      "w": round(w, 1), "d": round(dep, 1), "angle": round(ang, 4), "fx": round(fx, 4), "fn": round(fn, 4)})
    C.write_json(C.interim("landmark_sites.json"), sites)
    print(f"  landmark models: {len(sites)} sites, {len(drop)} generic buildings replaced")
    return sites, drop
