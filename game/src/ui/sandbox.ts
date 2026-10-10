import { PROP_LABELS, type PropKind } from '../actors/props';
import { SPECS, type VehicleKind } from '../actors/vehicle';
import { WEATHERS, type WeatherKind } from '../render/weather';

/** What the sandbox menu can change (wired up in main.ts). */
export interface SandboxHooks {
  spawnVehicle(kind: VehicleKind): void;
  spawnProp(kind: PropKind): void;
  clearProps(): void;
  getHour(): number;
  setHour(h: number): void;
  setClockRunning(on: boolean): void;
  getMonth(): number;
  setMonth(m: number): void;
  setWeather(w: WeatherKind): void;
  setTraffic(scale: number): void;
  setPeople(scale: number): void;
  drone(): void;
  photo(): void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEATHER_LABEL: Record<WeatherKind, string> = { clear: 'Clear', haze: 'Summer haze', rain: 'Monsoon rain' };

/** Sandbox menu (Tab, PROMPT §3.5): spawn vehicles and props; sliders for time, season, weather, traffic and people. */
export class SandboxMenu {
  private root: HTMLDivElement;
  open = false;

  constructor(private hooks: SandboxHooks) {
    this.root = document.createElement('div');
    this.root.id = 'sandbox';
    this.root.hidden = true;
    const vehicles = (Object.keys(SPECS) as VehicleKind[])
      .map((k) => `<button data-vehicle="${k}">${SPECS[k].label}<small>${SPECS[k].topKmh} km/h</small></button>`).join('');
    const props = (Object.keys(PROP_LABELS) as PropKind[])
      .map((k) => `<button data-prop="${k}">${PROP_LABELS[k]}</button>`).join('');
    this.root.innerHTML = `
      <div class="panel wide">
        <h2>Sandbox <small>Tab to close</small></h2>
        <h3>Ride or drive</h3>
        <div class="grid">${vehicles}</div>
        <h3>Props</h3>
        <div class="grid">${props}<button data-clear>Clear props</button></div>
        <h3>World</h3>
        <label>Time <output id="sb-hour-out"></output>
          <input id="sb-hour" type="range" min="0" max="23.75" step="0.25"></label>
        <label class="check"><input id="sb-clock" type="checkbox" checked> Clock runs</label>
        <label>Season
          <select id="sb-month">${MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join('')}</select></label>
        <label>Weather
          <select id="sb-weather">${WEATHERS.map((w) => `<option value="${w}">${WEATHER_LABEL[w]}</option>`).join('')}</select></label>
        <label>Traffic <output id="sb-traffic-out">100%</output>
          <input id="sb-traffic" type="range" min="0" max="2" step="0.1" value="1"></label>
        <label>People <output id="sb-people-out">100%</output>
          <input id="sb-people" type="range" min="0" max="2" step="0.1" value="1"></label>
        <h3>Cameras</h3>
        <div class="grid"><button data-drone>Drone camera</button><button data-photo>Photo mode (P)</button></div>
      </div>`;
    document.body.appendChild(this.root);
    const $ = <T extends HTMLElement>(id: string) => this.root.querySelector<T>(`#${id}`)!;
    this.root.querySelectorAll<HTMLButtonElement>('[data-vehicle]').forEach((b) => b.addEventListener('click', () => {
      this.toggle(false);
      hooks.spawnVehicle(b.dataset.vehicle as VehicleKind);
    }));
    this.root.querySelectorAll<HTMLButtonElement>('[data-prop]').forEach((b) => b.addEventListener('click', () => {
      this.toggle(false);
      hooks.spawnProp(b.dataset.prop as PropKind);
    }));
    this.root.querySelector('[data-clear]')!.addEventListener('click', () => hooks.clearProps());
    this.root.querySelector('[data-drone]')!.addEventListener('click', () => { this.toggle(false); hooks.drone(); });
    this.root.querySelector('[data-photo]')!.addEventListener('click', () => { this.toggle(false); hooks.photo(); });
    const hour = $<HTMLInputElement>('sb-hour');
    hour.addEventListener('input', () => { hooks.setHour(Number(hour.value)); this.refresh(); });
    $<HTMLInputElement>('sb-clock').addEventListener('change', (e) => hooks.setClockRunning((e.target as HTMLInputElement).checked));
    $<HTMLSelectElement>('sb-month').addEventListener('change', (e) => hooks.setMonth(Number((e.target as HTMLSelectElement).value)));
    $<HTMLSelectElement>('sb-weather').addEventListener('change', (e) => hooks.setWeather((e.target as HTMLSelectElement).value as WeatherKind));
    for (const [id, set] of [['sb-traffic', hooks.setTraffic], ['sb-people', hooks.setPeople]] as const) {
      const el = $<HTMLInputElement>(id);
      el.addEventListener('input', () => {
        set(Number(el.value));
        $(`${id}-out`).textContent = `${Math.round(Number(el.value) * 100)}%`;
      });
    }
    // Keys typed into the menu's controls must not drive the game.
    this.root.addEventListener('keydown', (e) => { if (e.code !== 'Tab' && e.code !== 'Escape') e.stopPropagation(); });
  }

  /** Show the current world state in the controls. */
  private refresh() {
    const h = this.hooks.getHour();
    (this.root.querySelector('#sb-hour') as HTMLInputElement).value = String(h);
    const hh = Math.floor(h), mm = Math.round((h - hh) * 60);
    this.root.querySelector('#sb-hour-out')!.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    (this.root.querySelector('#sb-month') as HTMLSelectElement).value = String(this.hooks.getMonth());
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.root.hidden = !this.open;
    if (this.open) {
      this.refresh();
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
}
