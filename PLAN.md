# Plan

Current phase: **P2 — Whole city** (PROMPT.md §13). Gate: cross-city drive without hitches (Rakshit).

## P2 tasks
- [x] 2.1 Bake every tile (1,308) — `.rtile` v2 polygons, gzipped region packs (11.6 MB)
- [x] 2.2 Streaming manager: priority by predicted position, worker pool with crash recovery, pack LRU, eviction with hysteresis
- [x] 2.3 LOD: near (LOD0/1 props by distance) + far merged meshes (LOD2) to 3 km on High
- [x] 2.4 Colliders only near the player; heightfield terrain
- [x] 2.5 City road graph + full map (M) + GPS route on map and minimap + fast travel (F)
- [x] 2.6 Quality presets (auto) + pause menu + dynamic resolution
- [x] 2.7 Engine bundle under 1.5 MB gzip (physics WASM split out)
- [x] 2.8 Cross-city tour test: 17 km route + repeated city tour, no errors, no growth in memory
- [x] 2.8b Independent review → fixes
- [ ] 2.9 Rakshit: cross-city drive on his laptop (gate)

## Next phase
P3 — make it look like Rajkot (recognition gate ≥ 8/10): trees, footpaths and kerbs, street lights and poles,
bilingual signboards with text, roof variety, flyovers' look, lakes and dams, the 20 landmarks.

## Done
- P0 — data recon. P1 — vertical slice (gate: streets not yet recognisable → P3).
