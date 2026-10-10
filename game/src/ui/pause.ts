import { PRESETS, storeQuality, type QualityName } from '../app/quality';
import { storeSettings, type Settings } from '../app/settings';

/** Pause menu (Esc): resume, quality preset, controls. Plain DOM over the canvas (PROMPT §4.1). */
export class PauseMenu {
  private root: HTMLDivElement;
  open = false;

  constructor(current: QualityName, saves: { exportSave(): void; importSave(): void } | undefined,
    private settings: Settings, private onSettings: (s: Settings) => void, private onCredits: () => void) {
    this.root = document.createElement('div');
    this.root.id = 'pause';
    this.root.hidden = true;
    const options = (Object.keys(PRESETS) as QualityName[])
      .map((q) => `<option value="${q}"${q === current ? ' selected' : ''}>${q[0].toUpperCase()}${q.slice(1)}</option>`)
      .join('');
    this.root.innerHTML = `
      <div class="panel">
        <h2>Paused</h2>
        <button id="pause-resume">Resume</button>
        <label>Graphics quality
          <select id="pause-quality">${options}</select>
        </label>
        <p class="note">Changing quality reloads the game.</p>
        <h3>Settings</h3>
        <label>Volume <input id="set-volume" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label>
        <label>Mouse sensitivity <input id="set-sens" type="range" min="0.3" max="3" step="0.1" value="${settings.sensitivity}"></label>
        <label>Field of view <input id="set-fov" type="range" min="50" max="90" step="1" value="${settings.fov}"></label>
        <label class="check"><input id="set-invert" type="checkbox" ${settings.invertY ? 'checked' : ''}> Invert mouse up/down</label>
        <label class="check"><input id="set-help" type="checkbox" ${settings.help ? 'checked' : ''}> Show key hints</label>
        <h3>Save</h3>
        <p class="note">The game saves itself every 15 seconds in this browser.</p>
        <div class="row"><button id="pause-export">Export save file</button><button id="pause-import">Import save file</button></div>
        <h3>Controls</h3>
        <ul>
          <li><b>WASD</b> move / ride · <b>Shift</b> sprint · <b>Space</b> jump / brake</li>
          <li><b>E</b> get on or off any vehicle (even one in traffic) · <b>H</b> horn</li>
          <li><b>R</b> reset the vehicle; on foot, bring your scooter</li>
          <li><b>M</b> map: click to set a waypoint, <b>F</b> to fast travel</li>
          <li><b>Tab</b> sandbox: spawn vehicles and props, time, season, weather, traffic</li>
          <li><b>J</b> activities (<b>X</b> quits one) · <b>L</b> discovery log</li>
          <li><b>P</b> photo mode · <b>C</b> camera · <b>T</b> +1 hour · <b>F3</b> performance</li>
        </ul>
        <button id="pause-credits" class="plain">Credits &amp; data sources</button>
      </div>`;
    document.body.appendChild(this.root);
    const bind = (id: string, apply: (el: HTMLInputElement) => void) => {
      const el = this.root.querySelector<HTMLInputElement>(`#${id}`)!;
      el.addEventListener('input', () => { apply(el); storeSettings(this.settings); this.onSettings(this.settings); });
    };
    bind('set-volume', (el) => { this.settings.volume = Number(el.value); });
    bind('set-sens', (el) => { this.settings.sensitivity = Number(el.value); });
    bind('set-fov', (el) => { this.settings.fov = Number(el.value); });
    bind('set-invert', (el) => { this.settings.invertY = el.checked; });
    bind('set-help', (el) => { this.settings.help = el.checked; });
    this.root.querySelector('#pause-credits')!.addEventListener('click', () => this.onCredits());
    // Keys typed into the menu's controls must not drive the game.
    this.root.addEventListener('keydown', (e) => { if (e.code !== 'Escape') e.stopPropagation(); });
    this.root.querySelector('#pause-resume')!.addEventListener('click', () => this.toggle(false));
    this.root.querySelector('#pause-export')!.addEventListener('click', () => saves?.exportSave());
    this.root.querySelector('#pause-import')!.addEventListener('click', () => saves?.importSave());
    this.root.querySelector('#pause-quality')!.addEventListener('change', (e) => {
      const q = (e.target as HTMLSelectElement).value as QualityName;
      storeQuality(q);
      // Also carried in the URL, so the choice survives the reload even without storage.
      const url = new URL(location.href);
      url.searchParams.set('quality', q);
      location.replace(url);
    });
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.root.hidden = !this.open;
    if (this.open && document.pointerLockElement) document.exitPointerLock();
  }
}
