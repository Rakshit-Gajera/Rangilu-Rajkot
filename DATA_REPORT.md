# Data report — Rajkot bake

Generated 2026-10-09 by `python -m rajkot_bake report`. Phase 0 (data recon).

## QA checks

| Check | Result | Detail |
|---|---|---|
| No invalid geometry | PASS | 0 invalid |
| Overlapping buildings < 0.5 % | PASS | 0.00% (0) overlap > 1 m² |
| Largest road component ≥ 98 % of drivable length | PASS | 99.5% |
| Every tile ≤ 1 MB | — | n/a until tiles are encoded (P1/P2) |
| Every landmark located | **FAIL** | missing: connaught_hall, dharmendra_road, lakhajiraj_road, sadar_bazaar, ramvan, darshan_university |

## World frame

- Projection EPSG:32642; origin [70.80185, 22.29487] (Overture places: Trikonbaug Ka Raja), E 685623 N 2466573.
- Playable area 333.0 km², extent 26.9 × 21.0 km; horizon ring 3 km.
- Tiles: 1447 active of a 55 × 43 grid (500 m).
- Lakes matched: Aji-1, Nyari-1, Lalpari, Randarda.

## Buildings

- Final buildings: **161,882** (OSM outlines in the area: 12,695).
| Outline source | Buildings |
|---|---|
| Microsoft ML | 78304 |
| Google Open Buildings | 71074 |
| OpenStreetMap | 12504 |

| Height source | Buildings |
|---|---|
| ghsl | 148,581 (91.8%) |
| heuristic | 13,286 (8.2%) |
| osm_levels | 13 (0.0%) |
| osm_height | 2 (0.0%) |

| Floors | Buildings |
|---|---|
| 1 | 51,804 |
| 2 | 52,935 |
| 3 | 35,764 |
| 4 | 13,500 |
| 5 | 4,696 |
| 6 | 1,701 |
| 7 | 780 |
| 8 | 331 |
| 9 | 180 |
| 10 | 105 |
| 11 | 49 |
| 12 | 19 |
| 13 | 13 |
| 14 | 5 |

| Style zone | Buildings |
|---|---|
| Z1 Old city | 775 |
| Z2 Heritage | 345 |
| Z3 Societies | 127,128 |
| Z4 Commercial corridor | 1,755 |
| Z5 New high-rise | 4,538 |
| Z6 Industrial | 6,089 |
| Z7 Outskirts | 21,252 |

| Use | Buildings |
|---|---|
| residential | 151,533 |
| industrial | 6,069 |
| mixed | 3,313 |
| healthcare | 281 |
| educational | 265 |
| commercial | 209 |
| religious | 150 |
| civic | 61 |
| transport | 1 |

- Shop ground floor: 3,516; corner plots: 14,443; shared-wall buildings: 38,050; outlines squared: 113,682.
- Flagged for review: 1 giant outlines (> 20,000 m²), 0 heights > 60 m.

## Roads

- Drivable length 3437.2 km; 31 connected components.
| OSM class | km |
|---|---|
| residential | 2330.1 |
| tertiary | 393.9 |
| service | 282.1 |
| track | 161.6 |
| primary | 131.9 |
| unclassified | 111.0 |
| trunk | 90.8 |
| secondary | 77.8 |
| path | 13.8 |
| footway | 9.6 |
| living_street | 8.8 |
| pedestrian | 7.8 |
| construction | 4.5 |
| bus_guideway | 1.6 |
| trunk_link | 1.4 |
| tertiary_link | 1.1 |
| primary_link | 0.4 |
| secondary_link | 0.2 |
| steps | 0.1 |

| Width rule | km |
|---|---|
| class_default | 3514.0 |
| lanes | 99.9 |
| name_feet | 14.4 |

- Roads whose name gives the width: 150 Foot Ring Road, 150 Foot Ring Road Flyover, 150 feet ring road, 150Feet Ring Road Railway Flyover, 40 ft. road, BRTS Route (150 ft. Ring Road), Nana Mava Circle Flyover, Shahid Flyover.
- Bridges/flyovers: 46.02 km.

## Landmarks

| Landmark | Confidence | Status | Note |
|---|---|---|---|
| Race Course (ground, ring road, walking track) | high | located |  |
| Madhavrao Scindia Cricket Ground | medium | approx |  |
| Bal Bhavan | high | located |  |
| Jubilee Garden | high | located |  |
| Watson Museum | high | located |  |
| Connaught Hall | low | missing | Not in OSM or Overture. Inside Jubilee Garden per general knowledge; needs a pin from Rakshit. |
| Kaba Gandhi no Delo | medium | approx |  |
| Mahatma Gandhi Museum (former Alfred High School) | medium | approx |  |
| Rotary Dolls Museum | medium | approx |  |
| Rajkumar College heritage campus | medium | approx | Campus outline not mapped; Z2 override is a 250 m circle until traced. |
| Rajkot Junction station | high | located |  |
| Bhaktinagar station | high | located |  |
| Trikon Baug | medium | approx | Not in OSM. World origin. Verify the triangle-garden position with Rakshit. |
| Soni Bazaar (gold market) | low | approx |  |
| Darbargadh area | low | approx |  |
| Dharmendra Road market | low | missing | Street not named in OSM. One Overture shop address mentions it near (70.8045, 22.2966). Needs Rakshit. |
| Lakhajiraj Road | low | missing | Street not named in OSM. Needs Rakshit. |
| Sadar Bazaar | low | missing | Not found. Needs Rakshit. |
| Atal Sarovar | high | located |  |
| Aji-1 Dam + reservoir | medium | approx |  |
| Ramvan urban forest | low | missing | Not found in OSM or Overture places. |
| Lalpari Lake + Randarda | medium | approx |  |
| Nyari-1 Dam | medium | approx |  |
| Pradyuman Park (zoo) | medium | approx |  |
| Ishwariya Park | medium | approx |  |
| BAPS Swaminarayan Mandir, Kalawad Road | medium | approx |  |
| 150 Ft Ring Road + Rajpath BRTS Blue Corridor | high | located |  |
| Saurashtra University campus | high | located |  |
| Old Rajkot airport airstrip | high | located |  |
| Trimandir | low | approx | Two candidate points 10 km apart. Needs Rakshit. |
| Darshan University (Hadala, Rajkot-Morbi Highway) | low | missing | Owner's college, added in PROMPT §0.1. Address "At. Hadala, Rajkot-Morbi Highway, Nr. Water Sump" (several college directories). The Overture point (70.81844, 22.32745) contradicts the address (13 km south of Hadala), so it is not used. Needs a pin from Rakshit. |

## Known data gaps

- OSM has no RMC boundary for Rajkot; the playable area is derived (see DECISIONS.md).
- Overture/OSM carry almost no building heights; ~92 % of heights come from GHSL 100 m cell averages (2018), so isolated towers are likely too short and post-2018 buildings use heuristics.
- Many old-city streets (Dharmendra Rd, Lakhajiraj Rd, Sadar Bazaar) are unnamed in OSM.
- Overture places are POI points of mixed quality (e.g. Darshan University is mis-geocoded).
