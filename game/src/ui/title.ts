import { OUTFITS, SKIN_TONES, type Character } from '../actors/character';
import { getLang, setLang, t } from '../app/i18n';
import type { Settings } from '../app/settings';

/**
 * Title screen (PROMPT §3.1): the camera circles over the Race Course ring at golden hour (main.ts drives the
 * orbit while `open`), with the English / ગુજરાતી toggle and character setup (name, skin tone, outfit colour).
 */
const SHIRTS = [0x6f9fd8, 0xe0b04a, 0xc0263f, 0x1f8a70, 0xf4f1ea, 0x2b2b2b, 0x7b2cbf, 0xe76f51];

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export class TitleScreen {
  open = true;
  private root: HTMLDivElement;
  private done: Promise<void>;
  private resolve!: () => void;

  constructor(private settings: Settings, private character: Character, private onSettings: (s: Settings) => void) {
    this.root = document.createElement('div');
    this.root.id = 'title';
    document.body.appendChild(this.root);
    this.done = new Promise((r) => (this.resolve = r));
    this.applyLook();
    this.render();
  }

  /** Resolves when the player presses Play. */
  wait() { return this.done; }

  private applyLook() {
    this.character.setSkin(SKIN_TONES[this.settings.skin] ?? SKIN_TONES[2]);
    this.character.setOutfit({ ...OUTFITS.casual, top: this.settings.shirt });
  }

  private render() {
    const s = this.settings;
    this.root.innerHTML = `
      <div class="brand"><h1>${t('title')}</h1><p>${t('tagline')}</p></div>
      <div class="setup">
        <label>${t('name')}<input id="t-name" maxlength="24" value="${esc(s.name)}" placeholder="Rakshit"></label>
        <div class="row-label">${t('skin')}</div>
        <div class="swatches">${SKIN_TONES.map((c, i) => `<button data-skin="${i}" class="${i === s.skin ? 'on' : ''}" style="background:${hex(c)}" aria-label="${t('skin')} ${i + 1}"></button>`).join('')}</div>
        <div class="row-label">${t('shirtColour')}</div>
        <div class="swatches">${SHIRTS.map((c) => `<button data-shirt="${c}" class="${c === s.shirt ? 'on' : ''}" style="background:${hex(c)}" aria-label="${hex(c)}"></button>`).join('')}</div>
        <div class="actions"><button id="t-play" class="play">${t('play')}</button><button id="t-lang">${t('language')}</button></div>
      </div>`;
    const name = this.root.querySelector<HTMLInputElement>('#t-name')!;
    name.addEventListener('input', () => { s.name = name.value.trim(); this.onSettings(s); });
    name.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.play(); });
    this.root.querySelectorAll<HTMLButtonElement>('[data-skin]').forEach((b) => b.addEventListener('click', () => {
      s.skin = Number(b.dataset.skin);
      this.onSettings(s);
      this.applyLook();
      this.render();
    }));
    this.root.querySelectorAll<HTMLButtonElement>('[data-shirt]').forEach((b) => b.addEventListener('click', () => {
      s.shirt = Number(b.dataset.shirt);
      this.onSettings(s);
      this.applyLook();
      this.render();
    }));
    this.root.querySelector('#t-play')!.addEventListener('click', () => this.play());
    this.root.querySelector('#t-lang')!.addEventListener('click', () => {
      s.lang = getLang() === 'en' ? 'gu' : 'en';
      setLang(s.lang);
      this.onSettings(s);
      this.render();
    });
  }

  private play() {
    if (!this.open) return;
    this.open = false;
    this.root.classList.add('out');
    setTimeout(() => this.root.remove(), 600);
    this.resolve();
  }
}
