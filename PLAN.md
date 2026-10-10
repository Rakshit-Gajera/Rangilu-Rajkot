# Plan

Current phase: **P3 — Make it look like Rajkot** (PROMPT.md §13). Gate: ≥ 8/10 street screenshots recognised by Rakshit.

P2 gate passed (Rakshit, 2026-10-10).

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

## P3 tasks (Rakshit's priorities first: chowks, statues, flyovers)
- [x] 3.1 Flyovers profiled as whole structures (no humps), widths from lanes, pillars, grey undersides
- [x] 3.2 Chowks: 50 roundabout islands with black-and-yellow kerbs, gardens, marigolds, lamps; real names (25)
- [x] 3.3 Statues from sourced places (Gandhi, Indira Gandhi, Vivekananda, Hanumanji); fountains, sculptures, flags
- [x] 3.4 Trees: 117k (neem, peepal, banyan, gulmohar, ashoka, palm, babool), instanced
- [x] 3.5 Street lights, electric poles with wires, night light pools
- [x] 3.6 Bilingual shop signboards (English + Gujarati)
- [x] 3.7 Heritage (Z2) facade: arches, pilasters, cornices
- [x] 3.8 Footpaths with black-and-yellow kerbs on main roads (medians still to do)
- [ ] 3.9 Landmark models (Race Course ground, Watson Museum, Rajkot Junction, Rajkumar College, …) — need reference photos / Rakshit
- [ ] 3.10 Lakes and dams (Aji-1, Nyari-1, Lalpari): embankments, water look
- [ ] 3.11 Roof variety (Mangalore tiles in Z1/Z7, solar panels, dish antennas)
- [ ] 3.12 Review → recognition gate

## Done
- P0 — data recon. P1 — vertical slice (gate: streets not yet recognisable → P3).
