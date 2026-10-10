# Deploying Rangilu Rajkot (Cloudflare Pages)

The game is a static site: `game/dist` = the built game + the baked world (`world/`: packs, manifest, map).
The world is baked on Rakshit's PC (`pipeline/`, ~40 min) and **committed**, so Cloudflare only has to run
the Vite build. Every push to `main` redeploys automatically.

## One-time setup (Cloudflare dashboard)
1. Log in at https://dash.cloudflare.com (free plan is enough).
2. **Workers & Pages → Create → Pages → Connect to Git**.
3. Authorise Cloudflare's GitHub app for the repository **Rakshit-Gajera/Rangilu-Rajkot** (only this repo is enough).
4. Build settings:

   | Setting | Value |
   |---|---|
   | Project name | `rangilu-rajkot` (gives `https://rangilu-rajkot.pages.dev`) |
   | Production branch | `main` |
   | Framework preset | None |
   | Build command | `npm ci --prefix game && npm run build --prefix game` |
   | Build output directory | `game/dist` |
   | Root directory | *(leave empty)* |
   | Environment variable | `NODE_VERSION` = `22` (also set by `.node-version`) |

5. **Save and Deploy.** The first build takes ~2 minutes. Pull requests get their own preview URLs.

## Updating
- Code change: commit and push to `main` → Cloudflare rebuilds and publishes.
- World change: re-run the bake (`.venv/Scripts/python -m rajkot_bake …`), commit `world/` (packs, manifest,
  map, strings), push.

## What is never published
- `world/private.local.json` (your home location; git-ignored and filtered out of the build)
- `world/preview/` (debug map), `pipeline/local.yaml`, raw data in `data/`

## Notes
- `game/public/_headers` sets caching and serves `.gz` packs as plain binary; the game inflates them itself
  (and also copes if a host has already inflated them).
- Limits: Cloudflare Pages allows 20,000 files and 25 MiB per file; the build is ~430 files, largest 1.5 MB.
