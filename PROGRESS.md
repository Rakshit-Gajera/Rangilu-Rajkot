# Progress

## 2026-10-10 · Session 3 — P3 look of Rajkot, P4 life, P5 sandbox and activities
**Done**
- P3 (Rakshit's priorities): flyovers as whole structures, 56 chowks (fountains, gardens, statues incl. Gandhi,
  Ambedkar, Sardar Patel at Bahumali Bhavan Circle, the MIG-27 at Kotecha Chowk, the old neem at Limda Chowk),
  117k trees, street lights and wires, bilingual shop signboards, heritage facades, footpaths with painted kerbs.
- P4: traffic on the real road graph (keep-left, IDM spacing, horns), pedestrians, cows; time-of-day density.
- Fixes from Rakshit's test drive: detailed jointed character (face, hair, hands, outfits, riding pose), rounded
  scooter, horn only on a vehicle, scooter falling/vanishing (ground safety net, parked vehicles locked upright,
  traffic stops for parked vehicles), people/vehicles inside buildings, High/Ultra frame rate (tree LOD layer:
  1.55 M → 0.80 M triangles per frame on High, tree shadow triangles 1.1 M → 19 k).
- P5: every vehicle drivable (bicycle … bus, tractor) and any traffic vehicle can be taken with E; sandbox menu
  (Tab: spawn vehicles and props, time/season/weather/traffic/people); weather (haze, monsoon rain, wet roads,
  rivers filling July–September); drone camera and photo mode; discovery log (25 landmark cards); five
  activities (rickshaw rides, farsan delivery, Race Course time trial, BRTS driver, Navratri garba); money,
  outfit and food shop; saves with export/import; traffic signals at 43 junctions; city ambience sounds.
- Repo fix: `game/src/world/` had been hidden by the `world/` ignore rule; it is now in the repo.

**Next**
- P5 gate: Rakshit's fun check (activities, vehicles, sandbox), F3 numbers on High/Ultra on his laptop.
- Open: landmark models (need photos), lakes/dams, roof variety, road medians, kite fight and gully cricket.

**Known issues**
- Software-renderer tests can't show real-GPU frame rates; High/Ultra need Rakshit's F3 numbers after the tree LOD fix.
- Some junctions that have signals in reality are missing (only main-road crossings get them).
- Riverbed water is a recolour of the dry bed (no flow or depth).

## 2026-10-10 · Session 2 — P2 whole city
**Done**
- P1 gate: Rakshit couldn't recognise the streets (→ P3), frame rate fine. P2 started on his request.
- Whole city baked: 1,308 tiles (tile format v2: polygons + gzip) = 11.6 MB, largest pack 0.46 MB. All QA checks pass
  except the waived landmark check (5 positions still unknown, Trimandir ambiguous).
- Streaming: predicted-position priority, eviction with hysteresis, far LOD to the horizon, colliders only nearby
  (heightfield terrain), worker crash recovery, pack cache. Boot to playable ≈ 4 s locally.
- Full map (M): pan/zoom, neighbourhoods and landmarks, click for a waypoint, GPS route (one-ways respected) on the
  map and minimap, F to fast travel, arrival message. Race Course → Rajkot Junction routes on real roads.
- Quality presets Low/Medium/High/Ultra (auto-picked, changeable in the Esc menu), dynamic resolution.
- Engine download 1.40 MB gzip (physics WASM separate).
- Independent P2 review: 6 must-fix issues fixed (parked scooter falling, map edge, collider hitches, holes on
  eviction, duplicate builds, meaningless memory test) + GPS on the main network, cheaper re-routing.
- Tests: 38 vitest, 19 pytest, 4 Playwright (boot + 10 viewpoints, walk/ride, map/GPS/fast travel, 17 km
  cross-city tour on High: heap 77–158 MB and stable, game main-thread p99 23 ms, 0 errors).

**Next**
- P2 gate: Rakshit rides across the city (e.g. Race Course → Darshan University with M + waypoint) and reports hitches.
- Then P3: make it look like Rajkot.

**Known issues**
- The city still looks generic (no trees, footpaths, street lights, sign text, landmark models) — P3.
- Far tiles have no facade detail; at night the far city is only a faint glow.
- Real-GPU frame times not measured yet (tests use a software renderer) — Rakshit's F3 numbers needed.
- Only 36 map labels (OSM has few neighbourhood names here); road names appear on the area banner.
- No IndexedDB pack cache yet (the browser HTTP cache covers repeat visits).
- Character and scooter are placeholders; lane markings double up at tile seams.

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

**P1 review (independent) — fixed**
- Sun/moon were read in the wrong units (suncalc 2.x returns degrees) → golden hour now real; unit tests added.
- Colours were treated as linear → all colours/vertex colours/emissives now converted from sRGB.
- Short bridges were 6 m humps → level decks; flyovers ramp ≤ 6 %.
- Jumps lost at high refresh rates (latched now); render interpolation for player and scooter; chase camera;
  lean from real yaw rate; dismount never lands on a roof; minimap north marker fixed.
- Roads drape on the same triangles as the ground (no terrain poking through); terrain edge normals.
- Old-city estimated heights capped to 4 floors (1,002 buildings); windows never wrap building corners.
- Reference views at street level on real roads, HUD hidden, date pinned (2026-10-09). 31 vitest + 19 pytest + 2 e2e pass.

**Next**
- P1 gate: Rakshit plays the slice, checks recognition and reports the F3 frame rate on his laptop.
- Then P2 (whole city): streaming + eviction, LOD, colliders only within 300 m, heightfield terrain colliders,
  smaller tiles, bundle size (Rapier WASM as a separate file).

**Known issues**
- No footpaths/kerbs, street lights, trees or traffic yet (P3/P4). Signboards have no text yet (P3).
- Character and rider are placeholders (stiff pose); scooter is boxy.
- Tile size ≈ 80 kB → whole city ≈ 100 MB (target 30–50 MB): move surface grid-splitting to runtime in P2.
- Lane markings double up across tile seams (10 m overlap).
- Engine bundle 1.82 MB gzip (budget 1.5 MB): Rapier's inlined WASM; split in P2.
- No street lights yet, so streets are very dark at night (P3).
- Landmarks are not modelled yet (P3); Watson Museum etc. are ordinary generated buildings.
- Open P0 items: Dharmendra Rd, Lakhajiraj Rd, Sadar Bazaar, Connaught Hall, Ramvan, Trimandir positions.
