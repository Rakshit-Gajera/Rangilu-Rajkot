import { Builder, type GeoBuf } from './geobuf';
import { box, quad, segment as segment0, sphere as sphere0, type V3 } from './prims';

/**
 * Models for traffic, pedestrians and animals (PROMPT §3.3, §9.4–9.5). Unbranded.
 * Local frame: +z forward (nose), +y up, ground at y = 0. Colours are sRGB, converted at the end, then
 * shaded by facing (undersides darker) so the flat colours read as solid forms.
 * People carry a `swing` attribute ([amplitude sign, pivot height]) so the instanced shader can swing
 * their arms and legs as they walk (actors/life.ts).
 */
export const MODELS = [
  'scooter', 'motorcycle', 'auto', 'chhakdo', 'car-white', 'car-red', 'car-silver', 'car-blue', 'bus',
  'ped-kurta', 'ped-shirt', 'ped-saree', 'ped-salwar', 'cow-stand', 'cow-sit',
  'bicycle', 'suv-white', 'suv-black', 'tractor', 'dog-lie', 'dog-walk', 'ped-elder', 'ped-student', 'cow-gir',
] as const;
export type ModelName = (typeof MODELS)[number];

type C = number[];
const BLACK: C = [0.07, 0.07, 0.08];
const TYRE: C = [0.05, 0.05, 0.05];
const RIM: C = [0.62, 0.63, 0.65];
const CHROME: C = [0.78, 0.79, 0.8];
const GLASS: C = [0.12, 0.17, 0.2];
const LAMP: C = [0.98, 0.96, 0.85];
const TAIL: C = [0.75, 0.05, 0.05];
const PLATE: C = [0.95, 0.95, 0.92];
const HAIR: C = [0.06, 0.05, 0.04];
const SKINS: C[] = [[0.62, 0.43, 0.3], [0.52, 0.35, 0.24], [0.44, 0.29, 0.19]];

/** Options for the player's own vehicles: no rider (the player sits there) and wheels as separate meshes. */
export interface ModelOptions { rider?: boolean; wheels?: boolean; lo?: boolean }
let opts: Required<ModelOptions> = { rider: true, wheels: true, lo: false };

// Far level of detail: round parts get about half the sides.
const segment = (b: Builder, p0: V3, p1: V3, r0: number, r1: number, col: C, n = 8, caps = true, extra?: Record<string, number[]>) =>
  segment0(b, p0, p1, r0, r1, col, opts.lo ? Math.max(4, Math.round(n / 2)) : n, caps, extra);
const sphere = (b: Builder, c: V3, r: number, col: C, sy = 1, n = 8, extra?: Record<string, number[]>) =>
  sphere0(b, c, r, col, sy, opts.lo ? Math.max(4, Math.round(n / 2)) : n, extra);

const LEG_L = { swing: [1, 0.92] }, LEG_R = { swing: [-1, 0.92] };
const ARM_L = { swing: [-0.7, 1.42] }, ARM_R = { swing: [0.7, 1.42] };

/** Tapered block (car cabins, bonnets): bottom w0×l0 at y0, top w1×l1 at y1, top shifted dz along z. */
function frustum(b: Builder, cz: number, y0: number, y1: number, w0: number, l0: number, w1: number, l1: number, col: C, dz = 0, sides?: C) {
  const B: V3[] = [[-w0 / 2, y0, cz - l0 / 2], [w0 / 2, y0, cz - l0 / 2], [w0 / 2, y0, cz + l0 / 2], [-w0 / 2, y0, cz + l0 / 2]];
  const T: V3[] = [[-w1 / 2, y1, cz + dz - l1 / 2], [w1 / 2, y1, cz + dz - l1 / 2], [w1 / 2, y1, cz + dz + l1 / 2], [-w1 / 2, y1, cz + dz + l1 / 2]];
  quad(b, T[3], T[2], T[1], T[0], col); // top
  const sc = sides ?? col;
  quad(b, B[3], B[2], T[2], T[3], sc); // front (+z)
  quad(b, B[1], B[0], T[0], T[1], sc); // back
  quad(b, B[2], B[1], T[1], T[2], sc); // right (+x)
  quad(b, B[0], B[3], T[3], T[0], sc); // left
}

