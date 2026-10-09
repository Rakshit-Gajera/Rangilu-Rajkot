"""Stage 13: DATA_REPORT.md (QA checks, coverage) + 2D preview map (PROMPT §7.15).

The preview map is written to world/preview/ (git-ignored). Pass include_private
to add personal places from pipeline/local.yaml (never for anything published).
"""

from __future__ import annotations

import json
from datetime import date

import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from pyproj import Transformer
from shapely import STRtree

from . import config as C
from .classify import ZONE_NAMES

USES = ["residential", "mixed", "commercial", "industrial", "religious", "educational", "civic",
        "healthcare", "transport", "other"]
HSRCS = ["osm_height", "osm_levels", "overture_height", "overture_floors", "ghsl", "heuristic", "other"]
SRCS = ["osm", "ms", "gob", "other"]
ROAD_CLS = {"trunk": "trunk", "motorway": "trunk", "trunk_link": "trunk", "primary": "primary",
            "primary_link": "primary", "secondary": "secondary", "secondary_link": "secondary",
            "tertiary": "tertiary", "tertiary_link": "tertiary"}


def _rings(geom, ox, oy, tol=0.0) -> list[list[int]]:
    if geom is None or geom.is_empty:
        return []
    if tol:
        geom = shapely.simplify(geom, tol)
    out = []
    for p in getattr(geom, "geoms", [geom]):
        if p.geom_type != "Polygon":
            continue
        for ring in [p.exterior, *p.interiors]:
            c = np.round(np.asarray(ring.coords)[:-1] - (ox, oy)).astype(int)
            out.append(c.ravel().tolist())
    return out


def _preview(cfg: C.Config, b: gpd.GeoDataFrame, meta: dict, include_private: bool) -> None:
    ox, oy = meta["origin"]["easting"], meta["origin"]["northing"]
    bounds = gpd.read_parquet(C.interim("bounds.parquet")).set_index("kind").geometry
    simp = shapely.simplify(b.geometry.values, 0.8)
    cent = shapely.centroid(b.geometry.values)
    use_i = {u: i for i, u in enumerate(USES)}
    rec = []
    for lv, z, u, hs, s, c, g in zip(b.levels, b.zone, b.use, b.height_source, b.src, cent, simp):
        if g.geom_type != "Polygon":
            continue
        ring = np.round(np.asarray(g.exterior.coords)[:-1] - (ox, oy)).astype(int).ravel().tolist()
        rec.append([int(lv), int(z), use_i.get(u, 9), HSRCS.index(hs) if hs in HSRCS else 6,
                    SRCS.index(s) if s in SRCS else 3, int(c.x - ox), int(c.y - oy), *ring])

    roads = gpd.read_parquet(C.interim("osm_roads.parquet"))
    roads = roads[roads.intersects(bounds["playable"].buffer(3000))]
    hw = roads.tags.map(lambda t: json.loads(t).get("highway", ""))
    keep = ~hw.isin(["footway", "path", "steps", "cycleway", "construction", "proposed", "bridleway"])
    rl: dict[str, list] = {}
    for h, g in zip(hw[keep], shapely.simplify(roads.geometry[keep].values, 2)):
        for p in getattr(g, "geoms", [g]):
            c = np.round(np.asarray(p.coords) - (ox, oy)).astype(int).ravel().tolist()
            rl.setdefault(ROAD_CLS.get(h, "other"), []).append(c)

    water = gpd.read_parquet(C.interim("osm_water_areas.parquet"))
    water = water[water.intersects(bounds["playable"].buffer(3000))]
    wr = [r for g in water.geometry for r in _rings(g, ox, oy, 2)]

    to_utm = Transformer.from_crs("EPSG:4326", cfg.crs, always_xy=True)
    lms = []
    for _, m in gpd.read_parquet(C.interim("landmarks.parquet")).iterrows():
        if m.geometry is None:
            continue
        p = m.geometry.representative_point() if m.geometry.geom_type != "Point" else m.geometry
        lms.append({"name": m["name"], "conf": m.confidence, "status": m.status, "note": m.note,
                    "x": round(p.x - ox), "y": round(p.y - oy)})
    if include_private:
        for name, pl in (cfg.local.get("personal_places") or {}).items():
            x, y = to_utm.transform(pl["lon"], pl["lat"])
            lms.append({"name": f"★ {name} (private)", "conf": "high", "status": "private", "note": pl.get("note", ""),
                        "x": round(x - ox), "y": round(y - oy)})

    zo = gpd.read_file(C.PIPELINE_DIR / "zones.geojson").to_crs(cfg.crs)
    tg = meta["tile_grid"]
    data = {
        "stats": {"buildings": len(b), "km": round(json.loads(C.interim("roads_stats.json").read_text())["drivable_km"]),
                  "date": date.today().isoformat()},
        "zones": [ZONE_NAMES[k] for k in range(1, 8)], "uses": USES, "hsrcs": HSRCS, "srcs": SRCS,
        "playable": _rings(bounds["playable"], ox, oy), "horizon": _rings(bounds["horizon"], ox, oy, 20),
        "water": wr, "roads": rl, "b": rec, "landmarks": lms,
        "zoneOverrides": [{"r": r} for g in zo.geometry for r in _rings(g, ox, oy)],
        "tiles": {"x0": tg["sw_easting"] - ox, "y0": tg["sw_northing"] - oy, "ni": tg["ni"], "nj": tg["nj"],
                  "size": meta["tile_size"]},
    }
    out = C.WORLD / "preview"
    out.mkdir(parents=True, exist_ok=True)
    (out / "preview_data.js").write_text("window.PREVIEW=" + json.dumps(data, separators=(",", ":")) + ";",
                                         encoding="utf-8")
    tpl = (C.PIPELINE_DIR / "rajkot_bake" / "preview_template.html").read_text(encoding="utf-8")
    (out / "index.html").write_text(tpl, encoding="utf-8")
    size = (out / "preview_data.js").stat().st_size / 1e6
    print(f"  preview map -> {out / 'index.html'} (data {size:.1f} MB)")


