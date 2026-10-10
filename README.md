# Rangilu Rajkot · રંગીલું રાજકોટ

A free-roam, open-world **browser game** set in a 1:1 recreation of Rajkot, Gujarat, built from open map data.
Walk, ride and drive anywhere in the real city and the countryside around it — every street, ring road, chowk,
lake and landmark in its true place. No combat: just Rajkot.

> Status: **v1 feature-complete, in polish** (Phase 6). See [PROGRESS.md](PROGRESS.md) and [PLAN.md](PLAN.md).

## What's in it
- **The whole region:** 1,543 km² around Rajkot (6,336 tiles, 284k buildings, 50k road junctions) streamed in the
  browser, from the old bazaars to Darshan University on the Morbi highway.
- **Rajkot you recognise:** chowks with their statues (Gandhi at Jubilee, Ambedkar at Hospital Chowk, Sardar Patel at
  Bahumali Bhavan, the MIG-27 at Kotecha Chowk, the old neem at Limda Chowk), flyovers, 117k trees, bilingual shop
  signboards, 20 hand-built landmarks (Watson Museum, Rajkot Junction, Rajkumar College, BAPS mandir, …).
- **A living city:** traffic that keeps left and stops at signals, autos and chhakdos, people, cows and street dogs,
  the afternoon rest, golden-hour sun from the real sun position, monsoon rain with wet roads and filling rivers.
- **Every vehicle:** bicycle, scooter, motorcycle, chhakdo, auto-rickshaw, hatchback, SUV, city bus, tractor — take
  any one from traffic with **E**.
- **Activities (J):** Rickshaw Rides, Farsan Delivery, Uttarayan Kite Fight, Lokmelo at Race Course, Navratri Garba,
  Gully Cricket, BRTS Driver, Race Course Time Trial. Earn ₹ for outfits and street food.
- **Sandbox (Tab):** spawn vehicles and props, change time, season, weather, traffic and crowds; drone camera and
  photo mode (**P**); discovery log (**L**) of landmarks with short sourced facts; teleport anywhere from the map (**M**).
- English / ગુજરાતી, keyboard + mouse, gamepad and touch controls, remappable keys, saves (export/import).

## Play locally (Windows)

```bash
npm ci --prefix game
npm run dev --prefix game
```

Open http://localhost:5173 and click the game to look around with the mouse. The baked world (`world/`) is in the
repo, so no bake is needed to play.

**Keys:** WASD move · mouse look · Shift sprint · Space jump/brake · E get on/off · H horn · M map (double-click to
teleport) · J activities · L discoveries · Tab sandbox · P photo · C camera · R reset / bring your scooter · Esc menu
(settings, keys, saves) · F3 performance.

## Publish (Cloudflare Pages)
Connect this GitHub repo in Cloudflare Pages; every push to `main` redeploys. Settings and details: [DEPLOY.md](DEPLOY.md).

## Re-bake the world (optional, Windows)

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e pipeline[dev]
.venv/Scripts/python -m rajkot_bake fetch     # raw data into data/raw (~300 MB)
.venv/Scripts/python -m rajkot_bake all       # every stage (~45 min for the open world)
.venv/Scripts/python -m rajkot_bake private   # optional: your home spawn from pipeline/local.yaml (never published)
```

## How it works
- **The bake (Python, `pipeline/`)** turns OpenStreetMap, Overture buildings and places, GHSL heights and the
  Copernicus elevation model into compact tiles of *facts*: outlines, heights, roads, water, trees, chowks, landmarks.
- **The game (TypeScript + Three.js + Rapier, `game/`)** generates the 3D city from those facts in Web Workers,
  seeded per object so the city looks the same every run, and streams it around you.

## Project docs

| File | Purpose |
|---|---|
| [PROMPT.md](PROMPT.md) | The vision and spec |
| [PLAN.md](PLAN.md) | Phase plan and what's left |
| [PROGRESS.md](PROGRESS.md) | What's done, known issues |
| [DECISIONS.md](DECISIONS.md) | Architecture decisions |
| [DEPLOY.md](DEPLOY.md) | Cloudflare Pages setup |
| [CREDITS.md](CREDITS.md) | Data and asset attributions |

## Licence

Code: MIT. World data: ODbL 1.0 (derived from © OpenStreetMap contributors and Overture Maps Foundation). See [CREDITS.md](CREDITS.md).