function wheel(b: Builder, x: number, z: number, r: number, w: number) {
  if (!opts.wheels) return;
  segment(b, [x - w / 2, r, z], [x + w / 2, r, z], r, r, TYRE, 14);
  const s = Math.sign(x) || 1;
  segment(b, [x + s * (w / 2 - 0.005), r, z], [x + s * (w / 2 + 0.01), r, z], r * 0.6, r * 0.6, RIM, 10, true);
}

/** Seated rider (two-wheelers, chhakdo, tractor). */
function rider(b: Builder, z: number, seatY: number, shirt: C, helmet = false) {
  if (!opts.rider) return;
  const skin = SKINS[1];
  const pants: C = [0.18, 0.2, 0.26];
  segment(b, [0, seatY, z], [0, seatY + 0.6, z + 0.08], 0.16, 0.18, shirt, 10); // torso
  segment(b, [0, seatY + 0.6, z + 0.08], [0, seatY + 0.68, z + 0.08], 0.06, 0.06, skin, 6); // neck
  sphere(b, [0, seatY + 0.8, z + 0.1], 0.105, skin, 1.12, 10);
  if (helmet) sphere(b, [0, seatY + 0.84, z + 0.08], 0.135, [0.12, 0.12, 0.14], 1.0, 10);
  else sphere(b, [0, seatY + 0.86, z + 0.07], 0.11, HAIR, 0.6, 10);
  for (const s of [-1, 1]) {
    segment(b, [s * 0.11, seatY + 0.04, z + 0.04], [s * 0.15, seatY + 0.04, z + 0.44], 0.07, 0.065, pants, 6); // thigh
    segment(b, [s * 0.15, seatY + 0.04, z + 0.44], [s * 0.16, 0.22, z + 0.52], 0.06, 0.05, pants, 6); // shin
    box(b, s * 0.16, 0.14, z + 0.57, 0.1, 0.08, 0.22, BLACK); // shoe
    segment(b, [s * 0.19, seatY + 0.56, z + 0.06], [s * 0.26, seatY + 0.4, z + 0.32], 0.05, 0.045, shirt, 6); // upper arm
    segment(b, [s * 0.26, seatY + 0.4, z + 0.32], [s * 0.28, seatY + 0.42, z + 0.58], 0.04, 0.035, skin, 6); // forearm
  }
}

