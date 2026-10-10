import { Builder, type GeoBuf } from './geobuf';
import { box, cylinder, quad, segment, sphere, type V3 } from './prims';

/**
 * Hand-built landmark models (PROMPT §7.11): Rajkot's recognisable buildings in the game's low-poly style.
 * Local frame: x along the front (width w), +z = the direction the front faces, ground at y = 0, centred.
 * Sizes come from the real footprints (pipeline/rajkot_bake/sites.py). Colours are sRGB (converted at the end).
 * Name boards with text are added separately (render-side canvas textures).
 */
export type LandmarkModel = 'museum' | 'colonial_school' | 'palace' | 'palace_gate' | 'station' | 'haveli' | 'dolls' |
  'temple' | 'campus' | 'pavilion' | 'terminal' | 'gate' | 'ferris';

type C3 = number[];
const CREAM: C3 = [0.9, 0.84, 0.7];
const WHITE: C3 = [0.94, 0.93, 0.9];
const STONE: C3 = [0.78, 0.66, 0.5];
const PINK: C3 = [0.86, 0.68, 0.6];
const DARK: C3 = [0.12, 0.11, 0.1];
const GLASS: C3 = [0.25, 0.36, 0.42];
const RED: C3 = [0.62, 0.22, 0.16];
const WOOD: C3 = [0.42, 0.26, 0.14];
const GREEN: C3 = [0.2, 0.42, 0.22];
const ROOF: C3 = [0.55, 0.3, 0.22];
const SAFFRON: C3 = [0.95, 0.55, 0.12];
const YELLOW: C3 = [0.98, 0.82, 0.18];

/** A board: where text goes (x, y, z centre on the front, width, height). */
export interface Board { x: number; y: number; z: number; w: number; h: number; text: string; sub?: string; bg: string; fg: string }

export interface LandmarkMesh { geo: GeoBuf; boards: Board[] }

function columns(b: Builder, x0: number, x1: number, z: number, n: number, h: number, r: number, col: C3, y0 = 0) {
  for (let k = 0; k < n; k++) {
    const x = n === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * k) / (n - 1);
    cylinder(b, x, y0, z, r, h, col, 10);
    box(b, x, y0 + h, z, r * 2.6, 0.25, r * 2.6, col); // capital
    box(b, x, y0, z, r * 2.6, 0.3, r * 2.6, col); // base
  }
}

/** Dark arched openings across a facade at z (front face), floor by floor. */
function arches(b: Builder, w: number, z: number, floors: number, fh: number, every = 3.2, col: C3 = DARK, y0 = 0) {
  const n = Math.max(1, Math.floor((w - 2) / every));
  for (let f = 0; f < floors; f++) {
    for (let k = 0; k < n; k++) {
      const x = -w / 2 + 1 + (k + 0.5) * ((w - 2) / n);
      const y = y0 + f * fh + 0.7;
      box(b, x, y, z, 1.2, fh * 0.55, 0.12, col);
      segment(b, [x - 0.6, y + fh * 0.55, z], [x + 0.6, y + fh * 0.55, z], 0.6, 0.6, col, 10, false); // arch head
    }
  }
}

function pediment(b: Builder, cx: number, y: number, z: number, w: number, h: number, col: C3) {
  quad(b, [cx - w / 2, y, z], [cx + w / 2, y, z], [cx, y + h, z], [cx, y + h, z], col);
  quad(b, [cx + w / 2, y, z - 1], [cx - w / 2, y, z - 1], [cx, y + h, z - 1], [cx, y + h, z - 1], col);
  quad(b, [cx - w / 2, y, z - 1], [cx - w / 2, y, z], [cx, y + h, z], [cx, y + h, z - 1], col);
  quad(b, [cx + w / 2, y, z], [cx + w / 2, y, z - 1], [cx, y + h, z - 1], [cx, y + h, z], col);
}

function dome(b: Builder, x: number, y: number, z: number, r: number, col: C3, finial = true) {
  cylinder(b, x, y, z, r * 0.95, r * 0.35, col, 16); // drum
  sphere(b, [x, y + r * 0.35, z], r, col, 0.9, 16);
  if (finial) segment(b, [x, y + r * 1.25, z], [x, y + r * 1.25 + 1.2, z], 0.12, 0.02, YELLOW, 6);
}

