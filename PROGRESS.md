# Progress

## 2026-10-09 · Session 1 (cont.) — P1 vertical slice
**Done**
- P0 gate answers applied: Darshan University placed at its real location with a Morbi-highway corridor
  (playable area now 296 km², 1,308 tiles); old-city zone confirmed; GHSL heights confirmed (5–10 floors near Race Course).
- Bake: `terrain` (de-bumped Copernicus → 10 m grid, roads flattened, 8 % max grade), `roads` (width, surface,
  bridges, speeds), `tiles` (`.rtile` v1 + region packs; format in docs/RTILE.md). Slice = 35 tiles, 2.9 MB.
- Game (`game/`, Vite 8 + TS 7 + three r186 + Rapier 0.21):
  - streaming world with a worker pool; terrain, building, road, bridge, grass/water/riverbed generators
  - facade shader: zone palettes, bays, windows (sliding/grille/wooden shutters), balconies, AC units,
    shop shutters open/closed by time incl. the afternoon rest, signboard bands, night windows, weathering
  - rooftop water tanks and stair cabins; gradient sky with real sun/moon (suncalc, IST), shadows, haze
  - player (Rapier character controller), third-person/first-person camera, scooter (ray-cast vehicle, lean,
    headlight, horn, engine sound), minimap of real roads, clock, speedometer, street/landmark names
- Tests: 26 vitest (decoder, generators, winding, determinism, budget); Playwright boot + 8 viewpoints +
  walk/ride test (SwiftShader, `?fixedstep=1`). Boot to playable ≈ 7 s locally.

**Measured (slice fully loaded):** 35 tiles, 9,392 buildings, 285k triangles, 114 draw calls (budget ≤ 800),
tile generation ≈ 35 ms per tile in workers. Real-GPU frame rate still to be measured on Rakshit's laptop (F3).

**Next**
- Independent P1 review → fixes → P1 gate (Rakshit: recognise streets, 60 fps on his laptop).

**Known issues**
- No footpaths/kerbs, street lights, trees or traffic yet (P3/P4). Signboards have no text yet (P3).
- Character and rider are placeholders (stiff pose); scooter is boxy.
- Tile size ≈ 80 kB → whole city ≈ 100 MB (target 30–50 MB): move surface grid-splitting to runtime in P2.
- Lane markings double up across tile seams (10 m overlap).
- Landmarks are not modelled yet (P3); Watson Museum etc. are ordinary generated buildings.
- Open P0 items: Dharmendra Rd, Lakhajiraj Rd, Sadar Bazaar, Connaught Hall, Ramvan, Trimandir positions.
