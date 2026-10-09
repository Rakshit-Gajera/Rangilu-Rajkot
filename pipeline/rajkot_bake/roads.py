"""Stage 6 (P1 version): road attributes (PROMPT §7.7).

Width, lanes, one-way, surface, bridge/layer and speed per OSM way inside the
playable area (+ margin). Junction geometry is resolved later by unioning
road surfaces per tile; dual-carriageway pairing and the lane graph come in P2.
Output: data/interim/roads.parquet.
"""

from __future__ import annotations

import json
import re

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely import STRtree

from . import config as C
from . import geom
from .buildings import DRIVABLE

# Draw/priority order (higher wins where surfaces overlap) and default speed (km/h).
CLASS_RANK = {"motorway": 9, "trunk": 8, "primary": 7, "secondary": 6, "tertiary": 5, "unclassified": 4,
              "residential": 3, "living_street": 3, "pedestrian": 2, "service": 2, "road": 2, "track": 1}
SPEED = {9: 70, 8: 70, 7: 50, 6: 50, 5: 40, 4: 40, 3: 25, 2: 20, 1: 20}
SURFACES = ["asphalt", "concrete", "paving", "dirt"]
OSM_SURFACE = {"asphalt": "asphalt", "paved": "asphalt", "concrete": "concrete", "concrete:plates": "concrete",
               "paving_stones": "paving", "sett": "paving", "cobblestone": "paving", "unpaved": "dirt",
               "dirt": "dirt", "gravel": "dirt", "ground": "dirt", "compacted": "dirt", "sand": "dirt"}


def _surface(tags: dict, rank: int, zone: int) -> str:
    if s := OSM_SURFACE.get(tags.get("surface", "")):
        return s
    if tags.get("highway") == "track" or zone == 7 and rank <= 3:
        return "dirt"
    if rank >= 5:
        return "asphalt"
    if zone == 1:
        return "paving" if tags.get("highway") == "pedestrian" else "asphalt"
    if zone in (3, 5) and rank <= 3:
        return "concrete"  # RCC society lanes
    return "asphalt"


def _speed(tags: dict, rank: int) -> int:
    m = re.match(r"\d+", tags.get("maxspeed", ""))
    return int(m.group()) if m else SPEED.get(rank, 25)


def run(cfg: C.Config) -> None:
    bounds = gpd.read_parquet(C.interim("bounds.parquet")).set_index("kind").geometry
    area = bounds["playable"].buffer(200)
    r = gpd.read_parquet(C.interim("osm_roads.parquet"))
    tags = r.tags.map(json.loads)
    hw = tags.map(lambda t: t.get("highway", "").removesuffix("_link"))
    keep = tags.map(lambda t: t.get("highway") in DRIVABLE or t.get("highway") == "track") & r.intersects(area)
    r, tags, hw = r[keep].reset_index(drop=True), tags[keep].reset_index(drop=True), hw[keep].reset_index(drop=True)
    r["geometry"] = r.geometry.intersection(area)
    r = r[~r.geometry.is_empty].copy()
    tags, hw = tags[r.index], hw[r.index]

    # Dominant style zone near each road (for surface defaults).
    b = gpd.read_parquet(C.interim("buildings_c.parquet"))
    ri, bi = STRtree(b.geometry.values).query(r.geometry.values, predicate="dwithin", distance=25.0)
    zone_of = pd.Series(b.zone.values[bi]).groupby(ri).agg(lambda s: s.mode().iloc[0])
    zones = np.array([zone_of.get(k, 3) for k in range(len(r))])

    rank = hw.map(lambda h: CLASS_RANK.get(h, 2)).values
    width, rule = zip(*tags.map(geom.road_width))
    out = gpd.GeoDataFrame({
        "rid": [f"w{i}" for i in r.osm_id],
        "highway": hw.values,
        "rank": rank,
        "name": r.name.values,
        "name_gu": r.name_gu.values,
        "width": np.round(width, 2),
        "width_rule": rule,
        "lanes": [int(t["lanes"]) if t.get("lanes", "").isdigit() else (2 if k >= 5 else 1 if k <= 2 else 2)
                  for t, k in zip(tags, rank)],
        "oneway": [t.get("oneway") in ("yes", "1", "true") or t.get("junction") == "roundabout" for t in tags],
        "roundabout": [t.get("junction") in ("roundabout", "circular") for t in tags],
        "surface": [_surface(t, k, z) for t, k, z in zip(tags, rank, zones)],
        "bridge": [t.get("bridge") not in (None, "no") for t in tags],
        "tunnel": [t.get("tunnel") not in (None, "no") for t in tags],
        "layer": [int(t["layer"]) if re.fullmatch(r"-?\d", t.get("layer", "")) else 0 for t in tags],
        "speed": [_speed(t, k) for t, k in zip(tags, rank)],
        "zone": zones,
        "geometry": shapely.line_merge(r.geometry.values),
    }, crs=cfg.crs)
    out = out.explode(index_parts=False).reset_index(drop=True)
    out = out[out.geom_type == "LineString"]
    out.to_parquet(C.interim("roads.parquet"))
    km = (out.length / 1000).groupby(out.surface).sum().round(1).to_dict()
    print(f"  roads: {len(out)} segments; km by surface {km}; bridges {int(out.bridge.sum())}")
