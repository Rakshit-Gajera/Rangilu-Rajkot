# Plan

Current phase: **P1 — Vertical slice** (PROMPT.md §13). Gate: Rakshit recognises his streets; 60 fps on his laptop.

P0 (data recon) is done. Leftover P0 items (landmark pins still needed: Dharmendra Rd, Lakhajiraj Rd,
Sadar Bazaar, Connaught Hall, Ramvan, Trimandir) don't block P1.

## Slice
About 3 × 2 km around Race Course, Jubilee Garden and the old-city bazaars:
x ∈ [−2000, +1000] m, y(north) ∈ [−500, +1500] m from the Trikon Baug origin = 24 tiles.

## P1 tasks
Bake (Python)
- [x] 1.1 Terrain: de-bumped Copernicus DEM → 10 m grid per tile, roads flattened, building base heights
- [x] 1.2 Roads: widths, surface polygons per tile (union handles junctions), centrelines with 3D profile, bridges/flyovers
- [x] 1.3 Parks/water/land-use polygons per tile
- [x] 1.4 Tiler + `.rtile` encoder (v1: HEIGHT, BLDG, ROAD, AREA sections) + manifest; slice packs

Game (TypeScript, `game/`)
- [x] 1.5 Scaffold: Vite 8 + TS 7 + three r186 + Rapier 0.21, vitest, fixed-step loop
- [x] 1.6 Tile decode in a worker; generators: terrain, roads, buildings (extrude, roofs, parapets)
- [x] 1.7 Facade shader (windows/shutters/plaster by zone Z1–Z4, night windows)
- [x] 1.8 Sky, sun and moon (suncalc, IST), shadows, fog, day/night cycle
- [x] 1.9 Player on foot: Rapier character controller, third-person camera, colliders
- [x] 1.10 Scooter: ray-cast vehicle, lean, enter/exit, horn
- [x] 1.11 HUD: minimap, clock, speed, area name
- [x] 1.12 Playwright: boot + viewpoint screenshots + perf numbers
- [x] 1.13 Reviewer pass → fixes (gate: waiting for Rakshit)

## Done
P0 — data recon (see PROGRESS.md and DATA_REPORT.md).
