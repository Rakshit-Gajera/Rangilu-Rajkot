# Progress

## 2026-10-09 · Session 1 — P0 data recon
**Done**
- Repo, docs, MIT licence; bake package `pipeline/rajkot_bake` with stages
  `fetch → osm → bounds → buildings → heights → classify → landmarks → roads → report`
  (`python -m rajkot_bake all`). 16 pytest tests pass.
- Raw data: Geofabrik western-zone (2026-10-08), Copernicus GLO-30, Overture buildings + places,
  GHSL building height (2018). Provenance + sha256 in `data/raw/manifest.json`.
- Playable area: 290 km² (21.0 × 19.8 km), 1,259 tiles of 500 m, origin at Trikon Baug, four lakes pinned by OSM id.
- Buildings: 149,846 (OSM 12k, Microsoft 73k, Google 68k outlines); overlaps clipped into shared walls;
  heights 92 % GHSL, 8 % heuristic; zones Z1–Z7 and uses classified (first-pass rules).
- Roads: 3,428 drivable km, 99.5 % in one connected component.
- Landmarks: 10 located, 14 approximate, 1 ambiguous (Trimandir), 6 missing (need Rakshit).
- DATA_REPORT.md + interactive preview map (`world/preview/index.html`, serve with the `preview-map`
  launch config or `python -m http.server -d world/preview`).

**Next**
- Independent review done; 6 must-fix + 8 later items fixed (DECISIONS.md "P0 review fixes").
- P0 gate: Rakshit reviews the preview map and answers the gate questions.
- Darshan University: add Rakshit's pin to `pipeline/config.yaml` (`world.extras[0].lonlat`), re-run `bounds` onward.

**Known issues**
- Old-city footprints are sparse (AI outlines miss wall-to-wall row houses).
- GHSL suggests 5–8 floors around Race Course/Jubilee — unverified.
- Z1 override is a rough hull; the relaxed Z1 rule also catches some row-house societies. Z4 corridors and shop ground floors look under-counted.
- Later review items still open: GHSL raster-grid edge cases, sliver edges < 0.5 m (4.9k buildings), tests for edge metrics/classify/determinism, stage timing log.
- Overture `division_area` download fails with S3 network errors (not needed now).
