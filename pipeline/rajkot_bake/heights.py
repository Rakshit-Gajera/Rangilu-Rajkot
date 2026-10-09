"""Stage 4: building heights as floor counts (PROMPT §7.5, amended).

Priority: OSM height > OSM building:levels > Overture height/floors >
GHSL average net building height (100 m cells, 2018) > heuristic.
Google Open Buildings 2.5D is replaced by GHSL (free, CC BY 4.0; see DECISIONS.md).

This stage stores `levels` and `height_source`; the metric height (which needs
the shop ground-floor flag) is computed in the classify stage.
"""

from __future__ import annotations

import json
import re

import geopandas as gpd
import numpy as np
import rasterio
import shapely
from pyproj import Transformer

from . import config as C
from . import geom


def _num(v: str | None) -> float | None:
    if not v:
        return None
    m = re.match(r"\s*([\d.]+)", v)
    try:
        return float(m.group(1)) if m else None
    except ValueError:
        return None


def _ghsl(cfg: C.Config, pts: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """GHSL height at each point and the id of the raster cell it falls in."""
    tif = next((C.RAW / "ghsl").glob("GHS_BUILT_H_ANBH*.tif"))
    lon, lat = Transformer.from_crs(cfg.crs, "EPSG:4326", always_xy=True).transform(pts[:, 0], pts[:, 1])
    with rasterio.open(tif) as r:
        vals = np.array([v[0] for v in r.sample(zip(lon, lat))], dtype=float)
        rows, cols = rasterio.transform.rowcol(r.transform, lon, lat)
    vals[~np.isfinite(vals)] = 0
    return vals, (np.asarray(rows, np.int64) << 20) + np.asarray(cols, np.int64)


def run(cfg: C.Config) -> None:
    hc = cfg["heights"]
    floor = hc["floor_height"]
    g = gpd.read_parquet(C.interim("buildings.parquet"))  # stage 3 output
    tags = g.tags.map(json.loads)

    n = len(g)
    levels = np.zeros(n, int)
    source = np.full(n, "", object)

    osm_h = tags.map(lambda t: _num(t.get("height"))).astype(float).values
    osm_l = tags.map(lambda t: _num(t.get("building:levels"))).astype(float).values
    ov_h = g.ov_height.astype(float).values
    ov_f = g.ov_floors.astype(float).values

    def take(mask: np.ndarray, vals: np.ndarray, name: str) -> None:
        m = mask & (source == "")
        levels[m] = np.clip(np.round(vals[m]).astype(int), 1, 40)
        source[m] = name

    take(np.isfinite(osm_h) & (osm_h >= 2.5), np.array([geom.levels_from_height(h) for h in np.nan_to_num(osm_h)]), "osm_height")
    take(np.isfinite(osm_l) & (osm_l >= 1), np.nan_to_num(osm_l), "osm_levels")
    take(np.isfinite(ov_h) & (ov_h >= 2.5), np.array([geom.levels_from_height(h) for h in np.nan_to_num(ov_h)]), "overture_height")
    take(np.isfinite(ov_f) & (ov_f >= 1), np.nan_to_num(ov_f), "overture_floors")

    # GHSL: cell-average height, distributed by footprint size within the cell.
    cent = np.column_stack([shapely.get_x(shapely.centroid(g.geometry.values)),
                            shapely.get_y(shapely.centroid(g.geometry.values))])
    gh, cell = _ghsl(cfg, cent)
    g["ghsl_h"] = gh.round(1)
    area = g.area.values
    order = np.argsort(cell)
    _, first, counts = np.unique(cell[order], return_index=True, return_counts=True)
    med = np.empty(n)
    for f, c in zip(first, counts):
        idx = order[f:f + c]
        med[idx] = np.median(area[idx])
    size_factor = np.clip((area / med) ** 0.25, 0.7, 1.6)
    jitter = np.array([np.random.default_rng(s).normal(1.0, 0.12) for s in g.seed.values])
    est_h = gh * size_factor * np.clip(jitter, 0.75, 1.25)
    take(gh >= 2.5, np.array([geom.levels_from_height(h) for h in est_h]), "ghsl")

    # Heuristic for the rest (new construction since 2018, GHSL gaps).
    rest = source == ""
    base = np.where(area < 60, 1, np.where(area < 250, 2, 3))
    base = base + (g.dist_arterial.values < 30) * 1
    noise = np.array([np.random.default_rng(int(s) ^ 0x5EED).integers(-1, 2) for s in g.seed.values[rest]])
    levels[rest] = np.clip(base[rest] + noise, 1, 6)
    source[rest] = "heuristic"

    g["levels"] = levels
    g["height_source"] = source
    approx_h = 3.1 + (levels - 1) * floor + 1.0
    g["review_height"] = approx_h > hc["review_above"]
    g.to_parquet(C.interim("buildings_h.parquet"))
    vc = g.height_source.value_counts()
    print("  height sources:", {k: f"{v} ({v / n:.1%})" for k, v in vc.items()})
    print("  levels distribution:", np.bincount(levels)[1:].tolist())
    print(f"  flagged > {hc['review_above']} m: {int(g.review_height.sum())}")