function chhatri(b: Builder, x: number, y: number, z: number, s: number, col: C3) {
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) segment(b, [x + dx * s, y, z + dz * s], [x + dx * s, y + s * 2, z + dz * s], 0.12 * s, 0.12 * s, col, 6);
  box(b, x, y + s * 2, z, s * 2.6, 0.25 * s, s * 2.6, col);
  sphere(b, [x, y + s * 2.2, z], s * 1.1, col, 0.8, 10);
}

/** Stepped temple spire (shikhara): stacked, narrowing drums with an amalaka and a saffron flag. */
function shikhara(b: Builder, x: number, y: number, z: number, r: number, h: number, col: C3) {
  const tiers = 7;
  for (let k = 0; k < tiers; k++) {
    const t = k / tiers, rr = r * (1 - t * 0.8), hh = h / tiers;
    cylinder(b, x, y + k * hh, z, rr, hh * 0.95, col, 12);
  }
  sphere(b, [x, y + h + 0.3, z], r * 0.3, col, 0.5, 10); // amalaka
  segment(b, [x, y + h, z], [x, y + h + 3, z], 0.05, 0.05, DARK, 4);
  quad(b, [x, y + h + 3, z], [x + 1.4, y + h + 2.6, z], [x + 1.4, y + h + 2.6, z], [x, y + h + 2.2, z], SAFFRON);
}

function canopy(b: Builder, x0: number, x1: number, z: number, d: number, h: number, col: C3, post: C3) {
  box(b, (x0 + x1) / 2, h, z, x1 - x0, 0.25, d, col);
  for (let x = x0 + 2; x <= x1 - 2; x += 6) segment(b, [x, 0, z], [x, h, z], 0.12, 0.12, post, 6);
}

