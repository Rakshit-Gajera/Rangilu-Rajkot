"""Stage 7: terrain (PROMPT §7.8).

Copernicus GLO-30 is a surface model (roofs, canopy), so building footprints
(+15 m) are masked and refilled from surrounding ground, then smoothed.
The result is resampled to a 10 m grid aligned with the tile grid, and the
ground under roads is flattened to a smoothed road profile (max grade 8 %).

Output: data/interim/terrain_10m.npy (float32 absolute elevation, row 0 = south)
and terrain_10m.json (grid origin and size).
"""

from __future__ import annotations

import json

import geopandas as gpd
import numpy as np
import rasterio
import shapely
from rasterio.enums import Resampling
from rasterio.features import rasterize
from rasterio.fill import fillnodata
from rasterio.transform import from_origin
from rasterio.warp import reproject
from scipy import ndimage
from scipy.spatial import cKDTree

from . import config as C
from . import geom
from .buildings import DRIVABLE

RES = 10.0
COARSE = 30.0


def grid_meta(cfg: C.Config) -> dict:
    """10 m grid covering every tile plus the horizon ring, aligned to tile corners."""
    meta = C.read_json(C.interim("bounds.json"))
    tg, ts = meta["tile_grid"], meta["tile_size"]
    margin = cfg["world"]["horizon_ring"]
    x0 = tg["sw_easting"] - margin
    y0 = tg["sw_northing"] - margin
    nx = int(round((tg["ni"] * ts + 2 * margin) / RES)) + 1
    ny = int(round((tg["nj"] * ts + 2 * margin) / RES)) + 1
    return {"x0": x0, "y0": y0, "res": RES, "nx": nx, "ny": ny}


def _road_profiles(cfg: C.Config, sample) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Dense points along every non-bridge road with a smoothed, grade-limited height."""
    roads = gpd.read_parquet(C.interim("osm_roads.parquet"))
    tags = roads.tags.map(json.loads)
    keep = tags.map(lambda t: t.get("highway") in DRIVABLE and t.get("bridge") in (None, "no")
                    and t.get("tunnel") in (None, "no"))
    pts, hs, hw = [], [], []
    step = 5.0
    sigma = 20.0 / step  # ~60 m Gaussian window
    for line, t in zip(roads.geometry[keep].values, tags[keep].values):
        half = geom.road_width(t)[0] / 2
        for part in getattr(line, "geoms", [line]):
            n = max(2, int(part.length // step) + 1)
            p = shapely.get_coordinates(shapely.line_interpolate_point(part, np.linspace(0, part.length, n)))
            h = ndimage.gaussian_filter1d(sample(p), sigma, mode="nearest")
            # Max grade 8 %: limit the change between consecutive samples, both directions.
            d = np.hypot(*np.diff(p, axis=0).T)
            for rng in (range(1, n), range(n - 2, -1, -1)):
                for k in rng:
                    j = k - 1 if rng.step == 1 else k + 1
                    lim = 0.08 * d[min(k, j)]
                    h[k] = np.clip(h[k], h[j] - lim, h[j] + lim)
            pts.append(p)
            hs.append(h)
            hw.append(np.full(n, half))
    return np.vstack(pts), np.concatenate(hs), np.concatenate(hw)


def run(cfg: C.Config) -> None:
    gm = grid_meta(cfg)
    x0, y0, nx, ny = gm["x0"], gm["y0"], gm["nx"], gm["ny"]

    # 1. DEM -> UTM at ~30 m over the grid extent.
    cnx, cny = int(np.ceil((nx - 1) * RES / COARSE)) + 1, int(np.ceil((ny - 1) * RES / COARSE)) + 1
    ctr = from_origin(x0 - COARSE / 2, y0 + (cny - 0.5) * COARSE, COARSE, COARSE)  # north-up
    dem = np.full((cny, cnx), np.nan, np.float32)
    src_path = C.RAW / cfg["fetch"]["sources"]["dem"]["file"]
    with rasterio.open(src_path) as src:
        reproject(rasterio.band(src, 1), dem, dst_transform=ctr, dst_crs=cfg.crs,
                  resampling=Resampling.bilinear, dst_nodata=np.nan)

    # 2. De-bump: mask buildings + 15 m and wooded land, refill from surrounding ground.
    b = gpd.read_parquet(C.interim("buildings_c.parquet"))
    shapes = list(shapely.buffer(b.geometry.values, 15.0))
    lu = gpd.read_parquet(C.interim("osm_landuse.parquet"))
    woods = lu[lu.tags.map(lambda t: json.loads(t).get("natural") in ("wood",) or
                           json.loads(t).get("landuse") == "forest")]
    shapes += list(woods.geometry.values)
    mask = rasterize(((s, 1) for s in shapes), out_shape=dem.shape, transform=ctr, fill=0,
                     dtype="uint8", all_touched=True).astype(bool)
    valid = (~mask & np.isfinite(dem)).astype("uint8")
    print(f"  masked {mask.mean():.1%} of 30 m cells (buildings + 15 m, woods)")
    filled = fillnodata(np.nan_to_num(dem, nan=0).copy(), mask=valid, max_search_distance=200, smoothing_iterations=0)
    filled = ndimage.median_filter(filled, size=3)
    filled = ndimage.gaussian_filter(filled, sigma=1.0)

    # 3. Resample to the 10 m grid (row 0 = south edge, y0).
    gx = np.arange(nx) * RES + x0
    gy = np.arange(ny) * RES + y0
    col = (gx - (x0 - COARSE / 2)) / COARSE - 0.5
    row_north = ((y0 + (cny - 0.5) * COARSE) - gy) / COARSE - 0.5
    rr, cc = np.meshgrid(row_north, col, indexing="ij")
    h = ndimage.map_coordinates(filled, [rr, cc], order=1, mode="nearest").astype(np.float32)

    def sample(p: np.ndarray) -> np.ndarray:
        return ndimage.map_coordinates(h, [(p[:, 1] - y0) / RES, (p[:, 0] - x0) / RES], order=1, mode="nearest")

    # 4. Conform: flatten under roads (half-width + 1 m, blended over 6 m).
    pts, ph, phw = _road_profiles(cfg, sample)
    tree = cKDTree(pts)
    reach = phw.max() + 7.0
    ys, xs = np.mgrid[0:ny, 0:nx]
    cell_xy = np.column_stack([xs.ravel() * RES + x0, ys.ravel() * RES + y0])
    d, idx = tree.query(cell_xy, distance_upper_bound=reach, workers=-1)
    hit = np.isfinite(d)
    d, idx = d[hit], idx[hit]
    t = np.clip((d - (phw[idx] + 1.0)) / 6.0, 0, 1)
    flat = h.ravel()
    flat[hit] = ph[idx] * (1 - t) + flat[hit] * t
    h = flat.reshape(ny, nx)
    print(f"  conformed {hit.mean():.1%} of 10 m cells to {len(pts):,} road samples")

    np.save(C.interim("terrain_10m.npy"), h)
    C.write_json(C.interim("terrain_10m.json"), gm)
    print(f"  terrain grid {nx} x {ny} @ {RES:.0f} m, elevation {h.min():.1f}–{h.max():.1f} m")
