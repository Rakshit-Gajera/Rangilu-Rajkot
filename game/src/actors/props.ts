import type * as RAPIER from '@dimforge/rapier3d';
import * as THREE from 'three';
import { GROUP_PLAYER, GROUP_VEHICLE, GROUP_WORLD, groups, type Physics } from '../physics/physics';

/** Spawnable sandbox props (PROMPT §3.5): traffic cones, oil barrels, stunt ramps and cricket stumps. */
export type PropKind = 'cone' | 'barrel' | 'ramp' | 'stumps';
export const PROP_LABELS: Record<PropKind, string> = { cone: 'Traffic cone', barrel: 'Barrel', ramp: 'Ramp', stumps: 'Cricket stumps' };

const MAX_PROPS = 40;

interface Prop { kind: PropKind; body: RAPIER.RigidBody; mesh: THREE.Object3D }

const std = (color: number, roughness = 0.7) => new THREE.MeshStandardMaterial({ color, roughness });

function coneMesh() {
  const g = new THREE.Group();
  const orange = std(0xf05a1a, 0.6), white = std(0xf2f2f2, 0.5), black = std(0x1a1a1a);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, y: number) => { const o = new THREE.Mesh(geo, m); o.position.y = y; o.castShadow = true; g.add(o); };
  add(new THREE.BoxGeometry(0.4, 0.04, 0.4), black, 0.02);
  add(new THREE.CylinderGeometry(0.05, 0.17, 0.66, 14), orange, 0.37);
  add(new THREE.CylinderGeometry(0.105, 0.125, 0.12, 14), white, 0.42);
  return g;
}

function barrelMesh() {
  const g = new THREE.Group();
  const blue = std(0x1f4f9a, 0.5), rim = std(0x2a2a2a, 0.5);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 18), blue);
  body.castShadow = true;
  g.add(body);
  for (const y of [-0.3, 0, 0.3]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.015, 6, 18).rotateX(Math.PI / 2), rim);
    r.position.y = y;
    g.add(r);
  }
  return g;
}

/** Wedge: 3 m wide, 4.5 m long, rising to 1.2 m. Local +z is up the ramp. */
const RAMP = { w: 1.5, l: 2.25, h: 1.2 };
function rampPoints(): Float32Array {
  const { w, l, h } = RAMP;
  return new Float32Array([-w, 0, -l, w, 0, -l, -w, 0, l, w, 0, l, -w, h, l, w, h, l]);
}
function rampMesh() {
  const { w, l, h } = RAMP;
  const shape = new THREE.Shape([new THREE.Vector2(-l, 0), new THREE.Vector2(l, 0), new THREE.Vector2(l, h)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 2 * w, bevelEnabled: false });
  geo.translate(0, 0, -w).rotateY(-Math.PI / 2);
  const m = new THREE.Mesh(geo, std(0xd8b02a, 0.8));
  m.castShadow = true;
  m.receiveShadow = true;
  const g = new THREE.Group();
  g.add(m);
  // Black chevrons on the slope.
  for (let k = 0; k < 4; k++) {
    const t = (k + 0.5) / 4;
    const s = new THREE.Mesh(new THREE.BoxGeometry(2 * w, 0.02, 0.3), std(0x161616));
    s.position.set(0, t * h + 0.01, -l + t * 2 * l);
    s.rotation.x = -Math.atan2(h, 2 * l);
    g.add(s);
  }
  return g;
}

function stumpsMesh() {
  const g = new THREE.Group();
  const wood = std(0xd9c08a, 0.6);
  for (const x of [-0.11, 0, 0.11]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.71, 8), wood);
    s.position.set(x, 0.355, 0);
    s.castShadow = true;
    g.add(s);
  }
  for (const x of [-0.055, 0.055]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.11, 6).rotateZ(Math.PI / 2), wood);
    b.position.set(x, 0.72, 0);
    g.add(b);
  }
  return g;
}

export class Props {
  private items: Prop[] = [];

  constructor(private physics: Physics, private scene: THREE.Scene) {}

  get count() { return this.items.length; }

  spawn(kind: PropKind, x: number, y: number, z: number, heading: number) {
    if (this.items.length >= MAX_PROPS) this.remove(this.items[0]);
    const R = this.physics.R;
    const q = { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
    const fixed = kind === 'ramp';
    const desc = (fixed ? R.RigidBodyDesc.fixed() : R.RigidBodyDesc.dynamic()).setTranslation(x, y, z).setRotation(q);
    const body = this.physics.world.createRigidBody(desc);
    const g = groups(GROUP_WORLD, GROUP_WORLD | GROUP_PLAYER | GROUP_VEHICLE);
    let mesh: THREE.Object3D;
    switch (kind) {
      case 'cone':
        this.physics.world.createCollider(R.ColliderDesc.cone(0.35, 0.18).setTranslation(0, 0.35, 0).setMass(3).setCollisionGroups(g), body);
        mesh = coneMesh();
        break;
      case 'barrel':
        this.physics.world.createCollider(R.ColliderDesc.cylinder(0.44, 0.29).setMass(25).setCollisionGroups(g), body);
        mesh = barrelMesh();
        break;
      case 'stumps':
        this.physics.world.createCollider(R.ColliderDesc.cuboid(0.14, 0.36, 0.03).setTranslation(0, 0.36, 0).setMass(2).setCollisionGroups(g), body);
        mesh = stumpsMesh();
        break;
      case 'ramp':
      default:
        this.physics.world.createCollider(R.ColliderDesc.convexHull(rampPoints())!.setFriction(0.9).setCollisionGroups(g), body);
        mesh = rampMesh();
        break;
    }
    if (kind === 'barrel') body.setTranslation({ x, y: y + 0.45, z }, true);
    this.scene.add(mesh);
    const prop = { kind, body, mesh };
    this.items.push(prop);
    this.sync();
    return prop;
  }

  private remove(p: Prop) {
    this.physics.world.removeRigidBody(p.body);
    this.scene.remove(p.mesh);
    this.items.splice(this.items.indexOf(p), 1);
  }

  clear() {
    while (this.items.length) this.remove(this.items[0]);
  }

  /** Render-rate: copy body poses to meshes. */
  sync() {
    for (const p of this.items) {
      const t = p.body.translation(), r = p.body.rotation();
      p.mesh.position.set(t.x, t.y, t.z);
      p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }
}
