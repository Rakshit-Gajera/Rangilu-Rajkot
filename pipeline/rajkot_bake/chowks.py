"""Chowks and circles (PROMPT §7.7): roundabout islands, their names and centrepieces.

Sources (refs/SOURCES.md):
  * islands  = areas enclosed by OSM roundabout ways (junction=roundabout/circular);
  * names    = nearest Overture place named "... Chowk/Circle/Chowkdi" (medium confidence);
  * statues  = Overture places that are statues/monuments (e.g. "Indira Gandhi Statue"), placed on the
               island they stand on, or on their own plinth where they stand.
Islands without a sourced statue get a generic centrepiece (garden, fountain, sculpture or flag)
chosen by size and seed — decoration, not a claim about the real chowk. pipeline/chowks.yaml lets
Rakshit correct names, statues and centrepieces.
Output: data/interim/chowks.parquet.
"""

from __future__ import annotations

import re

import duckdb
import geopandas as gpd
import numpy as np
import shapely
import yaml
from shapely.geometry import Point

from . import config as C
from . import geom

KINDS = {"garden": 0, "fountain": 1, "statue": 2, "sculpture": 3, "flag": 4}
SUBJECTS = {"none": 0, "gandhi": 1, "indira": 2, "vivekananda": 3, "hanuman": 4, "patel": 5, "ambedkar": 6, "figure": 7}
SUBJECT_RE = [("indira", r"indira"), ("gandhi", r"mahatma|gandhi"), ("vivekananda", r"vivekanand"),
              ("hanuman", r"hanuman|bajrang"), ("patel", r"sardar|patel"), ("ambedkar", r"ambedkar")]
CHOWK_RE = re.compile(r"(?i)\b(chowk|chowkdi|chokdi|circle|chauraha)\b")
# "Medkart Pharmacy Moti Tanki Chowk" -> "Moti Tanki Chowk": up to three words before the chowk word.
CHOWK_PHRASE = re.compile(r"((?:[A-Za-z][\w.]*\s+){1,3}(?:chowk|chowkdi|chokdi|circle|chauraha))\b", re.I)
SHOP_WORDS = re.compile(r"(?i)\b(pharmacy|home|loan|financiers?|telecom|desserts|shakes|store|shop|bank|hotel|"
                        r"restaurant|cafe|services?|pvt|ltd|clinic|hospital|near|opp|beside|medkart|poojara|dns|n)\b")


def chowk_name(raw: str) -> str | None:
    """The chowk's own name from a place name, or None if there isn't one."""
    found = None
    for part in raw.split(","):
        for m in CHOWK_PHRASE.finditer(part):
            found = m.group(1)
        if found:
            break
    if not found:
        return None
    words = found.split()
    # Drop shop words that crept in front ("Shakes _ Kishanpara Chowk" -> "Kishanpara Chowk").
    while len(words) > 2 and SHOP_WORDS.search(words[0]):
        words = words[1:]
    if SHOP_WORDS.search(" ".join(words)):
        return None
    return " ".join(w if w.isupper() and len(w) <= 3 else w[0].upper() + w[1:] for w in words)
STATUE_RE = re.compile(r"(?i)statue|pratima|putla")


def _subject(name: str) -> str:
    for key, pat in SUBJECT_RE:
        if re.search(pat, name, re.I):
            return key
    return "figure"


