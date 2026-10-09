import geopandas as gpd
from shapely.geometry import box

from rajkot_bake.buildings import _resolve_overlaps


def _gdf(geoms, tags):
    return gpd.GeoDataFrame({"tags": tags, "geometry": geoms}, crs="EPSG:32642")


def test_partial_overlap_is_clipped_to_shared_wall():
    g = _gdf([box(0, 0, 10, 10), box(9, 0, 15, 10)], [None, None])
    out = _resolve_overlaps(g, min_area=12)
    assert len(out) == 2
    a, b = out.geometry
    assert a.intersection(b).area == 0
    assert a.touches(b)
    assert a.area == 100  # larger outline wins


def test_osm_outline_wins_over_larger_ai_outline():
    g = _gdf([box(0, 0, 12, 10), box(10, 0, 18, 10)], [None, '{"building":"yes"}'])
    out = _resolve_overlaps(g, min_area=12)
    assert out.geometry[1].area == 80
    assert out.geometry[0].area == 100


def test_near_duplicate_is_dropped():
    g = _gdf([box(0, 0, 10, 10), box(1, 1, 9, 9.5)], [None, None])
    out = _resolve_overlaps(g, min_area=12)
    assert len(out) == 1 and out.geometry[0].area == 100
