import { Builder, type GeoBuf } from './geobuf';
import { box, segment, sphere } from './prims';

/**
 * Low-poly models for traffic, pedestrians and cows (PROMPT §3.3, §9.4–9.5). Unbranded.
 * Local frame: +z forward (nose), +y up, ground at y = 0. Colours are sRGB, converted at the end.
 */
export const MODELS = [
  'scooter', 'motorcycle', 'auto', 'chhakdo', 'car-white', 'car-red', 'car-silver', 'car-blue', 'bus',
  'ped-kurta', 'ped-shirt', 'ped-saree', 'ped-salwar', 'cow-stand', 'cow-sit',
  'bicycle', 'suv-white', 'suv-black', 'tractor', 'dog-lie', 'dog-walk',
] as const;
export type ModelName = (typeof MODELS)[number];

const BLACK = [0.08, 0.08, 0.08];
const TYRE = [0.06, 0.06, 0.06];
const GLASS = [0.2, 0.28, 0.32];
const SKIN = [0.55, 0.37, 0.24];
const HAIR = [0.08, 0.06, 0.05];

/** Options for the player's own vehicles: no rider (the player sits there) and wheels as separate meshes. */
export interface ModelOptions { rider?: boolean; wheels?: boolean }
let opts: Required<ModelOptions> = { rider: true, wheels: true };

function wheel(b: Builder, x: number, z: number, r: number, w: number) {
  if (!opts.wheels) return;
  segment(b, [x - w / 2, r, z], [x + w / 2, r, z], r, r, TYRE, 10);
}

/** Seated rider (two-wheelers, auto driver). */
function rider(b: Builder, z: number, seatY: number, shirt: number[]) {
  if (!opts.rider) return;
  segment(b, [0, seatY, z], [0, seatY + 0.62, z + 0.05], 0.17, 0.19, shirt, 8);
  sphere(b, [0, seatY + 0.78, z + 0.06], 0.11, SKIN, 1.1, 8);
  sphere(b, [0, seatY + 0.84, z + 0.04], 0.115, HAIR, 0.6, 8);
  for (const s of [-1, 1]) {
    segment(b, [s * 0.12, seatY + 0.05, z + 0.05], [s * 0.15, seatY + 0.05, z + 0.45], 0.07, 0.065, [0.2, 0.2, 0.25], 6);
    segment(b, [s * 0.15, seatY + 0.05, z + 0.45], [s * 0.15, 0.25, z + 0.55], 0.06, 0.05, [0.2, 0.2, 0.25], 6);
    segment(b, [s * 0.2, seatY + 0.55, z + 0.05], [s * 0.28, seatY + 0.42, z + 0.5], 0.05, 0.045, shirt, 6);
  }
}

function person(b: Builder, top: number[], bottom: number[], dress: 'pants' | 'saree' | 'salwar') {
  for (const s of [-1, 1]) segment(b, [s * 0.09, 0.85, 0], [s * 0.1, 0.05, 0], 0.07, 0.055, bottom, 6);
  if (dress !== 'pants') segment(b, [0, 1.0, 0], [0, 0.05, 0], 0.17, dress === 'saree' ? 0.3 : 0.22, bottom, 8);
  segment(b, [0, 0.9, 0], [0, 1.43, 0], 0.15, 0.18, top, 8);
  if (dress === 'saree') segment(b, [0.16, 1.4, 0.02], [-0.18, 0.95, 0.06], 0.06, 0.06, bottom, 6); // pallu
  sphere(b, [0, 1.6, 0.01], 0.11, SKIN, 1.1, 8);
  sphere(b, [0, 1.65, -0.01], 0.115, HAIR, 0.65, 8);
  for (const s of [-1, 1]) segment(b, [s * 0.2, 1.4, 0], [s * 0.23, 0.95, 0.02], 0.05, 0.04, top, 6);
}

