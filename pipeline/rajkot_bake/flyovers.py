"""Bridge and flyover deck heights (PROMPT §7.7 vertical profile).

OSM splits a flyover into many ways. Profiling each way alone made every piece ramp up and down
("humps"). Here connected bridge ways are treated as one structure:
  * base = straight line between the ends of each merged chain, never below the ground
    (river bridges stay level with their banks);
  * lift = up to 6.5 m per layer, rising with the network distance from the structure's free ends
    (where it lands on ordinary roads), so the deck climbs on gentle ramps and stays up in between.
Short structures (< FLYOVER_MIN_LENGTH in total) are not lifted: culverts and nala crossings.
"""

from __future__ import annotations

from collections import defaultdict

import numpy as np
import shapely
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components, dijkstra

FLYOVER_MIN_LENGTH = 60.0
RAMP = 130.0           # horizontal length of a full ramp
MAX_RAMP_GRADE = 0.05  # average grade of the ramp (smoothstep peaks at 1.5x)
STEP = 5.0


def _samples(line) -> tuple[np.ndarray, np.ndarray]:
    L = line.length
    n = max(2, int(L // STEP) + 1)
    s = np.linspace(0, L, n)
    return s, shapely.get_coordinates(shapely.line_interpolate_point(line, s))


def deck_heights(lines: list, layers: list[int], ground_fn) -> list[np.ndarray]:
    """Deck height (y) for every 5 m sample of every bridge line, as one array per line."""
    samples = [_samples(l) for l in lines]
    # Graph over sample points; shared OSM nodes make consecutive ways meet at the same point.
    node: dict[tuple, int] = {}
    ids = []
    for _, p in samples:
        ids.append(np.array([node.setdefault((round(x * 2), round(y * 2)), len(node)) for x, y in p]))
    rows, cols, w = [], [], []
    for (s, p), idx in zip(samples, ids):
        d = np.diff(s)
        rows += list(idx[:-1]) + list(idx[1:])
        cols += list(idx[1:]) + list(idx[:-1])
        w += list(d) + list(d)
    n = len(node)
    g = coo_matrix((np.maximum(w, 1e-3), (rows, cols)), shape=(n, n)).tocsr()
    deg = np.diff((g > 0).astype(np.int8).tocsr().indptr)
    ncomp, comp = connected_components(g, directed=False)
    comp_len = np.zeros(ncomp)
    for (s, _), idx in zip(samples, ids):
        comp_len[comp[idx[0]]] += s[-1]
    free = np.flatnonzero(deg <= 1)
    dist = dijkstra(g, directed=False, indices=free, min_only=True) if len(free) else np.full(n, np.inf)
    dist = np.where(np.isfinite(dist), dist, 0.0)

    # Base: per merged chain, a straight line between its ends, never below the ground.
    by_comp = defaultdict(list)
    for k, idx in enumerate(ids):
        by_comp[comp[idx[0]]].append(k)
    out: list[np.ndarray] = [None] * len(lines)  # type: ignore[list-item]
    for c, members in by_comp.items():
        merged = shapely.line_merge(shapely.union_all([lines[k] for k in members]))
        chains = list(getattr(merged, "geoms", [merged]))
        chain_base = []
        for ch in chains:
            cs, cp = _samples(ch)
            cg = ground_fn(cp)
            straight = np.interp(cs, [0, cs[-1]], [cg[0], cg[-1]])
            chain_base.append((ch, cs, np.maximum(straight, cg)))
        layer = max(1, max(int(layers[k]) for k in members))
        lift = min(6.5 * layer, MAX_RAMP_GRADE * RAMP) if comp_len[c] >= FLYOVER_MIN_LENGTH else 0.0
        for k in members:
            s, p = samples[k]
            pts = shapely.points(p)
            dists = [shapely.distance(ch, pts).max() for ch, _, _ in chain_base]
            ch, cs, cb = chain_base[int(np.argmin(dists))]
            base = np.interp(shapely.line_locate_point(ch, pts), cs, cb)
            base = np.maximum(base, ground_fn(p))
            t = np.clip(dist[ids[k]] / RAMP, 0, 1)
            out[k] = base + lift * t * t * (3 - 2 * t)
    return out
