# Data report — Rajkot bake

Generated 2026-10-09 by `python -m rajkot_bake report`. Phase 0 (data recon).

## QA checks

| Check | Result | Detail |
|---|---|---|
| No invalid geometry | PASS | 0 invalid |
| Overlapping buildings < 0.5 % | PASS | 0.00% (0) overlap > 1 m² |
| Largest road component ≥ 98 % of drivable length | PASS | 99.5% |
| Every tile ≤ 1 MB | — | n/a until tiles are encoded (P1/P2) |
| Every landmark located (unambiguous, inside the playable area) | WAIVED (P0: six landmarks need positions from Rakshit) | missing/ambiguous: connaught_hall, dharmendra_road, lakhajiraj_road, sadar_bazaar, ramvan, trimandir, darshan_university; outside playable: none |

## World frame

- Projection EPSG:32642; origin [70.80185, 22.29487] (Overture places: Trikonbaug Ka Raja), E 685623 N 2466573.
- Playable area 290.4 km², extent 21.0 × 19.8 km; horizon ring 3 km.
- Tiles: 1259 active of a 43 × 40 grid (500 m).
- Lakes matched: Aji-1, Nyari-1, Lalpari, Randarda.

## Buildings

- Final buildings: **149,846** in the playable area (raw bbox: 337,856 Overture buildings, 12,695 OSM building outlines).
| Outline source | Buildings |
|---|---|
| Microsoft ML | 73251 |
| Google Open Buildings | 64108 |
| OpenStreetMap | 12487 |

| Height source | Buildings |
|---|---|
| ghsl | 138,692 (92.6%) |
| heuristic | 11,139 (7.4%) |
| osm_levels | 13 (0.0%) |
| osm_height | 2 (0.0%) |

| Floors | Buildings |
|---|---|
| 1 | 45,810 |
| 2 | 50,043 |
| 3 | 33,844 |
| 4 | 12,844 |
| 5 | 4,221 |
| 6 | 1,626 |
| 7 | 736 |
| 8 | 351 |
| 9 | 183 |
| 10 | 90 |
| 11 | 49 |
| 12 | 22 |
| 13 | 14 |
| 14 | 7 |
| 15 | 5 |
| 16 | 1 |

| Style zone | Buildings |
|---|---|
| Z1 Old city | 4,494 |
| Z2 Heritage | 127 |
| Z3 Societies | 119,425 |
| Z4 Commercial corridor | 1,698 |
| Z5 New high-rise | 4,356 |
| Z6 Industrial | 1,664 |
| Z7 Outskirts | 18,082 |

| Use | Buildings |
|---|---|
| residential | 145,595 |
| mixed | 1,756 |
| industrial | 1,657 |
| healthcare | 276 |
| educational | 262 |
| religious | 149 |
| commercial | 90 |
| civic | 60 |
| transport | 1 |

- Shop ground floor: 1,842; corner plots: 18,152; shared-wall buildings: 35,631; outlines squared: 104,112.
- Flagged for review: 1 giant outlines (> 20,000 m²), 0 heights > 60 m.

## Roads

- Drivable length 3295.9 km; 29 connected components.
| OSM class | km |
|---|---|
| residential | 2278.0 |
| tertiary | 375.6 |
| service | 246.9 |
| track | 145.6 |
| primary | 115.1 |
| unclassified | 95.8 |
| trunk | 88.4 |
| secondary | 76.5 |
| footway | 9.6 |
| living_street | 8.8 |
| pedestrian | 7.8 |
| path | 7.5 |
| construction | 4.4 |
| bus_guideway | 1.6 |
| trunk_link | 1.4 |
| tertiary_link | 1.1 |
| primary_link | 0.4 |
| secondary_link | 0.2 |
| steps | 0.1 |

| Width rule | km |
|---|---|
| class_default | 3354.5 |
| lanes | 95.8 |
| name_feet | 14.4 |

- Roads whose name gives the width: 150 Foot Ring Road, 150 Foot Ring Road Flyover, 150 feet ring road, 150Feet Ring Road Railway Flyover, 40 ft. road, BRTS Route (150 ft. Ring Road), Nana Mava Circle Flyover, Shahid Flyover.
- Bridges/flyovers: 45.25 km.