/** Indian street dog (desi): tan or brown-and-white, lying in the shade or trotting. */
function dog(b: Builder, lying: boolean, coat: number[]) {
  const W = [0.92, 0.88, 0.8];
  const y = lying ? 0.18 : 0.42;
  segment(b, [0, y, -0.32], [0, y + 0.02, 0.3], 0.13, 0.12, coat, 8); // body
  segment(b, [0, y + 0.08, 0.32], [0, y + (lying ? 0.12 : 0.26), 0.48], 0.07, 0.06, coat, 6); // neck
  sphere(b, [0, y + (lying ? 0.14 : 0.3), 0.52], 0.09, coat, 1, 8); // head
  segment(b, [0, y + (lying ? 0.12 : 0.28), 0.58], [0, y + (lying ? 0.1 : 0.26), 0.7], 0.045, 0.03, W, 6); // muzzle
  for (const s of [-1, 1]) segment(b, [s * 0.05, y + (lying ? 0.2 : 0.36), 0.5], [s * 0.07, y + (lying ? 0.3 : 0.46), 0.48], 0.03, 0.01, coat, 4); // ears
  segment(b, [0, y + 0.04, -0.34], [0, y + (lying ? 0.06 : 0.25), -0.56], 0.03, 0.015, coat, 4); // tail
  if (lying) {
    for (const s of [-1, 1]) segment(b, [s * 0.08, 0.06, 0.32], [s * 0.08, 0.05, 0.55], 0.03, 0.025, coat, 4);
  } else {
    for (const [x, z] of [[-0.07, 0.24], [0.07, 0.24], [-0.07, -0.26], [0.07, -0.26]]) segment(b, [x, y - 0.06, z], [x, 0.01, z], 0.035, 0.028, coat, 5);
  }
}

function cow(b: Builder, sitting: boolean) {
  const W = [0.88, 0.86, 0.8], G = [0.62, 0.6, 0.56];
  const y = sitting ? 0.45 : 0.95;
  segment(b, [0, y, -0.75], [0, y + 0.05, 0.7], 0.34, 0.32, W, 10); // body
  sphere(b, [0, y + 0.35, 0.45], 0.2, W, 1, 8); // hump (zebu)
  segment(b, [0, y + 0.15, 0.8], [0, y + 0.1, 1.25], 0.13, 0.11, W, 8); // neck/head
  segment(b, [0, y + 0.05, 1.2], [0, y - 0.05, 1.45], 0.11, 0.08, G, 8); // muzzle
  for (const s of [-1, 1]) segment(b, [s * 0.08, y + 0.28, 1.15], [s * 0.2, y + 0.5, 1.05], 0.03, 0.01, [0.3, 0.25, 0.2], 4); // horns
  segment(b, [0, y + 0.05, -0.8], [0, y - 0.5, -0.95], 0.03, 0.02, W, 4); // tail
  if (sitting) {
    for (const [x, z] of [[-0.3, 0.6], [0.3, 0.6], [-0.3, -0.5], [0.3, -0.5]]) segment(b, [x, 0.12, z], [x, 0.12, z + 0.35], 0.09, 0.08, G, 6);
  } else {
    for (const [x, z] of [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.55], [0.2, -0.55]]) segment(b, [x, y - 0.2, z], [x, 0.02, z], 0.07, 0.055, G, 6);
  }
}

function car(b: Builder, body: number[]) {
  box(b, 0, 0.3, 0, 1.62, 0.62, 3.75, body);
  box(b, 0, 0.92, -0.25, 1.48, 0.55, 2.0, GLASS);
  box(b, 0, 1.45, -0.25, 1.46, 0.06, 1.9, body);
  for (const s of [-1, 1]) for (const z of [1.25, -1.25]) wheel(b, s * 0.72, z, 0.3, 0.2);
  box(b, 0, 0.55, 1.88, 1.4, 0.15, 0.04, [0.95, 0.95, 0.85]); // headlights
}