export function landmarkModel(model: LandmarkModel, w: number, d: number, name: string, seed: number): LandmarkMesh {
  const b = new Builder(false, { color: 3 });
  const boards: Board[] = [];
  switch (model) {
    case 'museum': { // Watson Museum: Victorian, cream, central portico with columns and pediment, Queen Victoria statue
      const W = Math.min(w, 48), D = Math.min(d, 26), h = 11;
      box(b, 0, 0, 0, W, 1.2, D, STONE); // plinth
      box(b, 0, 1.2, 0, W, h, D, CREAM);
      box(b, 0, 1.2 + h, 0, W + 0.6, 0.6, D + 0.6, WHITE); // cornice
      arches(b, W, D / 2 + 0.05, 2, h / 2, 3.4, DARK, 1.2);
      box(b, 0, 1.2, D / 2 + 3, 14, 0.4, 6, STONE); // portico floor
      columns(b, -6, 6, D / 2 + 5.4, 6, 9, 0.38, WHITE, 1.6);
      box(b, 0, 10.6, D / 2 + 3, 15, 0.8, 6.4, WHITE); // entablature
      pediment(b, 0, 11.4, D / 2 + 6.2, 15, 3, WHITE);
      for (const s of [-1, 1]) dome(b, s * (W / 2 - 3), 1.8 + h, 0, 2.2, WHITE);
      for (let k = 0; k < 3; k++) box(b, 0, 0.3 * k, D / 2 + 6.5 + k * 0.6, 10, 0.3, 0.6, STONE); // steps
      // Statue of Queen Victoria on a plinth in front.
      box(b, 0, 0, D / 2 + 14, 2.2, 2.4, 2.2, STONE);
      segment(b, [0, 2.4, D / 2 + 14], [0, 4.2, D / 2 + 14], 0.55, 0.35, [0.2, 0.22, 0.2], 10);
      sphere(b, [0, 4.5, D / 2 + 14], 0.3, [0.2, 0.22, 0.2], 1, 8);
      boards.push({ x: 0, y: 10.9, z: D / 2 + 6.35, w: 8, h: 0.7, text: 'WATSON MUSEUM', sub: 'વોટસન મ્યુઝિયમ', bg: '#f4efe2', fg: '#3a2a1a' });
      break;
    }
    case 'colonial_school': { // Alfred High School / Mahatma Gandhi Museum: long two-storey arcade, central tower
      const W = Math.min(w, 70), D = Math.min(d, 18), h = 9;
      box(b, 0, 0, 0, W, 0.8, D, STONE);
      box(b, 0, 0.8, 0, W, h, D, WHITE);
      arches(b, W, D / 2 + 0.05, 2, h / 2, 3, [0.35, 0.3, 0.25], 0.8);
      box(b, 0, 0.8 + h, 0, W + 0.5, 0.5, D + 0.5, CREAM);
      box(b, 0, 0.8, D / 2 - 2, 12, h + 6, 6, WHITE); // central tower
      pediment(b, 0, 0.8 + h + 6, D / 2 + 1, 12.5, 2.6, CREAM);
      box(b, 0, 8, D / 2 + 1.01, 2.2, 2.2, 0.1, [0.95, 0.95, 0.9]); // clock face
      boards.push({ x: 0, y: 4.2, z: D / 2 + 1.1, w: 9, h: 0.8, text: 'MAHATMA GANDHI MUSEUM', sub: 'મહાત્મા ગાંધી મ્યુઝિયમ', bg: '#ffffff', fg: '#1e3a5f' });
      break;
    }
    case 'palace': { // Rajkumar College: Indo-Saracenic, central clock tower with domes, chhatris
      const W = Math.min(w, 80), D = Math.min(d, 24), h = 10;
      box(b, 0, 0, 0, W, h, D, CREAM);
      arches(b, W, D / 2 + 0.05, 2, h / 2, 3.6, [0.3, 0.24, 0.2]);
      box(b, 0, h, 0, W + 0.6, 0.7, D + 0.6, STONE);
      box(b, 0, 0, D / 2 - 3, 10, 24, 8, CREAM); // clock tower
      box(b, 0, 18, D / 2 + 1.01, 2.6, 2.6, 0.1, WHITE);
      dome(b, 0, 24, D / 2 - 3, 4, CREAM);
      for (const s of [-1, 1]) { chhatri(b, s * (W / 2 - 3), h + 0.7, 0, 1.5, CREAM); chhatri(b, s * 5, 24, D / 2 + 0.5, 0.9, CREAM); }
      boards.push({ x: 0, y: 3.2, z: D / 2 + 1.05, w: 8, h: 0.8, text: 'THE RAJKUMAR COLLEGE', sub: 'રાજકુમાર કોલેજ · 1868', bg: '#7a1f1f', fg: '#f4d58d' });
      break;
    }
    case 'palace_gate': { // Darbargadh: a fortified palace gateway with an arched entry and jharokhas
      const W = Math.min(w, 34);
      box(b, 0, 0, 0, W, 12, 10, STONE);
      box(b, 0, 0, 5.05, 6, 8, 0.2, WOOD); // great door
      segment(b, [-3, 8, 5.1], [3, 8, 5.1], 3, 3, STONE, 12, false);
      for (const s of [-1, 1]) {
        cylinder(b, s * (W / 2), 0, 3, 3.2, 15, STONE, 14); // bastions
        chhatri(b, s * (W / 2), 15, 3, 1.4, CREAM);
        box(b, s * 7, 7, 5.6, 3, 2.4, 1.2, WOOD); // jharokha
      }
      boards.push({ x: 0, y: 9.4, z: 5.2, w: 6, h: 0.9, text: 'DARBARGADH', sub: 'દરબારગઢ', bg: '#5b2c12', fg: '#ffd28a' });
      break;
    }
    case 'station': { // Rajkot Junction / Bhaktinagar: long station building + platform canopies + yellow nameboard
      const W = Math.min(w, 140), D = Math.min(Math.max(d, 10), 16);
      box(b, 0, 0, 0, W * 0.55, 8, D, [0.85, 0.55, 0.42]);
      box(b, 0, 8, 0, W * 0.55 + 0.6, 0.5, D + 0.6, CREAM);
      box(b, 0, 0, 0, 14, 12, D + 2, [0.88, 0.6, 0.45]); // entrance block
      arches(b, W * 0.55, D / 2 + 0.05, 1, 7, 4, [0.3, 0.22, 0.18]);
      canopy(b, -W / 2, W / 2, -D / 2 - 5, 8, 4.5, [0.5, 0.52, 0.54], [0.35, 0.36, 0.38]); // platform 1
      box(b, 0, 0, -D / 2 - 5, W, 0.9, 7, [0.6, 0.58, 0.55]); // platform
      canopy(b, -W * 0.4, W * 0.4, -D / 2 - 18, 7, 4.5, [0.5, 0.52, 0.54], [0.35, 0.36, 0.38]);
      box(b, 0, 0, -D / 2 - 18, W * 0.8, 0.9, 6, [0.6, 0.58, 0.55]);
      const nm = name.toLowerCase().includes('bhakti') ? ['BHAKTINAGAR', 'ભક્તિનગર'] : ['RAJKOT JN.', 'રાજકોટ જં.'];
      for (const s of [-1, 1]) {
        segment(b, [s * (W / 2 - 6) - 1.5, 0, -D / 2 - 2], [s * (W / 2 - 6) - 1.5, 3, -D / 2 - 2], 0.06, 0.06, DARK, 4);
        segment(b, [s * (W / 2 - 6) + 1.5, 0, -D / 2 - 2], [s * (W / 2 - 6) + 1.5, 3, -D / 2 - 2], 0.06, 0.06, DARK, 4);
        boards.push({ x: s * (W / 2 - 6), y: 3.6, z: -D / 2 - 1.98, w: 4, h: 1.3, text: nm[0], sub: nm[1], bg: '#f2c81c', fg: '#111111' });
      }
      boards.push({ x: 0, y: 10, z: D / 2 + 1.06, w: 9, h: 1.1, text: nm[0], sub: nm[1], bg: '#f2c81c', fg: '#111111' });
      break;
    }
    case 'haveli': { // Kaba Gandhi no Delo: courtyard house behind a big wooden gate (delo)
      const W = Math.min(w, 22), D = Math.min(d, 16);
      box(b, 0, 0, 0, W, 7.5, D, [0.88, 0.8, 0.66]);
      box(b, 0, 7.5, 0, W + 0.4, 0.4, D + 0.4, STONE);
      box(b, 0, 0, D / 2 + 0.6, 4.2, 5.2, 1.2, STONE); // gate frame
      box(b, 0, 0, D / 2 + 1.25, 3.2, 4.2, 0.15, WOOD); // the delo door
      for (const s of [-1, 1]) box(b, s * 6, 4.2, D / 2 + 0.6, 3.4, 2.2, 1.4, WOOD); // carved balconies
      box(b, 0, 5.5, D / 2 + 1.3, 3.6, 0.8, 0.1, [0.95, 0.92, 0.85]);
      boards.push({ x: 0, y: 5.9, z: D / 2 + 1.36, w: 3.4, h: 0.7, text: 'KABA GANDHI NO DELO', sub: 'કબા ગાંધીનો ડેલો', bg: '#f6efdf', fg: '#3a2412' });
      break;
    }
    case 'dolls': { // Rotary Dolls Museum: cheerful painted building with doll motifs
      const W = Math.min(w, 26), D = Math.min(d, 14);
      box(b, 0, 0, 0, W, 8, D, [0.97, 0.86, 0.55]);
      for (let k = 0; k < 6; k++) {
        const x = -W / 2 + 2 + k * ((W - 4) / 5);
        sphere(b, [x, 5.6, D / 2 + 0.3], 0.7, [[0.9, 0.3, 0.3], [0.3, 0.6, 0.9], [0.4, 0.75, 0.35]][k % 3], 1, 10);
        segment(b, [x, 3.4, D / 2 + 0.3], [x, 5, D / 2 + 0.3], 0.6, 0.35, [[0.95, 0.5, 0.2], [0.8, 0.3, 0.6], [0.3, 0.5, 0.85]][k % 3], 8);
      }
      box(b, 0, 0, D / 2 + 0.05, 3, 3, 0.1, GLASS);
      boards.push({ x: 0, y: 7, z: D / 2 + 0.12, w: 8, h: 0.9, text: 'ROTARY DOLLS MUSEUM', sub: 'રોટરી ડોલ્સ મ્યુઝિયમ', bg: '#c2185b', fg: '#ffffff' });
      break;
    }
    case 'temple': { // BAPS / Trimandir: pink-stone mandir on a plinth, a tall central shikhara and smaller ones
      const S = Math.min(Math.max(w, d), 50) / 40;
      box(b, 0, 0, 0, 34 * S, 2.4, 28 * S, PINK); // jagati (plinth)
      for (let k = 0; k < 6; k++) box(b, 0, 2.4 * k / 6, 14 * S + 1 + k * 0.5, 8, 0.4, 0.5, PINK); // steps
      box(b, 0, 2.4, 0, 24 * S, 8 * S, 18 * S, PINK);
      columns(b, -10 * S, 10 * S, 9 * S + 0.5, 7, 7 * S, 0.45, PINK, 2.4);
      shikhara(b, 0, 2.4 + 8 * S, 0, 6 * S, 16 * S, PINK);
      for (const [x, z] of [[-8, -5], [8, -5], [-8, 5], [8, 5]]) shikhara(b, x * S, 2.4 + 8 * S, z * S, 3 * S, 8 * S, PINK);
      boards.push({ x: 0, y: 1.2, z: 14 * S + 0.02, w: 10, h: 0.9, text: name.includes('Trimandir') ? 'TRIMANDIR' : 'SHRI SWAMINARAYAN MANDIR',
        sub: name.includes('Trimandir') ? 'ત્રિમંદિર' : 'શ્રી સ્વામિનારાયણ મંદિર', bg: '#7a2e1c', fg: '#ffe4b5' });
      break;
    }
    case 'campus': { // Darshan University: modern glass-and-white block with a canopy entrance
      const W = Math.min(w, 80), D = Math.min(d, 24);
      box(b, 0, 0, 0, W, 16, D, WHITE);
      for (let f = 0; f < 4; f++) box(b, 0, 1.5 + f * 3.8, D / 2 + 0.05, W - 4, 2.2, 0.1, GLASS);
      box(b, 0, 0, D / 2 + 4, 16, 0.3, 8, [0.6, 0.6, 0.6]);
      box(b, 0, 4.5, D / 2 + 4, 16, 0.4, 8, [0.25, 0.3, 0.45]); // entrance canopy
      for (const s of [-1, 1]) segment(b, [s * 7, 0, D / 2 + 7.5], [s * 7, 4.5, D / 2 + 7.5], 0.2, 0.2, [0.7, 0.7, 0.7], 8);
      boards.push({ x: 0, y: 13.2, z: D / 2 + 0.12, w: 16, h: 1.6, text: 'DARSHAN UNIVERSITY', sub: 'દર્શન યુનિવર્સિટી', bg: '#1d3557', fg: '#ffffff' });
      break;
    }
    case 'pavilion': { // Madhavrao Scindia ground: pavilion with a sloping roof and stepped stands
      const W = Math.min(w, 50);
      box(b, 0, 0, 0, W, 6, 8, CREAM);
      for (let k = 0; k < 5; k++) box(b, 0, k * 0.8, 6 + k * 1.2, W, 0.8, 1.2, [0.7, 0.7, 0.72]); // stands
      quad(b, [-W / 2, 8, 12], [W / 2, 8, 12], [W / 2, 10, 2], [-W / 2, 10, 2], [0.8, 0.82, 0.85]);
      for (let x = -W / 2 + 3; x <= W / 2 - 3; x += 8) segment(b, [x, 0, 11.5], [x, 8, 11.5], 0.12, 0.12, DARK, 6);
      boards.push({ x: 0, y: 4.6, z: 4.02, w: 10, h: 0.9, text: 'MADHAVRAO SCINDIA CRICKET GROUND', bg: '#14532d', fg: '#ffffff' });
      break;
    }
    case 'terminal': { // Old Rajkot airport: low terminal with a control tower
      const W = Math.min(w, 80), D = Math.min(d, 24);
      box(b, 0, 0, 0, W, 6, D, WHITE);
      box(b, 0, 2, D / 2 + 0.05, W - 6, 3, 0.1, GLASS);
      box(b, W / 2 - 6, 0, -D / 2 + 4, 5, 18, 5, WHITE);
      box(b, W / 2 - 6, 18, -D / 2 + 4, 7, 3, 7, GLASS);
      box(b, W / 2 - 6, 21, -D / 2 + 4, 7.6, 0.5, 7.6, [0.3, 0.3, 0.32]);
      boards.push({ x: 0, y: 6.8, z: D / 2 + 0.06, w: 12, h: 1.2, text: 'RAJKOT AIRPORT', sub: 'રાજકોટ એરપોર્ટ', bg: '#ffffff', fg: '#0b3d91' });
      break;
    }
    case 'gate': { // Park / campus entrance arch with a name board
      const W = Math.max(w, 10);
      for (const s of [-1, 1]) {
        box(b, s * (W / 2), 0, 0, 1.4, 6.5, 1.4, s > 0 ? CREAM : CREAM);
        sphere(b, [s * (W / 2), 7.1, 0], 0.7, RED, 1, 10);
        box(b, s * (W / 2 + 2.2), 0, 0, 3, 1.3, 0.4, STONE); // side walls
      }
      box(b, 0, 5.4, 0, W + 1.6, 1.3, 1.1, CREAM);
      segment(b, [-W / 2, 6.2, 0], [W / 2, 6.2, 0], 0.15, 0.15, ROOF, 6);
      for (const s of [-1, 1]) for (let k = 0; k < 4; k++) sphere(b, [s * (W / 2 + 1 + k * 1.1), 0.6, 1.2], 0.5, GREEN, 0.8, 8); // hedges
      boards.push({ x: 0, y: 6.05, z: 0.57, w: W, h: 1.1, text: name.replace(/\s*\(.*\)/, '').toUpperCase(), bg: '#14532d', fg: '#fef3c7' });
      break;
    }
    case 'ferris': { // Atal Sarovar: a giant wheel by the lake, its face towards the road
      const R = 14, y0 = R + 3;
      for (const s of [-1, 1]) {
        segment(b, [-5, 0, s * 2], [0, y0, s * 2], 0.35, 0.3, WHITE, 8);
        segment(b, [5, 0, s * 2], [0, y0, s * 2], 0.35, 0.3, WHITE, 8);
      }
      const n = 24;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2, a1 = ((k + 1) / n) * Math.PI * 2;
        const p0: V3 = [Math.sin(a0) * R, y0 + Math.cos(a0) * R, 0], p1: V3 = [Math.sin(a1) * R, y0 + Math.cos(a1) * R, 0];
        for (const s of [-1.6, 1.6]) segment(b, [p0[0], p0[1], s], [p1[0], p1[1], s], 0.15, 0.15, WHITE, 6, false);
        if (k % 3 === 0) {
          segment(b, [0, y0, 0], p0, 0.08, 0.08, WHITE, 4, false);
          box(b, p0[0], p0[1] - 2.2, 0, 1.6, 1.8, 2.2, [[0.9, 0.2, 0.2], [0.2, 0.5, 0.9], [0.95, 0.75, 0.1]][(k / 3) % 3]);
        }
      }
      segment(b, [0, y0, -2.4], [0, y0, 2.4], 0.9, 0.9, DARK, 10); // hub
      boards.push({ x: 0, y: 2.2, z: 3, w: 7, h: 1, text: 'ATAL SAROVAR', sub: 'અટલ સરોવર', bg: '#0e7490', fg: '#ffffff' });
      break;
    }
  }
  void seed;
  const out = b.build();
  const c = out.attrs.color[0];
  for (let k = 0; k < c.length; k++) c[k] = Math.pow(c[k], 2.2);
  return { geo: out, boards };
}

