"""Stages 11-12: assign world facts to 500 m tiles, encode `.rtile` v1, pack `.rpk`.

Format: docs/RTILE.md. Output: world/manifest.json, world/strings.json, world/packs/*.rpk.
"""

from __future__ import annotations

import json
import struct
from collections import defaultdict

import geopandas as gpd
import mapbox_earcut as earcut
import numpy as np
import shapely
from scipy import ndimage
from shapely import STRtree
from shapely.geometry import box

from . import config as C
from .report import USES

VERSION = 1
N_H = 51
SURF_ORDER = ["asphalt", "paving", "concrete", "dirt"]  # priority where surfaces overlap
SURF_CODE = {"asphalt": 0, "concrete": 1, "paving": 2, "dirt": 3}
AREA_GRASS, AREA_WATER, AREA_SAND = 0, 1, 2
WORSHIP_CODE = {"hindu_temple": 1, "jain_derasar": 2, "mosque": 3, "church": 4, "gurudwara": 5}
CONF_CODE = {"low": 0, "medium": 1, "high": 2}
GREEN = {("leisure", "park"), ("leisure", "garden"), ("leisure", "pitch"), ("leisure", "playground"),
         ("leisure", "recreation_ground"), ("landuse", "grass"), ("landuse", "recreation_ground"),
         ("landuse", "meadow"), ("landuse", "village_green"), ("leisure", "stadium")}


class Terrain:
    def __init__(self) -> None:
        self.h = np.load(C.interim("terrain_10m.npy"))
        g = C.read_json(C.interim("terrain_10m.json"))
        self.x0, self.y0, self.res = g["x0"], g["y0"], g["res"]

    def sample(self, xy: np.ndarray) -> np.ndarray:
        return ndimage.map_coordinates(self.h, [(xy[:, 1] - self.y0) / self.res, (xy[:, 0] - self.x0) / self.res],
                                       order=1, mode="nearest")

    def block(self, e: float, n: float) -> np.ndarray:
        c0, r0 = int(round((e - self.x0) / self.res)), int(round((n - self.y0) / self.res))
        return self.h[r0:r0 + N_H, c0:c0 + N_H]


def dm(v) -> np.ndarray:
    return np.clip(np.round(np.asarray(v, dtype=np.float64) * 10), -32768, 32767).astype("<i2")


class Strings:
    def __init__(self) -> None:
        self.items: list[str] = []
        self.index: dict[str, int] = {}

    def get(self, s) -> int:
        if not isinstance(s, str) or not s:
            return 0xFFFFFFFF
        if s not in self.index:
            self.index[s] = len(self.items)
            self.items.append(s)
        return self.index[s]


