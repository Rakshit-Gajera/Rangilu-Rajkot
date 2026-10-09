"""Stage 2b: playable area, horizon ring, origin and tile grid (PROMPT §7.1).

OSM has no RMC boundary for Rajkot, so the city extent is derived from data:
urban talukas + the OSM place=city polygon + the densely built-up area from
Overture buildings (DECISIONS.md 2026-10-09).
"""

from __future__ import annotations

import json
import math

import duckdb
import geopandas as gpd
import numpy as np
import shapely
from pyproj import Transformer
from scipy import ndimage
from shapely.geometry import Point, box

from . import config as C


def _builtup(cfg: C.Config, cell: float, min_cover: float, closing: int) -> shapely.Geometry:
    """Union of grid cells whose building footprint coverage is >= min_cover."""
    con = duckdb.connect()
    con.sql("INSTALL spatial; LOAD spatial;")
    src = (C.RAW / cfg["fetch"]["sources"]["overture_buildings"]["file"]).as_posix()
    xy = con.sql(f"""
        select ST_X(c) x, ST_Y(c) y, a from (
          select ST_Centroid(g) c, ST_Area(g) a from (
            select ST_Transform(geometry, 'EPSG:4326', '{cfg.crs}', always_xy := true) g
            from read_parquet('{src}')))""").fetchnumpy()
    x, y, a = xy["x"], xy["y"], xy["a"]
    x0, y0 = math.floor(x.min() / cell) * cell, math.floor(y.min() / cell) * cell
    nx, ny = int((x.max() - x0) // cell) + 1, int((y.max() - y0) // cell) + 1
    grid = np.zeros((ny, nx))
    np.add.at(grid, (((y - y0) // cell).astype(int), ((x - x0) // cell).astype(int)), a)
    mask = grid / (cell * cell) >= min_cover
    mask = ndimage.binary_closing(mask, iterations=closing)
    mask = ndimage.binary_fill_holes(mask)
    labels, n = ndimage.label(mask)
    cells = [box(x0 + i * cell, y0 + j * cell, x0 + (i + 1) * cell, y0 + (j + 1) * cell)
             for j, i in zip(*np.nonzero(mask))]
    print(f"  built-up: {mask.sum()} cells of {cell:.0f} m, {n} components")
    return shapely.union_all(cells)


def run(cfg: C.Config) -> None:
    w = cfg["world"]
    to_utm = Transformer.from_crs("EPSG:4326", cfg.crs, always_xy=True)

    # Origin (rounded to whole metres so world coordinates are exact).
    lon, lat = w["origin"]["lonlat"]
    oe, on = (round(v) for v in to_utm.transform(lon, lat))
    origin = Point(oe, on)

    # City core.
    b = gpd.read_parquet(C.interim("osm_boundaries.parquet"))
    tags = b.tags.map(json.loads)
    talukas = b[b.name.isin(w["urban_talukas"])]
    city = b[tags.map(lambda t: t.get("place") == "city") & b.intersects(origin.buffer(3000))]
    print(f"  urban talukas found: {sorted(talukas.name)}; city polygons: {len(city)}")
    core = shapely.union_all([*talukas.geometry, *city.geometry])

    bu = w["builtup"]
    built = _builtup(cfg, bu["cell"], bu["min_cover"], bu["closing"])
    # Keep built-up blobs that touch the core, clipped to a radius around the origin
    # (ribbon development along highways would otherwise pull in distant GIDCs).
    built = built.intersection(origin.buffer(bu["max_distance"]))
    parts = [p for p in getattr(built, "geoms", [built]) if p.intersects(core.buffer(500))]
    core = shapely.union_all([core, *parts])

    playable = core.buffer(w["rmc_buffer"])

    # Lakes: OSM water polygons pinned by id in config.yaml.
    water = gpd.read_parquet(C.interim("osm_water_areas.parquet"))
    lakes = []
    for name, lk in w["lakes"].items():
        hit = water[(water.osm_type == lk["osm"][0]) & (water.osm_id == int(lk["osm"][1:]))]
        if len(hit):
            lakes.append((name, hit.iloc[0]))
        else:
            print(f"  WARNING lake {name}: OSM {lk['osm']} not found")
    for name, row in lakes:
        playable = playable.union(row.geometry.buffer(w["lake_buffer"]))

    # Extra areas (e.g. Darshan University) with a corridor along their access road.
    for ex in w.get("extras", []):
        if not ex.get("lonlat"):
            print(f"  PENDING extra '{ex['name']}': no verified location yet")
            continue
        p = Point(*to_utm.transform(*ex["lonlat"]))
        roads = gpd.read_parquet(C.interim("osm_roads.parquet"))
        corridor = roads[roads.name.fillna("").str.contains(ex["corridor_road"], case=False)]
        seg = shapely.union_all(corridor.geometry.values)
        # Only the stretch between the city and the site.
        reach = shapely.convex_hull(shapely.union_all([p.buffer(ex["buffer"]), playable.boundary]))
        playable = playable.union(seg.intersection(reach).buffer(ex["corridor_width"]))
        playable = playable.union(p.buffer(ex["buffer"]))

    playable = shapely.simplify(shapely.make_valid(playable), 10)
    horizon = playable.buffer(w["horizon_ring"]).difference(playable)

    # Tile grid aligned to the origin; (i, j) are relative to the origin so ids
    # stay stable when the playable area grows.
    ts = w["tile_size"]
    minx, miny, maxx, maxy = playable.bounds
    i0, j0 = math.floor((minx - oe) / ts), math.floor((miny - on) / ts)
    i1, j1 = math.ceil((maxx - oe) / ts), math.ceil((maxy - on) / ts)
    tiles = []
    for j in range(j0, j1):
        for i in range(i0, i1):
            t = box(oe + i * ts, on + j * ts, oe + (i + 1) * ts, on + (j + 1) * ts)
            if t.intersects(playable):
                tiles.append({"i": i, "j": j, "geometry": t})

    gpd.GeoDataFrame([{"kind": "playable", "geometry": playable}, {"kind": "horizon", "geometry": horizon},
                      {"kind": "core", "geometry": core}], crs=cfg.crs).to_parquet(C.interim("bounds.parquet"))
    gpd.GeoDataFrame(tiles, crs=cfg.crs).to_parquet(C.interim("tiles.parquet"))
    gpd.GeoDataFrame([{"name": n, "osm_type": r.osm_type, "osm_id": r.osm_id, "geometry": r.geometry}
                      for n, r in lakes], crs=cfg.crs).to_parquet(C.interim("lakes.parquet"))
    meta = {
        "crs": cfg.crs,
        "origin": {"lonlat": [lon, lat], "easting": oe, "northing": on, "source": w["origin"]["source"]},
        "tile_size": ts,
        "tile_grid": {"i0": i0, "j0": j0, "ni": i1 - i0, "nj": j1 - j0,
                      "sw_easting": oe + i0 * ts, "sw_northing": on + j0 * ts},
        "tiles_active": len(tiles),
        "playable_km2": round(playable.area / 1e6, 1),
        "playable_extent_km": [round((maxx - minx) / 1000, 1), round((maxy - miny) / 1000, 1)],
        "lakes_found": [n for n, _ in lakes],
    }
    C.write_json(C.interim("bounds.json"), meta)
    print(f"  playable {meta['playable_km2']} km², extent {meta['playable_extent_km']} km, "
          f"{len(tiles)} tiles, lakes {meta['lakes_found']}")
