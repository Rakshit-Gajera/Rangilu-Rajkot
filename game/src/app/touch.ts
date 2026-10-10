import type { Input } from './input';

/**
 * Touch controls (PROMPT §9.9): a virtual stick on the left (WASD), drag on the right half to look,
 * and buttons for get on/off, jump/brake, horn, map, sandbox, activities and the menu.
 * They drive the same Input as the keyboard, so the game needs no touch-specific code.
 */
const BUTTONS: [string, string, boolean][] = [ // label, key code, hold (true) or tap
  ['E', 'KeyE', false], ['⤒', 'Space', true], ['📯', 'KeyH', false], ['🗺', 'KeyM', false],
  ['⚙', 'Tab', false], ['★', 'KeyJ', false], ['☰', 'Escape', false],
];

export function enableTouch(input: Input) {
  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `<div class="stick"><i></i></div><div class="look"></div>
    <div class="buttons">${BUTTONS.map(([l, c]) => `<button data-code="${c}">${l}</button>`).join('')}</div>`;
  document.body.appendChild(root);
  const stick = root.querySelector<HTMLDivElement>('.stick')!, knob = stick.querySelector('i')!;
  let stickId: number | null = null;
  const setDir = (dx: number, dy: number) => {
    const t = 0.35;
    input.setHeld('KeyW', dy < -t);
    input.setHeld('KeyS', dy > t);
    input.setHeld('KeyA', dx < -t);
    input.setHeld('KeyD', dx > t);
    input.setHeld('ShiftLeft', Math.hypot(dx, dy) > 0.95); // push to the edge to sprint
  };
  stick.addEventListener('pointerdown', (e) => { stickId = e.pointerId; stick.setPointerCapture(e.pointerId); move(e); });
  const move = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    const r = stick.getBoundingClientRect();
    let dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
    setDir(dx, dy);
  };
  stick.addEventListener('pointermove', move);
  const end = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null;
    knob.style.transform = '';
    setDir(0, 0);
  };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
  // Look: drag anywhere on the right half.
  const look = root.querySelector<HTMLDivElement>('.look')!;
  const last = new Map<number, [number, number]>();
  look.addEventListener('pointerdown', (e) => { last.set(e.pointerId, [e.clientX, e.clientY]); look.setPointerCapture(e.pointerId); });
  look.addEventListener('pointermove', (e) => {
    const p = last.get(e.pointerId);
    if (!p) return;
    input.mouseDX += (e.clientX - p[0]) * 1.6;
    input.mouseDY += (e.clientY - p[1]) * 1.6;
    last.set(e.pointerId, [e.clientX, e.clientY]);
  });
  const lift = (e: PointerEvent) => last.delete(e.pointerId);
  look.addEventListener('pointerup', lift);
  look.addEventListener('pointercancel', lift);
  root.querySelectorAll<HTMLButtonElement>('.buttons button').forEach((b) => {
    const code = b.dataset.code!, hold = BUTTONS.find((x) => x[1] === code)![2];
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (hold) input.setHeld(code, true);
      input.tap(code);
    });
    if (hold) for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => input.setHeld(code, false));
  });
}

export function isTouchDevice(): boolean {
  return matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
}