/** A standing person with jointed limbs (they swing in the shader). */
function person(b: Builder, top: C, bottom: C, dress: 'pants' | 'saree' | 'salwar' | 'dhoti', skin: C, opts2: { long?: boolean; cap?: C; bag?: C; dupatta?: C } = {}) {
  const shoe: C = [0.12, 0.09, 0.07];
  // Legs (pivot at the hip) and feet.
  for (const [s, L] of [[-1, LEG_L], [1, LEG_R]] as const) {
    segment(b, [s * 0.09, 0.9, 0], [s * 0.1, 0.48, 0.01], 0.075, 0.062, dress === 'dhoti' ? top : bottom, 8, true, L);
    segment(b, [s * 0.1, 0.48, 0.01], [s * 0.1, 0.07, 0], 0.06, 0.045, dress === 'pants' ? bottom : skin, 8, true, L);
    box(b, s * 0.1, 0, 0.04, 0.1, 0.07, 0.25, shoe, 0, L);
  }
  if (dress !== 'pants') {
    // Saree / salwar-kameez / dhoti: a skirt from the waist, wider at the hem.
    const hem = dress === 'saree' ? 0.31 : dress === 'dhoti' ? 0.2 : 0.24;
    segment(b, [0, 1.0, 0], [0, dress === 'salwar' ? 0.5 : 0.08, 0], 0.17, hem, dress === 'dhoti' ? [0.94, 0.93, 0.88] : bottom, 12);
  }
  // Torso: hips, waist, chest; shoulders.
  segment(b, [0, 0.88, 0], [0, 1.05, 0], 0.16, 0.15, dress === 'pants' ? bottom : top, 10);
  segment(b, [0, 1.05, 0], [0, 1.42, 0.01], 0.15, 0.185, top, 10);
  segment(b, [-0.18, 1.4, 0.01], [0.18, 1.4, 0.01], 0.06, 0.06, top, 8);
  if (dress === 'saree') segment(b, [0.17, 1.42, 0.03], [-0.2, 0.96, 0.08], 0.07, 0.07, bottom, 6); // pallu
  if (opts2.dupatta) segment(b, [-0.17, 1.42, 0.06], [0.17, 1.42, 0.06], 0.05, 0.05, opts2.dupatta, 6);
  // Neck and head with face hints.
  segment(b, [0, 1.44, 0.01], [0, 1.53, 0.01], 0.055, 0.05, skin, 8);
  sphere(b, [0, 1.63, 0.015], 0.1, skin, 1.15, 12);
  box(b, 0, 1.64, 0.1, 0.09, 0.016, 0.012, HAIR); // brows/eyes band
  sphere(b, [0, 1.6, 0.115], 0.018, skin, 1.3, 6); // nose
  sphere(b, [0, 1.69, -0.005], 0.106, HAIR, opts2.long ? 0.75 : 0.55, 12);
  if (opts2.long) {
    segment(b, [0, 1.66, -0.08], [0, 1.25, -0.11], 0.06, 0.03, HAIR, 6); // braid
    sphere(b, [0, 1.7, -0.1], 0.06, HAIR, 1, 8); // bun
  }
  if (opts2.cap) segment(b, [0, 1.73, 0], [0, 1.8, 0], 0.11, 0.09, opts2.cap, 10); // Gandhi topi
  // Arms (pivot at the shoulder) with hands.
  for (const [s, A] of [[-1, ARM_L], [1, ARM_R]] as const) {
    segment(b, [s * 0.2, 1.4, 0.01], [s * 0.23, 1.12, 0.02], 0.055, 0.048, top, 8, true, A);
    segment(b, [s * 0.23, 1.12, 0.02], [s * 0.24, 0.88, 0.05], 0.042, 0.036, dress === 'pants' && top !== bottom ? top : skin, 8, true, A);
    sphere(b, [s * 0.24, 0.84, 0.05], 0.045, skin, 1.2, 6, A);
  }
  if (opts2.bag) box(b, 0, 1.0, -0.2, 0.3, 0.4, 0.14, opts2.bag); // school bag
}

/** Zebu cow: hump, dewlap, long ears, curved horns, tail with a tuft. Gir: red-brown with a domed forehead. */
function cow(b: Builder, sitting: boolean, coat: C, patch: C | null, horn: C) {
  const hoof: C = [0.12, 0.1, 0.09];
  const y = sitting ? 0.5 : 1.0;
  segment(b, [0, y, -0.72], [0, y + 0.04, 0.12], 0.36, 0.38, coat, 14); // rear barrel
  segment(b, [0, y + 0.04, 0.12], [0, y + 0.06, 0.7], 0.38, 0.32, coat, 14); // chest
  if (patch) {
    sphere(b, [0.2, y + 0.1, -0.3], 0.26, patch, 0.85, 10);
    sphere(b, [-0.24, y + 0.02, 0.35], 0.22, patch, 0.9, 10);
  }
  sphere(b, [0, y + 0.38, 0.5], 0.21, coat, 1.05, 12); // hump
  segment(b, [0, y + 0.1, 0.7], [0, y + 0.32, 1.08], 0.18, 0.13, coat, 10); // neck
  quad(b, [0, y - 0.3, 0.62], [0, y - 0.32, 0.95], [0, y + 0.05, 1.05], [0, y + 0.05, 0.7], coat); // dewlap
  segment(b, [0, y + 0.32, 1.06], [0, y + 0.22, 1.42], 0.13, 0.1, coat, 10); // head
  sphere(b, [0, y + 0.4, 1.12], 0.12, coat, 0.9, 10); // domed forehead
  segment(b, [0, y + 0.2, 1.38], [0, y + 0.13, 1.52], 0.095, 0.08, [0.3, 0.24, 0.22], 8); // muzzle
  for (const s of [-1, 1]) {
    segment(b, [s * 0.1, y + 0.32, 1.12], [s * 0.26, y + 0.12, 1.08], 0.05, 0.03, coat, 6); // drooping ears
    segment(b, [s * 0.08, y + 0.44, 1.1], [s * 0.2, y + 0.62, 1.0], 0.035, 0.02, horn, 5); // horns
    segment(b, [s * 0.2, y + 0.62, 1.0], [s * 0.17, y + 0.74, 0.86], 0.02, 0.008, horn, 5);
    sphere(b, [s * 0.07, y + 0.32, 1.32], 0.02, BLACK, 1, 5); // eyes
  }
  segment(b, [0, y + 0.08, -0.78], [0, y - 0.55, -0.9], 0.03, 0.02, coat, 5); // tail
  sphere(b, [0, y - 0.6, -0.9], 0.05, BLACK, 1.6, 6); // tuft
  if (sitting) {
    for (const [x, z] of [[-0.32, 0.55], [0.32, 0.55], [-0.32, -0.45], [0.32, -0.45]]) {
      segment(b, [x, 0.12, z], [x, 0.11, z + 0.34], 0.09, 0.07, coat, 6);
      sphere(b, [x, 0.08, z + 0.38], 0.06, hoof, 0.8, 5);
    }
  } else {
    for (const [x, z] of [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.55], [0.2, -0.55]]) {
      segment(b, [x, y - 0.25, z], [x, 0.3, z], 0.08, 0.06, coat, 7);
      segment(b, [x, 0.3, z], [x, 0.06, z], 0.055, 0.05, coat, 7);
      segment(b, [x, 0.07, z], [x, 0, z + 0.03], 0.06, 0.06, hoof, 6);
    }
  }
}

