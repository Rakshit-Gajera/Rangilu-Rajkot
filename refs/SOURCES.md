# Sources

Facts and positions used by the bake, with source and confidence (PROMPT rule 4).
Reference photos are stored as links only, never as files.
Confidence: **high** = mapped feature/outline in OSM; **medium** = single POI point or a consistent secondary source; **low** = unverified, ambiguous or missing (needs Rakshit).

## World frame
| Fact | Value | Source | Confidence |
|---|---|---|---|
| Origin (Trikon Baug) | 70.80185 E, 22.29487 N | Overture places "Trikonbaug Ka Raja" (meta) — Trikon Baug is not in OSM | medium |
| City extent | Rajkot East/West/South urban talukas + OSM place=city polygon (w22826335) + built-up density | OSM; Overture buildings | medium — no RMC boundary exists in OSM/Overture |

## Lakes and dams
| Lake | Reference point | Source | Confidence |
|---|---|---|---|
| Aji-1 | 70.83608, 22.27047 | Overture places "Aji Dam" (meta) → nearest OSM water polygon | medium |
| Nyari-1 | 70.70801, 22.24772 | Overture places "Nyari Dam" (lake) → OSM r1917301 area | medium |
| Lalpari | 70.83456, 22.31345 | Overture places "Lalpari Lake" | medium |
| Randarda | 70.84485, 22.29339 | Overture places "Randarda Lake Bird Sanctury" | medium |

## Darshan University
- Address "At. Hadala, Rajkot–Morbi Highway, Nr. Water Sump, PIN 363650":
  [spoken-tutorial.org](https://spoken-tutorial.org/software-training/academic-center/653),
  [collegebatch.com](https://www.collegebatch.com/3756-darshan-university-contact-number-address-map-rajkot);
  "on SH 24": [targetadmission.com](https://www.targetadmission.com/colleges/4235-darshan-institute-of-engineering-technology-for-diploma-studies-rajkot). Confidence: high for the village, **position unknown**.
- Hadala village polygon in OSM: w1062608764 (centroid ≈ 70.762 E, 22.441 N).
- Overture place "Darshan University" at 70.81844, 22.32745 is **rejected**: it's ~13 km south of Hadala, contradicting its own address.

## Landmarks
See `pipeline/landmarks.yaml` (each entry carries its refs and confidence) and the landmark table in DATA_REPORT.md.

## Building heights
- GHSL GHS-BUILT-H R2023A, ANBH (average net building height), epoch 2018, 3 arc-second (~90 m) grid, tile R7_C26. © European Union, 1995–2026, CC BY 4.0. https://human-settlement.emergency.copernicus.eu/ — confidence medium (cell averages, not per building).
