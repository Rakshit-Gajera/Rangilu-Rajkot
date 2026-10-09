"""Pure geometry / rule helpers shared by bake stages (unit-tested in tests/)."""

from __future__ import annotations

import hashlib
import math
import re

import numpy as np
import shapely
from shapely.geometry import LineString, Polygon

FEET = 0.3048
_WIDTH_IN_NAME = re.compile(r"(\d+)\s*(?:ft|feet|fit|foot)\b", re.IGNORECASE)

# Carriageway width defaults by OSM highway class (PROMPT §7.7), metres.
CLASS_WIDTH = {
    "motorway": 14.0, "trunk": 14.0, "primary": 14.0, "secondary": 10.0, "tertiary": 8.0,
    "unclassified": 6.0, "residential": 6.0, "living_street": 5.0, "service": 4.0, "track": 3.5,
}
LANE_WIDTH = 3.2
CARRIAGEWAY_SHARE = 0.70  # of right-of-way, for roads named "N Feet Road"


def seed_of(key: str) -> int:
    """Stable 32-bit seed for an object id (same on every run and platform)."""
    return int.from_bytes(hashlib.blake2b(key.encode(), digest_size=4).digest(), "little")


def _parse_metres(v: str | None) -> float | None:
    if not v:
        return None
    m = re.match(r"\s*([\d.]+)\s*(m|ft|')?", v)
    if not m:
        return None
    x = float(m.group(1))
    return x * FEET if m.group(2) in ("ft", "'") else x


def road_width(tags: dict[str, str]) -> tuple[float, str]:
    """Carriageway width in metres and which rule produced it."""
    if (w := _parse_metres(tags.get("width"))) and 2 <= w <= 60:
        return w, "width_tag"
    for key in ("name", "name:en", "alt_name"):
        if m := _WIDTH_IN_NAME.search(tags.get(key, "")):
            row = int(m.group(1)) * FEET
            if 6 <= row <= 80:
                return round(row * CARRIAGEWAY_SHARE, 1), "name_feet"
    if (lanes := tags.get("lanes", "")).isdigit() and 1 <= int(lanes) <= 10:
        return int(lanes) * LANE_WIDTH, "lanes"
    cls = tags.get("highway", "").removesuffix("_link")
    return CLASS_WIDTH.get(cls, 3.0), "class_default"


def levels_from_height(h: float) -> int:
    return max(1, round((h - 0.5) / 3.1))


def height_from_levels(levels: int, shop: bool, rng: np.random.Generator,
                       floor: float = 3.1) -> float:
    """PROMPT §7.5: ground floor + upper floors + parapet."""
    ground = rng.uniform(3.6, 4.2) if shop else floor
    return ground + (levels - 1) * floor + rng.uniform(0.9, 1.1)


def iou(a: shapely.Geometry, b: shapely.Geometry) -> float:
    inter = a.intersection(b).area
    return inter / (a.area + b.area - inter) if inter > 0 else 0.0


def dominant_angle(poly: Polygon) -> float:
    """Orientation (radians, 0..pi/2) of the longest-weighted edge direction."""
    c = np.asarray(poly.exterior.coords)
    d = np.diff(c, axis=0)
    lengths = np.hypot(d[:, 0], d[:, 1])
    ang = np.mod(np.arctan2(d[:, 1], d[:, 0]), math.pi / 2)
    # Circular mean on the 90-degree period, weighted by edge length.
    z = (lengths * np.exp(1j * ang * 4)).sum()
    return float(np.mod(np.angle(z) / 4, math.pi / 2))


def square_polygon(poly: Polygon, tol_deg: float = 8.0) -> Polygon | None:
    """Snap a nearly rectilinear outline to exact right angles.

    Returns None if any edge deviates more than tol_deg from the dominant
    axes (the building is not rectilinear) or the result is invalid.
    """
    if poly.interiors:
        return None
    coords = np.asarray(shapely.remove_repeated_points(poly, 0.05).exterior.coords)[:-1]
    n = len(coords)
    if n < 4:
        return None
    theta = dominant_angle(poly)
    rot = np.array([[math.cos(-theta), -math.sin(-theta)], [math.sin(-theta), math.cos(-theta)]])
    p = coords @ rot.T
    d = np.roll(p, -1, axis=0) - p
    ang = np.degrees(np.arctan2(d[:, 1], d[:, 0]))
    dev = np.abs(((ang + 45) % 90) - 45)
    if dev.max() > tol_deg:
        return None
    horiz = np.abs(d[:, 0]) >= np.abs(d[:, 1])
    # Each edge becomes an axis line through its midpoint: y=const or x=const.
    mid = (p + np.roll(p, -1, axis=0)) / 2
    out = []
    for k in range(n):
        prev, cur = (k - 1) % n, k
        if horiz[prev] == horiz[cur]:
            # Collinear edges: keep the vertex projected on the shared line.
            if horiz[cur]:
                out.append((p[k, 0], (mid[prev, 1] + mid[cur, 1]) / 2))
            else:
                out.append(((mid[prev, 0] + mid[cur, 0]) / 2, p[k, 1]))
        elif horiz[prev]:
            out.append((mid[cur, 0], mid[prev, 1]))
        else:
            out.append((mid[prev, 0], mid[cur, 1]))
    q = np.asarray(out) @ np.linalg.inv(rot).T
    res = Polygon(q)
    if not res.is_valid or res.area <= 0 or abs(res.area - poly.area) / poly.area > 0.10:
        return None
    return shapely.normalize(shapely.remove_repeated_points(res, 0.05))


def edges(poly: Polygon) -> list[LineString]:
    c = list(poly.exterior.coords)
    return [LineString([c[k], c[k + 1]]) for k in range(len(c) - 1)]