/** Indian street dog (desi): tan or brown-and-white, lying in the shade or trotting. */
function dog(b: Builder, lying: boolean, coat: C) {
  const W: C = [0.92, 0.88, 0.8];
  const y = lying ? 0.18 : 0.42;
  segment(b, [0, y, -0.32], [0, y + 0.02, 0.3], 0.13, 0.12, coat, 10);
  segment(b, [0, y + 0.08, 0.32], [0, y + (lying ? 0.12 : 0.26), 0.48], 0.07, 0.06, coat, 8);
  sphere(b, [0, y + (lying ? 0.14 : 0.3), 0.52], 0.09, coat, 1, 10);
  segment(b, [0, y + (lying ? 0.12 : 0.28), 0.58], [0, y + (lying ? 0.1 : 0.26), 0.7], 0.045, 0.03, W, 6);
  sphere(b, [0, y + (lying ? 0.1 : 0.26), 0.71], 0.02, BLACK, 1, 5);
  for (const s of [-1, 1]) segment(b, [s * 0.05, y + (lying ? 0.2 : 0.36), 0.5], [s * 0.07, y + (lying ? 0.3 : 0.46), 0.48], 0.03, 0.01, coat, 4);
  segment(b, [0, y + 0.04, -0.34], [0, y + (lying ? 0.06 : 0.3), -0.56], 0.03, 0.015, coat, 5);
  if (lying) for (const s of [-1, 1]) segment(b, [s * 0.08, 0.06, 0.32], [s * 0.08, 0.05, 0.55], 0.03, 0.025, coat, 5);
  else for (const [x, z] of [[-0.07, 0.24], [0.07, 0.24], [-0.07, -0.26], [0.07, -0.26]]) segment(b, [x, y - 0.06, z], [x, 0.01, z], 0.035, 0.028, coat, 6);
}

