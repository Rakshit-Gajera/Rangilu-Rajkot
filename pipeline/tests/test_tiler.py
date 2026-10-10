import numpy as np
from shapely.geometry import LineString

from rajkot_bake.flyovers import deck_heights

FLAT = lambda p: np.full(len(p), 30.0)  # noqa: E731


def _max_grade(line, y):
    s = np.linspace(0, line.length, len(y))
    return float(np.max(np.abs(np.diff(y) / np.diff(s))))


def test_flyover_split_into_pieces_has_no_humps():
    # One 600 m flyover mapped as four OSM ways.
    pieces = [LineString([(x, 0), (x + 150, 0)]) for x in range(0, 600, 150)]
    decks = deck_heights(pieces, [1] * 4, FLAT)
    joined = np.concatenate([d[:-1] for d in decks] + [decks[-1][-1:]])
    assert joined[0] == 30.0 and joined[-1] == 30.0
    middle = joined[len(joined) // 2 - 20: len(joined) // 2 + 20]
    assert middle.min() > 35.5  # stays up over the middle, no dip at the way joints
    for line, d in zip(pieces, decks):
        assert _max_grade(line, d) <= 0.08


def test_short_bridge_stays_level_over_a_nala():
    line = LineString([(0, 0), (15, 0)])
    ground = lambda p: 30 - 2 * np.exp(-((p[:, 0] - 7.5) ** 2) / 10)  # noqa: E731
    deck = deck_heights([line], [1], ground)[0]
    assert np.allclose(deck, 30.0, atol=0.05)


def test_river_bridge_is_not_below_its_banks():
    line = LineString([(0, 0), (200, 0)])
    ground = lambda p: 30 - 4 * np.sin(np.pi * p[:, 0] / 200)  # noqa: E731
    deck = deck_heights([line], [1], ground)[0]
    assert deck.min() >= 30.0 - 1e-6
