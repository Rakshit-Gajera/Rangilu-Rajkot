/**
 * Saves (PROMPT §9.10): position, vehicle, outfit, money, discoveries, activity records, settings.
 * localStorage, every call wrapped: the game works fully without storage. Export/import as a JSON file.
 */
export interface SaveData {
  v: 1;
  pos: [number, number, number] | null;
  vehicle: string | null; // kind being driven when saved
  outfit: string;
  money: number;
  discovered: string[];
  records: Record<string, number>; // activity id → best score (higher is better)
  settings: { weather: string; traffic: number; people: number };
}

const KEY = 'rr.save';

export function freshSave(): SaveData {
  return { v: 1, pos: null, vehicle: null, outfit: 'casual', money: 200, discovered: [], records: {},
    settings: { weather: 'clear', traffic: 1, people: 1 } };
}

/** Accept only well-formed data (imported files are untrusted). */
export function sanitize(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<SaveData>;
  if (r.v !== 1) return null;
  const base = freshSave();
  const num = (x: unknown, d: number) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const pos = Array.isArray(r.pos) && r.pos.length === 3 && r.pos.every((x) => typeof x === 'number' && Number.isFinite(x))
    ? (r.pos as [number, number, number]) : null;
  const records: Record<string, number> = {};
  if (r.records && typeof r.records === 'object') {
    for (const [k, v] of Object.entries(r.records)) if (typeof v === 'number' && Number.isFinite(v)) records[String(k).slice(0, 40)] = v;
  }
  return {
    v: 1,
    pos,
    vehicle: typeof r.vehicle === 'string' ? r.vehicle.slice(0, 20) : null,
    outfit: typeof r.outfit === 'string' ? r.outfit.slice(0, 20) : base.outfit,
    money: Math.max(0, Math.min(1e9, Math.round(num(r.money, base.money)))),
    discovered: Array.isArray(r.discovered) ? r.discovered.filter((d): d is string => typeof d === 'string').map((d) => d.slice(0, 40)).slice(0, 200) : [],
    records,
    settings: {
      weather: typeof r.settings?.weather === 'string' ? r.settings.weather : base.settings.weather,
      traffic: Math.max(0, Math.min(2, num(r.settings?.traffic, 1))),
      people: Math.max(0, Math.min(2, num(r.settings?.people, 1))),
    },
  };
}

export function loadSave(): SaveData {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return sanitize(JSON.parse(s)) ?? freshSave();
  } catch { /* storage unavailable or corrupt: start fresh */ }
  return freshSave();
}

export function storeSave(d: SaveData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function exportSave(d: SaveData) {
  const blob = new Blob([JSON.stringify(d, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rangilu-rajkot-save.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Ask for a save file; resolves with the parsed save, or null if cancelled/invalid. */
export function importSave(): Promise<SaveData | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f || f.size > 1_000_000) return resolve(null);
      try {
        resolve(sanitize(JSON.parse(await f.text())));
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}
