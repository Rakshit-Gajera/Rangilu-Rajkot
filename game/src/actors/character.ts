import * as THREE from 'three';

/**
 * The player's character (PROMPT §3.2, §11): a jointed, procedurally built person with a face, hair,
 * hands and clothes, posed by code (walk, run, idle breathing, jump, riding). Local +z is forward, feet at y = 0.
 */

export type OutfitStyle = 'shirt' | 'kurta' | 'tshirt';
export interface Outfit {
  style: OutfitStyle;
  top: number;
  bottom: number;
  shoes: number;
}

export const OUTFITS: Record<string, Outfit> = {
  casual: { style: 'shirt', top: 0x6f9fd8, bottom: 0x2b3446, shoes: 0xe8e6e0 },
  kurta: { style: 'kurta', top: 0xe0b04a, bottom: 0xf1ece0, shoes: 0x6b4126 },
  cricket: { style: 'tshirt', top: 0x2a62c9, bottom: 0x1d2433, shoes: 0xf2f2f2 },
  festive: { style: 'kurta', top: 0x9e1f3c, bottom: 0xf3e6c4, shoes: 0xc8a050 },
};

export type Pose = 'stand' | 'ride';

const SKIN = 0x8a5a3c;
/** Skin tones offered in character setup. */
export const SKIN_TONES = [0xc68e65, 0xa8714d, 0x8a5a3c, 0x6e4529, 0x4e3020];

export class Character {
  readonly root = new THREE.Group();
  private hips = new THREE.Group();
  private spine = new THREE.Group();
  private neck = new THREE.Group();
  private head = new THREE.Group();
  private shoulder: THREE.Group[] = [];
  private elbow: THREE.Group[] = [];
  private hip: THREE.Group[] = [];
  private knee: THREE.Group[] = [];
  private ankle: THREE.Group[] = [];
  private skin: THREE.MeshStandardMaterial;
  private mats: { top: THREE.MeshStandardMaterial; bottom: THREE.MeshStandardMaterial; shoes: THREE.MeshStandardMaterial };
  private styleParts: Record<OutfitStyle, THREE.Object3D[]> = { shirt: [], kurta: [], tshirt: [] };
  private sleeves: THREE.Mesh[] = [];
  private forearmSleeves: THREE.Mesh[] = [];
  private t = 0;
  private phase = 0;
  pose: Pose = 'stand';

  constructor(outfit: Outfit = OUTFITS.casual) {
    const std = (color: number, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
    const skin = (this.skin = std(SKIN, 0.65));
    const hair = std(0x15100c, 0.55);
    const white = std(0xf4f1ea, 0.4);
    const dark = std(0x1a1210, 0.4);
    this.mats = { top: std(outfit.top, 0.85), bottom: std(outfit.bottom, 0.9), shoes: std(outfit.shoes, 0.6) };
    const { top, bottom, shoes } = this.mats;

    const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 4, 10);

    // --- Hierarchy: root → hips (pelvis height) → spine → neck → head; shoulders on the spine; legs on the hips.
    this.root.add(this.hips);
    this.hips.position.y = 0.95;
    this.hips.add(this.spine);
    this.spine.position.y = 0.08;

    // Pelvis and torso: a lathe profile (waist narrower than chest), slightly flattened front-to-back.
    mesh(new THREE.SphereGeometry(0.155, 14, 10), bottom, this.hips, 0, 0, 0).scale.set(1.08, 0.75, 0.82);
    const torsoProfile = [
      [0.0, 0.0], [0.15, 0.0], [0.145, 0.1], [0.15, 0.2], [0.17, 0.32], [0.185, 0.42], [0.175, 0.5], [0.12, 0.56], [0.055, 0.6], [0.0, 0.6],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const torso = mesh(new THREE.LatheGeometry(torsoProfile, 16), top, this.spine, 0, -0.02, 0);
    torso.scale.set(1.05, 1, 0.72);
    // Kurta: long flared hem to the knees; shirt: collar, placket and buttons; t-shirt: round neck.
    const hem = mesh(new THREE.CylinderGeometry(0.17, 0.23, 0.48, 16, 1, true), top, this.hips, 0, -0.2, 0);
    hem.scale.z = 0.78;
    (hem.material as THREE.Material).side = THREE.DoubleSide;
    this.styleParts.kurta.push(hem);
    const kurtaPlacket = mesh(new THREE.BoxGeometry(0.035, 0.2, 0.01), std(0xc79a3a), this.spine, 0, 0.45, 0.132);
    this.styleParts.kurta.push(kurtaPlacket);
    const collar = mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 14, Math.PI * 1.3), top, this.spine, 0, 0.57, 0.02);
    collar.rotation.set(Math.PI / 2, 0, Math.PI * 0.85 + Math.PI);
    this.styleParts.shirt.push(collar);
    const placket = mesh(new THREE.BoxGeometry(0.03, 0.5, 0.008), top, this.spine, 0, 0.3, 0.131);
    this.styleParts.shirt.push(placket);
    for (let k = 0; k < 4; k++) this.styleParts.shirt.push(mesh(new THREE.SphereGeometry(0.008, 6, 4), white, this.spine, 0, 0.12 + k * 0.12, 0.137));
    const tuck = mesh(new THREE.CylinderGeometry(0.152, 0.152, 0.05, 16), dark, this.hips, 0, 0.06, 0); // belt
    tuck.scale.z = 0.8;
    this.styleParts.shirt.push(tuck);
    this.styleParts.shirt.push(mesh(new THREE.BoxGeometry(0.05, 0.035, 0.01), std(0xb8a060, 0.3), this.hips, 0, 0.06, 0.125)); // buckle

