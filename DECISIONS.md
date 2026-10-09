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
- **Decision:** city core = OSM Rajkot East/West/South urban talukas ∪ OSM place=city polygon ∪ Overture built-up blobs (200 m cells with ≥ 8 % footprint cover) that touch it; playable = core + 1.5 km ∪ four lakes (+200 m). Result: 333 km², 26.9 × 21 km, 1,447 tiles.
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
