import { DISCOVERIES } from '../data/discoveries';

interface Place { id: string; x: number; n: number }

const RADIUS = 80; // metres: close enough to count as a visit

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/**
 * Discovery log (PROMPT §3.5): visiting a landmark unlocks its card; the log (L) lists them all, and
 * discovered places can be travelled to. Visits are checked twice a second.
 */
export class DiscoveryLog {
  private places: Place[];
  private found: Set<string>;
  private timer = 0;
  private card: HTMLDivElement;
  private log: HTMLDivElement;
  private cardTimer = 0;
  open = false;

  constructor(labels: { id?: string; x: number; n: number; kind: string }[], discovered: string[],
    private onDiscover: (id: string, total: number) => void, private onTravel: (x: number, n: number) => void) {
    this.places = labels.filter((l) => l.kind === 'landmark' && l.id && DISCOVERIES[l.id]).map((l) => ({ id: l.id!, x: l.x, n: l.n }));
    this.found = new Set(discovered.filter((d) => DISCOVERIES[d]));
    this.card = document.createElement('div');
    this.card.id = 'discovery-card';
    this.card.hidden = true;
    this.log = document.createElement('div');
    this.log.id = 'discovery-log';
    this.log.hidden = true;
    document.body.append(this.card, this.log);
    this.log.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-go]');
      if (b) {
        const p = this.places.find((q) => q.id === b.dataset.go);
        if (p) { this.toggle(false); this.onTravel(p.x, p.n); }
      }
      if ((e.target as HTMLElement).closest('[data-close]')) this.toggle(false);
    });
  }

  get discovered(): string[] { return [...this.found]; }
  get total(): number { return this.places.length; }

  update(x: number, n: number, dt: number) {
    if (this.cardTimer > 0 && (this.cardTimer -= dt) <= 0) this.card.hidden = true;
    if ((this.timer -= dt) > 0) return;
    this.timer = 0.5;
    for (const p of this.places) {
      if (this.found.has(p.id) || Math.hypot(p.x - x, p.n - n) > RADIUS) continue;
      this.found.add(p.id);
      this.show(p.id);
      this.onDiscover(p.id, this.found.size);
    }
  }

  private show(id: string) {
    const d = DISCOVERIES[id];
    this.card.innerHTML = `<small>Discovered · ${this.found.size}/${this.places.length}</small>
      <h3>${esc(d.title)}${d.gu ? ` <span lang="gu">${esc(d.gu)}</span>` : ''}</h3>
      ${d.facts.map((f) => `<p>${esc(f)}</p>`).join('')}<small>Source: ${esc(d.source)} · L for the log</small>`;
    this.card.hidden = false;
    this.cardTimer = 10;
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.log.hidden = !this.open;
    if (!this.open) return;
    if (document.pointerLockElement) document.exitPointerLock();
    const rows = this.places
      .slice()
      .sort((a, b) => Number(this.found.has(b.id)) - Number(this.found.has(a.id)))
      .map((p) => {
        const d = DISCOVERIES[p.id];
        if (!this.found.has(p.id)) return `<li class="locked"><b>???</b><span>Not yet visited — explore the city</span></li>`;
        return `<li><b>${esc(d.title)}${d.gu ? ` <span lang="gu">${esc(d.gu)}</span>` : ''}</b>
          ${d.facts.map((f) => `<span>${esc(f)}</span>`).join('')}
          <small>Source: ${esc(d.source)}</small><button data-go="${p.id}">Travel here</button></li>`;
      }).join('');
    this.log.innerHTML = `<div class="panel wide"><h2>Discovery log <small>${this.found.size}/${this.places.length} · L to close</small></h2>
      <ul>${rows}</ul><button data-close>Close</button></div>`;
  }
}