def _road_points(roads: gpd.GeoDataFrame, terrain: Terrain) -> list[np.ndarray]:
    """Dense (x, n, y) points per road; bridges rise to a deck of 6.5 m per layer."""
    out = []
    for line, bridge, layer in zip(roads.geometry.values, roads.bridge.values, roads.layer.values):
        L = line.length
        n = max(2, int(L // 5) + 1)
        p = shapely.get_coordinates(shapely.line_interpolate_point(line, np.linspace(0, L, n)))
        y = terrain.sample(p) - 100.0
        if bridge:
            s = np.linspace(0, L, n)
            ramp = max(min(120.0, L / 2.5), 1.0)
            t = np.clip(np.minimum(s, L - s) / ramp, 0, 1)
            y = y + 6.5 * max(int(layer), 1) * t * t * (3 - 2 * t)
        out.append(np.column_stack([p, y]))
    return out


def _triangulate(pieces, sw: tuple[float, float]) -> tuple[np.ndarray, np.ndarray]:
    verts, idx, base = [], [], 0
    for g in pieces:
        for poly in getattr(g, "geoms", [g]):
            if poly.geom_type != "Polygon" or poly.area < 0.05:
                continue
            rings = [np.asarray(poly.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in poly.interiors]
            v = np.vstack(rings)
            ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
            tri = earcut.triangulate_float64(v, ends)
            if len(tri) == 0:
                continue
            verts.append(v - sw)
            idx.append(tri.astype(np.int64) + base)
            base += len(v)
    if not verts:
        return np.zeros((0, 2)), np.zeros(0, np.int64)
    return np.vstack(verts), np.concatenate(idx)


def _grid_split(geom, sw: tuple[float, float], ts: float, cell: float = 10.0):
    """Cut a polygon on the terrain grid so each piece lies inside one 10 m cell."""
    if geom.is_empty:
        return []
    k = int(ts / cell)
    xs = sw[0] + np.arange(k) * cell
    ys = sw[1] + np.arange(k) * cell
    gx, gy = np.meshgrid(xs, ys)
    cells = shapely.box(gx.ravel(), gy.ravel(), gx.ravel() + cell, gy.ravel() + cell)
    hit = STRtree(cells).query(geom, predicate="intersects")
    pieces = shapely.intersection(cells[hit], geom)
    return [p for p in pieces if not p.is_empty]


def _mesh_block(entries: list[tuple[int, int | None, np.ndarray, np.ndarray]]) -> bytes:
    out = [struct.pack("<B", len(entries))]
    for code, level, v, i in entries:
        if len(v) > 65535:
            raise ValueError(f"mesh entry with {len(v)} vertices exceeds u16 indices")
        out.append(struct.pack("<B", code))
        if level is not None:
            out.append(struct.pack("<h", int(dm(level))))
        out.append(struct.pack("<II", len(v), len(i)))
        out.append(dm(v).tobytes())
        out.append(i.astype("<u2").tobytes())
    return b"".join(out)


def _encode(i: int, j: int, sections: list[tuple[bytes, bytes]]) -> bytes:
    head = struct.pack("<4sHHhhHH", b"RJKT", VERSION, 0, i, j, len(sections), 0)
    table_len = 12 * len(sections)
    off = len(head) + table_len
    table, body = [], []
    for tag, data in sections:
        table.append(struct.pack("<4sII", tag, off, len(data)))
        body.append(data)
        off += len(data)
    return head + b"".join(table) + b"".join(body)


def run(cfg: C.Config) -> None:
    tc = cfg["tiler"]
    meta = C.read_json(C.interim("bounds.json"))
    oe, on, ts = meta["origin"]["easting"], meta["origin"]["northing"], meta["tile_size"]
    tiles = gpd.read_parquet(C.interim("tiles.parquet"))
    if tc.get("only_slice"):
        x0, x1, y0, y1 = tc["slice"]
        tiles = tiles[(tiles.i * ts >= x0 - ts) & (tiles.i * ts < x1) & (tiles.j * ts >= y0 - ts) & (tiles.j * ts < y1)]
    terrain = Terrain()
    strings = Strings()

    # Buildings by centroid tile.
    b = gpd.read_parquet(C.interim("buildings_c.parquet"))
    cent = shapely.centroid(b.geometry.values)
    b["ti"] = np.floor((shapely.get_x(cent) - oe) / ts).astype(int)
    b["tj"] = np.floor((shapely.get_y(cent) - on) / ts).astype(int)
    by_tile = defaultdict(list)
    for k, (ti, tj) in enumerate(zip(b.ti.values, b.tj.values)):
        by_tile[(ti, tj)].append(k)
    use_code = {u: k for k, u in enumerate(USES)}

    roads = gpd.read_parquet(C.interim("roads.parquet"))
    rpts = _road_points(roads, terrain)
    road_tree = STRtree(roads.geometry.values)
    surf_roads = roads[~roads.bridge & ~roads.tunnel]
    surf_poly = shapely.buffer(surf_roads.geometry.values, surf_roads.width.values / 2, quad_segs=4)
    surf_tree = STRtree(surf_poly)

    lu = gpd.read_parquet(C.interim("osm_landuse.parquet"))
    lt = lu.tags.map(json.loads)
    green = lu[lt.map(lambda t: any((k, t.get(k)) in GREEN for k in ("leisure", "landuse")))]
    green_tree = STRtree(green.geometry.values)
    water = gpd.read_parquet(C.interim("osm_water_areas.parquet"))
    wt = water.tags.map(json.loads)
    water["river"] = wt.map(lambda t: t.get("water") in ("river", "stream", "canal") or t.get("waterway") == "riverbank")
    water_tree = STRtree(water.geometry.values)
    # Lake level: 10th percentile of ground along the shore - 0.3 m (PROMPT §7.9).
    levels = []
    for g in water.geometry.values:
        ring = shapely.segmentize(g.boundary, 20)
        pts = shapely.get_coordinates(ring)
        levels.append(float(np.percentile(terrain.sample(pts), 10)) - 100.0 - 0.3 if len(pts) else 0.0)
    water["level"] = levels

    lm = gpd.read_parquet(C.interim("landmarks.parquet")).dropna(subset=["geometry"])
    lm_pts = [g if g.geom_type == "Point" else g.representative_point() for g in lm.geometry.values]

    packs: dict[tuple[int, int], list[tuple[int, int, bytes]]] = defaultdict(list)
    sizes = []
    for i, j in zip(tiles.i.values, tiles.j.values):
        sw = (oe + i * ts, on + j * ts)
        tbox = box(sw[0], sw[1], sw[0] + ts, sw[1] + ts)
        sections = []

        hb = terrain.block(*sw)
        sections.append((b"HGHT", struct.pack("<H", N_H) + dm(hb - 100.0).tobytes()))

        parts = [struct.pack("<I", len(by_tile[(i, j)]))]
        for k in by_tile[(i, j)]:
            r = b.iloc[k]
            ring = np.asarray(r.geometry.exterior.coords)[:-1]
            base = float(terrain.sample(ring).min()) - 100.0
            flags = (r.shop_ground_floor << 0) | (r.corner << 1) | (r.touching << 2) | ((r.use == "religious") << 3)
            kinds = [{"B": 0, "F": 1, "S": 2}[c] for c in r.edge_kinds]
            packed = bytearray((len(kinds) + 3) // 4)
            for e, kd in enumerate(kinds):
                packed[e // 4] |= kd << (2 * (e % 4))
            parts.append(struct.pack("<IBBBBHhBBH", int(r.seed) & 0xFFFFFFFF, int(r.levels), int(r.zone),
                                     use_code.get(r.use, 9), int(flags), int(round(r.height * 10)),
                                     int(dm(base)), int(r.palette_id), WORSHIP_CODE.get(r.worship, 0), len(ring)))
            parts.append(dm(ring - sw).tobytes())
            parts.append(bytes(packed))
        sections.append((b"BLDG", b"".join(parts)))

        ex = tbox.buffer(10, join_style="mitre")
        lines = []
        for k in road_tree.query(ex, predicate="intersects"):
            p = rpts[k]
            inside = (p[:, 0] >= sw[0] - 10) & (p[:, 0] <= sw[0] + ts + 10) & \
                     (p[:, 1] >= sw[1] - 10) & (p[:, 1] <= sw[1] + ts + 10)
            idx = np.flatnonzero(inside)
            if not len(idx):
                continue
            runs = np.split(idx, np.flatnonzero(np.diff(idx) > 1) + 1)
            r = roads.iloc[k]
            for run in runs:
                run = np.arange(max(run[0] - 1, 0), min(run[-1] + 2, len(p)))
                if len(run) < 2:
                    continue
                q = p[run].copy()
                q[:, :2] -= sw
                flags = int(r.oneway) | int(r.bridge) << 1 | int(r.tunnel) << 2 | int(r.roundabout) << 3
                lines.append(struct.pack("<BBBBHbBIH", int(r["rank"]), SURF_CODE[r.surface], int(r.lanes), flags,
                                         int(round(r.width * 100)), int(r.layer), int(r.speed),
                                         strings.get(r["name"]), len(q)) + dm(q).tobytes())
        sections.append((b"RDLN", struct.pack("<I", len(lines)) + b"".join(lines)))

        # Road surfaces: union per surface, inner corners rounded, higher priority wins.
        near = surf_tree.query(tbox.buffer(30), predicate="intersects")
        taken = shapely.Polygon()
        entries = []
        for s in SURF_ORDER:
            sel = [surf_poly[k] for k in near if surf_roads.surface.values[k] == s]
            if not sel:
                continue
            u = shapely.union_all(sel).buffer(4, quad_segs=4).buffer(-4, quad_segs=4)
            u = u.difference(taken)
            taken = taken.union(u)
            u = u.intersection(tbox)
            v, tri = _triangulate(_grid_split(u, sw, ts), sw)
            if len(tri):
                entries.append((SURF_CODE[s], None, v, tri))
        sections.append((b"RDSF", _mesh_block(entries)))
        road_union = taken

        entries = []
        gsel = green.geometry.values[green_tree.query(tbox, predicate="intersects")]
        if len(gsel):
            gu = shapely.union_all(gsel).intersection(tbox).difference(road_union)
            v, tri = _triangulate(_grid_split(gu, sw, ts), sw)
            if len(tri):
                entries.append((AREA_GRASS, None, v, tri))
        for k in water_tree.query(tbox, predicate="intersects"):
            wg = water.geometry.values[k].intersection(tbox)
            if water.river.values[k]:
                v, tri = _triangulate(_grid_split(wg, sw, ts), sw)
                if len(tri):
                    entries.append((AREA_SAND, None, v, tri))  # dry riverbed outside the monsoon
            else:
                v, tri = _triangulate([wg], sw)  # flat water surface: no grid split needed
                if len(tri):
                    entries.append((AREA_WATER, water.level.values[k], v, tri))
        sections.append((b"AREA", _mesh_block(entries)))

        lms = [(lm.iloc[k], p) for k, p in enumerate(lm_pts) if tbox.contains(p)]
        sections.append((b"LMRK", struct.pack("<H", len(lms)) + b"".join(
            struct.pack("<IBhh", strings.get(m["name"]), CONF_CODE[m.confidence],
                        int(dm(p.x - sw[0])), int(dm(p.y - sw[1]))) for m, p in lms)))

        data = _encode(int(i), int(j), sections)
        sizes.append(len(data))
        packs[(i // 4, j // 4)].append((int(i), int(j), data))

    out = C.WORLD / "packs"
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.rpk"):
        old.unlink()
    index = {}
    for (pi, pj), items in packs.items():
        name = f"r_{pi}_{pj}.rpk"
        off, blob = 0, []
        for i, j, data in items:
            index[f"{i},{j}"] = [name, off, len(data)]
            blob.append(data)
            off += len(data)
        (out / name).write_bytes(b"".join(blob))

    C.write_json(C.WORLD / "strings.json", strings.items)
    sp = tc["spawn"]
    manifest = {
        "version": VERSION, "crs": cfg.crs, "tileSize": ts, "yOffset": cfg["world"]["y_offset"],
        "origin": meta["origin"], "tiles": index, "strings": "strings.json",
        "spawn": {"x": sp["x"], "z": -sp["n"], "heading": sp.get("heading", 0)},
        "slice": tc.get("slice") if tc.get("only_slice") else None,
    }
    C.write_json(C.WORLD / "manifest.json", manifest)
    sizes = np.array(sizes)
    print(f"  {len(sizes)} tiles in {len(packs)} packs; tile size p50 {np.median(sizes) / 1e3:.0f} kB, "
          f"max {sizes.max() / 1e3:.0f} kB, total {sizes.sum() / 1e6:.1f} MB")
    big = int((sizes > 1_000_000).sum())
    if big:
        raise SystemExit(f"QA failed: {big} tiles exceed 1 MB")
