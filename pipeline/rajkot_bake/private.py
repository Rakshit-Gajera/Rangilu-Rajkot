"""Stage: private places for this machine only (never published).

Reads personal_places from the git-ignored pipeline/local.yaml and writes world/private.local.json:
  {"places": {"home": {"x": ..., "n": ..., "note": ...}}}  (metres from the world origin)
The game uses it for a private spawn point and a "Home" pin on the map. The production build
(game/vite.config.ts) and the repo (.gitignore: /world/) both leave it out.
"""

from __future__ import annotations

import json

from pyproj import Transformer

from . import config as C

OUT = "private.local.json"


def run(cfg: C.Config) -> None:
    places = (cfg.local or {}).get("personal_places") or {}
    out = C.WORLD / OUT
    if not places:
        out.unlink(missing_ok=True)
        print("  no personal places in pipeline/local.yaml")
        return
    meta = C.read_json(C.interim("bounds.json"))
    ox, oy = meta["origin"]["easting"], meta["origin"]["northing"]
    t = Transformer.from_crs(4326, cfg.crs, always_xy=True)
    data = {}
    for name, p in places.items():
        x, y = t.transform(float(p["lon"]), float(p["lat"]))
        data[name] = {"x": round(x - ox, 1), "n": round(y - oy, 1)}
    out.write_text(json.dumps({"places": data}), encoding="utf-8")
    print(f"  {len(data)} private place(s) -> world/{OUT} (git-ignored, excluded from builds)")
