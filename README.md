# Rangilu Rajkot

A free-roam, open-world **browser game** set in a 1:1 recreation of Rajkot, Gujarat, built from open map data.
Walk, ride and drive anywhere in the real city — every street, ring road, lake and landmark in its true place.

> Status: **Phase 0 — data recon.** Nothing playable yet. See [PROGRESS.md](PROGRESS.md).

## How it works

- **The bake (Python, `pipeline/`)** turns OpenStreetMap, Overture buildings and Copernicus elevation into a compact database of *facts*: building outlines and heights, roads, water, trees, landmarks.
- **The game (TypeScript + Three.js, `game/`)** — from Phase 1 — generates the 3D city from those facts in Web Workers, seeded per object so the city looks the same every run.

## Running the bake (Windows)

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -e pipeline[dev]
.venv/Scripts/python -m rajkot_bake fetch     # download raw data into data/raw (~300 MB)
.venv/Scripts/python -m rajkot_bake all       # run every stage
.venv/Scripts/python -m rajkot_bake report    # DATA_REPORT.md + preview map
```

## Project docs

| File | Purpose |
|---|---|
| [PROMPT.md](PROMPT.md) | The vision and spec (single source of truth) |
| [PLAN.md](PLAN.md) | Current phase plan |
| [PROGRESS.md](PROGRESS.md) | What's done, what's next, known bugs |
| [DECISIONS.md](DECISIONS.md) | Architecture decision log |
| [BACKLOG.md](BACKLOG.md) | Ideas parked for later |
| [CREDITS.md](CREDITS.md) | Data and asset attributions |

## Licence

Code: MIT. World data: ODbL 1.0 (derived from © OpenStreetMap contributors and Overture Maps Foundation). See [CREDITS.md](CREDITS.md).
