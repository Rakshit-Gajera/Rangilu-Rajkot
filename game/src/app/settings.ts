/** Player settings (PROMPT §9.10): kept in localStorage when available; defaults otherwise. */
export interface Settings {
  volume: number; // 0..1
  sensitivity: number; // mouse look multiplier, 0.3..3
  invertY: boolean;
  fov: number; // degrees, 50..90
  help: boolean; // key hints on the HUD
  lang: 'en' | 'gu';
  name: string;
  skin: number; // index into SKIN_TONES
  shirt: number; // shirt colour (hex)
  uiScale: number; // 0.8..1.6
  reduceMotion: boolean; // no FOV kick, no automatic camera swing
  keys: Record<string, string>; // action (default key code) -> chosen key code
}

/** Remappable actions: default key code -> label. */
export const ACTIONS: [string, string][] = [
  ['KeyW', 'Forward / accelerate'], ['KeyS', 'Back / brake'], ['KeyA', 'Left'], ['KeyD', 'Right'],
  ['ShiftLeft', 'Sprint'], ['Space', 'Jump / handbrake'], ['KeyE', 'Get on/off · interact'], ['KeyH', 'Horn'],
  ['KeyR', 'Reset vehicle / bring scooter'], ['KeyM', 'Map'], ['Tab', 'Sandbox'], ['KeyJ', 'Activities'],
  ['KeyX', 'Quit activity'], ['KeyL', 'Discovery log'], ['KeyP', 'Photo mode'], ['KeyC', 'Camera'], ['KeyT', '+1 hour'],
];

const KEY = 'rr.settings';
export const DEFAULT_SETTINGS: Settings = { volume: 0.8, sensitivity: 1, invertY: false, fov: 62, help: true, lang: 'en', name: '', skin: 2, shirt: 0x6f9fd8, uiScale: 1, reduceMotion: false, keys: {} };

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
      lang: raw.lang === 'gu' ? 'gu' : 'en',
      name: typeof raw.name === 'string' ? raw.name.slice(0, 24) : '',
      skin: num(raw.skin, 2, 0, 4),
      shirt: num(raw.shirt, 0x6f9fd8, 0, 0xffffff),
      uiScale: num(raw.uiScale, 1, 0.8, 1.6),
      reduceMotion: raw.reduceMotion === true,
      keys: raw.keys && typeof raw.keys === 'object'
        ? Object.fromEntries(Object.entries(raw.keys as Record<string, unknown>).filter(([a, k]) => ACTIONS.some(([d]) => d === a) && typeof k === 'string').map(([a, k]) => [a, String(k).slice(0, 20)]))
        : {},
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function storeSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
