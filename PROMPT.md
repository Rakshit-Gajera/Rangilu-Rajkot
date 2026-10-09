# RANGILU RAJKOT — Open-World Game: Master Project Prompt

> Version 1.1 · 9 October 2026 (v1.0 + owner amendments in §0.1) · Product owner: Rakshit · Builder: AI coding agent on Rakshit's PC
> This prompt is the single source of truth for the project. Day-to-day progress goes in PLAN.md, PROGRESS.md and DECISIONS.md, never in this prompt. Change this prompt only when Rakshit changes the vision.

---

## 0. Your role and how you must work

You are the lead engineer, technical artist and game designer of *Rangilu Rajkot*: a free-roam, GTA-style, open-world BROWSER game set in a 1:1-scale recreation of Rajkot, Gujarat, India, built from open map data. Rakshit is the product owner. He lives in and knows Rajkot, playtests every milestone, and has the final say on look and feel.

Rules (non-negotiable):
1. Session start: read PROMPT.md → PLAN.md → PROGRESS.md → DECISIONS.md, then state the phase and task you're on.
2. Session end: update PROGRESS.md (what changed, what's next, known bugs). Log every architectural choice in DECISIONS.md (date, decision, why, alternatives).
3. Keep `main` playable at all times. Make small commits.
4. Never invent Rajkot geography. Roads, buildings, lakes and landmark positions come from data. Anything researched (e.g. how a landmark looks) goes in refs/SOURCES.md with its source and a confidence level (high/medium/low). Flag low-confidence items for Rakshit.
5. Performance is a feature. Measure before and after every rendering, streaming or AI change against the budgets in §9.6.
6. Look at your own work: after every visual change, capture the fixed viewpoint screenshots (§12) and inspect them before calling the task done.
7. Builders never grade their own work. At each milestone, run a separate review pass with reviewer personas (geographer, technical artist, game designer, performance engineer) and fix what they find.
8. If a data host is blocked from your workspace, don't work around it. Run the download on Rakshit's PC or ask him to download the file.
9. Scope discipline (the Mumbai Gullies lesson). That Indian open-world game was cancelled in May 2026 after 5 years, partly because of repeated engine switches and growing scope. Use one engine, work one phase at a time, and finish every phase with a playable build. New ideas go to BACKLOG.md.
10. Ask Rakshit at the phase gates (§13), not constantly. Between gates, make reasonable decisions and log them.

## 0.1 Owner amendments (v1.1, 9 Oct 2026). These override anything below that conflicts.
1. The owner is **Rakshit** (v1.0 mistakenly said "Soham" in places; all fixed).
2. **Repo:** https://github.com/Rakshit-Gajera/Rangilu-Rajkot (public). Push after every finished task or bug fix. Project folder: `C:\R drive\OpenRajkotGame`. Everything (bake, dev, tests) runs on Rakshit's PC; the builder may download data directly.
3. **Commercial use is allowed.** Therefore no non-commercial data or assets (e.g. FABDEM, CC BY-NC) — only licences that permit commercial use.
4. **Real brands and shop names are allowed** (§7.10 and §14 relaxed). Still: no real private individuals or house numbers.
5. **Darshan University** (Rakshit's college, on the Rajkot–Morbi highway at Hadala, outside RMC) is part of the playable world, in its real location, reached along the real highway corridor.
6. **pyosmium** replaces the osmium CLI for the OSM clip.
7. **Google Open Buildings 2.5D** is optional: Rakshit has no Earth Engine account. Heights fall back to OSM → Overture → heuristics until (and unless) a free route is set up.
8. **Privacy:** the repo is public. Rakshit's personal locations (e.g. home) live only in the git-ignored `pipeline/local.yaml`.

---

## 1. The aim

### 1.1 Pitch
Walk, ride and drive anywhere in the real Rajkot. Every street, ring road, society lane, lake and landmark is in its true place at real scale. The city is alive with traffic, people and cows, and you are free to do whatever you like. It runs in a web browser with nothing to install.

### 1.2 Why
- For Rajkotians and people who miss Rajkot: find your street, ride to your college, watch the sunset at Race Course.
- To celebrate "Rangilu Rajkot" (colourful Rajkot, the city's nickname): its food, its festivals (Uttarayan, Navratri, the Janmashtami lokmelo at Race Course), its famous afternoon rest when shutters come down, chhakdos and scooters.
- To show what open data plus AI can build: a portfolio-grade, open, browser-based game of an Indian city, which nobody has made yet.

### 1.3 Design pillars (use them to settle every design argument)
| Pillar | Meaning | Test |
|---|---|---|
| Recognisable | A local says "that's my area" | Rakshit recognises ≥ 8 of 10 random street-level screenshots |
| Free | No invisible walls inside the city, any vehicle, no forced missions | Every public street is reachable |
| Alive | Traffic, people, animals, sound, time of day, weather | A 2-minute street clip never looks frozen or empty |
| Accessible | Runs on a normal laptop and a mid-range phone | 60 fps on a mid laptop (High), 30 fps on a mid phone (Low) |

### 1.4 v1.0 success criteria
- The whole city is playable: Rajkot Municipal Corporation (RMC) area plus a buffer that includes the Aji, Nyari and Lalpari lakes (≈ 20 × 20 km).
- A drive from Race Course to Rajkot Junction follows the real road network.
- ≥ 15 hand-finished landmarks, ≥ 8 vehicles, ≥ 5 activities, day/night cycle, monsoon rain.
- Cold start to playable in < 15 s on 20 Mbps. Memory stays stable during a 30-minute drive.
- A credits screen with all data attributions (§14).

### 1.5 Non-goals for v1 (they go to BACKLOG.md)
- Photorealism. The target is stylised-realistic.
- Interiors everywhere. Only a few hero interiors, and those come later.
- Weapons, combat, crime, police wanted-levels.
- Multiplayer. Don't block it architecturally, but don't build it.
- Areas outside the city: Hirasar airport (~36 km away) and the Khandheri stadium (~15 km away) are future expansions.

---

## 2. Locked decisions
| Topic | Decision |
|---|---|
| Game type | GTA-style sandbox: walk, ride and drive anywhere, take any vehicle, traffic and people, optional activities and festivals. No combat. |
| Visual style | Stylised-realistic: real proportions, real sun and lighting, clean procedural textures, readable silhouettes |
| Platform | Web browser (desktop first, phone supported) |
| Project home | A folder on Rakshit's Windows PC (e.g. Documents\rajkot-open-world), with a git repo |
| Scale | 1:1. One world unit = 1 metre |
| Working title | Rangilu Rajkot |

---

## 3. Player experience

### 3.1 First five minutes
1. Title screen: a slow drone shot over the Race Course ring at golden hour, with an English / ગુજરાતી toggle.
2. Character setup: name, body type, skin tone, outfit (shirt-pant, kurta, saree, salwar-kameez, school uniform, cricket whites), with colour pickers.
3. Spawn at Race Course at 6:30 pm: evening walkers, balloon sellers, a parked scooter nearby.
4. Light tutorial prompts (no forced quest): move → sprint → get on the scooter → open the map → set a waypoint → ride there.
5. Then complete freedom.

### 3.2 On foot
- Walk, jog, sprint, jump, crouch, auto-step (kerbs and stairs up to 35 cm), climb low walls, swim in lakes.
- Interact with E: sit on benches; buy chai, ganthiya or ice-gola at stalls; pet cows and dogs; read landmark info boards; get on and off vehicles.
- Cameras: third-person (default), first-person, free photo camera.

### 3.3 Vehicles (all physics-driven; you can take any parked one)
| Vehicle | Top speed | Notes |
|---|---|---|
| Bicycle | 25 km/h | Pedal stamina, rides on footpaths |
| Scooter (Activa-style, unbranded) | 85 km/h | Default and signature ride; carries a pillion |
| Commuter motorcycle | 100 km/h | |
| Chhakdo (Saurashtra motorcycle-based 3-wheeler) | 50 km/h | Cargo or passengers, wobbly and iconic |
| Auto-rickshaw (CNG) | 55 km/h | Used for the taxi activity |
| Hatchback | 140 km/h | |
| SUV | 150 km/h | |
| City / BRTS bus | 70 km/h | Can use the BRTS lane on the 150 Ft Ring Road |
| Tractor | 35 km/h | Outskirts and farms |

Every vehicle has a horn (H, essential) and auto headlights. The radio plays only CC0 or self-made music. Cosmetic damage is backlog.

### 3.4 A living city
- **Traffic:** follows the real roads. Mostly two-wheelers, with honking, overtaking, and two-wheelers filtering through gaps.
- **Pedestrians:** crowds in the markets (Dharmendra Road, Lakhajiraj Road, Sadar Bazaar), walkers at Race Course, students near colleges.
- **Animals:** cows sitting on road dividers, stray dogs, pigeons at chabutaras.
- **Time of day:** real sun position for Rajkot. During the afternoon rest (~1–4 pm) many shutters close and the roads empty. Evening rush hour, then markets lit up at night.
- **Weather and season:** clear, summer haze, monsoon rain with wet roads. The Aji and Nyari rivers fill only in the monsoon setting; otherwise they're dry beds, as in reality.

### 3.5 Sandbox tools ("do anything")
- Map teleport to discovered places, and fast travel.
- Spawn menu: vehicles, cones, ramps, barrels, cricket stumps, kites.
- World sliders: time, date/season, weather, traffic density, pedestrian density.
- Free-fly drone camera over the whole city, and a photo mode (depth of field, filters, hide HUD).
- Discovery log: visiting a landmark unlocks an info card with real, sourced facts, so the game doubles as a mini city guide.

### 3.6 Activities (optional mini-games that never lock the world)
1. **Rickshaw Rides:** pick up passengers and drive them to real destinations. Fare plus a tip for a smooth, fast ride.
2. **Farsan Delivery:** deliver ganthiya, peda or ice cream by scooter before it's late or melts.
3. **Uttarayan Kite Fight** (signature mode): fly a kite from a rooftop and cut rivals' strings ("kai po che!") with simple string physics.
4. **Lokmelo at Race Course:** Ferris wheel, stalls, crowds, lights.
5. **Navratri Garba:** rhythm mini-game at a party plot.
6. **Gully Cricket:** a street match in a society lane.
7. **BRTS Driver:** drive the Ring Road corridor and stop at each station.
8. **Time Trials:** races around the Race Course ring and the ring roads.

Money (₹) from activities buys vehicles, outfits and food. The economy stays light and never blocks free roam.

---

## 4. Tech stack (latest stable versions as of October 2026; pin exact versions)

### 4.1 Game runtime (browser)
| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript 7 (strict) | Safety in a large codebase |
| Build / dev | Vite 8 | Fast reloads, simple bundles, Web Workers |
| Renderer | Three.js r186 (three@0.186.x), WebGL2 WebGLRenderer | Mature, runs everywhere. WebGPURenderer + TSL is a later upgrade, not v1. |
| Physics | Rapier 3D (@dimforge/rapier3d-compat@0.21.x, WASM) | Fast and deterministic, with a built-in kinematic character controller and ray-cast vehicle controller |
| Mesh compression | meshoptimizer 1.3.x | Small, fast-decoding buffers for any pre-built meshes |
| Ray casts | three-mesh-bvh 0.9.x | Camera collision, interaction picking |
| Triangulation | earcut 3.x | Roofs, footprints, junction polygons |
| Noise | simplex-noise 4.x | Procedural textures, wear, variation |
| Sun and moon | suncalc 2.x | Real sun/moon for 22.30° N, 70.80° E, IST |
| Post-FX | postprocessing 6.x | Bloom, SMAA, tone mapping, colour grading, optional SSAO |
| Storage | localStorage + idb-keyval (IndexedDB) | Saves, settings, tile cache. Every call is wrapped in try/catch, and the game works without storage. |
| Fonts | Noto Sans Gujarati + Noto Sans (OFL) | Bilingual signs and UI. Browser canvas text shapes Gujarati correctly. |
| Tests | Vitest 5 (unit), Playwright 1.64 (e2e, screenshots, performance) | |

No Unity or Unreal, and no UI framework in the game loop. The HUD and menus are plain DOM + CSS over the canvas.

### 4.2 Data pipeline ("the bake", offline, Python)
| Need | Tool |
|---|---|
| Language | Python 3.12+ |
| Read OSM .pbf | osmium (pyosmium 4.x) |
| Overture buildings | overturemaps CLI 1.x + duckdb 1.5 + pyarrow |
| Geometry | shapely 2.x, geopandas 1.x |
| Projection | pyproj 3.8 (WGS84 → UTM 42N, EPSG:32642) |
| Rasters (elevation, heights) | rasterio 1.5, numpy, scipy |
| Road graph | networkx 3.x |
| Triangulation | mapbox-earcut |
| Mesh packing | A small Node script using meshoptimizer's encoder |
| Optional | Blender as a Python module (bpy 5.x, Python 3.13, GPL-3.0) for complex landmark ornament. Kept in tools/ with its own virtual environment; the generated .glb files are ours. |

### 4.3 Hosting
- Development: `npm run dev` (Vite, localhost:5173).
- Shareable build: a hosted web page. Limits of the first-choice host: 16 MB per file, ≤ 511 files and 256 MB per version, so the world ships as region packs (§7.14). Alternatives: GitHub Pages, Cloudflare Pages, Netlify.
- Licences: code MIT (suggested). The world data package is ODbL, which is required because it's derived from OSM/Overture.

---

## 5. Architecture

```
OFFLINE "THE BAKE" (Python)
  OpenStreetMap, Overture buildings, Open Buildings 2.5D heights, Copernicus DEM,
  zones.geojson, landmarks.yaml, corrections.yaml
    → 1 Fetch → 2 Clip + reproject (UTM 42N) → 3 Clean + conflate buildings → 4 Heights
    → 5 Classify (use + style zone) → 6 Roads + lane graph + rail → 7 Terrain (de-bump, conform)
    → 8 Water + green → 9 POIs + names → 10 Landmark placements → 11 Tile (500 m)
    → 12 Encode + pack → 13 QA report (DATA_REPORT.md + 2D preview map)
        │
        ▼  WORLD PACKAGE = FACTS, NOT MESHES
           manifest.json · region packs (.rpk) · road/lane graphs · POIs · labels · minimap layer
        │
RUNTIME (browser, TypeScript)
  Main thread: game loop (fixed 60 Hz sim, variable render), streaming manager, Three.js renderer,
               actors (player, vehicles, traffic, pedestrians, animals), audio, DOM UI, saves, activities
  Worker pool (2–4): fetch + decode tiles → seeded generators (terrain, roads, buildings, facades,
               roofs, props, trees, signs, landmarks) → LOD0/1/2 geometry → transferred to main thread
  Rapier (WASM): colliders for tiles within ~300 m, character controller, vehicle controllers
```

**Key idea: bake facts in Python, generate looks in TypeScript.** The bake produces a compact database of Rajkot facts:
- each building's outline, height, floors, use, style zone and seed
- each road's centreline, width, lanes and surface
- lakes, parks, trees, names and landmark placements

The game's generators turn those facts into 3D inside Web Workers at load time. Each object's random generator is seeded by its ID, so a building looks identical on every run. Benefits:
- **Tiny downloads:** an outline is ~40 bytes, while a mesh would be ~40 KB.
- **Detail adapts to the device.**
- **Instant city-wide upgrades:** improving one generator upgrades the whole city without re-baking.

Only hero landmarks, vehicles, characters and a few prop kits are pre-built meshes.

### 5.1 Repository layout
```
rajkot-open-world/
├─ PROMPT.md PLAN.md PROGRESS.md DECISIONS.md BACKLOG.md CREDITS.md README.md LICENSE
├─ data/            (git-ignored) raw/ interim/
├─ pipeline/        pyproject.toml, config.yaml, zones.geojson, landmarks.yaml, corrections.yaml
│  └─ rajkot_bake/  fetch, clip, buildings, heights, classify, roads, lanes, terrain, water,
│                   vegetation, pois, landmarks, tiler, encode, report, cli   + tests/
├─ world/           (generated, git-ignored) manifest.json, packs/*.rpk, graph/, pois.json, labels.bin
├─ game/            index.html, vite.config.ts, package.json, public/ (fonts, small textures, audio, kits/*.glb)
│  └─ src/
│     app/ (boot, loop, settings, quality presets, loading screen)
│     core/ (math, seeded RNG, events, pools, time)
│     world/ (manifest, streaming, cache, worker pool, LOD)
│     gen/ (terrain, roads, junctions, buildings, facades, roofs, props, vegetation, water, signs, landmarks/)
│     render/ (materials, shaders, sky, sun/moon, lights, shadows, post-FX, weather)
│     physics/ (Rapier, tile colliders, character, vehicles)
│     actors/ (player, vehicles/, traffic/, pedestrians/, animals/)
│     audio/  ui/ (HUD, minimap, map, menus, photo mode, i18n en/gu)
│     activities/ (rickshaw, delivery, kites, lokmelo, garba, cricket, brts, trials)  save/
│  tests/ (vitest)  e2e/ (playwright: smoke, viewpoints, perf)
├─ tools/           bpy kit builders, VAT baker, atlas builder
└─ refs/SOURCES.md  reference-photo links + facts with sources and confidence (no photos stored)
```

---

## 6. Environment and workflow
- **Rakshit's PC (Windows) is the source of truth:** git repo, Python bake, data downloads, `npm run dev`, playtests.
- **Cloud workspace (optional):** headless Chromium + Playwright for screenshots and performance runs, plus publishing. As of 9 Oct 2026 it reaches npm, PyPI and raw GitHub, but not map-data hosts (Geofabrik, Overture S3, Copernicus and Overpass were blocked). Data downloads therefore run on the PC.

Commands:
```
python -m rajkot_bake fetch | all | report
npm run dev | test | e2e | build
```

Raw data (bounds with buffer: lon 70.65–70.95, lat 22.15–22.42):
1. **OSM:** the Geofabrik "India – Western Zone" extract, then `osmium extract -b 70.65,22.15,70.95,22.42 ... -o data/raw/rajkot.osm.pbf`
2. **Overture:** `overturemaps download --bbox=70.65,22.15,70.95,22.42 -f geoparquet --type=building -o data/raw/overture_buildings.parquet`
3. **Copernicus DEM GLO-30:** tile Copernicus_DSM_COG_10_N22_00_E070_00_DEM (covers 22–23° N, 70–71° E)
4. **Google Open Buildings 2.5D Temporal:** the `building_height` band for 2023, exported from Earth Engine (GOOGLE/Research/open-buildings-temporal/v1) or via Google's download Colab. This is a manual step with Rakshit's Google account.

---

## 7. How Rajkot is made (the city pipeline)

The city is NOT modelled by hand:
1. It is **computed from real data**.
2. It is **styled by rules** that encode what Rajkot looks like.
3. It is **hand-finished where it matters** (landmarks, hero streets).
4. It is **checked** against real photos and Rakshit's eyes.

### 7.1 Extent and coordinates
- **Playable area:** the RMC boundary from OSM (check it reflects the 2020 expansion) + a 1.5 km buffer, unioned with the Aji-1, Nyari-1, Lalpari and Randarda lakes. That's ≈ 20 × 20 km, roughly 22.20–22.38° N and 70.70–70.90° E (confirm in Phase 0).
- **Horizon ring:** 3 km more of terrain, farms and highway stubs only. Past it, fog thickens and a soft boundary shows "You've reached the edge of Rajkot".
- **Projection:** UTM 42N (EPSG:32642), in metres.
- **Origin O:** Trikon Baug (city centre). `x = easting − O.e`, `z = −(northing − O.n)`, `y = elevation − 100 m`; y is up and −z points north. Coordinates stay within ±12 km, so float32 precision is ~1 mm and no floating origin is needed.
- **Tiles:** 500 × 500 m, indexed (i, j) from the south-west corner. ≈ 1,600 tiles.

### 7.2 Sources
| Source | What we take | Licence |
|---|---|---|
| OpenStreetMap | Roads, rail, BRTS, bridges/layers, rivers, lakes, dams, land use, parks, trees, POIs, names (name, name:gu, name:en), building tags | ODbL |
| Overture buildings (release 2026-09-23 or newer) | Outlines combining OSM with Microsoft, Google and Esri footprints. These fill OSM's gaps in Indian cities. Height where present. | ODbL |
| Google Open Buildings 2.5D Temporal (2023) | Building-height raster, 0–100 m, ~4 m effective resolution | CC BY 4.0 or ODbL (use ODbL) |
| Copernicus DEM GLO-30 | Ground elevation, 30 m | Free with attribution |
| Overture places (optional) | Extra POIs | CDLA-Permissive-2.0 |
| zones.geojson, landmarks.yaml, corrections.yaml | Style zones, landmark list, Rakshit's local fixes | Ours |

### 7.3 Fetch, clip, reproject
Clip to the bounds, reproject to EPSG:32642 and write GeoParquet. Keep OSM ids on everything. Each stage reads and writes parquet, so any stage can be re-run alone.

### 7.4 Buildings: clean and conflate
1. Use Overture as the primary set. Re-attach OSM tags (building, building:levels, height, roof:shape, name) by OSM id, or by overlap (IoU > 0.5).
2. Run make_valid and drop slivers < 12 m² unless they're tagged.
3. Simplify at 0.3–0.5 m, preserving topology: old-city row houses share walls, and shared edges must stay identical.
4. Square up AI-detected outlines: snap corners within ±8° of 90°.
5. Resolve duplicates (keep OSM) and split implausible giant outlines (> 20,000 m² that aren't industrial or a campus).
6. Compute per building:
   - area, perimeter, compactness, orientation
   - frontage edges (within 8 m of a road edge)
   - corner-plot flag
   - shared-wall edges (no windows there)
   - distance to the nearest arterial

### 7.5 Heights
Use the first source available:
1. OSM `height`
2. OSM `building:levels` × floor height
3. Overture `height`
4. Open Buildings 2.5D: the 75th percentile of `building_height` pixels inside the outline shrunk by 2 m. Needs ≥ 4 pixels; values < 2.5 m count as no data.
5. A heuristic by style zone, area and frontage.

Then snap to floors: `levels = max(1, round((h − 0.5) / 3.1))`. `height = ground floor (3.6–4.2 m with shops, else 3.1) + (levels − 1) × 3.1 + parapet (0.9–1.1)`. Clamp to 3–100 m, flag anything over 60 m for review, and store `height_source`.

### 7.6 Classify use and style zone
- **Use:** residential, commercial, mixed (shops below, homes above), industrial, religious, educational, civic, healthcare, transport, other.
  - OSM tags win.
  - A shop or amenity POI inside or touching the outline makes it mixed or commercial.
  - Arterial frontage in mixed zones means probable ground-floor shops.
  - Industrial land use plus a large, low outline means a shed.
- **Places of worship** go to dedicated, respectful generators: Hindu temple (shikhara, mandap, flag), Jain derasar (white marble shikhara), mosque (domes, minarets), church (gable, cross), gurudwara.
- **Style zone (Z1–Z7):** zones.geojson overrides first, then rules (land use, density per hectare, mean height, outline size, distance to arterials, neighbourhood).
- **Output fields:** use, zone, palette_id, shop_ground_floor, seed (a hash of the building id).

### 7.7 Roads, lanes, rail
**Width.** Use the first that applies:
1. The `width` tag.
2. **Rajkot road names that carry their width:** the regex `(\d+)\s*(ft|feet|fit)` on names like "150 Feet Ring Road" or "80 Feet Road" gives right-of-way = N × 0.3048 m. The carriageway is ≈ 65–75 % of it; the rest is footpaths and median.
3. `lanes` × 3.2 m.
4. Class default: primary 14, secondary 10, tertiary 8, residential 6, service 4, track 3.5 m.

**Dual carriageways.** Detect pairs of one-way OSM lines that are parallel, 8–40 m apart, run in opposite directions and share a name. Fill the median between them with a raised black-and-yellow kerb, trees, street lights and, on the Ring Road, BRTS stations.

**Junctions** (the hardest geometry):
1. Build a graph from shared OSM nodes.
2. Offset each incoming road's left and right edges.
3. Intersect neighbouring edges to get corner points, and round the corners with a 3–8 m radius by class.
4. Output a junction polygon plus trimmed road segments.
5. Roundabouts and circles (chowks) get a central island with a garden, statue plinth or fountain. Streets GL (MIT) is a reference for this.

**Vertical profile.** Terrain along the centreline, smoothed with a Gaussian over 60 m and a max grade of 8 %.
- Flyovers and overbridges (`bridge=yes` + `layer`): deck at +6.5 m per layer, smooth ramps up to 120 m long, piers every 25–30 m.
- Underpasses: carved into the ground.

**Surface.** The OSM `surface` tag, else class + zone: asphalt on arterials, RCC concrete in many societies, paving blocks in markets, dirt on the outskirts.

**Furniture points** (baked; meshes are generated at runtime):
- street lights every 30–35 m on arterials (double-arm on medians)
- electric poles with sagging wires every ~35 m in Z1/Z3/Z7, plus transformers
- traffic signals
- zebra crossings
- speed breakers (traffic_calming tags, plus heuristics near schools and hospitals)
- bus stops and BRTS stations
- bilingual green and blue direction boards at major junctions

**Lane graph** (for traffic AI):
- Lane centrelines per direction (from the `lanes` tag or a class default).
- Bézier connector lanes through junctions for each allowed turn (respecting one-ways and OSM turn restrictions).
- Junction control: signal, priority or roundabout-yield.
- Speeds: `maxspeed`, or arterial 50, collector 40, residential 25, highway 70 km/h.

**Rail.** Track bed with ballast and sleepers, plus platforms at Rajkot Junction and Bhaktinagar. Moving trains are backlog.

### 7.8 Terrain
1. **De-bump.** Copernicus GLO-30 is a SURFACE model, so it includes roofs and canopies.
   1. Mask building outlines + 15 m and dense trees.
   2. Fill the masked cells by interpolating from unmasked neighbours.
   3. Apply a 3×3 median filter, then a light Gaussian.
   - *Alternative:* FABDEM, which has buildings removed, but its licence is CC BY-NC-SA 4.0, so it's only usable while the game is non-commercial. Log the decision.
2. **Resample to 10 m.** Each tile gets a 51×51 int16 grid in decimetres, with shared edges.
3. **Conform:**
   - Flatten under roads (half-width + 1 m, blended over 6 m).
   - A building sits on the lowest ground under its outline, and its walls extend 1 m below ground so slopes never show gaps.
   - Carve lake beds with natural shore slopes.
   - Carve riverbeds along `waterway=river` (2–4 m deep, sandy).
4. **Ground material weights** (baked): dusty bare earth (open plots), grass (parks, greener in monsoon), farmland rows, riverbed sand, rock on dam embankments.
5. **Runtime:** micro-noise of ≤ 15 cm on unbuilt ground only.

### 7.9 Water and green
- **Lakes:** water level = the 10th percentile of cleaned ground height along the shore − 0.3 m. Seasonal offset: full in monsoon, about −1.5 m in summer, which exposes the banks.
- **Dams (Aji-1, Nyari-1):** trapezoid embankment, top road, spillway.
- **Rivers (Aji, Nyari):** dry sandy beds with scrub outside the July–September monsoon. Water appears only in monsoon.
- **Parks:** grass, OSM footpaths, benches, dense trees. Race Course gets its open ground, cricket ground, walking track and ring road.
- **Trees** are baked as points `(x, z, species, scale, seed)`.
  - **Placement:**
    - OSM `natural=tree` and tree rows exactly.
    - Parks: Poisson-disc at 8–12 m spacing.
    - Street trees along residential and tertiary roads: every 12–25 m, 40–70 % filled, skipping driveways and junctions.
    - 1–2 trees in society plots.
    - Babool/prosopis along farm edges and riverbeds.
  - **Species:**
    - neem (default)
    - peepal and banyan (temples, old city, chowks)
    - gulmohar (red blossoms in May–June)
    - ashoka (institutions)
    - a few coconut and date palms (bungalows)
    - prosopis (outskirts)

### 7.10 POIs, names, neighbourhoods
- POIs come from OSM. Neighbourhoods (place=suburb/neighbourhood/quarter, e.g. Raiya, Mavdi, Kotharia, Nana Mava) become Voronoi areas that drive the bilingual area-name pop-up ("Kalawad Road / કાલાવડ રોડ").
- Real names are used ONLY for landmarks, roads, neighbourhoods, public institutions and places of worship.
- Shops get invented names in the right category (e.g. "Shree Ambika Jewellers / શ્રી અંબિકા જ્વેલર્સ"). Never use real brands or logos.
- Missing Gujarati names go through a rule-based transliterator, are marked "auto", and Rakshit fixes them in corrections.yaml.

### 7.11 Landmarks (hand-finished)
**Workflow for each landmark:**
1. Find it in OSM (name or wikidata) to get its outline and position.
2. Collect free-licensed reference photos, storing links and licences only.
3. Write a landmark brief: dimensions, materials, colours, the 3–5 features that make it recognisable, and the standard viewpoints.
4. Build a TypeScript generator in gen/landmarks/ (use Blender bpy only for heavy ornament).
5. Compare screenshots from matched viewpoints against the photos and fix.
6. Rakshit signs off.

| # | Landmark | Confidence / notes |
|---|---|---|
| 1 | Race Course: ground, ring road, walking track, Madhavrao Scindia Cricket Ground, Bal Bhavan | high, lokmelo site |
| 2 | Jubilee Garden + Watson Museum + Connaught Hall | high |
| 3 | Kaba Gandhi no Delo | high |
| 4 | Mahatma Gandhi Museum (former Alfred High School) | high |
| 5 | Rotary Dolls Museum | high |
| 6 | Rajkumar College heritage campus | high |
| 7 | Rajkot Junction station (+ simpler Bhaktinagar) | high |
| 8 | Trikon Baug | high |
| 9 | Old-city hero streets: Darbargadh area, Sadar Bazaar, Soni Bazaar (gold market), Dharmendra Road, Lakhajiraj Road | high, district-level tuning |
| 10 | Atal Sarovar | high |
| 11 | Aji-1 Dam + reservoir (+ Ramvan urban forest) | medium, verify Ramvan |
| 12 | Lalpari Lake + Randarda | medium |
| 13 | Nyari-1 Dam | medium |
| 14 | Pradyuman Park (zoo) | medium |
| 15 | Ishwariya Park | medium |
| 16 | BAPS Swaminarayan Mandir, Kalawad Road | medium, verify |
| 17 | 150 Ft Ring Road + Rajpath BRTS Blue Corridor (10.7 km, 18 stops, Jamnagar Rd to Gondal Rd crossroads) | high |
| 18 | Saurashtra University campus | medium |
| 19 | Old Rajkot airport airstrip (general aviation, big open area) | medium |
| 20 | Trimandir | low, check it's in bounds |

### 7.12 The Rajkot style system
| Zone | Where (initial guess; refine with Rakshit) | Floors | Character |
|---|---|---|---|
| Z1 Old city | Darbargadh, Sadar, Soni Bazaar, Dharmendra Rd, Lakhajiraj Rd | 2–4 | Narrow lanes, shared walls, shops below, wooden/iron balconies, faded lime plaster (ochre, blue, green), tangled wires, some Mangalore-tile roofs, chabutaras |
| Z2 Heritage | Jubilee Garden, Rajkumar College, around Race Course | 1–3 | Stone, arches, colonnades, domes, compound walls |
| Z3 Societies | Most residential areas | 1–3 | Bungalows and row houses, compound walls and gates, arched society entrance gates with name boards ("…Society / …Park / …Nagar"), RCC roads |
| Z4 Commercial corridors | Kalawad Rd, Yagnik Rd, University Rd, 150 Ft Ring Rd, Gondal Rd | 4–10 | Glass-front complexes, showrooms, hoardings, shop rows, parking strips full of two-wheelers |
| Z5 New high-rise | Raiya, Mavdi, Nana Mava, along the ring roads | 7–14+ | Apartment towers, grilled balconies, painted bands, rooftop solar |
| Z6 Industrial | Aji GIDC, Bhaktinagar industrial area | 1–2 | Sawtooth or curved metal sheds, compound walls, trucks |
| Z7 Outskirts | Edges, farmland | 1–2 | Low houses, farms, dirt tracks, babool, small temples |

**Facade grammar** (runs in a worker for each building):
1. **Edges:** classify each as front (road-facing), side, back or shared (no windows).
2. **Floors:** ground floor 3.6–4.2 m with shops, else 3.1 m; upper floors 3.0–3.2 m.
3. **Bays:** front edges split into bays of 2.6–4 m. Each bay picks from the zone palette: a window type (sliding aluminium, wooden shutter, grilled), a balcony (open, grilled, enclosed), a split-AC outdoor unit, or utility.
4. **Ground floor** on shop buildings:
   - rolling-shutter shopfronts, open or closed by time of day, including the afternoon rest
   - a signboard band with generated bilingual names
   - plinth steps
   - cloth or metal awnings
5. **Side and back walls:** mostly blank, with small windows and exposed drainage pipes.
6. **Roof:**
   - parapet (0.9–1.1 m) and a stair cabin (mumty)
   - black cylindrical plastic water tanks on stands (almost every roof)
   - dish antennas and clotheslines
   - rooftop solar (more in Z3/Z5)
   - some Mangalore-tile pitched roofs in Z1/Z7
7. **Colour:** from the zone palette, plus weathering noise and monsoon streaks under parapets and AC units.
8. **Night:** a seeded share of windows glows (warm and cool tube-light colours), and signboards light up.

### 7.13 Street-life hints (baked)
- Lari, handcart and tea-stall clusters near commercial nodes and colleges.
- Parked two-wheelers along shop frontage.
- Cow hotspots: medians, open plots, around temples.
- Chabutaras in old-city squares.
- Society gates where a named residential polygon meets a road.
- Crowd density maps: markets, Race Course in the evening, campuses in the daytime.

### 7.14 Tiling, encoding, packing
- **Assignment:** buildings by centroid, lines and polygons clipped per tile, points by position.
- **.rtile** (binary, little-endian, versioned):
  - **Header:** magic "RJKT", format version, (i, j), section table.
  - **Sections:** HEIGHT (51×51 int16 dm), BLDG, ROAD (segments, junction polygons, furniture points), WATER, LANDUSE, TREES, HINTS, LABELS (ids into a global string table), LANDMARKS.
  - **Coordinates:** int16 decimetres relative to the tile's south-west corner.
  - **BLDG record:** ≈ 12 bytes + 4 bytes per vertex (≈ 40 bytes per building).
- **Region packs (.rpk):** 4×4 tiles (2×2 km), ≈ 100 packs, ≤ 4 MB each. manifest.json maps each tile to its pack, offset and length. Packs are fetched whole and cached, because the hosting may not support HTTP Range requests.
- **Global files:** road graph (GPS), lane graph (split per region), POI/label index (≤ 2 MB), simplified minimap vector layer (≤ 3 MB).
- **Size budget:**

  | Data | Expected size |
  |---|---|
  | Buildings | ≈ 10–20 MB |
  | Roads, water and land use | ≈ 5–10 MB |
  | Height grids | ≈ 8 MB |
  | Trees and hints | ≈ 5 MB |
  | **Total** | **≈ 30–50 MB (hard cap 150 MB)** |

### 7.15 City QA report (DATA_REPORT.md)
- **Coverage:** buildings OSM vs Overture vs final, % of heights by source, road km by class, POIs by category, landmarks found or missing.
- **Checks that fail the bake:**
  - any invalid geometry
  - ≥ 0.5 % of buildings overlapping
  - largest connected road component < 98 % of drivable length
  - any tile > 1 MB
  - any landmark not located
- **2D preview map (HTML):** buildings coloured by height, roads by class, zone overlay, landmarks. Rakshit reviews it and writes fixes in corrections.yaml.

---

## 8. Runtime: streaming, generation, rendering

### 8.1 Boot
1. Load the engine bundle (target ≤ 1.5 MB gzipped), fonts, manifest and minimap layer.
2. Initialise Rapier.
3. Run a 3-second benchmark to pick the quality preset.
4. Fetch the packs within 1 km of spawn and generate LOD0 within 300 m. The game is now playable.
5. Everything else streams in the background.

The loading screen shows Rajkot facts.

### 8.2 Streaming manager
- **Tile states:** unloaded → fetching → decoding → generating → uploading → active → evicting.
- **Priority:** distance to the player's predicted position (velocity × 3 s) plus LOD need.
- **Workers:** pool size = clamp(cores − 1, 2, 4). Data moves as Transferable ArrayBuffers.
- **Main thread:** GPU uploads are time-sliced to ≤ 4 ms per frame.
- **Memory:** LRU eviction with hysteresis. The pack cache lives in IndexedDB (try/catch).

### 8.3 LOD rings (High preset; Low halves the distances)
| Ring | Distance | Buildings | Roads/terrain | Props/trees | Physics |
|---|---|---|---|---|---|
| LOD0 | 0–300 m | Facade shader + instanced details (balconies, ACs, tanks, signs, awnings) | Full junctions, kerbs, markings, furniture | All props, full trees | Colliders |
| LOD1 | 300–1200 m | Prisms + facade shader | Roads without kerbs or furniture | Low-poly trees | None |
| LOD2 | 1.2–3 km | Merged per tile, small buildings dropped | 20 m terrain, roads as ground texture | Tree impostors | None |
| Beyond | > 3 km | Haze and fog (Rajkot's dusty horizon) | | | |

Dithered cross-fades between rings prevent popping.

### 8.4 Generators (deterministic, seeded, in workers)
- **Terrain:** mesh from the height grid plus splat weights.
- **Roads:** ribbons with UVs in metres, junction polygons (earcut), kerbs, medians.
- **Buildings:** extruded walls, triangulated roofs, parapet rings. Per-building style parameters are packed into vertex attributes. Wall UVs are in metres along the perimeter and up the height.
- **Instancing:** balconies, AC units, tanks, dishes, solar panels, signboards, furniture, trees.
- **Landmarks:** from their own modules.
- **Signboard text:** Canvas2D with Noto Sans Gujarati renders into 2048² atlas pages per region.
- **Batching:** per tile, one BatchedMesh or merged geometry per material class (buildings, roads, terrain, water). Props, trees and vehicles share InstancedMesh pools.

### 8.5 Materials and shaders
Extend MeshStandardMaterial via onBeforeCompile to keep PBR lighting, shadows and fog.
- **Facade shader:**
  - procedural window grid from wall UVs (bay width, floor height)
  - window, shutter and balcony looks from a small atlas generated at boot
  - plaster colour with grime noise and monsoon streaks
  - night-time emissive windows chosen by a per-window hash
- **Road shader:** asphalt or concrete, wear, patches, lane markings in road-space UVs, wetness.
- **Terrain:** splat shader.
- **Water:** normal maps, sky reflection, shore foam, dry-season mud.
- **Trees:** wind sway.

Textures are procedural at boot or tiny PNGs; there are no large texture downloads.

### 8.6 Light, sky, time
- **Sky and sun:** physical sky (Three.js Sky addon) with tuned haze. Sun and moon from suncalc for 22.30° N, 70.80° E, IST. One game day = 48 real minutes (configurable).
- **Lighting:** directional sun, hemisphere ambient, cascaded shadow maps (3 cascades on High, 1 on Low, none on phone-Low).
- **Night:** emissive street lights plus the nearest 8–16 real point lights; headlights on the player and nearby vehicles.
- **Grading:** AgX/ACES tone mapping, a colour-grading LUT per time slot (warm golden hour, harsh noon, cool monsoon), bloom at night.

### 8.7 Weather and seasons
- **States:** clear, summer haze, cloudy, monsoon rain, post-rain.
- **Rain:** particle streaks near the camera, splashes, wet roads (darker albedo, lower roughness, puddle mask), rain audio.
- **Seasons:** river water, lake levels, grass greenness, gulmohar blossoms, festival decorations (Diwali lights, Navratri, kites in the January sky).

---

## 9. Simulation, actors, UI

### 9.1 Physics (Rapier)
- **Step:** fixed 60 Hz with interpolation.
- **Where:** colliders only for tiles within ~300 m of the player and of any physics-active vehicle.
- **Collider types:**
  - **Terrain:** a heightfield collider per tile.
  - **Buildings:** a convex prism if the outline is convex, otherwise a simplified trimesh of walls and roof.
  - **Kerbs and medians:** thin boxes.
  - **Props:** cuboids.
- **Collision groups:** world, player, vehicles, traffic, pedestrians, props, triggers.
- **Safety net:** if the player falls below terrain − 5 m, respawn them on the nearest road.

### 9.2 Player
- **Controller:** Rapier KinematicCharacterController (autostep 0.35 m, slope limit 45°, snap-to-ground 0.3 m).
- **States:** idle, walk, run, sprint, jump, fall, land, crouch, climb, swim, sit, ride, drive.
- **Animation:** AnimationMixer with blending.
- **Camera:** spring arm with a collision ray.
- **Character:** a CC0 rig (e.g. Quaternius) with outfit swaps and colour tints.

### 9.3 Vehicles
- **Controller:** Rapier DynamicRayCastVehicleController.
- **Tuning table per vehicle:** mass, torque curve, simple gears, brakes, steering angle vs speed, suspension stiffness/damping/travel, tyre friction.
- **Two-wheelers:** a hidden stabilising 4-wheel base, with visual lean driven by lateral acceleration and a rider IK pose.
- **Three-wheelers:** 3 visual wheels on a narrow-front 4-wheel physics base.
- **Controls:** enter/exit animations, horn, indicators, headlights, flip reset (R).
- **Camera:** chase camera with speed-based field of view.

### 9.4 Traffic AI
- **Spawning:** in a ring 150–600 m around the player. Agents despawn beyond 700 m when off-screen.
- **Density:** road class × a time-of-day curve (peaks 9–11 am and 6–9 pm, a dip at 1–4 pm, low at night).
- **Mix:** mostly two-wheelers, then autos, cars, chhakdos, buses, and trucks or tractors depending on zone.
- **Longitudinal motion:** Intelligent Driver Model (IDM).
- **Lateral motion:**
  - lane following with offset noise
  - two-wheelers filter through gaps
  - MOBIL-lite lane changes
- **Junctions:**
  - signal cycles
  - priority junctions with gap acceptance, where growing impatience produces realistic nudging
  - roundabout yield
- **Obstacles** (cows, the player, parked vehicles): slow down and steer around. Horns sound when blocked.
- **Physics:** agents are kinematic until a collision, then become dynamic bodies.
- **Simulation LOD:** agents beyond 300 m update at 10 Hz with no physics.
- **Caps:** 150 agents on High, 50 on Low.

### 9.5 Pedestrians and animals
- **Navigation:** a footway graph with crossings, plus wander and goal behaviours.
- **Crowds:** Vertex Animation Textures (pre-baked walk and idle cycles) on InstancedMesh for hundreds of people. Within 30 m they swap to full skinned meshes.
- **Reactions:** step aside for the player; scatter from speeding vehicles.
- **Animals:**
  - cows: idle, sit, wander, sometimes block a lane
  - dogs: follow, bark
  - pigeon flocks at chabutaras
- **Caps:** 300 visible pedestrians on High, 80 on Low.

### 9.6 Performance budgets and quality presets
| Metric | High (mid laptop, 1080p) | Low (mid phone) |
|---|---|---|
| FPS | 60 | 30 |
| Draw calls | ≤ 800 | ≤ 250 |
| Visible triangles | ≤ 3 M | ≤ 0.8 M |
| GPU memory | ≤ 1 GB | ≤ 400 MB |
| JS heap | ≤ 600 MB | ≤ 300 MB |
| Main-thread frame | ≤ 10 ms | ≤ 22 ms |
| Physics step | ≤ 3 ms | ≤ 5 ms |
| Draw distance | 3 km | 1.2 km |

Presets: Low, Medium, High and Ultra, auto-picked by the benchmark. Dynamic resolution scaling holds the target frame rate, and F3 toggles a performance overlay.

### 9.7 Audio (WebAudio)
- **Buses:** music, SFX, ambience, UI. Spatial PannerNodes (HRTF on High).
- **Engines:** synthesised by RPM from short loops per vehicle type.
- **Horns:** scooter beep, auto pom-pom, bus air horn, truck musical horn.
- **Ambience zones:** market chatter, traffic hum by density, temple bells, park birds, crickets and dogs at night, rain.
- **Rule:** all audio is CC0 or self-made.

### 9.8 UI, HUD, map
- **HUD:**
  - rotating vector minimap (300 m radius, GPS route)
  - speedometer, clock and weather, money
  - bilingual area-name pop-up
  - interaction prompts
- **Full map:** pan and zoom, en/gu labels, landmarks, discovered places, waypoint.
- **GPS:** A* on the road graph, respecting one-ways. The route shows on the minimap and as in-world chevrons.
- **Menus:** pause, settings, sandbox, spawn, discovery log, activities, credits, photo mode.
- **Language:** every string is localised to en and gu.

### 9.9 Input
- **Keyboard and mouse:**

  | Action | Key |
  |---|---|
  | Move | WASD |
  | Sprint | Shift |
  | Jump / handbrake | Space |
  | Interact / enter | E |
  | Horn | H |
  | Map | M |
  | Time | T |
  | Sandbox | Tab |
  | Photo mode | P |
  | Camera | C |
  | Reset vehicle | R |
  | Performance overlay | F3 |

- **Gamepad:** standard mapping.
- **Touch:** virtual left stick, right-side drag to look, context buttons.
- All keys are remappable.

### 9.10 Saves and settings
- **What's saved:** position, vehicle, outfit, money, discovered landmarks, activity records, settings.
- **Where:** localStorage or IndexedDB, wrapped in try/catch.
- **Portability:** export/import saves as a JSON file.
- **Fallback:** the game must work fully even when storage is unavailable.

---

## 10. Activities framework
- **Module interface:** each activity implements `canStart(ctx)`, `start()`, `update(dt)` and `end(result)`, with its own UI, map markers and triggers.
- **Data:** activities are defined in JSON, and destinations come from real POIs and landmarks.
- **Freedom:** an activity never locks the world, and quitting is always one key.

---

## 11. Asset strategy
- **Buildings, roads, terrain, low-poly trees, street furniture:** generated by code.
- **Vehicles:** TypeScript generator kits or Blender bpy scripts exporting .glb. Unbranded designs of common Indian vehicle types, no logos.
- **Characters:** CC0 rigged humanoids and animations (e.g. Quaternius), with our own Indian outfit variants and recolours.
- **Textures:** procedural at boot plus small hand-made atlases.
- **Audio and music:** CC0 or synthesised.
- **Fonts:** Noto Sans Gujarati and Noto Sans (OFL).
- Every third-party asset is listed in CREDITS.md with its licence and source.

---

## 12. Testing and quality
- **Pipeline:** pytest on geometry functions, plus the bake checks in §7.15.
- **Generators:** vitest checks for no NaNs, closed outlines, triangle counts within budget, and identical output for the same seed (snapshot hashes).
- **E2E (Playwright):**
  - boot to playable in < 15 s
  - walk for 10 s
  - drive a scooter on a scripted 60 s route without falling through the world
  - open the map and set a waypoint
- **Viewpoint screenshots** (fixed camera poses, compared with the last build and by eye with reference photos):
  1. Race Course ring at sunset
  2. Jubilee Garden / Watson Museum
  3. Dharmendra Road market
  4. Soni Bazaar
  5. Trikon Baug
  6. Rajkot Junction forecourt
  7. Kalawad Road at KKV Chowk
  8. A 150 Ft Ring Road BRTS station
  9. Atal Sarovar
  10. Aji Dam embankment
  11. A typical society lane
  12. Raiya high-rises
  13. Aji GIDC
  14. Lalpari
  15. Aerial over the centre at night
- **Performance run:** a scripted 10-minute drive (Race Course → Ring Road → Raiya → Kalawad Rd → old city) logging fps percentiles, heap, GPU memory and tile latency. It fails if any budget is broken.
- **Milestone reviews:** a reviewer pass (rule 7) plus Rakshit's playtest.

---

## 13. Phases (each ends with a playable build and a gate)
| Phase | Deliverables | Gate |
|---|---|---|
| P0 Data recon | Data downloaded; bake stages 1–5; DATA_REPORT.md; 2D preview map; bounds and origin fixed; draft zones.geojson; landmarks.yaml with confidence levels | Rakshit reviews the preview map |
| P1 Vertical slice (~2×2 km: Race Course, Jubilee Garden, old-city bazaars) | Terrain, roads and junctions, buildings with the facade shader (Z1–Z4), walking + scooter, day/night, minimap, basic HUD | Rakshit recognises his streets; 60 fps on his laptop |
| P2 Whole city | All tiles, streaming, LOD 0–2, region packs, full map + GPS + fast travel, quality presets, memory stable for 30 min | Cross-city drive without hitches |
| P3 Make it look like Rajkot | All zones, roofs, props, trees, furniture, bilingual signs, flyovers, lakes and dams, 20 landmarks | ≥ 8/10 screenshot recognition test |
| P4 Life | Traffic, pedestrians, animals, audio, weather and seasons | Street clip looks alive; budgets hold |
| P5 Sandbox and activities | All vehicles, spawn menu, sliders, drone cam, photo mode, discovery log, ≥ 5 activities, saves | Fun check |
| P6 Polish and ship | Onboarding, settings, touch controls, accessibility, credits, bug bash, published link, README | v1.0 release |

Backlog:
- hero interiors (Watson Museum, a farsan shop, a home)
- moving trains
- festival calendar events
- multiplayer
- expansions (Hirasar airport, Khandheri stadium, highways to Jamnagar, Gondal and Morbi)
- WebGPU renderer
- cosmetic damage

---

## 14. Legal, attribution, respect
- **Credits** (screen + CREDITS.md):
  - "© OpenStreetMap contributors" (ODbL)
  - Overture Maps Foundation (ODbL)
  - Google Open Buildings (used under ODbL)
  - Copernicus DEM: "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved"
  - fonts (OFL)
  - every asset
- **Data licence:** the world package is a derivative database and is published under ODbL.
- **Real-world content:**
  - no real brands, logos or shop names
  - no real private individuals, house numbers or owner names
- **Places of worship:** shown respectfully, indestructible, never targets of gameplay.
- **Tone:** family-friendly with no combat. Reference photos are links only, licence-checked and never redistributed.

---

## 15. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Missing or misaligned buildings | Overture fill, QA report, corrections.yaml, Rakshit's review |
| Wrong heights | Multi-source priority, zone heuristics, review flag above 60 m |
| City looks generic | Style zones, Rajkot details, landmarks first, photo checks, recognition test |
| Phones too slow | Presets, aggressive LOD, dynamic resolution, Low budgets |
| Scope creep | Phases, gates, BACKLOG.md |
| Data hosts blocked | Run downloads on the PC, or manual download |
| Physics glitches | Conservative colliders, safety respawn, e2e drive tests |
| Hosting limits | Region packs ≤ 4 MB, alternative hosts |
| AI session continuity | PLAN / PROGRESS / DECISIONS files, small commits |
| Licensing mistakes | Open data, CC0 and own assets only; CREDITS.md kept current |

---

## 16. Glossary
- **Chowk:** junction or square.
- **Chhakdo:** Saurashtra's motorcycle-based three-wheeler.
- **Lari:** handcart stall.
- **Galla:** kiosk or small shop.
- **Chabutaro:** bird-feeding tower.
- **Farsan:** savoury snacks.
- **Ganthiya:** fried gram-flour snack.
- **Peda:** milk sweet.
- **Lokmelo:** public fair (the Janmashtami fair at Race Course).
- **Garba:** Navratri dance.
- **Uttarayan:** kite festival on 14 January.
- **Kai po che:** the shout when you cut a kite.
- **Society:** a gated residential colony.
- **Mumty:** rooftop stair cabin.
- **Derasar:** Jain temple.
- **RMC:** Rajkot Municipal Corporation.
- **Rajpath:** Rajkot's BRTS.
- **GIDC:** Gujarat industrial estate.
- **Dayro:** Saurashtra folk storytelling music.

---

## FIRST INSTRUCTION
Read this entire prompt. Do not write code yet. Reply with:
1. A summary of the project in ≤ 15 bullets.
2. Your Phase 0 task list.
3. Any open questions for Rakshit.

Wait for his go-ahead before starting Phase 0.
