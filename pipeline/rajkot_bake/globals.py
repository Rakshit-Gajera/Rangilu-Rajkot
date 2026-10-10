"""Stage 12b: city-wide files (PROMPT §7.14): road graph for GPS + map layer + labels.

Output world/map.json.gz:
  nodes:  flat [x, n, ...] in whole metres from the origin
  edges:  parallel arrays a, b, rank, flags (bit0 one-way a->b, bit1 bridge), name (strings index or -1),
          length (dm), carriageway width (dm), and polyline points (offsets into `pts`, flat [x, n, ...] metres, simplified 2 m)
  labels: [{t, x, n, kind}] neighbourhoods and landmarks
The road graph doubles as the map layer, so the map draws exactly what GPS routes on.
"""

from __future__ import annotations

import gzip
import json
from collections import defaultdict

import geopandas as gpd
import numpy as np
import shapely

from . import config as C

DRIVE_RANKS = 2  # service roads and above are routable; tracks (rank 1) are drawn but not routed


def run(cfg: C.Config) -> None:
    meta = C.read_json(C.interim("bounds.json"))
    ox, oy = meta["origin"]["easting"], meta["origin"]["northing"]
    roads = gpd.read_parquet(C.interim("roads.parquet"))
    strings: list[str] = C.read_json(C.WORLD / "strings.json")
    sidx = {s: k for k, s in enumerate(strings)}

    def name_id(v) -> int:
        if not isinstance(v, str) or not v:
            return -1
        if v not in sidx:
            sidx[v] = len(strings)
            strings.append(v)
        return sidx[v]

    # Graph nodes: vertices shared by more than one way, plus every way's endpoints.
    lines = []
    use = defaultdict(int)
    for geom in roads.geometry.values:
        c = np.round(np.asarray(geom.coords) - (ox, oy), 1)
        lines.append(c)
        for k, p in enumerate(map(tuple, c)):
            use[p] += 2 if k in (0, len(c) - 1) else 1
    node_id: dict[tuple, int] = {}
    nodes: list[float] = []

    def nid(p: tuple) -> int:
        if p not in node_id:
            node_id[p] = len(node_id)
            nodes.extend(p)
        return node_id[p]

    ea, eb, erank, eflags, ename, elen, estart, ewidth = [], [], [], [], [], [], [], []
    pts: list[int] = []
    for c, rank, oneway, bridge, name, width in zip(lines, roads["rank"].values, roads.oneway.values,
                                                    roads.bridge.values, roads.name.values, roads.width.values):
        cut = [k for k, p in enumerate(map(tuple, c)) if k in (0, len(c) - 1) or use[p] > 1]
        for s, e in zip(cut[:-1], cut[1:]):
            seg = c[s:e + 1]
            length = float(np.hypot(*np.diff(seg, axis=0).T).sum())
            if length < 0.05:
                continue
            simp = np.asarray(shapely.simplify(shapely.LineString(seg), 2.0).coords)
            ea.append(nid(tuple(seg[0])))
            eb.append(nid(tuple(seg[-1])))
            erank.append(int(rank))
            eflags.append(int(bool(oneway)) | int(bool(bridge)) << 1)
            ename.append(name_id(name))
            elen.append(int(round(length * 10)))
            ewidth.append(int(round(float(width) * 10)))
            estart.append(len(pts) // 2)
            pts.extend(np.round(simp).astype(int).ravel().tolist())
    estart.append(len(pts) // 2)

    # Labels: neighbourhoods (OSM places) and landmarks.
    labels = []
    places = gpd.read_parquet(C.interim("osm_places.parquet"))
    bounds = gpd.read_parquet(C.interim("bounds.parquet")).set_index("kind").geometry
    for _, p in places.iterrows():
        if isinstance(p["name"], str) and p.geometry.within(bounds["playable"]):
            tags = json.loads(p.tags)
            labels.append({"t": p["name"], "gu": p.get("name_gu") if isinstance(p.get("name_gu"), str) else None,
                           "x": round(p.geometry.x - ox), "n": round(p.geometry.y - oy),
                           "kind": tags.get("place", "place")})
    lm = gpd.read_parquet(C.interim("landmarks.parquet")).dropna(subset=["geometry"])
    for _, m in lm.iterrows():
        if m.status == "ambiguous" or not m.in_playable:
            continue
        g = m.geometry if m.geometry.geom_type == "Point" else m.geometry.representative_point()
        labels.append({"t": m["name"], "gu": None, "x": round(g.x - ox), "n": round(g.y - oy), "kind": "landmark",
                       "id": m["id"]})

    for _, ck in gpd.read_parquet(C.interim("chowks.parquet")).iterrows():
        if isinstance(ck["name"], str):
            c = ck.geometry.centroid
            labels.append({"t": ck["name"], "gu": None, "x": round(c.x - ox), "n": round(c.y - oy), "kind": "chowk"})

    data = {
        "version": 1,
        "nodes": [round(v) for v in nodes],
        "edges": {"a": ea, "b": eb, "rank": erank, "flags": eflags, "name": ename, "len": elen, "start": estart,
                  "width": ewidth},
        "pts": pts,
        "labels": labels,
        "bounds": [round(v) for v in np.asarray(bounds["playable"].bounds) - (ox, oy, ox, oy)],
        "playable": [np.round(np.asarray(r.coords) - (ox, oy)).astype(int).ravel().tolist()
                     for g in getattr(shapely.simplify(bounds["playable"], 20), "geoms", [shapely.simplify(bounds["playable"], 20)])
                     for r in [g.exterior]],
    }
    raw = json.dumps(data, separators=(",", ":")).encode()
    (C.WORLD / "map.json.gz").write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
    C.write_json(C.WORLD / "strings.json", strings)
    manifest = C.read_json(C.WORLD / "manifest.json")
    manifest["map"] = "map.json.gz"
    C.write_json(C.WORLD / "manifest.json", manifest)
    print(f"  graph: {len(node_id):,} nodes, {len(ea):,} edges; labels {len(labels)}; "
          f"map.json.gz {len(gzip.compress(raw, 9)) / 1e6:.2f} MB (raw {len(raw) / 1e6:.1f} MB)")
