"""Stages 11-12: assign world facts to 500 m tiles, encode `.rtile` v1, pack `.rpk`.

Format: docs/RTILE.md. Output: world/manifest.json, world/strings.json, world/packs/*.rpk.
"""

from __future__ import annotations

import gzip
import json
import struct
from collections import defaultdict

import geopandas as gpd
import numpy as np
import shapely
from scipy import ndimage
from shapely import STRtree
from shapely.geometry import box

from . import config as C
from . import sites
from .chowks import KINDS as CHOWK_KINDS, SUBJECTS as CHOWK_SUBJECTS
from .flyovers import deck_heights
from .report import USES

VERSION = 2
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
    """Dense (x, n, y) points per road at 5 m spacing; bridges follow `flyovers.deck_heights`."""
    out = []
    bridge_idx = np.flatnonzero(roads.bridge.values)
    decks = deck_heights([roads.geometry.values[k] for k in bridge_idx], list(roads.layer.values[bridge_idx]),
                         lambda p: terrain.sample(p) - 100.0)
    deck_of = dict(zip(bridge_idx, decks))
    for k, line in enumerate(roads.geometry.values):
        L = line.length
        n = max(2, int(L // 5) + 1)
        s = np.linspace(0, L, n)
        p = shapely.get_coordinates(shapely.line_interpolate_point(line, s))
        y = deck_of[k] if k in deck_of else terrain.sample(p) - 100.0
        out.append(np.column_stack([p, y]))
    return out


def _poly_block(entries: list[tuple[int, float | None, object]], sw: tuple[float, float], has_level) -> bytes:
    """Polygons (with holes) per class, tile-local dm. Triangulated and draped at runtime (docs/RTILE.md v2)."""
    out = [struct.pack("<B", len(entries))]
    for code, level, geom in entries:
        polys = []
        for poly in getattr(geom, "geoms", [geom]):
            if poly.geom_type != "Polygon" or poly.area < 0.05:
                continue
            poly = shapely.simplify(poly, 0.1, preserve_topology=True)
            rings = [np.asarray(poly.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in poly.interiors]
            rings = [r for r in rings if len(r) >= 3]
            if rings:
                polys.append(rings)
        out.append(struct.pack("<B", code))
        if has_level(code):
            out.append(struct.pack("<h", int(dm(level or 0.0))))
        out.append(struct.pack("<H", len(polys)))
        for rings in polys:
            out.append(struct.pack("<B", len(rings)))
            for r in rings:
                out.append(struct.pack("<H", len(r)))
                out.append(dm(r - sw).tobytes())
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
    # Hand-built landmark models replace the generic building at their site (sites.py).
    _, landmark_drop = sites.compute(cfg, b, roads, oe, on)

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
    chowks = gpd.read_parquet(C.interim("chowks.parquet"))
    island_geoms = chowks.geometry.values[chowks.island.values]
    island_tree = STRtree(island_geoms)
    trees = gpd.read_parquet(C.interim("trees.parquet"))
    txy = shapely.get_coordinates(trees.geometry.values)
    t_tile = (np.floor((txy[:, 0] - oe) / ts).astype(int), np.floor((txy[:, 1] - on) / ts).astype(int))
    trees_by_tile = defaultdict(list)
    for k, key in enumerate(zip(*t_tile)):
        trees_by_tile[key].append(k)
    chowk_cent = [g.centroid for g in chowks.geometry.values]

    packs: dict[tuple[int, int], list[tuple[int, int, bytes]]] = defaultdict(list)
    sizes = []
    for i, j in zip(tiles.i.values, tiles.j.values):
        sw = (oe + i * ts, on + j * ts)
        tbox = box(sw[0], sw[1], sw[0] + ts, sw[1] + ts)
        sections = []

        hb = terrain.block(*sw)
        sections.append((b"HGHT", struct.pack("<H", N_H) + dm(hb - 100.0).tobytes()))

        keep = [k for k in by_tile[(i, j)] if k not in landmark_drop]
        parts = [struct.pack("<I", len(keep))]
        for k in keep:
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
            # Roads mapped straight through a circle must not cover its island.
            isl = island_geoms[island_tree.query(tbox.buffer(30), predicate="intersects")]
            if len(isl):
                u = u.difference(shapely.union_all(isl))
            u = u.difference(taken)
            taken = taken.union(u)
            u = u.intersection(tbox)
            if not u.is_empty:
                entries.append((SURF_CODE[s], None, u))
        sections.append((b"RDSF", _poly_block(entries, sw, lambda c: False)))
        road_union = taken

        entries = []
        gsel = green.geometry.values[green_tree.query(tbox, predicate="intersects")]
        if len(gsel):
            gu = shapely.union_all(gsel).intersection(tbox).difference(road_union)
            if not gu.is_empty:
                entries.append((AREA_GRASS, None, gu))
        for k in water_tree.query(tbox, predicate="intersects"):
            wg = water.geometry.values[k].intersection(tbox)
            if wg.is_empty:
                continue
            if water.river.values[k]:
                entries.append((AREA_SAND, None, wg))  # dry riverbed outside the monsoon
            else:
                entries.append((AREA_WATER, water.level.values[k], wg))
        sections.append((b"AREA", _poly_block(entries, sw, lambda c: c == AREA_WATER)))

        lms = [(lm.iloc[k], p) for k, p in enumerate(lm_pts) if tbox.contains(p)]
        sections.append((b"LMRK", struct.pack("<H", len(lms)) + b"".join(
            struct.pack("<IBhh", strings.get(m["name"]), CONF_CODE[m.confidence],
                        int(dm(p.x - sw[0])), int(dm(p.y - sw[1]))) for m, p in lms)))

        cks = [k for k, c in enumerate(chowk_cent) if tbox.contains(c)]
        parts = [struct.pack("<H", len(cks))]
        for k in cks:
            ck = chowks.iloc[k]
            ring = np.asarray(shapely.simplify(ck.geometry, 0.2).exterior.coords)[:-1]
            ground = float(terrain.sample(ring).min()) - 100.0
            c = chowk_cent[k]
            parts.append(struct.pack("<BBBIIhhhH", CHOWK_KINDS[ck.kind], CHOWK_SUBJECTS[ck.subject], int(bool(ck.island)),
                                     strings.get(ck["name"]), int(ck.seed) & 0xFFFFFFFF, int(dm(c.x - sw[0])),
                                     int(dm(c.y - sw[1])), int(dm(ground)), len(ring)))
            parts.append(dm(ring - sw).tobytes())
        sections.append((b"CHWK", b"".join(parts)))
        tk = np.array(trees_by_tile[(i, j)], dtype=int)
        tq = np.zeros(len(tk), dtype=[("x", "<i2"), ("n", "<i2"), ("sp", "u1"), ("sc", "u1")])
        if len(tk):
            tq["x"] = dm(txy[tk, 0] - sw[0])
            tq["n"] = dm(txy[tk, 1] - sw[1])
            tq["sp"] = trees["species"].values[tk]
            tq["sc"] = np.clip(np.round(trees["scale"].values[tk] * 100), 0, 255)
        sections.append((b"TREE", struct.pack("<I", len(tk)) + tq.tobytes()))
        # Named chowks also count as landmarks for the on-screen place name.
        li = next(k for k, (tag, _) in enumerate(sections) if tag == b"LMRK")
        lmrk = sections[li]
        extra = [(ck_name, chowk_cent[k]) for k in cks if isinstance(ck_name := chowks["name"].values[k], str)]
        if extra:
            count = struct.unpack_from("<H", lmrk[1])[0] + len(extra)
            body = lmrk[1][2:] + b"".join(struct.pack("<IBhh", strings.get(nm), 1, int(dm(c.x - sw[0])),
                                                      int(dm(c.y - sw[1]))) for nm, c in extra)
            sections[li] = (b"LMRK", struct.pack("<H", count) + body)

        data = _encode(int(i), int(j), sections)
        sizes.append(len(data))
        packs[(i // 4, j // 4)].append((int(i), int(j), data))

    out = C.WORLD / "packs"
    out.mkdir(parents=True, exist_ok=True)
    for old in [*out.glob("*.rpk"), *out.glob("*.rpk.gz")]:
        old.unlink()
    index = {}
    pack_sizes = []
    for (pi, pj), items in packs.items():
        # Gzipped; offsets refer to the decompressed pack (the game inflates it with DecompressionStream).
        name = f"r_{pi}_{pj}.rpk.gz"
        off, blob = 0, []
        for i, j, data in items:
            index[f"{i},{j}"] = [name, off, len(data)]
            blob.append(data)
            off += len(data)
        z = gzip.compress(b"".join(blob), compresslevel=9, mtime=0)
        (out / name).write_bytes(z)
        pack_sizes.append(len(z))

    C.write_json(C.WORLD / "strings.json", strings.items)
    sp = tc["spawn"]
    manifest = {
        "version": VERSION, "crs": cfg.crs, "tileSize": ts, "yOffset": cfg["world"]["y_offset"],
        "origin": meta["origin"], "tiles": index, "strings": "strings.json",
        "spawn": {"x": sp["x"], "z": -sp["n"], "heading": sp.get("heading", 0)},
        "slice": tc.get("slice") if tc.get("only_slice") else None,
    }
    C.write_json(C.WORLD / "manifest.json", manifest)
    # The road graph shares strings.json and is referenced from the manifest, so it is always rebuilt with the tiles.
    from . import globals as world_globals
    world_globals.run(cfg)
    sizes = np.array(sizes)
    print(f"  {len(sizes)} tiles in {len(packs)} packs; tile size p50 {np.median(sizes) / 1e3:.0f} kB, "
          f"max {sizes.max() / 1e3:.0f} kB, total {sizes.sum() / 1e6:.1f} MB raw, "
          f"{sum(pack_sizes) / 1e6:.1f} MB gzipped (largest pack {max(pack_sizes) / 1e6:.2f} MB)")
    if max(pack_sizes) > 4_000_000:
        raise SystemExit("QA failed: a region pack exceeds 4 MB")
    big = int((sizes > 1_000_000).sum())
    if big:
        raise SystemExit(f"QA failed: {big} tiles exceed 1 MB")
