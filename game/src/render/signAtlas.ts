import * as THREE from 'three';
import { ATLAS_COLS, ATLAS_ROWS, type SignSpec } from '../gen/signs';
import { worldUniforms } from './materials';

const CELL_W = 256, CELL_H = 32; // 4 × 32 cells in a 1024² texture: up to 128 boards per tile

/** Draw a tile's signboards into one texture: English name on top, Gujarati below (PROMPT §7.10). */
export function signAtlas(specs: SignSpec[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * ATLAS_COLS;
  canvas.height = CELL_H * ATLAS_ROWS;
  const ctx = canvas.getContext('2d')!;
  specs.forEach((s, k) => {
    const x = (k % ATLAS_COLS) * CELL_W, y = Math.floor(k / ATLAS_COLS) * CELL_H;
    ctx.fillStyle = s.bg;
    ctx.fillRect(x, y, CELL_W, CELL_H);
    ctx.strokeStyle = s.fg;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, y + 2, CELL_W - 4, CELL_H - 4);
    ctx.fillStyle = s.fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fit(ctx, s.en.toUpperCase(), '700', 'Noto Sans, sans-serif', 12, x + CELL_W / 2, y + 10, CELL_W - 12);
    fit(ctx, s.gu, '600', '"Noto Sans Gujarati", sans-serif', 12, x + CELL_W / 2, y + 23, CELL_W - 12);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function fit(ctx: CanvasRenderingContext2D, text: string, weight: string, family: string, size: number,
  x: number, y: number, maxW: number) {
  let px = size;
  ctx.font = `${weight} ${px}px ${family}`;
  while (ctx.measureText(text).width > maxW && px > 10) {
    px -= 1;
    ctx.font = `${weight} ${px}px ${family}`;
  }
  ctx.fillText(text, x, y);
}

/** Signboard material: the atlas, lit from behind at night. */
export function signMaterial(tex: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, roughness: 0.6 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = worldUniforms.uNight;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= 0.55 * uNight;');
  };
  m.customProgramCacheKey = () => 'sign-v1';
  return m;
}
