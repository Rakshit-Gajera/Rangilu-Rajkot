import numpy as np

from rajkot_bake.tiler import bridge_profile


def _max_grade(s, y):
    return float(np.max(np.abs(np.diff(y) / np.diff(s))))


def test_short_bridge_has_no_hump():
    s = np.linspace(0, 15, 4)
    ground = np.array([30.0, 28.0, 28.0, 30.2])  # nala under the bridge
    deck = bridge_profile(s, ground, layer=1)
    assert deck.max() <= 30.2 + 1e-6
    assert _max_grade(s, deck) < 0.05


def test_flyover_rises_with_gentle_ramps():
    s = np.linspace(0, 600, 121)
    ground = np.full_like(s, 30.0)
    deck = bridge_profile(s, ground, layer=1)
    assert deck.max() > 34.5  # clearly elevated over the junction
    assert _max_grade(s, deck) <= 0.061
    assert deck[0] == 30.0 and deck[-1] == 30.0


def test_deck_never_below_ground():
    s = np.linspace(0, 100, 21)
    ground = 30 + np.sin(s / 10) * 3
    deck = bridge_profile(s, ground, layer=1)
    assert np.all(deck >= ground - 1e-9)
