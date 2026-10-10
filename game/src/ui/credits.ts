import CREDITS from '../../../CREDITS.md?raw';

/** Credits & data sources (PROMPT §6, §11): rendered from CREDITS.md so the game and the repo never disagree. */
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function render(md: string): string {
  const inline = (t: string) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(https?:\/\/[^\s)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  const out: string[] = [];
  let list = false;
  for (const line of md.split(/\r?\n/)) {
    const li = /^\s*-\s+(.*)/.exec(line);
    if (li) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${inline(li[1])}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    const h = /^(#{1,3})\s+(.*)/.exec(line);
    if (h) out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('');
}

export class Credits {
  private root: HTMLDivElement;
  open = false;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'credits';
    this.root.hidden = true;
    this.root.innerHTML = `<div class="panel wide">${render(CREDITS)}
      <p class="note">Rangilu Rajkot — made by Rakshit Gajera. Code MIT; map data ODbL.</p>
      <button data-close>Close</button></div>`;
    document.body.appendChild(this.root);
    this.root.querySelector('[data-close]')!.addEventListener('click', () => this.toggle(false));
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.root.hidden = !this.open;
  }
}
