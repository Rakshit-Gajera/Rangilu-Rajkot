# Progress

## 2026-10-09 · Session 1 — P0 data recon
**Done**
- Repo, docs, MIT licence; bake package `pipeline/rajkot_bake` with stages
  `fetch → osm → bounds → buildings → heights → classify → landmarks → roads → report`
  (`python -m rajkot_bake all`). 16 pytest tests pass.
- Raw data: Geofabrik western-zone (2026-10-08), Copernicus GLO-30, Overture buildings + places,
  GHSL building height (2018). Provenance + sha256 in `data/raw/manifest.json`.
- Playable area: 333 km² (26.9 × 21 km), 1,447 tiles of 500 m, origin at Trikon Baug, four lakes included.
- Buildings: 161,882 (OSM 12k, Microsoft 77k, Google 72k outlines); overlaps clipped into shared walls;
  heights 92 % GHSL, 8 % heuristic; zones Z1–Z7 and uses classified (first-pass rules).
- Roads: 3,437 drivable km, 99.5 % in one connected component.
- Landmarks: 10 located, 15 approximate, 6 missing (need Rakshit).
- DATA_REPORT.md + interactive preview map (`world/preview/index.html`, serve with the `preview-map`
  launch config or `python -m http.server -d world/preview`).

**Next**
- Reviewer pass on P0 → fixes → P0 gate with Rakshit (see questions in DATA_REPORT.md "Known data gaps").
- Darshan University: add Rakshit's pin to `pipeline/config.yaml` (`world.extras[0].lonlat`), re-run `bounds` onward.

**Known issues**
- Old-city footprints are sparse (AI outlines miss wall-to-wall row houses).
- GHSL suggests 5–8 floors around Race Course/Jubilee — unverified.
- Z1 (old city) and Z4 (corridors) rules catch too few buildings; shop ground floors look under-counted.
- Overture `division_area` download fails with S3 network errors (not needed now).
