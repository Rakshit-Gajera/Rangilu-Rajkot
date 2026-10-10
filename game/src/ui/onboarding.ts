/**
 * Onboarding (PROMPT §13 P6): a welcome card on the first visit, then a few timed tips.
 * Remembered in localStorage (shown again if storage is unavailable — harmless).
 */
const KEY = 'rr.onboarded';

const TIPS_KEYS = [
  [6, 'Walk up to your scooter and press E to ride. WASD to drive, H for the horn.'],
  [30, 'M opens the map: double-click anywhere to teleport there.'],
  [60, 'J for activities (rickshaw rides, deliveries, garba…), Tab for the sandbox.'],
  [95, 'Visit landmarks to fill your discovery log (L). Esc for settings.'],
] as const;
const TIPS_TOUCH = [
  [6, 'Use the stick to walk, drag on the right to look. Tap E near your scooter to ride.'],
  [30, 'Tap 🗺 for the map: double-tap anywhere to teleport there.'],
  [60, 'Tap ★ for activities and ⚙ for the sandbox.'],
] as const;

export class Onboarding {
  private t = 0;
  private next = 0;
  private card: HTMLDivElement | null = null;
  private tips: readonly (readonly [number, string])[];
  active: boolean;

  constructor(touch: boolean, private flash: (text: string) => void, home: boolean, after?: Promise<void>) {
    this.tips = touch ? TIPS_TOUCH : TIPS_KEYS;
    let seen = false;
    try { seen = localStorage.getItem(KEY) === '1'; } catch { /* no storage */ }
    this.active = !seen && !navigator.webdriver;
    if (!this.active) return;
    this.card = document.createElement('div');
    this.card.id = 'welcome';
    this.card.innerHTML = `<div class="panel">
      <h2>Rangilu Rajkot <span lang="gu">રંગીલું રાજકોટ</span></h2>
      <p>${home ? 'You start at home.' : 'You start at Race Course.'} The whole city is yours: ride, drive, explore, or try an activity.
        No combat — just Rajkot.</p>
      <ul>
        ${touch ? '<li>Stick to move · drag right side to look · E to get on/off</li>'
          : '<li><b>WASD</b> move · <b>mouse</b> look (click the game) · <b>Shift</b> sprint</li><li><b>E</b> get on/off any vehicle · <b>H</b> horn · <b>M</b> map</li>'}
      </ul>
      <button>Let's go</button></div>`;
    document.body.appendChild(this.card);
    if (after) {
      // Wait for the title screen.
      this.card.hidden = true;
      void after.then(() => { if (this.card) this.card.hidden = false; });
    }
    this.card.querySelector('button')!.addEventListener('click', () => this.close());
  }

  private close() {
    this.card?.remove();
    this.card = null;
    try { localStorage.setItem(KEY, '1'); } catch { /* fine */ }
  }

  get blocking() { return !!this.card && !this.card.hidden; }

  update(dt: number) {
    if (!this.active || this.card) return;
    this.t += dt;
    while (this.next < this.tips.length && this.t >= this.tips[this.next][0]) this.flash(this.tips[this.next++][1]);
    if (this.next >= this.tips.length) this.active = false;
  }
}