/** Solid parts for physics, as [cx, cy, cz, hx, hy, hz] boxes in the model frame (main bodies only). */
export function landmarkColliders(model: LandmarkModel, w: number, d: number): number[][] {
  const B = (W: number, H: number, D: number, cx = 0, cz = 0) => [cx, H / 2, cz, W / 2, H / 2, D / 2];
  switch (model) {
    case 'museum': return [B(Math.min(w, 48), 12.8, Math.min(d, 26)), B(1.2, 2.4, 1.2, 0, Math.min(d, 26) / 2 + 14)];
    case 'colonial_school': return [B(Math.min(w, 70), 10, Math.min(d, 18))];
    case 'palace': return [B(Math.min(w, 80), 11, Math.min(d, 24))];
    case 'palace_gate': return [B(Math.min(w, 34) / 2 - 3, 12, 10, -(Math.min(w, 34) / 4 + 1.5)), B(Math.min(w, 34) / 2 - 3, 12, 10, Math.min(w, 34) / 4 + 1.5)];
    case 'station': return [B(Math.min(w, 140) * 0.55, 8, Math.min(Math.max(d, 10), 16))];
    case 'haveli': return [B(Math.min(w, 22), 7.5, Math.min(d, 16))];
    case 'dolls': return [B(Math.min(w, 26), 8, Math.min(d, 14))];
    case 'temple': { const S = Math.min(Math.max(w, d), 50) / 40; return [B(24 * S, 10 * S, 18 * S), B(34 * S, 2.4, 28 * S)]; }
    case 'campus': return [B(Math.min(w, 80), 16, Math.min(d, 24))];
    case 'pavilion': return [B(Math.min(w, 50), 6, 8)];
    case 'terminal': return [B(Math.min(w, 80), 6, Math.min(d, 24))];
    case 'gate': { const W = Math.max(w, 10); return [B(1.4, 6.5, 1.4, -W / 2), B(1.4, 6.5, 1.4, W / 2)]; }
    case 'ferris': return [B(11, 17, 1, 0, -2), B(11, 17, 1, 0, 2)];
  }
}
