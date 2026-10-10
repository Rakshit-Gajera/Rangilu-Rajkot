import type * as RAPIER from '@dimforge/rapier3d';
import * as THREE from 'three';
import { landmarkColliders, landmarkModel, type Board, type LandmarkModel } from '../gen/landmarks';
import { GROUP_PLAYER, GROUP_VEHICLE, GROUP_WORLD, groups, type Physics } from '../physics/physics';
import { vertexColorMaterial } from '../render/materials';

/** A landmark model site from map.json (pipeline/rajkot_bake/sites.py). */
export interface Site { id: string; model: LandmarkModel; name: string; x: number; n: number; w: number; d: number; angle: number; fx: number; fn: number }

interface Built { group: THREE.Group; body: RAPIER.RigidBody; textures: THREE.Texture[] }

const SHOW = 1600, HIDE = 2000;

/** Name board texture: English on top, Gujarati below. */
function boardTexture(bd: Board): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  const ratio = bd.w / bd.h;
  c.height = 128;
  c.width = Math.min(2048, Math.round(128 * ratio));
  const g = c.getContext('2d')!;
  g.fillStyle = bd.bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = bd.fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const fit = (text: string, size: number, y: number, font: string) => {
    let s = size;
    do { g.font = `700 ${s}px ${font}`; s -= 2; } while (g.measureText(text).width > c.width * 0.92 && s > 10);
    g.fillText(text, c.width / 2, y);
  };
  if (bd.sub) {
    fit(bd.text, 54, 40, '"Noto Sans", sans-serif');
    fit(bd.sub, 42, 96, '"Noto Sans Gujarati", sans-serif');
  } else fit(bd.text, 72, 64, '"Noto Sans", sans-serif');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Hand-built landmark models (PROMPT §7.11), placed at their real sites near the player with colliders.
 * The generic building that stood there was removed in the bake.
 */
export class LandmarkModels {
  private built = new Map<string, Built>();
  private mat = vertexColorMaterial({ roughness: 0.75 });
  private timer = 0;

  constructor(private sites: Site[], private scene: THREE.Scene, private physics: Physics, private shadows: boolean) {}

  update(dt: number, x: number, n: number, groundAt: (x: number, n: number) => number | null) {
    if ((this.timer -= dt) > 0) return;
    this.timer = 1;
    for (const s of this.sites) {
      const d = Math.hypot(s.x - x, s.n - n);
      const have = this.built.get(s.id);
      if (!have && d < SHOW) {
        const y = groundAt(s.x, s.n);
        if (y !== null) this.build(s, y);
      } else if (have && d > HIDE) this.drop(s.id, have);
    }
  }

  private build(s: Site, y: number) {
    const { geo, boards } = landmarkModel(s.model, s.w, s.d, s.name, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(geo.position, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(geo.normal, 3));
    g.setAttribute('color', new THREE.BufferAttribute(geo.attrs.color[0], 3));
    g.setIndex(new THREE.BufferAttribute(geo.index, 1));
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(g, this.mat);
    mesh.castShadow = mesh.receiveShadow = this.shadows;
    group.add(mesh);
    const textures: THREE.Texture[] = [];
    for (const bd of boards) {
      const tex = boardTexture(bd);
      textures.push(tex);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(bd.w, bd.h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
      m.position.set(bd.x, bd.y, bd.z);
      group.add(m);
    }
    // Model +z faces (fx, fn); three.js: x east, z = −north.
    const yaw = Math.atan2(s.fx, -s.fn);
    group.position.set(s.x, y, -s.n);
    group.rotation.y = yaw;
    this.scene.add(group);
    const R = this.physics.R;
    const q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    const body = this.physics.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(s.x, y, -s.n).setRotation(q));
    for (const [cx, cy, cz, hx, hy, hz] of landmarkColliders(s.model, s.w, s.d)) {
      this.physics.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, cz)
        .setCollisionGroups(groups(GROUP_WORLD, GROUP_WORLD | GROUP_PLAYER | GROUP_VEHICLE)), body);
    }
    this.built.set(s.id, { group, body, textures });
  }

  private drop(id: string, b: Built) {
    this.scene.remove(b.group);
    b.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); if (m.material !== this.mat) (m.material as THREE.Material).dispose(); }
    });
    for (const t of b.textures) t.dispose();
    this.physics.world.removeRigidBody(b.body);
    this.built.delete(id);
  }

  get count() { return this.built.size; }
}
