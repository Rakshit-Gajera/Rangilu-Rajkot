import type { StreamConfig } from '../world/world';

export type QualityName = 'low' | 'medium' | 'high' | 'ultra';

export interface Quality {
  name: QualityName;
  stream: StreamConfig;
  shadowSize: number; // 0 = no shadows
  maxPixelRatio: number;
  targetFps: number;
  /** Living street caps (PROMPT §9.4–9.5). */
  life: { vehicles: number; peds: number; cows: number };
}

/** Presets (PROMPT §9.6). Low targets a mid-range phone, High a mid laptop at 1080p. */
export const PRESETS: Record<QualityName, Quality> = {
  low: { name: 'low', stream: { near: 450, far: 1200, props: 150, trees: 300, colliders: 300 }, shadowSize: 0, maxPixelRatio: 1, targetFps: 30, life: { vehicles: 50, peds: 80, cows: 8 } },
  medium: { name: 'medium', stream: { near: 750, far: 2000, props: 250, trees: 500, colliders: 300 }, shadowSize: 1024, maxPixelRatio: 1, targetFps: 60, life: { vehicles: 90, peds: 160, cows: 14 } },
  high: { name: 'high', stream: { near: 1100, far: 3000, props: 300, trees: 700, colliders: 300 }, shadowSize: 2048, maxPixelRatio: 1.5, targetFps: 60, life: { vehicles: 150, peds: 300, cows: 20 } },
  ultra: { name: 'ultra', stream: { near: 1500, far: 4000, props: 450, trees: 1100, colliders: 350 }, shadowSize: 4096, maxPixelRatio: 2, targetFps: 60, life: { vehicles: 200, peds: 400, cows: 28 } },
};

function stored(): QualityName | null {
  try {
    const v = localStorage.getItem('rr.quality');
    return v && v in PRESETS ? (v as QualityName) : null;
  } catch {
    return null;
  }
}

export function storeQuality(name: QualityName) {
  try {
    localStorage.setItem('rr.quality', name);
  } catch {
    /* storage unavailable: the choice lasts for this session only */
  }
}

/** Pick a preset: ?quality= override, then the saved choice, then a hardware guess. */
export function pickQuality(params: URLSearchParams, gl: WebGL2RenderingContext | null): Quality {
  const q = params.get('quality');
  if (q && q in PRESETS) return PRESETS[q as QualityName];
  const saved = stored();
  if (saved) return PRESETS[saved];
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 900);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  let renderer = '';
  try {
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    renderer = ext ? String(gl!.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  } catch { /* not exposed */ }
  const software = /SwiftShader|llvmpipe|Software/i.test(renderer);
  const integrated = /Intel|UHD|Iris|Mali|Adreno|PowerVR|Apple GPU/i.test(renderer);
  if (mobile || software || mem <= 4) return PRESETS.low;
  if (integrated || cores <= 4) return PRESETS.medium;
  if (/RTX [34-9]0|RX [67-9]\d00|Radeon Pro|M[2-4] (Pro|Max)/i.test(renderer) && cores >= 8) return PRESETS.ultra;
  return PRESETS.high;
}

/** Dynamic resolution: trades pixel ratio for frame rate (PROMPT §9.6). */
export class DynamicResolution {
  private acc = 0;
  private frames = 0;
  ratio: number;

  constructor(private max: number, private targetFps: number) {
    this.ratio = max;
  }

  /** Feed the frame time (s); returns a new pixel ratio when it should change, else null. */
  sample(dt: number): number | null {
    this.acc += dt;
    this.frames++;
    // Resizing reallocates the drawing buffers (a hitch), so decide over 5 s and move in clear steps.
    if (this.acc < 5) return null;
    const fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    let next = this.ratio;
    if (fps < this.targetFps * 0.8) next = Math.max(this.max * 0.55, this.ratio - 0.15);
    else if (fps > this.targetFps * 0.98) next = Math.min(this.max, this.ratio + 0.1);
    if (Math.abs(next - this.ratio) < 0.05) return null;
    this.ratio = next;
    return next;
  }
}
