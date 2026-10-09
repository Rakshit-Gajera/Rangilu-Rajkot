import math

import numpy as np
import pytest
from shapely import affinity
from shapely.geometry import Polygon, box

from rajkot_bake import geom


@pytest.mark.parametrize("tags,expected,rule", [
    ({"width": "12"}, 12.0, "width_tag"),
    ({"name": "150 Feet Ring Road", "highway": "primary"}, round(150 * 0.3048 * 0.7, 1), "name_feet"),
    ({"name": "80 Ft Road", "highway": "secondary"}, round(80 * 0.3048 * 0.7, 1), "name_feet"),
    ({"name": "50 fit main road"}, round(50 * 0.3048 * 0.7, 1), "name_feet"),
    ({"lanes": "4", "highway": "primary"}, 12.8, "lanes"),
    ({"highway": "residential"}, 6.0, "class_default"),
    ({"highway": "primary_link"}, 14.0, "class_default"),
])
def test_road_width(tags, expected, rule):
    w, r = geom.road_width(tags)
    assert r == rule
    assert w == pytest.approx(expected)


def test_seed_is_stable():
    assert geom.seed_of("w123") == geom.seed_of("w123")
    assert geom.seed_of("w123") != geom.seed_of("w124")
    assert 0 <= geom.seed_of("x") < 2**64


def test_height_formula_bounds():
    rng = np.random.default_rng(0)
    h = geom.height_from_levels(4, shop=True, rng=rng)
    assert 3.6 + 3 * 3.1 + 0.9 <= h <= 4.2 + 3 * 3.1 + 1.1
    assert geom.levels_from_height(13.0) == 4
    assert geom.levels_from_height(2.0) == 1


def test_square_polygon_snaps_skewed_rectangle():
    # A 20x10 rectangle rotated 30 degrees, with one corner pushed off-square.
    r = affinity.rotate(box(0, 0, 20, 10), 30, origin=(0, 0))
    c = list(r.exterior.coords)[:-1]
    c[2] = (c[2][0] + 0.6, c[2][1] - 0.3)
    sq = geom.square_polygon(Polygon(c))
    assert sq is not None
    pts = list(sq.exterior.coords)[:-1]
    for k in range(len(pts)):
        a, b, d = np.array(pts[k - 1]), np.array(pts[k]), np.array(pts[(k + 1) % len(pts)])
        u, v = a - b, d - b
        cos = u @ v / (np.linalg.norm(u) * np.linalg.norm(v))
        assert abs(cos) < 1e-6
    assert sq.area == pytest.approx(200, rel=0.05)


def test_square_polygon_handles_l_shape():
    l = Polygon([(0, 0), (10, 0), (10, 4), (4, 4.2), (4, 10), (0, 10)])
    sq = geom.square_polygon(l)
    assert sq is not None and len(sq.exterior.coords) == 7


def test_square_polygon_rejects_non_rectilinear():
    tri = Polygon([(0, 0), (10, 0), (5, 8)])
    assert geom.square_polygon(tri) is None
    octagon = Polygon([(math.cos(a), math.sin(a)) for a in np.linspace(0, 2 * math.pi, 9)[:-1]])
    assert geom.square_polygon(octagon) is None


def test_iou():
    assert geom.iou(box(0, 0, 2, 2), box(1, 0, 3, 2)) == pytest.approx(1 / 3)
    assert geom.iou(box(0, 0, 1, 1), box(5, 5, 6, 6)) == 0