function suv(b: Builder, body: number[]) {
  box(b, 0, 0.42, 0, 1.8, 0.75, 4.4, body);
  box(b, 0, 1.17, -0.15, 1.72, 0.62, 3.0, GLASS);
  box(b, 0, 1.79, -0.15, 1.74, 0.07, 3.0, body);
  for (const s of [-1, 1]) box(b, s * 0.6, 1.86, -0.15, 0.05, 0.05, 2.6, BLACK); // roof rails
  box(b, 0, 0.3, 2.21, 1.8, 0.3, 0.06, BLACK); // bumper
  box(b, 0, 0.75, 2.2, 1.5, 0.15, 0.04, [0.95, 0.95, 0.85]);
  box(b, 0, 0.8, -2.26, 0.8, 0.6, 0.12, BLACK); // spare wheel
  for (const s of [-1, 1]) for (const z of [1.45, -1.45]) wheel(b, s * 0.8, z, 0.38, 0.26);
}

export function vehicleModel(name: ModelName, options: ModelOptions = {}): GeoBuf {
  opts = { rider: true, wheels: true, ...options };
  const b = new Builder(false, { color: 3 });
  switch (name) {
    case 'scooter': {
      const c = [0.7, 0.1, 0.12];
      box(b, 0, 0.25, 0.05, 0.3, 0.08, 0.6, BLACK);
      box(b, 0, 0.32, -0.42, 0.34, 0.4, 0.6, c);
      box(b, 0, 0.3, 0.42, 0.32, 0.65, 0.14, c);
      wheel(b, 0, 0.6, 0.22, 0.1); wheel(b, 0, -0.58, 0.22, 0.1);
      rider(b, -0.35, 0.72, [0.2, 0.4, 0.75]);
      break;
    }
    case 'motorcycle': {
      box(b, 0, 0.45, 0, 0.3, 0.3, 1.2, [0.1, 0.1, 0.12]);
      box(b, 0, 0.7, 0.25, 0.32, 0.22, 0.5, [0.65, 0.05, 0.05]);
      wheel(b, 0, 0.7, 0.3, 0.1); wheel(b, 0, -0.65, 0.3, 0.1);
      rider(b, -0.25, 0.8, [0.9, 0.9, 0.88]);
      break;
    }
    case 'auto': {
      const G = [0.18, 0.55, 0.22], Y = [0.98, 0.82, 0.1];
      box(b, 0, 0.3, -0.35, 1.3, 0.75, 1.5, G);
      box(b, 0, 0.3, 0.75, 0.75, 0.6, 0.7, G);
      box(b, 0, 1.05, -0.05, 1.32, 0.75, 2.1, BLACK); // canvas hood (open sides suggested by darker colour)
      box(b, 0, 1.75, -0.05, 1.36, 0.08, 2.2, Y);
      box(b, 0, 0.9, 1.05, 1.0, 0.6, 0.05, GLASS);
      wheel(b, 0, 1.0, 0.22, 0.14);
      for (const s of [-1, 1]) wheel(b, s * 0.62, -0.75, 0.22, 0.14);
      break;
    }
    case 'chhakdo': {
      // Motorcycle front with a wooden cargo/passenger bed: Saurashtra's own three-wheeler.
      box(b, 0, 0.5, 1.0, 0.3, 0.3, 1.0, [0.1, 0.1, 0.12]);
      wheel(b, 0, 1.55, 0.3, 0.1);
      box(b, 0, 0.55, -0.6, 1.5, 0.12, 2.0, [0.45, 0.3, 0.16]);
      for (const s of [-1, 1]) box(b, s * 0.72, 0.67, -0.6, 0.06, 0.35, 2.0, [0.55, 0.38, 0.2]);
      box(b, 0, 0.67, -1.58, 1.5, 0.35, 0.06, [0.55, 0.38, 0.2]);
      for (const s of [-1, 1]) wheel(b, s * 0.82, -0.9, 0.3, 0.15);
      rider(b, 0.8, 0.85, [0.85, 0.82, 0.75]);
      break;
    }
    case 'car-white': car(b, [0.92, 0.92, 0.9]); break;
    case 'car-red': car(b, [0.7, 0.08, 0.08]); break;
    case 'car-silver': car(b, [0.66, 0.67, 0.68]); break;
    case 'car-blue': car(b, [0.12, 0.25, 0.5]); break;
    case 'bus': {
      const R = [0.78, 0.18, 0.12], W = [0.92, 0.9, 0.85];
      box(b, 0, 0.45, 0, 2.5, 1.0, 10.5, R);
      box(b, 0, 1.45, 0, 2.5, 0.9, 10.5, GLASS);
      box(b, 0, 2.35, 0, 2.5, 0.55, 10.5, W);
      for (const s of [-1, 1]) for (const z of [3.6, -3.4]) wheel(b, s * 1.1, z, 0.48, 0.3);
      break;
    }
    case 'bicycle': {
      const F = [0.12, 0.12, 0.14];
      wheel(b, 0, 0.55, 0.33, 0.04); wheel(b, 0, -0.5, 0.33, 0.04);
      segment(b, [0, 0.33, -0.5], [0, 0.85, -0.15], 0.02, 0.02, F, 5); // seat tube
      segment(b, [0, 0.85, -0.15], [0, 0.9, 0.45], 0.02, 0.02, F, 5); // top tube
      segment(b, [0, 0.33, -0.1], [0, 0.9, 0.45], 0.02, 0.02, F, 5); // down tube
      segment(b, [0, 0.33, -0.5], [0, 0.33, -0.1], 0.015, 0.015, F, 5);
      segment(b, [0, 0.33, 0.55], [0, 1.05, 0.42], 0.02, 0.02, F, 5); // fork
      box(b, 0, 1.03, 0.42, 0.55, 0.03, 0.03, F); // handlebar
      box(b, 0, 0.9, -0.18, 0.14, 0.05, 0.25, BLACK); // saddle
      box(b, 0, 0.62, -0.45, 0.3, 0.03, 0.35, F); // carrier
      rider(b, -0.2, 0.92, [0.95, 0.95, 0.95]);
      break;
    }
    case 'suv-white': suv(b, [0.93, 0.93, 0.92]); break;
    case 'suv-black': suv(b, [0.1, 0.1, 0.11]); break;
    case 'tractor': {
      const R = [0.75, 0.12, 0.1];
      box(b, 0, 0.55, 0.6, 0.7, 0.6, 1.9, R); // bonnet
      box(b, 0, 1.15, 0.85, 0.6, 0.12, 1.3, R);
      segment(b, [0.2, 1.2, 1.2], [0.2, 2.0, 1.2], 0.05, 0.04, BLACK, 6); // exhaust
      box(b, 0, 0.6, -0.65, 1.0, 0.5, 0.9, [0.3, 0.3, 0.32]); // body
      box(b, 0, 1.2, -0.75, 0.45, 0.12, 0.4, BLACK); // seat
      box(b, 0, 1.45, -0.45, 0.06, 0.4, 0.06, BLACK); // steering
      for (const s of [-1, 1]) box(b, s * 0.82, 1.35, -0.75, 0.42, 0.06, 0.9, R); // mudguards
      for (const s of [-1, 1]) wheel(b, s * 0.82, -0.75, 0.72, 0.4);
      for (const s of [-1, 1]) wheel(b, s * 0.55, 1.2, 0.4, 0.2);
      rider(b, -0.75, 1.25, [0.9, 0.9, 0.85]);
      break;
    }
    case 'ped-kurta': person(b, [0.85, 0.75, 0.45], [0.92, 0.9, 0.85], 'pants'); break;
    case 'ped-shirt': person(b, [0.3, 0.45, 0.7], [0.2, 0.2, 0.25], 'pants'); break;
    case 'ped-saree': person(b, [0.75, 0.15, 0.35], [0.85, 0.3, 0.45], 'saree'); break;
    case 'ped-salwar': person(b, [0.95, 0.65, 0.15], [0.3, 0.55, 0.45], 'salwar'); break;
    case 'cow-stand': cow(b, false); break;
    case 'cow-sit': cow(b, true); break;
    case 'dog-lie': dog(b, true, [0.72, 0.52, 0.3]); break;
    case 'dog-walk': dog(b, false, [0.55, 0.36, 0.2]); break;
  }
  const out = b.build();
  const c = out.attrs.color[0];
  for (let k = 0; k < c.length; k++) c[k] = Math.pow(c[k], 2.2);
  return out;
}

