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
