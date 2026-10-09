"""Stage 5: building use, style zone, shop ground floor, palette, metric height (PROMPT §7.5-7.6).

Zones Z1-Z7 (PROMPT §7.12): pipeline/zones.geojson overrides first, then rules.
All rules here are first guesses for Rakshit to correct on the preview map.
"""

from __future__ import annotations

import json

import duckdb
import geopandas as gpd
import numpy as np
import pandas as pd
import shapely
from shapely import STRtree

from . import config as C

ZONE_NAMES = {1: "Z1 Old city", 2: "Z2 Heritage", 3: "Z3 Societies", 4: "Z4 Commercial corridor",
              5: "Z5 New high-rise", 6: "Z6 Industrial", 7: "Z7 Outskirts"}
CORRIDORS = r"(?i)kalawad|yagnik|university road|150\s*(?:ft|feet|foot)|gondal road|raiya road|dhebar|" \
            r"jamnagar road|kuvadva|kuvadava|morbi road|amin marg|tagore|limda chowk"
PALETTES_PER_ZONE = 8

OSM_USE = {
    "house": "residential", "residential": "residential", "apartments": "residential", "detached": "residential",
    "terrace": "residential", "bungalow": "residential", "dormitory": "residential", "hut": "residential",
    "commercial": "commercial", "retail": "commercial", "office": "commercial", "hotel": "commercial",
    "supermarket": "commercial", "kiosk": "commercial", "industrial": "industrial", "warehouse": "industrial",
    "factory": "industrial", "shed": "industrial", "temple": "religious", "mosque": "religious",
    "church": "religious", "religious": "religious", "shrine": "religious", "school": "educational",
    "college": "educational", "university": "educational", "hospital": "healthcare", "civic": "civic",
    "government": "civic", "public": "civic", "fire_station": "civic", "train_station": "transport",
    "transportation": "transport", "garage": "other", "roof": "other", "construction": "other",
}
POI_USE = {  # Overture basic_category / OSM amenity -> use
    "hindu_place_of_worship": "religious", "religious_organization": "religious", "mosque": "religious",
    "church_cathedral": "religious", "sikh_temple": "religious", "jain_temple": "religious",
    "place_of_worship": "religious", "college_university": "educational", "high_school": "educational",
    "school": "educational", "place_of_learning": "educational", "preschool": "educational",
    "university": "educational", "college": "educational", "hospital": "healthcare", "clinic": "healthcare",
    "government_office": "civic", "police_station": "civic", "post_office": "civic", "townhall": "civic",
    "courthouse": "civic", "fire_station": "civic", "library": "civic", "museum": "civic",
}
WORSHIP_TYPE = {"hindu": "hindu_temple", "jain": "jain_derasar", "muslim": "mosque", "christian": "church",
                "sikh": "gurudwara", "hindu_place_of_worship": "hindu_temple", "mosque": "mosque",
                "church_cathedral": "church", "sikh_temple": "gurudwara", "jain_temple": "jain_derasar"}


def _pois(cfg: C.Config) -> gpd.GeoDataFrame:
    osm = gpd.read_parquet(C.interim("osm_pois.parquet"))
    t = osm.tags.map(json.loads)
    osm = gpd.GeoDataFrame({
        "cat": t.map(lambda d: d.get("amenity") or ("shop" if "shop" in d else d.get("tourism") or "other")),
        "religion": t.map(lambda d: d.get("religion")),
        "geometry": osm.geometry.representative_point()}, crs=cfg.crs)
    con = duckdb.connect()
    con.sql("INSTALL spatial; LOAD spatial;")
    src = (C.RAW / "overture" / "overture_places.parquet").as_posix()
    df = con.sql(f"select basic_category cat, ST_AsWKB(geometry) wkb from read_parquet('{src}') "
                 f"where confidence >= 0.5").df()
    ov = gpd.GeoDataFrame({"cat": df.cat.fillna("other"), "religion": None},
                          geometry=shapely.from_wkb(df.wkb.map(bytes)), crs="EPSG:4326").to_crs(cfg.crs)
    return pd.concat([osm, ov], ignore_index=True)