def run(cfg: C.Config) -> None:
    roads = gpd.read_parquet(C.interim("roads.parquet"))
    ring = roads[roads.roundabout]
    merged = shapely.line_merge(shapely.union_all(ring.geometry.values))
    islands = [p for p in getattr(shapely.polygonize(list(getattr(merged, "geoms", [merged]))), "geoms", [])
               if 15 < p.area < 20000]
    # Drop islands that contain other islands (large blocks enclosed by several roundabouts).
    islands = [p for p in islands if not any(q is not p and p.contains(q) for q in islands)]

    con = duckdb.connect()
    con.sql("INSTALL spatial; LOAD spatial;")
    src = (C.RAW / cfg["fetch"]["sources"]["overture_places"]["file"]).as_posix()
    df = con.sql(f"""select names.primary AS "name", basic_category AS "cat", confidence AS "conf", ST_AsWKB(geometry) AS "wkb"
                     from read_parquet('{src}') where names.primary is not null""").df()
    places = gpd.GeoDataFrame(df.drop(columns="wkb"), geometry=shapely.from_wkb(df.wkb.map(bytes)),
                              crs="EPSG:4326").to_crs(cfg.crs)
    chowk_names = places[places.name.str.contains(CHOWK_RE) & (places.conf >= 0.4)]
    statues = places[(places.name.str.contains(STATUE_RE) | (places.cat == "monument")) & (places.conf >= 0.4)
                     & ~places.name.str.contains(CHOWK_RE)]

    surf = shapely.union_all(shapely.buffer(roads.geometry.values, roads.width.values / 2))
    rows = []
    used_statues = set()
    for poly in islands:
        c = poly.centroid
        r = np.sqrt(poly.area / np.pi)
        d = chowk_names.distance(c)
        name = chowk_name(chowk_names.name.values[int(d.argmin())]) if len(d) and d.min() < 120 + r else None
        ds = statues.distance(c)
        near = ds[ds < r + 40]
        kind, subject, source, conf = None, "none", "generic", "low"
        if len(near):
            k = near.idxmin()
            used_statues.add(k)
            kind, subject = "statue", _subject(statues.name[k])
            source, conf = f"Overture place: {statues.name[k]}", "medium"
        rows.append({"name": name, "kind": kind, "subject": subject, "source": source, "confidence": conf,
                     "geometry": poly})
    # Statues not on any roundabout: on the road (a junction centre) they get a small island; elsewhere a plinth.
    playable = gpd.read_parquet(C.interim("bounds.parquet")).set_index("kind").geometry["playable"]
    for k, srow in statues.iterrows():
        if k in used_statues or not srow.geometry.within(playable):
            continue
        on_road = surf.contains(srow.geometry)
        poly = srow.geometry.buffer(6.0 if on_road else 2.5, quad_segs=6)
        rows.append({"name": srow["name"].split(",")[0], "kind": "statue", "subject": _subject(srow["name"]),
                     "source": f"Overture place: {srow['name']}", "confidence": "medium", "geometry": poly,
                     "island": on_road})

    g = gpd.GeoDataFrame(rows, geometry="geometry", crs=cfg.crs)
    if "island" not in g:
        g["island"] = True
    g["island"] = g["island"].fillna(True).astype(bool)

    # Owner corrections (pipeline/chowks.yaml): match by name or by position.
    path = C.PIPELINE_DIR / "chowks.yaml"
    if path.exists():
        for fix in (yaml.safe_load(path.read_text(encoding="utf-8")) or {}).get("chowks", []):
            sel = g.name == fix["match"] if "match" in fix else g.distance(Point(fix["x"], fix["y"])) < 30
            for key in ("name", "kind", "subject"):
                if key in fix:
                    g.loc[sel, key] = fix[key]
            g.loc[sel, ["source", "confidence"]] = ["Rakshit (chowks.yaml)", "high"]

    # Generic centrepieces for the rest, by island size.
    g["seed"] = [geom.seed_of(f"chowk:{round(p.centroid.x)}:{round(p.centroid.y)}") for p in g.geometry]
    radius = np.sqrt(g.area / np.pi)
    for k in np.flatnonzero(g.kind.isna().values):
        rnd = (int(g.seed.values[k]) >> 8) % 100
        r = radius[k]
        g.iat[k, g.columns.get_loc("kind")] = (
            "garden" if r < 5 else "fountain" if r > 14 and rnd < 55 else "sculpture" if rnd < 70 else "flag"
            if r > 8 and rnd < 85 else "garden")
    g.to_parquet(C.interim("chowks.parquet"))
    print(f"  chowks: {len(g)} ({int(g.island.sum())} islands); named {int(g.name.notna().sum())}; "
          f"kinds {g.kind.value_counts().to_dict()}; statues {g.loc[g.kind == 'statue', 'subject'].value_counts().to_dict()}")
