# `.rtile` format, version 1

One 500 × 500 m tile of world facts. Little-endian. Written by `pipeline/rajkot_bake/tiler.py`,
read by `game/src/world/rtile.ts`. Change both together and bump the version.

## Coordinates
- Tile-local metres: `x` east and `n` north from the tile's south-west corner, stored as **int16 decimetres**.
- World coordinates (runtime): `X = tileSwX + x`, `Z = −(tileSwN + n)`, both relative to the Trikon Baug origin.
- Heights `y` are **int16 decimetres** of `elevation − 100 m` (PROMPT §7.1).

## Header (16 bytes)
| Offset | Type | Field |
|---|---|---|
| 0 | char[4] | magic `RJKT` |
| 4 | u16 | version (1) |
| 6 | u16 | flags (0) |
| 8 | i16 | tile i (relative to origin tile) |
| 10 | i16 | tile j |
| 12 | u16 | section count |
| 14 | u16 | reserved |

Then the section table: per section `char[4] tag, u32 offset, u32 length` (offsets from the start of the tile).

## Sections
### `HGHT` — terrain heights
`u16 n` (51), then `n × n` i16 heights (dm), row-major, row 0 = south edge, column 0 = west edge, 10 m spacing.
Tiles share their edge rows/columns.

### `BLDG` — buildings
`u32 count`, then per building:

| Type | Field |
|---|---|
| u32 | seed (low 32 bits of the 64-bit building seed) |
| u8 | levels |
| u8 | zone (1–7) |
| u8 | use (index into `USES`) |
| u8 | flags: bit0 shop ground floor, bit1 corner plot, bit2 shared walls, bit3 place of worship |
| u16 | height (dm) |
| i16 | base y (dm): lowest ground under the outline |
| u8 | palette id |
| u8 | worship type (0 none, 1 hindu temple, 2 jain derasar, 3 mosque, 4 church, 5 gurudwara) |
| u16 | vertex count `v` |
| v × (i16, i16) | outline x, n (dm), counter-clockwise seen from above, not closed |
| ⌈v/4⌉ bytes | edge kinds, 2 bits per edge, edge k = vertex k → k+1: 0 back/side, 1 front (road), 2 shared wall |

`USES = residential, mixed, commercial, industrial, religious, educational, civic, healthcare, transport, other`

### `RDLN` — road centrelines
`u32 count`, then per polyline:

| Type | Field |
|---|---|
| u8 | rank (9 motorway … 1 track) |
| u8 | surface (0 asphalt, 1 concrete, 2 paving, 3 dirt) |
| u8 | lanes |
| u8 | flags: bit0 one-way, bit1 bridge, bit2 tunnel, bit3 roundabout |
| u16 | width (cm) |
| i8 | layer |
| u8 | speed (km/h) |
| u32 | name (index into `strings.json`, 0xFFFFFFFF = none) |
| u16 | point count `p` |
| p × (i16, i16, i16) | x, n, y (dm); y follows the terrain, or the deck for bridges |

Lines are clipped to the tile (+10 m overlap). Bridges are not part of `RDSF`.

### `RDSF` — road surface meshes
`u8 surface count`, then per surface: `u8 surface, u32 vertex count V, u32 index count I`,
`V × (i16 x, i16 n)`, `I × u16` triangle indices. Junctions are already merged (union of all
road footprints, inner corners rounded) and split on the 10 m terrain grid so every vertex can
take its height from `HGHT`.

### `AREA` — ground cover meshes
Same layout as `RDSF`, with an area class instead of a surface: 0 grass, 1 water, 2 sand, 3 pitch/dirt.
Water vertices carry no height; the water level for the tile is `i16` dm stored after each water
class header (`u8 class, i16 level, u32 V, u32 I`), other classes have no level field.

### `LMRK` — landmarks
`u16 count`, then per landmark: `u32 name (strings index), u8 confidence (0 low, 1 medium, 2 high), i16 x, i16 n`.

## Packs (`.rpk`) and manifest
A region pack is the plain concatenation of up to 4 × 4 tiles. `world/manifest.json` maps
`"i,j"` → `[packFile, offset, length]` and carries the world frame (origin, tile size, y offset)
and the `strings.json` name.