/** Hatchback: body with wheel arches, tapered glass cabin, lights, bumpers, mirrors, plates. */
function car(b: Builder, body: C) {
  const dark: C = body.map((c) => c * 0.55);
  box(b, 0, 0.28, 0, 1.68, 0.5, 3.8, body); // lower body
  frustum(b, 1.35, 0.78, 0.9, 1.6, 1.1, 1.5, 0.95, body, -0.05); // bonnet
  frustum(b, -0.25, 0.78, 1.38, 1.62, 2.5, 1.32, 1.55, GLASS, -0.15, GLASS); // glass cabin
  box(b, 0, 1.38, -0.4, 1.34, 0.06, 1.6, body); // roof
  for (const z of [0.42, -0.75]) for (const s of [-1, 1]) box(b, s * 0.79, 0.8, z, 0.04, 0.56, 0.08, body); // pillars
  box(b, 0, 0.18, 1.92, 1.66, 0.3, 0.12, BLACK); // front bumper
  box(b, 0, 0.18, -1.92, 1.66, 0.3, 0.12, BLACK); // rear bumper
  box(b, 0, 0.5, 1.93, 0.6, 0.16, 0.04, BLACK); // grille
  for (const s of [-1, 1]) {
    box(b, s * 0.6, 0.62, 1.91, 0.36, 0.12, 0.05, LAMP); // headlights
    box(b, s * 0.68, 0.62, -1.91, 0.24, 0.14, 0.05, TAIL); // tail lamps
    box(b, s * 0.9, 0.95, 0.55, 0.12, 0.08, 0.1, body); // mirrors
    for (const z of [1.25, -1.25]) box(b, s * 0.83, 0.28, z, 0.06, 0.5, 0.95, dark); // wheel arches (dark)
    box(b, s * 0.85, 0.62, -0.1, 0.02, 0.03, 1.4, dark); // door line
  }
  box(b, 0, 0.32, 1.99, 0.42, 0.11, 0.02, PLATE);
  box(b, 0, 0.32, -1.99, 0.42, 0.11, 0.02, PLATE);
  for (const s of [-1, 1]) for (const z of [1.25, -1.25]) wheel(b, s * 0.74, z, 0.3, 0.2);
}

function suv(b: Builder, body: C) {
  box(b, 0, 0.42, 0, 1.82, 0.62, 4.4, body);
  frustum(b, 1.6, 1.04, 1.12, 1.78, 1.2, 1.7, 1.1, body, 0);
  frustum(b, -0.3, 1.04, 1.78, 1.78, 3.1, 1.66, 2.8, GLASS, -0.05, GLASS);
  box(b, 0, 1.78, -0.35, 1.7, 0.08, 2.8, body);
  for (const s of [-1, 1]) {
    box(b, s * 0.6, 1.86, -0.35, 0.05, 0.05, 2.5, BLACK); // roof rails
    box(b, s * 0.65, 0.88, 2.21, 0.36, 0.14, 0.04, LAMP);
    box(b, s * 0.75, 0.9, -2.21, 0.2, 0.2, 0.04, TAIL);
    box(b, s * 0.93, 1.2, 1.0, 0.12, 0.1, 0.12, body);
    for (const z of [1.45, -1.45]) box(b, s * 0.9, 0.38, z, 0.06, 0.62, 1.05, BLACK);
  }
  box(b, 0, 0.3, 2.21, 1.84, 0.34, 0.08, BLACK);
  box(b, 0, 0.62, 2.22, 0.7, 0.22, 0.03, CHROME);
  box(b, 0, 0.75, -2.28, 0.8, 0.8, 0.14, BLACK); // spare wheel
  for (const s of [-1, 1]) for (const z of [1.45, -1.45]) wheel(b, s * 0.82, z, 0.38, 0.26);
}

function riderShirt(seed: number): C {
  return [[0.2, 0.4, 0.75], [0.9, 0.9, 0.88], [0.75, 0.2, 0.2], [0.3, 0.55, 0.35], [0.85, 0.7, 0.35]][seed % 5];
}

