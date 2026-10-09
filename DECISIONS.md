# Decisions

Format: date · decision · why · alternatives considered.

## 2026-10-09 · Build everything on Rakshit's PC
- **Why:** data hosts (Geofabrik, AWS open data, Overture S3) are reachable from the PC; avoids shuttling ~300 MB of raw data. Rakshit approved either option.
- **Alternatives:** cloud workspace (data hosts blocked there per PROMPT.md §6).

## 2026-10-09 · pyosmium instead of osmium-tool for the OSM clip
- **Why:** osmium-tool has no simple Windows install; pyosmium 4.3 ships Windows wheels. Rakshit approved.
- **Alternatives:** Miniforge/conda osmium-tool, WSL.

## 2026-10-09 · Fetch bbox widened to lon 70.60–71.00, lat 22.10–22.55
- **Why:** Darshan University (Hadala, Rajkot–Morbi highway) is outside the RMC area but is now in scope (PROMPT.md §0.1 item 5). Raw data must cover it plus a margin; the playable polygon is still computed precisely in stage 2.
- **Alternatives:** moving the campus into the city (rejected — violates rule 4, never invent geography; the real highway drive is better gameplay anyway).

## 2026-10-09 · Terrain: de-bumped Copernicus GLO-30, not FABDEM
- **Why:** commercial use is allowed (§0.1 item 3); FABDEM is CC BY-NC-SA.

## 2026-10-09 · Open Buildings 2.5D deferred
- **Why:** needs Earth Engine; Rakshit has no account and no budget. Heights use OSM → Overture → zone heuristic. Revisit if coverage is poor.

## 2026-10-09 · Licences: code MIT, world data ODbL
- **Why:** as suggested in PROMPT.md §4.3; ODbL is mandatory for an OSM/Overture derivative database.

## 2026-10-09 · City extent derived from data (no RMC boundary in OSM)
- **Decision:** city core = OSM Rajkot East/West/South urban talukas ∪ OSM place=city polygon ∪ Overture built-up area (200 m cells with ≥ 8 % footprint cover) within 10 km of the origin that touches it; playable = core + 1.5 km ∪ four lakes (+200 m). Result: 290 km², 21.0 × 19.8 km, 1,259 tiles.
- **Revised after review:** the first version (no radius cap) followed ribbon development along Kalawad Road out to Metoda GIDC, 17 km west.
- **Why:** neither OSM nor Overture has an RMC polygon for Rajkot; rule 4 forbids drawing one by hand. Overture division areas also failed to download (S3 network errors).
- **Alternatives:** hand-drawn boundary (rejected, rule 4); bbox (too much empty farmland). Rakshit reviews at the P0 gate.

## 2026-10-09 · Heights from GHSL instead of Google Open Buildings 2.5D
- **Decision:** priority OSM height > OSM levels > Overture > GHSL GHS-BUILT-H ANBH (2018, ~90 m) × footprint-size factor ((area / cell median)^0.25, clamped 0.7–1.6) × seeded jitter > heuristic.
- **Why:** Overture has heights for 2 of 338k buildings; Open Buildings needs Earth Engine. GHSL is a free direct download under CC BY 4.0 (commercial OK).
- **Trade-off:** cell averages smear isolated towers and miss post-2018 construction. Revisit if Rakshit's checks disagree.

## 2026-10-09 · Metric height computed in classify, not heights
- **Why:** the height formula needs the shop ground-floor flag, which is a classify output. Heights stores `levels` + `height_source`; classify adds `height`.

## 2026-10-09 · Overlapping AI outlines are clipped, not dropped
- **Decision:** after dedupe, any intersecting pair: if > 50 % of the smaller is covered, drop it; else subtract the higher-priority outline (OSM, then larger) from the other.
- **Why:** ~6 % of Google/Microsoft outlines overlapped neighbours; clipping turns these into shared walls instead of losing buildings.