def _cell_stats(g: gpd.GeoDataFrame, cell: float) -> pd.DataFrame:
    c = shapely.centroid(g.geometry.values)
    key = pd.Series(list(zip((shapely.get_x(c) // cell).astype(int), (shapely.get_y(c) // cell).astype(int))))
    df = pd.DataFrame({"key": key, "touch": g.touching.values, "area": g.area.values, "lv": g.levels.values})
    agg = df.groupby("key").agg(n=("area", "size"), touch=("touch", "mean"), med_area=("area", "median"),
                                cover=("area", "sum"), med_lv=("lv", "median"))
    agg["cover"] /= cell * cell
    return df[["key"]].join(agg, on="key")


def run(cfg: C.Config) -> None:
    hc = cfg["heights"]
    g = gpd.read_parquet(C.interim("buildings.parquet"))
    meta = C.read_json(C.interim("bounds.json"))
    oe, on = meta["origin"]["easting"], meta["origin"]["northing"]
    tags = g.tags.map(json.loads)
    geoms = g.geometry.values
    n = len(g)

    # --- Use ---------------------------------------------------------------
    use = np.full(n, "", object)
    btag = tags.map(lambda t: t.get("building", "")).values
    for k, b in enumerate(btag):
        if b in OSM_USE:
            use[k] = OSM_USE[b]
        t = tags.iloc[k]
        if t.get("amenity") == "place_of_worship":
            use[k] = "religious"
    ov_sub = g.ov_subtype.fillna("").values
    sub_map = {"residential": "residential", "education": "educational", "commercial": "commercial",
               "industrial": "industrial", "religious": "religious", "medical": "healthcare",
               "civic": "civic", "transportation": "transport", "entertainment": "commercial"}
    m = (use == "") & np.isin(ov_sub, list(sub_map))
    use[m] = [sub_map[s] for s in ov_sub[m]]

    pois = _pois(cfg)
    tree = STRtree(geoms)
    pi, bi = tree.query(pois.geometry.values, predicate="dwithin", distance=2.0)
    has_shop = np.zeros(n, bool)
    worship = np.full(n, None, object)
    for p, b in zip(pi, bi):
        cat = pois.cat.values[p]
        u = POI_USE.get(cat)
        if u == "religious":
            rel = pois.religion.values[p]
            worship[b] = WORSHIP_TYPE.get(rel) or WORSHIP_TYPE.get(cat, "hindu_temple")
        if u and use[b] in ("", "residential", "commercial", "mixed"):
            use[b] = u
        elif not u and cat not in ("other", None):
            has_shop[b] = True
    for k in np.flatnonzero(use == "religious"):
        if worship[k] is None:
            worship[k] = WORSHIP_TYPE.get(tags.iloc[k].get("religion", ""), "hindu_temple")

    # Industrial land use.
    lu = gpd.read_parquet(C.interim("osm_landuse.parquet"))
    ind = lu[lu.tags.map(lambda t: json.loads(t).get("landuse") == "industrial")]
    in_ind = np.zeros(n, bool)
    if len(ind):
        bi, _ = STRtree(ind.geometry.values).query(shapely.centroid(geoms), predicate="within")
        in_ind[bi] = True

    # --- Zone ----------------------------------------------------------------
    cs = _cell_stats(g, 200.0)
    dist_origin = np.hypot(shapely.get_x(shapely.centroid(geoms)) - oe, shapely.get_y(shapely.centroid(geoms)) - on)
    zone = np.full(n, 3, int)
    zone[(cs.cover.values < 0.05) & (dist_origin > 3000)] = 7
    roads = gpd.read_parquet(C.interim("osm_roads.parquet"))
    cor = roads[roads.name.fillna("").str.contains(CORRIDORS)]
    near_cor = np.zeros(n, bool)
    if len(cor):
        bi, _ = STRtree(cor.geometry.values).query(geoms, predicate="dwithin", distance=30.0)
        near_cor[bi] = True
    zone[near_cor & (zone != 7)] = 4
    zone[(g.levels.values >= 6) | ((cs.med_lv.values >= 5) & (g.levels.values >= 4))] = 5
    zone[in_ind | ((g.area.values > 1500) & (g.levels.values <= 2) & (use != "educational"))] = 6
    zone[(cs.touch.values >= 0.5) & (cs.med_area.values < 150) & (dist_origin < 2000)] = 1

    ov = gpd.read_file(C.PIPELINE_DIR / "zones.geojson").to_crs(cfg.crs)
    for _, z in ov.iterrows():
        zone[tree.query(z.geometry, predicate="intersects")] = int(z.zone)

    # Remaining use defaults by zone.
    rest = use == ""
    use[rest & (zone == 6)] = "industrial"
    shop_gf = has_shop | ((g.frontage_m.values > 0) & np.isin(zone, [1, 4]) & (g.dist_arterial.values < 25))
    shop_gf &= ~np.isin(use, ["religious", "educational", "healthcare", "industrial", "civic"])
    rest = use == ""
    use[rest & shop_gf & (g.levels.values >= 2)] = "mixed"
    use[rest & shop_gf & (g.levels.values < 2)] = "commercial"
    use[use == ""] = "residential"
    use[(use == "residential") & shop_gf] = "mixed"

    # --- Metric height (PROMPT §7.5) -----------------------------------------
    lo, hi = hc["clamp"]
    height = np.empty(n)
    for k, (lv, s, seed) in enumerate(zip(g.levels.values, shop_gf, g.seed.values)):
        r = np.random.default_rng(int(seed))
        ground = r.uniform(*hc["shop_ground_floor"]) if s else hc["floor_height"]
        height[k] = ground + (lv - 1) * hc["floor_height"] + r.uniform(*hc["parapet"])
    g["height"] = np.clip(height, lo, hi).round(2)
    g["use"] = use
    g["worship"] = worship
    g["zone"] = zone
    g["shop_ground_floor"] = shop_gf
    g["palette_id"] = (g.seed.values % PALETTES_PER_ZONE).astype("uint8")
    g.to_parquet(C.interim("buildings.parquet"))
    print("  use:", pd.Series(use).value_counts().to_dict())
    print("  zone:", {ZONE_NAMES[k]: int(v) for k, v in sorted(pd.Series(zone).value_counts().items())})
    print(f"  shop ground floor: {int(shop_gf.sum())}; worship: {pd.Series(worship).value_counts().to_dict()}")
