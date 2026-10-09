"""Early road statistics for the P0 report: km by class, width rules, connectivity.

The full road/lane graph (PROMPT §7.7) comes in a later phase; this only checks
that the raw OSM network is usable.
"""

from __future__ import annotations

import json

import geopandas as gpd
import networkx as nx
import numpy as np
import pandas as pd

from . import config as C
from . import geom
from .buildings import DRIVABLE


def run(cfg: C.Config) -> None:
    bounds = gpd.read_parquet(C.interim("bounds.parquet"))
    playable = bounds.loc[bounds.kind == "playable", "geometry"].iloc[0]
    r = gpd.read_parquet(C.interim("osm_roads.parquet"))
    r = r[r.intersects(playable)].copy()
    r["geometry"] = r.geometry.intersection(playable)
    tags = r.tags.map(json.loads)
    r["highway"] = tags.map(lambda t: t.get("highway"))
    wr = tags.map(geom.road_width)
    r["width"], r["width_rule"] = wr.map(lambda x: x[0]), wr.map(lambda x: x[1])
    r["km"] = r.length / 1000

    by_class = r.groupby("highway").km.sum().sort_values(ascending=False).round(1)
    by_rule = r.groupby("width_rule").km.sum().round(1)

    # Connectivity on shared endpoints/vertices of drivable ways (snapped to 0.1 m).
    d = r[r.highway.isin(DRIVABLE)]
    G = nx.Graph()
    for line, km in zip(d.geometry.values, d.km.values):
        parts = getattr(line, "geoms", [line])
        for p in parts:
            c = np.round(np.asarray(p.coords), 1)
            for a, b in zip(map(tuple, c[:-1]), map(tuple, c[1:])):
                G.add_edge(a, b, km=float(np.hypot(*(np.subtract(b, a)))) / 1000)
    comps = sorted(nx.connected_components(G), key=len, reverse=True)
    total = sum(e["km"] for *_, e in G.edges(data=True))
    largest = sum(e["km"] for *_, e in G.subgraph(comps[0]).edges(data=True)) if comps else 0
    stats = {
        "km_by_class": by_class.to_dict(),
        "km_by_width_rule": by_rule.to_dict(),
        "drivable_km": round(total, 1),
        "largest_component_share": round(largest / total, 4) if total else 0,
        "components": len(comps),
        "named_feet_roads": sorted(set(r.loc[r.width_rule == "name_feet", "name"].dropna())),
        "bridges_km": round(r[tags.map(lambda t: t.get("bridge") == "yes")].km.sum(), 2),
    }
    C.write_json(C.interim("roads_stats.json"), stats)
    print(f"  drivable {stats['drivable_km']} km, largest component {stats['largest_component_share']:.1%} "
          f"of length ({stats['components']} components)")
    print(f"  width rules: {stats['km_by_width_rule']}")