## 2026-10-09 · Giant outlines are flagged, not split
- **Why:** splitting needs an invented subdivision (rule 4). Only 1 outline is flagged; revisit in P3 if needed.

## 2026-10-09 · Landmark positions from Overture places when OSM lacks them
- **Why:** OSM Rajkot is sparse (no Trikon Baug, Rajkumar College, Lalpari...). Overture POI points are used as **medium** confidence; mis-geocoded points (e.g. Darshan University) are rejected and logged in refs/SOURCES.md.

## 2026-10-09 · P0 review fixes
- **Lakes are pinned by OSM id** in config.yaml (nearest-polygon snapping picked a 2.4 ha pond for Lalpari). Aji-1 is mapped twice in OSM (w132973447, r1786289); water polygons must be de-duplicated before meshing.
- **Old-city Z1 override** from sourced points (Soni Bazar, Darbar Gadh Museum, Kaba Gandhi no Delo, a Dharmendra Rd shop address) + 250 m; low confidence, for Rakshit to redraw. The rule was relaxed to ≥ 30 % shared walls, median footprint < 120 m², < 2 km from the origin.
- **Zone overrides apply by building centroid**, with tighter buffers (20–40 m).
- **Frontage uses the nearest road segment's direction**, not the whole way's end-to-end direction.
- **Shops need a retail POI category** (allowlist), not any POI.
- **Each building stage writes its own file** (`buildings` → `buildings_h` → `buildings_c`) so stages re-run independently.
- **Tile (i, j) are relative to the origin**, so ids stay stable when the playable area grows.
- **Seeds are 64-bit** (blake2b-8); outlines are wound counter-clockwise.
- **QA failures exit non-zero** unless waived in `config.yaml → qa.waivers`. P0 waiver: `landmarks_located` (six landmarks need Rakshit's input; Trimandir is ambiguous).
- **The preview map excludes private places** unless `report --private` is passed.

## 2026-10-09 · Gate P0 answers from Rakshit
- Darshan University at 22.4411 N, 70.7831 E; playable area extended by a 600 m-wide corridor along the Rajkot–Morbi Highway (now 296 km², 21 × 28.5 km, 1,308 tiles; coordinates reach ~16 km north of the origin — float32 precision still ~2 mm).
- The brown Z1 zone matches the old bazaar area.
- Buildings around Race Course are 5–10 floors, consistent with GHSL; keep the GHSL-based heights.
- Still open: Dharmendra Rd, Lakhajiraj Rd, Sadar Bazaar, Connaught Hall, Ramvan, Trimandir (waiver stays).

## 2026-10-09 · P1 runtime choices
- **Tile meshes are built in the bake for road/area surfaces** (union + 10 m grid split + earcut in Python), buildings/terrain in TS workers. Junctions come free from the polygon union. *Trade-off:* tiles are ~80 kB each (≈100 MB for the whole city, over the 30–50 MB target) — move grid splitting to runtime in P2.
- **Own gradient sky dome instead of three's `Sky` addon.** `Sky` rendered black in most directions on our test renderer and is heavier on phones; the dome gives controllable dusty-haze colours keyed to sun altitude, plus sun, moon and stars.
- **ACES tone mapping** (AgX washed out the golden-hour and signboard colours).
- **Spawn at golden hour = 40 min before today's real sunset** (PROMPT says 6:30 pm, but in October Rajkot's sun sets ~18:20, so 6:30 pm is already dark; the intent was golden hour).
- **Spawn/ground heights come from the tile height grid**, not physics ray casts: Rapier only sees new colliders after a step (this caused an under-ground spawn).
- **Facade shader uses `flat` varyings and a quantised seed**; per-window hashes amplified interpolation error into speckle.
- **Automated tests use SwiftShader** (`--use-angle=swiftshader`): headless D3D11 lost the WebGL context. A `?fixedstep=1` mode advances exactly one physics step per frame so tests measure simulated time.
- **Placeholder character and scooter are procedural** (no external assets yet); CC0 rigs come in P5.
