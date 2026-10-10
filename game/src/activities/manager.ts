import type { Activity, ActivityContext } from './activity';
import { BrtsDriver } from './brts';
import { FarsanDelivery } from './delivery';
import { Garba } from './garba';
import { KiteFight } from './kite';
import { GullyCricket } from './cricket';
import { Lokmelo } from './lokmelo';
import { RickshawRides } from './rickshaw';
import { TimeTrial } from './timetrial';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Activities menu (J), the running activity's panel, and quitting (X) — PROMPT §3.6, §10. */
export class Activities {
  readonly list: Activity[] = [new RickshawRides(), new FarsanDelivery(), new TimeTrial(), new BrtsDriver(), new Garba(), new KiteFight(), new GullyCricket(), new Lokmelo()];
  current: Activity | null = null;
  open = false;
  private menu: HTMLDivElement;
  private panel: HTMLDivElement;
  private starting = false;

  constructor(private ctx: ActivityContext, private describeBest: (a: Activity) => string) {
    this.menu = document.createElement('div');
    this.menu.id = 'activities';
    this.menu.hidden = true;
    this.panel = document.createElement('div');
    this.panel.id = 'activity-panel';
    this.panel.hidden = true;
    document.body.append(this.menu, this.panel);
    this.menu.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-start]');
      if (b) void this.start(this.list.find((a) => a.id === b.dataset.start)!);
      if ((e.target as HTMLElement).closest('[data-close]')) this.toggle(false);
    });
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.menu.hidden = !this.open;
    if (!this.open) return;
    if (document.pointerLockElement) document.exitPointerLock();
    const rows = this.list.map((a) => {
      const why = a.canStart(this.ctx);
      const best = this.describeBest(a);
      return `<li><b>${esc(a.title)}</b><span>${esc(a.blurb)}</span>${best ? `<small>Best: ${esc(best)}</small>` : ''}
        ${why ? `<small class="why">${esc(why)}</small>` : ''}
        <button data-start="${a.id}" ${why ? 'disabled' : ''}>${this.current === a ? 'Running' : 'Start'}</button></li>`;
    }).join('');
    this.menu.innerHTML = `<div class="panel wide"><h2>Activities <small>J to close · X quits a running one</small></h2>
      <ul>${rows}</ul><button data-close>Close</button></div>`;
  }

  async start(a: Activity) {
    if (this.starting || a.canStart(this.ctx)) return;
    this.starting = true;
    this.quit();
    this.toggle(false);
    try {
      await a.start(this.ctx);
      this.current = a;
      this.panel.hidden = false;
    } finally {
      this.starting = false;
    }
  }

  quit(summary?: string) {
    if (!this.current) return;
    this.current.end(this.ctx);
    this.current = null;
    this.panel.hidden = true;
    if (summary) this.ctx.flash(summary);
  }

  update(dt: number) {
    const a = this.current;
    if (!a) return;
    const r = a.update(dt, this.ctx);
    if (r.done) {
      this.quit(r.summary);
      return;
    }
    this.panel.innerHTML = `<b>${esc(a.title)}</b> <small>X to quit</small><div>${a.status()}</div>`;
  }
}
