import { PRESETS, storeQuality, type QualityName } from '../app/quality';

/** Pause menu (Esc): resume, quality preset, controls. Plain DOM over the canvas (PROMPT §4.1). */
export class PauseMenu {
  private root: HTMLDivElement;
  open = false;

  constructor(current: QualityName) {
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
        <h3>Controls</h3>
        <ul>
          <li><b>WASD</b> move / ride · <b>Shift</b> sprint · <b>Space</b> jump / brake</li>
          <li><b>E</b> get on or off the scooter · <b>H</b> horn · <b>R</b> reset scooter</li>
          <li><b>M</b> map: click to set a waypoint, <b>F</b> to fast travel</li>
          <li><b>C</b> camera · <b>T</b> +1 hour · <b>F3</b> performance</li>
        </ul>
      </div>`;
    document.body.appendChild(this.root);
    this.root.querySelector('#pause-resume')!.addEventListener('click', () => this.toggle(false));
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