export function vehicleModel(name: ModelName, options: ModelOptions = {}): GeoBuf {
  opts = { rider: true, wheels: true, lo: false, ...options };
  const b = new Builder(false, { color: 3, swing: 2 });
  switch (name) {
    case 'scooter': {
      const c: C = [0.72, 0.1, 0.12];
      box(b, 0, 0.24, 0.06, 0.3, 0.07, 0.62, BLACK); // floorboard
      segment(b, [0, 0.5, -0.75], [0, 0.52, -0.15], 0.17, 0.2, c, 12); // rear body
      box(b, 0, 0.72, -0.45, 0.28, 0.1, 0.62, BLACK); // seat
      frustum(b, 0.43, 0.25, 1.0, 0.34, 0.16, 0.24, 0.1, c, -0.05); // apron
      sphere(b, [0, 1.08, 0.4], 0.12, c, 0.6, 10); // cowl
      box(b, 0, 1.08, 0.4, 0.62, 0.03, 0.03, CHROME); // handlebar
      box(b, 0, 1.03, 0.5, 0.12, 0.07, 0.03, LAMP);
      box(b, 0, 0.6, -0.82, 0.16, 0.06, 0.03, TAIL);
      wheel(b, 0, 0.6, 0.22, 0.1); wheel(b, 0, -0.58, 0.22, 0.1);
      rider(b, -0.35, 0.74, riderShirt(1), true);
      break;
    }
    case 'motorcycle': {
      const tank: C = [0.65, 0.05, 0.05];
      segment(b, [0, 0.42, -0.55], [0, 0.55, 0.55], 0.06, 0.06, BLACK, 6); // frame
      segment(b, [0, 0.78, -0.05], [0, 0.82, 0.38], 0.15, 0.12, tank, 10); // tank
      box(b, 0, 0.78, -0.42, 0.24, 0.08, 0.55, BLACK); // seat
      box(b, 0, 0.32, 0, 0.26, 0.3, 0.38, [0.25, 0.25, 0.27]); // engine
      segment(b, [0.15, 0.3, 0.1], [0.17, 0.42, -0.75], 0.04, 0.045, CHROME, 8); // silencer
      segment(b, [0, 0.55, 0.62], [0, 1.0, 0.5], 0.03, 0.03, CHROME, 6); // fork
      sphere(b, [0, 0.98, 0.58], 0.09, LAMP, 1, 8);
      box(b, 0, 1.05, 0.48, 0.7, 0.03, 0.03, BLACK);
      for (const z of [0.7, -0.65]) box(b, 0, 0.64, z, 0.14, 0.03, 0.4, BLACK); // mudguards
      wheel(b, 0, 0.7, 0.3, 0.1); wheel(b, 0, -0.65, 0.3, 0.1);
      rider(b, -0.25, 0.82, riderShirt(2), true);
      break;
    }
    case 'auto': {
      // CNG auto-rickshaw: green body, yellow roof, black canvas sides, single front wheel.
      const G: C = [0.16, 0.52, 0.22], Y: C = [0.98, 0.82, 0.1];
      box(b, 0, 0.32, -0.45, 1.3, 0.62, 1.35, G); // rear body / seat box
      frustum(b, 0.62, 0.3, 1.1, 0.9, 0.85, 0.75, 0.5, G, -0.12); // nose
      box(b, 0, 0.22, 0.2, 1.1, 0.12, 1.3, BLACK); // floor
      frustum(b, -0.05, 1.1, 1.72, 1.32, 2.2, 1.2, 1.9, [0.12, 0.12, 0.12], 0, [0.12, 0.12, 0.12]); // canvas hood
      frustum(b, -0.05, 1.72, 1.82, 1.2, 1.9, 1.05, 1.6, Y); // yellow roof
      for (const s of [-1, 1]) box(b, s * 0.66, 0.95, 0.1, 0.03, 0.8, 1.2, [0.1, 0.1, 0.1]); // open sides (shadow)
      box(b, 0, 1.15, 0.95, 1.0, 0.55, 0.04, GLASS); // windscreen
      box(b, 0, 0.75, 1.05, 0.22, 0.14, 0.06, LAMP);
      box(b, 0, 1.0, 0.75, 0.6, 0.03, 0.03, CHROME); // handlebar
      box(b, 0, 0.62, -1.13, 1.1, 0.25, 0.04, [0.08, 0.08, 0.08]);
      for (const s of [-1, 1]) box(b, s * 0.5, 0.62, -1.14, 0.14, 0.1, 0.03, TAIL);
      box(b, 0, 0.42, -1.14, 0.4, 0.12, 0.02, [0.98, 0.85, 0.1]); // yellow commercial plate
      wheel(b, 0, 1.0, 0.22, 0.14);
      for (const s of [-1, 1]) wheel(b, s * 0.62, -0.75, 0.22, 0.14);
      if (opts.rider) rider(b, 0.4, 0.82, [0.85, 0.82, 0.75]);
      break;
    }
    case 'chhakdo': {
      // Saurashtra's own: a motorcycle front with a wooden cargo/passenger bed.
      box(b, 0, 0.5, 1.0, 0.3, 0.3, 1.0, [0.1, 0.1, 0.12]);
      segment(b, [0, 0.82, 1.1], [0, 0.85, 1.45], 0.12, 0.1, [0.15, 0.3, 0.6], 8); // tank
      sphere(b, [0, 1.15, 1.6], 0.1, LAMP, 1, 8);
      box(b, 0, 1.2, 1.5, 0.75, 0.03, 0.03, CHROME);
      wheel(b, 0, 1.55, 0.3, 0.1);
      box(b, 0, 0.55, -0.6, 1.5, 0.12, 2.0, [0.45, 0.3, 0.16]);
      for (const s of [-1, 1]) box(b, s * 0.72, 0.67, -0.6, 0.06, 0.35, 2.0, [0.55, 0.38, 0.2]);
      box(b, 0, 0.67, -1.58, 1.5, 0.35, 0.06, [0.55, 0.38, 0.2]);
      box(b, 0, 1.4, -0.6, 1.4, 0.05, 1.6, [0.7, 0.12, 0.1]); // red canopy
      for (const [x, z] of [[-0.68, 0.15], [0.68, 0.15], [-0.68, -1.35], [0.68, -1.35]]) segment(b, [x, 0.67, z], [x, 1.4, z], 0.025, 0.025, BLACK, 4);
      for (const s of [-1, 1]) wheel(b, s * 0.82, -0.9, 0.3, 0.15);
      rider(b, 0.8, 0.88, [0.85, 0.82, 0.75]);
      break;
    }
    case 'car-white': car(b, [0.92, 0.92, 0.9]); break;
    case 'car-red': car(b, [0.7, 0.08, 0.08]); break;
    case 'car-silver': car(b, [0.66, 0.67, 0.68]); break;
    case 'car-blue': car(b, [0.12, 0.25, 0.5]); break;
    case 'suv-white': suv(b, [0.93, 0.93, 0.92]); break;
    case 'suv-black': suv(b, [0.1, 0.1, 0.11]); break;
    case 'bus': {
      // City / BRTS bus: two-tone body, window band with pillars, doors, destination board.
      const R: C = [0.78, 0.18, 0.12], W: C = [0.94, 0.92, 0.86];
      box(b, 0, 0.35, 0, 2.5, 1.0, 10.5, R);
      box(b, 0, 1.35, 0, 2.5, 1.0, 10.5, GLASS);
      for (let z = -4.8; z <= 4.8; z += 1.2) for (const s of [-1, 1]) box(b, s * 1.255, 1.35, z, 0.02, 1.0, 0.12, W); // pillars
      box(b, 0, 2.35, 0, 2.5, 0.45, 10.5, W);
      box(b, 0, 2.8, 0, 2.3, 0.12, 9.5, [0.82, 0.82, 0.82]); // roof
      box(b, 0, 1.0, 5.26, 2.3, 1.5, 0.03, GLASS); // windscreen
      box(b, 0, 2.45, 5.27, 1.6, 0.3, 0.03, [0.95, 0.55, 0.1]); // destination board
      for (const s of [-1, 1]) {
        box(b, s * 0.85, 0.65, 5.27, 0.3, 0.16, 0.04, LAMP);
        box(b, s * 0.95, 0.75, -5.27, 0.2, 0.3, 0.04, TAIL);
      }
      box(b, 1.26, 0.35, 3.6, 0.03, 2.0, 1.1, [0.2, 0.2, 0.22]); // doors (left side: traffic keeps left)
      box(b, 1.26, 0.35, -1.0, 0.03, 2.0, 1.1, [0.2, 0.2, 0.22]);
      box(b, 0, 0.2, 5.3, 2.5, 0.3, 0.1, BLACK);
      for (const s of [-1, 1]) for (const z of [3.6, -3.4]) wheel(b, s * 1.1, z, 0.48, 0.3);
      break;
    }
    case 'bicycle': {
      const F: C = [0.12, 0.12, 0.14];
      wheel(b, 0, 0.55, 0.33, 0.04); wheel(b, 0, -0.5, 0.33, 0.04);
      segment(b, [0, 0.33, -0.5], [0, 0.85, -0.15], 0.02, 0.02, F, 5);
      segment(b, [0, 0.85, -0.15], [0, 0.9, 0.45], 0.02, 0.02, F, 5);
      segment(b, [0, 0.33, -0.1], [0, 0.9, 0.45], 0.02, 0.02, F, 5);
      segment(b, [0, 0.33, -0.5], [0, 0.33, -0.1], 0.015, 0.015, F, 5);
      segment(b, [0, 0.33, 0.55], [0, 1.05, 0.42], 0.02, 0.02, F, 5);
      box(b, 0, 1.03, 0.42, 0.55, 0.03, 0.03, F);
      box(b, 0, 0.9, -0.18, 0.14, 0.05, 0.25, BLACK);
      box(b, 0, 0.62, -0.45, 0.3, 0.03, 0.35, F);
      rider(b, -0.2, 0.92, [0.95, 0.95, 0.95]);
      break;
    }
    case 'tractor': {
      const R: C = [0.75, 0.12, 0.1];
      box(b, 0, 0.55, 0.6, 0.7, 0.6, 1.9, R);
      box(b, 0, 1.15, 0.85, 0.6, 0.12, 1.3, R);
      box(b, 0, 0.7, 1.56, 0.5, 0.35, 0.04, [0.15, 0.15, 0.15]); // grille
      segment(b, [0.2, 1.2, 1.2], [0.2, 2.0, 1.2], 0.05, 0.04, BLACK, 6);
      box(b, 0, 0.6, -0.65, 1.0, 0.5, 0.9, [0.3, 0.3, 0.32]);
      box(b, 0, 1.2, -0.75, 0.45, 0.12, 0.4, BLACK);
      box(b, 0, 1.45, -0.45, 0.06, 0.4, 0.06, BLACK);
      for (const s of [-1, 1]) box(b, s * 0.82, 1.35, -0.75, 0.42, 0.06, 0.9, R);
      for (const s of [-1, 1]) wheel(b, s * 0.82, -0.75, 0.72, 0.4);
      for (const s of [-1, 1]) wheel(b, s * 0.55, 1.2, 0.4, 0.2);
      rider(b, -0.75, 1.25, [0.9, 0.9, 0.85]);
      break;
    }
    case 'ped-kurta': person(b, [0.88, 0.78, 0.5], [0.94, 0.92, 0.86], 'pants', SKINS[1]); break;
    case 'ped-shirt': person(b, [0.3, 0.45, 0.7], [0.2, 0.2, 0.25], 'pants', SKINS[2]); break;
    case 'ped-saree': person(b, [0.75, 0.15, 0.35], [0.88, 0.3, 0.45], 'saree', SKINS[0], { long: true }); break;
    case 'ped-salwar': person(b, [0.95, 0.65, 0.15], [0.3, 0.55, 0.45], 'salwar', SKINS[1], { long: true, dupatta: [0.95, 0.4, 0.5] }); break;
    case 'ped-elder': person(b, [0.95, 0.94, 0.9], [0.95, 0.94, 0.9], 'dhoti', SKINS[2], { cap: [0.97, 0.97, 0.95] }); break;
    case 'ped-student': person(b, [0.92, 0.93, 0.95], [0.18, 0.24, 0.45], 'pants', SKINS[0], { bag: [0.2, 0.35, 0.7] }); break;
    case 'cow-stand': cow(b, false, [0.9, 0.88, 0.82], null, [0.35, 0.28, 0.22]); break;
    case 'cow-sit': cow(b, true, [0.86, 0.84, 0.78], [0.62, 0.6, 0.56], [0.35, 0.28, 0.22]); break;
    case 'cow-gir': cow(b, false, [0.55, 0.26, 0.14], [0.92, 0.88, 0.8], [0.28, 0.22, 0.16]); break;
    case 'dog-lie': dog(b, true, [0.72, 0.52, 0.3]); break;
    case 'dog-walk': dog(b, false, [0.55, 0.36, 0.2]); break;
  }
  const out = b.build();
  const c = out.attrs.color[0], n = out.normal;
  for (let k = 0; k < c.length; k += 3) {
    // Facing shade: undersides and lower sides darker, like soft sky light. Then sRGB -> linear.
    const sky = 0.68 + 0.32 * (n[k + 1] * 0.5 + 0.5);
    for (let q = 0; q < 3; q++) c[k + q] = Math.pow(c[k + q], 2.2) * sky;
  }
  return out;
}