## Landmarks

| Landmark | Confidence | Status | In playable area | Note |
|---|---|---|---|---|
| Race Course (ground, ring road, walking track) | high | located | yes |  |
| Madhavrao Scindia Cricket Ground | medium | approx | yes |  |
| Bal Bhavan | high | located | yes |  |
| Jubilee Garden | high | located | yes |  |
| Watson Museum | high | located | yes |  |
| Connaught Hall | low | missing | no | Not in OSM or Overture. Inside Jubilee Garden per general knowledge; needs a pin from Rakshit. |
| Kaba Gandhi no Delo | medium | approx | yes |  |
| Mahatma Gandhi Museum (former Alfred High School) | medium | approx | yes |  |
| Rotary Dolls Museum | medium | approx | yes |  |
| Rajkumar College heritage campus | medium | approx | yes | Campus outline not mapped; Z2 override is a 250 m circle until traced. |
| Rajkot Junction station | high | located | yes |  |
| Bhaktinagar station | high | located | yes |  |
| Trikon Baug | medium | approx | yes | Not in OSM. World origin. Verify the triangle-garden position with Rakshit. |
| Soni Bazaar (gold market) | low | approx | yes |  |
| Darbargadh area | low | approx | yes |  |
| Dharmendra Road market | low | missing | no | Street not named in OSM. One Overture shop address mentions it near (70.8045, 22.2966). Needs Rakshit. |
| Lakhajiraj Road | low | missing | no | Street not named in OSM. Needs Rakshit. |
| Sadar Bazaar | low | missing | no | Not found. Needs Rakshit. |
| Atal Sarovar | high | located | yes |  |
| Aji-1 Dam + reservoir | medium | approx | yes |  |
| Ramvan urban forest | low | missing | no | Not found in OSM or Overture places. |
| Lalpari Lake + Randarda | medium | approx | yes |  |
| Nyari-1 Dam | medium | approx | yes |  |
| Pradyuman Park (zoo) | medium | approx | yes |  |
| Ishwariya Park | medium | approx | yes |  |
| BAPS Swaminarayan Mandir, Kalawad Road | medium | approx | yes |  |
| 150 Ft Ring Road + Rajpath BRTS Blue Corridor | high | located | yes |  |
| Saurashtra University campus | high | located | yes |  |
| Old Rajkot airport airstrip | high | located | yes |  |
| Trimandir | low | ambiguous | yes | Two candidate points 10 km apart. Needs Rakshit. |
| Darshan University (Hadala, Rajkot-Morbi Highway) | low | missing | no | Owner's college, added in PROMPT §0.1. Address "At. Hadala, Rajkot-Morbi Highway, Nr. Water Sump" (several college directories). The Overture point (70.81844, 22.32745) contradicts the address (13 km south of Hadala), so it is not used. Needs a pin from Rakshit. |

## POIs

| OSM POI category (top 20) | Count |
|---|---|
| amenity=hospital | 162 |
| railway=level_crossing | 51 |
| other | 45 |
| shop=* | 44 |
| amenity=clinic | 29 |
| amenity=place_of_worship | 25 |
| leisure=park | 22 |
| tourism=hotel | 18 |
| amenity=restaurant | 14 |
| tourism=hostel | 12 |
| railway=buffer_stop | 9 |
| railway=station | 9 |
| amenity=fuel | 9 |
| amenity=university | 9 |
| amenity=bus_station | 7 |
| amenity=school | 6 |
| amenity=cafe | 6 |
| amenity=bank | 6 |
| amenity=blood_bank | 6 |
| amenity=dentist | 6 |

- Overture places with confidence ≥ 0.5 (used for shop/use hints): 14,924.

## Known data gaps

- OSM has no RMC boundary for Rajkot; the playable area is derived (see DECISIONS.md).
- Overture/OSM carry almost no building heights; ~92 % of heights come from GHSL 100 m cell averages (2018), so isolated towers are likely too short and post-2018 buildings use heuristics.
- Many old-city streets (Dharmendra Rd, Lakhajiraj Rd, Sadar Bazaar) are unnamed in OSM.
- Overture places are POI points of mixed quality (e.g. Darshan University is mis-geocoded).
