"""Command line: python -m rajkot_bake <stage> [...]"""

from __future__ import annotations

import argparse
import importlib
import time

from . import config as C

# Stage name -> module. Order matters for `all`.
STAGES = {
    "fetch": "fetch",
    "osm": "osm",
    "bounds": "bounds",
    "buildings": "buildings",
    "heights": "heights",
    "classify": "classify",
    "landmarks": "landmarks",
    "roads": "roads_raw",
    "report": "report",
}


def main() -> None:
    p = argparse.ArgumentParser(prog="rajkot_bake")
    p.add_argument("stages", nargs="+", choices=[*STAGES, "all"])
    args = p.parse_args()
    cfg = C.load()
    names = list(STAGES) if "all" in args.stages else args.stages
    for name in names:
        t0 = time.perf_counter()
        print(f"[{name}]")
        importlib.import_module(f".{STAGES[name]}", __package__).run(cfg)
        print(f"[{name}] done in {time.perf_counter() - t0:.1f}s")