def _table(d: dict, h1: str, h2: str) -> str:
    rows = "\n".join(f"| {k} | {v} |" for k, v in d.items())
    return f"| {h1} | {h2} |\n|---|---|\n{rows}\n"


def run(cfg: C.Config, include_private: bool = True) -> None:
    b = gpd.read_parquet(C.interim("buildings.parquet"))
    meta = C.read_json(C.interim("bounds.json"))
    rs = C.read_json(C.interim("roads_stats.json"))
    lm = gpd.read_parquet(C.interim("landmarks.parquet"))
    osm_b = gpd.read_parquet(C.interim("osm_buildings.parquet"))
    n = len(b)

    # QA checks (PROMPT §7.15).
    invalid = int((~shapely.is_valid(b.geometry.values)).sum())
    tree = STRtree(b.geometry.values)
    i, j = tree.query(b.geometry.values, predicate="intersects")
    pairs = i < j
    ov_area = shapely.area(shapely.intersection(b.geometry.values[i[pairs]], b.geometry.values[j[pairs]]))
    overlapping = len(set(i[pairs][ov_area > 1.0]) | set(j[pairs][ov_area > 1.0]))
    overlap_share = overlapping / n
    missing_lm = lm.loc[lm.status == "missing", "id"].tolist()
    checks = [
        ("No invalid geometry", invalid == 0, f"{invalid} invalid"),
        ("Overlapping buildings < 0.5 %", overlap_share < 0.005, f"{overlap_share:.2%} ({overlapping}) overlap > 1 m²"),
        ("Largest road component ≥ 98 % of drivable length", rs["largest_component_share"] >= 0.98,
         f"{rs['largest_component_share']:.1%}"),
        ("Every tile ≤ 1 MB", None, "n/a until tiles are encoded (P1/P2)"),
        ("Every landmark located", not missing_lm, f"missing: {', '.join(missing_lm) or 'none'}"),
    ]

    hs = b.height_source.value_counts()
    lv = b.levels.value_counts().sort_index()
    md = [f"# Data report — Rajkot bake\n\nGenerated {date.today().isoformat()} by `python -m rajkot_bake report`. "
          "Phase 0 (data recon).\n",
          "## QA checks\n", "| Check | Result | Detail |\n|---|---|---|",
          *[f"| {c} | {'PASS' if ok else ('—' if ok is None else '**FAIL**')} | {d} |" for c, ok, d in checks], "",
          "## World frame\n",
          f"- Projection {meta['crs']}; origin {meta['origin']['lonlat']} ({meta['origin']['source']}), "
          f"E {meta['origin']['easting']} N {meta['origin']['northing']}.",
          f"- Playable area {meta['playable_km2']} km², extent {meta['playable_extent_km'][0]} × "
          f"{meta['playable_extent_km'][1]} km; horizon ring 3 km.",
          f"- Tiles: {meta['tiles_active']} active of a {meta['tile_grid']['ni']} × {meta['tile_grid']['nj']} grid (500 m).",
          f"- Lakes matched: {', '.join(meta['lakes_found'])}.", "",
          "## Buildings\n",
          f"- Final buildings: **{n:,}** (OSM outlines in the area: {len(osm_b):,}).",
          _table(b.src.value_counts().rename({"osm": "OpenStreetMap", "ms": "Microsoft ML", "gob": "Google Open Buildings"}).to_dict(),
                 "Outline source", "Buildings"),
          _table({k: f"{v:,} ({v / n:.1%})" for k, v in hs.items()}, "Height source", "Buildings"),
          _table({int(k): f"{v:,}" for k, v in lv.items()}, "Floors", "Buildings"),
          _table({ZONE_NAMES[int(k)]: f"{v:,}" for k, v in b.zone.value_counts().sort_index().items()}, "Style zone", "Buildings"),
          _table({k: f"{v:,}" for k, v in b.use.value_counts().items()}, "Use", "Buildings"),
          f"- Shop ground floor: {int(b.shop_ground_floor.sum()):,}; corner plots: {int(b.corner.sum()):,}; "
          f"shared-wall buildings: {int(b.touching.sum()):,}; outlines squared: {int(b.squared.sum()):,}.",
          f"- Flagged for review: {int(b.giant.sum())} giant outlines (> 20,000 m²), "
          f"{int(b.review_height.sum())} heights > 60 m.", "",
          "## Roads\n",
          f"- Drivable length {rs['drivable_km']} km; {rs['components']} connected components.",
          _table({k: v for k, v in rs["km_by_class"].items()}, "OSM class", "km"),
          _table(rs["km_by_width_rule"], "Width rule", "km"),
          f"- Roads whose name gives the width: {', '.join(rs['named_feet_roads']) or 'none'}.",
          f"- Bridges/flyovers: {rs['bridges_km']} km.", "",
          "## Landmarks\n", "| Landmark | Confidence | Status | Note |\n|---|---|---|---|",
          *[f"| {r['name']} | {r.confidence} | {r.status} | {r.note} |" for _, r in lm.iterrows()], "",
          "## Known data gaps\n",
          "- OSM has no RMC boundary for Rajkot; the playable area is derived (see DECISIONS.md).",
          "- Overture/OSM carry almost no building heights; ~92 % of heights come from GHSL 100 m cell averages "
          "(2018), so isolated towers are likely too short and post-2018 buildings use heuristics.",
          "- Many old-city streets (Dharmendra Rd, Lakhajiraj Rd, Sadar Bazaar) are unnamed in OSM.",
          "- Overture places are POI points of mixed quality (e.g. Darshan University is mis-geocoded).", ""]
    (C.ROOT / "DATA_REPORT.md").write_text("\n".join(md), encoding="utf-8")
    print(f"  DATA_REPORT.md written; checks: " + ", ".join(f"{c.split()[0]}={'ok' if ok else ('n/a' if ok is None else 'FAIL')}" for c, ok, _ in checks))
    _preview(cfg, b, meta, include_private)
