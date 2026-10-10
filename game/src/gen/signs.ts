import { rng } from '../core/rng';
import type { Tile } from '../world/rtile';
import { Builder, type GeoBuf } from './geobuf';

/**
 * Shop signboards (PROMPT §7.10, §7.12): one board per shop front edge, at the signboard band of the
 * facade shader, with an invented bilingual name. Text is drawn into a per-tile atlas on the main thread.
 */

/** Name parts as [English, Gujarati]. */
const PREFIX: [string, string][] = [
  ['Shree', 'શ્રી'], ['Jay', 'જય'], ['New', 'ન્યૂ'], ['Om', 'ૐ'], ['Raj', 'રાજ'], ['', ''], ['', ''],
];
const NAME: [string, string][] = [
  ['Ambika', 'અંબિકા'], ['Krishna', 'કૃષ્ણ'], ['Balaji', 'બાલાજી'], ['Khodiyar', 'ખોડિયાર'], ['Jalaram', 'જલારામ'],
  ['Mahavir', 'મહાવીર'], ['Sai', 'સાઈ'], ['Umiya', 'ઉમિયા'], ['Ganesh', 'ગણેશ'], ['Gayatri', 'ગાયત્રી'],
  ['Bhagwati', 'ભગવતી'], ['Rajkot', 'રાજકોટ'], ['Saurashtra', 'સૌરાષ્ટ્ર'], ['Laxmi', 'લક્ષ્મી'], ['Shakti', 'શક્તિ'],
  ['Momai', 'મોમાઈ'], ['Chamunda', 'ચામુંડા'], ['Ashapura', 'આશાપુરા'], ['Patel', 'પટેલ'], ['Bhavani', 'ભવાની'],
];
/** Shop types, weighted towards what Rajkot streets are full of. */
const TRADE: [string, string, number][] = [
  ['Kirana Store', 'કિરાણા સ્ટોર', 4], ['Jewellers', 'જ્વેલર્સ', 3], ['Medical Store', 'મેડિકલ સ્ટોર', 3],
  ['Mobile', 'મોબાઈલ', 3], ['Garments', 'ગાર્મેન્ટ્સ', 3], ['Farsan', 'ફરસાણ', 3], ['Sweets', 'સ્વીટ્સ', 2],
  ['Hardware', 'હાર્ડવેર', 2], ['Electricals', 'ઇલેક્ટ્રિકલ્સ', 2], ['Footwear', 'ફૂટવેર', 2], ['Tea Stall', 'ટી સ્ટોલ', 2],
  ['Pan House', 'પાન હાઉસ', 2], ['Dairy', 'ડેરી', 2], ['Auto Parts', 'ઓટો પાર્ટ્સ', 1], ['Provision', 'પ્રોવિઝન', 2],
  ['Cloth Centre', 'ક્લોથ સેન્ટર', 2], ['Steel', 'સ્ટીલ', 1], ['Photo Studio', 'ફોટો સ્ટુડિયો', 1],
];
const TRADE_TOTAL = TRADE.reduce((s, t) => s + t[2], 0);
/** Board backgrounds and text colours (sRGB hex). */
const SCHEMES: [string, string][] = [
  ['#c8102e', '#ffffff'], ['#ffd400', '#b00020'], ['#0b3d91', '#ffffff'], ['#0a7a33', '#ffffff'],
  ['#ffffff', '#c8102e'], ['#ff6f00', '#ffffff'], ['#1b1b1b', '#ffd400'], ['#6a1b9a', '#ffffff'],
];

export interface SignSpec {
  en: string;
  gu: string;
  bg: string;
  fg: string;
}

export interface SignMeshes {
  /** Boards; `uv` points into a grid atlas of ATLAS_COLS × ATLAS_ROWS cells (cell k = specs[k]). */
  mesh: GeoBuf;
  specs: SignSpec[];
}

export const ATLAS_COLS = 4;
export const ATLAS_ROWS = 16;
export const MAX_SIGNS = ATLAS_COLS * ATLAS_ROWS;

export function shopName(seed: number): SignSpec {
  const r = rng(seed ^ 0x51a7);
  const pre = PREFIX[Math.floor(r() * PREFIX.length)];
  const name = NAME[Math.floor(r() * NAME.length)];
  let pick = r() * TRADE_TOTAL;
  let trade = TRADE[0];
  for (const t of TRADE) {
    pick -= t[2];
    if (pick <= 0) { trade = t; break; }
  }
  const [bg, fg] = SCHEMES[Math.floor(r() * SCHEMES.length)];
  const join = (a: string, b: string, c: string) => [a, b, c].filter(Boolean).join(' ');
  return { en: join(pre[0], name[0], trade[0]), gu: join(pre[1], name[1], trade[1]), bg, fg };
}

export function signMeshes(tile: Tile): SignMeshes {
  const b = new Builder(true);
  const specs: SignSpec[] = [];
  for (const bl of tile.buildings) {
    if (!bl.shop || specs.length >= MAX_SIGNS) continue;
    const o = bl.outline, m = o.length / 2;
    // Same draws as gen/buildings.ts (parapet, then ground-floor height), so the board sits on the sign band.
    const r = rng(bl.seed);
    r();
    const ground = 3.6 + r() * 0.6;
    for (let k = 0; k < m && specs.length < MAX_SIGNS; k++) {
      if (bl.edgeKinds[k] !== 1) continue; // front edges only
      const j = (k + 1) % m;
      const x0 = o[2 * k], n0 = o[2 * k + 1], x1 = o[2 * j], n1 = o[2 * j + 1];
      const len = Math.hypot(x1 - x0, n1 - n0);
      if (len < 3) continue;
      const nx = (n1 - n0) / len, nn = -(x1 - x0) / len; // outward in (x, n)
      const inset = Math.min(0.3, len * 0.05), out = 0.06;
      const ax = x0 + ((x1 - x0) / len) * inset + nx * out, an = n0 + ((n1 - n0) / len) * inset + nn * out;
      const bx = x1 - ((x1 - x0) / len) * inset + nx * out, bn = n1 - ((n1 - n0) / len) * inset + nn * out;
      const y0 = bl.baseY + ground - 0.95, y1 = bl.baseY + ground - 0.1;
      const cell = specs.length;
      const cu = (cell % ATLAS_COLS) / ATLAS_COLS, cv = 1 - Math.floor(cell / ATLAS_COLS) / ATLAS_ROWS;
      const du = 1 / ATLAS_COLS, dv = 1 / ATLAS_ROWS;
      const nzz = -nn; // three.js z = −north
      const v0 = b.vertex(ax, y0, -an, nx, 0, nzz, cu, cv - dv);
      const v1 = b.vertex(bx, y0, -bn, nx, 0, nzz, cu + du, cv - dv);
      const v2 = b.vertex(bx, y1, -bn, nx, 0, nzz, cu + du, cv);
      const v3 = b.vertex(ax, y1, -an, nx, 0, nzz, cu, cv);
      b.quad(v0, v1, v2, v3);
      specs.push(shopName(bl.seed + k * 7919));
    }
  }
  return { mesh: b.build(), specs };
}
