# Plan

Current phase: **P0 — Data recon** (PROMPT.md §13). Gate: Rakshit reviews the 2D preview map.

## P0 tasks
- [x] 0.1 Repo skeleton, docs, git remote, venv
- [x] 0.2 Download raw data: OSM Western Zone (Geofabrik), Copernicus GLO-30 N22E070, Overture buildings
- [x] 0.3 `rajkot_bake` package: config, CLI, stage framework (parquet in/out)
- [x] 0.4 Stage 1–2: clip OSM with pyosmium → GeoParquet layers (UTM 42N, OSM ids kept)
- [x] 0.5 Bounds (Darshan corridor pending pin): RMC boundary + 1.5 km ∪ lakes ∪ Darshan University corridor; horizon ring; origin at Trikon Baug; tile grid
- [x] 0.6 Stage 3: building clean + conflate (Overture primary, OSM tags re-attached)
- [x] 0.7 Stage 4: heights (OSM → Overture → heuristic; GHSL replaces Open Buildings)
- [x] 0.8 Stage 5: use classification + draft zones.geojson
- [x] 0.9 landmarks.yaml (20 + Darshan University), refs/SOURCES.md
- [x] 0.10 Raw road stats + connectivity check
- [x] 0.11 DATA_REPORT.md + 2D preview map (HTML)
- [x] 0.12 pytest for geometry functions
- [ ] 0.13 Reviewer pass (geographer, performance) → fixes → gate

## Next phase
P1 — vertical slice (~2×2 km: Race Course, Jubilee Garden, old-city bazaars).
