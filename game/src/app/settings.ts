/** Player settings (PROMPT §9.10): kept in localStorage when available; defaults otherwise. */
export interface Settings {
  volume: number; // 0..1
  sensitivity: number; // mouse look multiplier, 0.3..3
  invertY: boolean;
  fov: number; // degrees, 50..90
  help: boolean; // key hints on the HUD
}

const KEY = 'rr.settings';
export const DEFAULT_SETTINGS: Settings = { volume: 0.8, sensitivity: 1, invertY: false, fov: 62, help: true };

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
    return {
      volume: num(raw.volume, DEFAULT_SETTINGS.volume, 0, 1),
      sensitivity: num(raw.sensitivity, 1, 0.3, 3),
      invertY: raw.invertY === true,
      fov: num(raw.fov, 62, 50, 90),
      help: raw.help !== false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function storeSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