    // Neck and head.
    this.spine.add(this.neck);
    this.neck.position.y = 0.56;
    mesh(new THREE.CylinderGeometry(0.056, 0.062, 0.1, 10), skin, this.neck, 0, 0.04, 0);
    this.neck.add(this.head);
    this.head.position.y = 0.075;
    const skull = mesh(new THREE.SphereGeometry(0.105, 18, 14), skin, this.head, 0, 0.1, 0);
    skull.scale.set(0.9, 1.12, 1.0);
    const jaw = mesh(new THREE.SphereGeometry(0.075, 14, 10), skin, this.head, 0, 0.03, 0.025);
    jaw.scale.set(1.05, 0.9, 1.0);
    mesh(new THREE.ConeGeometry(0.018, 0.045, 8), skin, this.head, 0, 0.085, 0.105).rotation.x = Math.PI / 2 + 0.25; // nose
    for (const s of [-1, 1]) {
      mesh(new THREE.SphereGeometry(0.02, 8, 6), skin, this.head, s * 0.095, 0.1, 0.0).scale.set(0.5, 1, 0.8); // ears
      mesh(new THREE.SphereGeometry(0.012, 8, 6), white, this.head, s * 0.036, 0.112, 0.099).scale.set(1.25, 0.7, 0.5); // eyes
      mesh(new THREE.SphereGeometry(0.0065, 6, 4), dark, this.head, s * 0.036, 0.112, 0.104);
      const brow = mesh(new THREE.BoxGeometry(0.035, 0.007, 0.008), hair, this.head, s * 0.037, 0.138, 0.103);
      brow.rotation.z = s * -0.12;
    }
    const tache = mesh(new THREE.BoxGeometry(0.06, 0.012, 0.01), hair, this.head, 0, 0.06, 0.1); // moustache
    tache.rotation.x = 0.2;
    mesh(new THREE.BoxGeometry(0.04, 0.008, 0.01), std(0x6a3a30, 0.5), this.head, 0, 0.04, 0.1); // lips
    // Hair: a cap over the skull with a slight front quiff and fuller back.
    const cap = mesh(new THREE.SphereGeometry(0.112, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, this.head, 0, 0.115, -0.005);
    cap.scale.set(0.95, 1.12, 1.05);
    cap.rotation.x = -0.55; // rim high over the forehead, low at the nape
    const quiff = mesh(new THREE.SphereGeometry(0.06, 12, 8), hair, this.head, 0.01, 0.205, 0.035);
    quiff.scale.set(1.4, 0.55, 0.9);
    mesh(new THREE.SphereGeometry(0.09, 12, 8), hair, this.head, 0, 0.1, -0.04).scale.set(1.05, 1.0, 0.85);

    // Arms: shoulder → upper arm (sleeve) → elbow → forearm → hand with a thumb; a watch on the left wrist.
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.2, 0.5, 0);
      this.spine.add(sh);
      mesh(new THREE.SphereGeometry(0.052, 10, 8), top, sh, s * -0.01, -0.01, 0);
      const upper = mesh(capsule(0.048, 0.22), top, sh, 0, -0.14, 0);
      this.sleeves.push(upper);
      const el = new THREE.Group();
      el.position.y = -0.29;
      sh.add(el);
      mesh(capsule(0.04, 0.2), skin, el, 0, -0.12, 0);
      const cuff = mesh(capsule(0.045, 0.16), top, el, 0, -0.1, 0); // long sleeves (shirt, kurta)
      this.forearmSleeves.push(cuff);
      mesh(new THREE.BoxGeometry(0.06, 0.09, 0.03), skin, el, 0, -0.29, 0.005); // hand
      const thumb = mesh(capsule(0.012, 0.03), skin, el, s * -0.03, -0.27, 0.025);
      thumb.rotation.z = s * 0.5;
      if (s < 0) mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.025, 10), dark, el, 0, -0.22, 0);
      this.shoulder.push(sh);
      this.elbow.push(el);
    }

    // Legs: hip → thigh → knee → shin → ankle → shoe.
    for (const s of [-1, 1]) {
      const hp = new THREE.Group();
      hp.position.set(s * 0.085, -0.02, 0);
      this.hips.add(hp);
      mesh(capsule(0.072, 0.32), bottom, hp, 0, -0.21, 0);
      const kn = new THREE.Group();
      kn.position.y = -0.44;
      hp.add(kn);
      mesh(capsule(0.058, 0.32), bottom, kn, 0, -0.2, 0);
      const an = new THREE.Group();
      an.position.y = -0.43;
      kn.add(an);
      mesh(new THREE.BoxGeometry(0.095, 0.075, 0.24), shoes, an, 0, -0.045, 0.045); // shoe
      mesh(new THREE.BoxGeometry(0.1, 0.02, 0.25), dark, an, 0, -0.075, 0.045); // sole
      this.hip.push(hp);
      this.knee.push(kn);
      this.ankle.push(an);
    }
    this.setOutfit(outfit);
  }

  /** Skin tone (title-screen character setup). */
  setSkin(hex: number) {
    this.skin.color.setHex(hex);
  }

  setOutfit(o: Outfit) {
    this.mats.top.color.setHex(o.top);
    this.mats.bottom.color.setHex(o.bottom);
    this.mats.shoes.color.setHex(o.shoes);
    for (const [style, parts] of Object.entries(this.styleParts)) for (const p of parts) p.visible = style === o.style;
    for (const c of this.forearmSleeves) c.visible = o.style !== 'tshirt';
  }

  /**
   * Pose for this frame. speed in m/s on foot; airborne for jumps; ride for sitting on a two-wheeler
   * (lean is the vehicle's roll, already applied by the parent).
   */
  animate(dt: number, speed: number, airborne: boolean) {
    this.t += dt;
    const sh = this.shoulder, el = this.elbow, hp = this.hip, kn = this.knee, an = this.ankle;
    if (this.pose === 'ride') {
      // Seat top is ~0.8 m above the scooter's ground line; hands reach the handlebar ahead.
      this.hips.position.y = 0.89;
      this.hips.rotation.set(0, 0, 0);
      this.spine.rotation.set(0.25, 0, 0);
      this.neck.rotation.set(-0.22, 0, 0);
      for (let k = 0; k < 2; k++) {
        const s = k === 0 ? -1 : 1;
        hp[k].rotation.set(-1.35, 0, s * -0.1);
        kn[k].rotation.set(1.45, 0, 0);
        an[k].rotation.set(-0.1, 0, 0);
        sh[k].rotation.set(-1.2, 0, s * 0.22);
        el[k].rotation.set(-0.3, 0, 0);
      }
      return;
    }
    const run = Math.min(speed / 3.6, 1.6);
    const moving = speed > 0.2;
    this.phase += dt * (moving ? 3.2 + speed * 1.55 : 0);
    const p = this.phase;
    const amp = moving ? 0.35 + 0.3 * Math.min(run, 1.2) : 0;
    const breathe = Math.sin(this.t * 1.8) * 0.015;
    this.hips.position.y = 0.95 - (moving ? Math.abs(Math.sin(p)) * 0.04 * run : 0) + (moving ? 0 : breathe * 0.2);
    this.hips.rotation.set(0, Math.sin(p) * 0.12 * amp, 0);
    this.spine.rotation.set(moving ? 0.06 * run + 0.02 : breathe, -Math.sin(p) * 0.2 * amp, 0);
    this.neck.rotation.set(moving ? -0.05 * run : 0, Math.sin(p) * 0.1 * amp, 0);
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? 1 : -1;
      const sw = Math.sin(p) * s; // +: leg forward
      if (airborne) {
        hp[k].rotation.set(k === 0 ? -0.7 : 0.2, 0, 0);
        kn[k].rotation.set(k === 0 ? 1.1 : 0.5, 0, 0);
        sh[k].rotation.set(-0.5, 0, (k === 0 ? -1 : 1) * 0.6);
        el[k].rotation.set(-0.6, 0, 0);
        an[k].rotation.set(0, 0, 0);
        continue;
      }
      hp[k].rotation.set(-sw * amp * 1.1, 0, 0);
      // The knee bends most while the leg swings through (forward-moving phase).
      const swingThrough = Math.max(0, Math.cos(p) * s);
      kn[k].rotation.set(moving ? 0.1 + swingThrough * (0.6 + 0.5 * run) * amp * 1.6 : 0.03, 0, 0);
      an[k].rotation.set(moving ? -Math.max(0, -sw) * 0.3 * amp : 0, 0, 0);
      sh[k].rotation.set(sw * amp * 1.0, 0, (k === 0 ? -1 : 1) * (0.08 + breathe));
      el[k].rotation.set(-(0.15 + (moving ? 0.35 * run + Math.max(0, sw) * 0.4 * amp : 0)), 0, 0);
    }
  }
}
