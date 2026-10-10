/** Keyboard + mouse state. Mouse look uses pointer lock (click the canvas). */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  /** Keys currently held by a gamepad (kept apart so the pad never releases a keyboard key). */
  private padDown = new Set<string>();
  gamepad = false;
  /** Remapped keys: physical code -> the default code of the action it now does ('' = unbound). */
  private remap = new Map<string, string>();
  /** While set, the next key press goes here instead of the game (key binding UI). */
  capture: ((code: string) => void) | null = null;

  /** bindings: action (its default key code) -> chosen physical key code. */
  setBindings(bindings: Record<string, string>) {
    this.remap.clear();
    for (const [action, key] of Object.entries(bindings)) {
      if (key === action) continue;
      if (!this.remap.has(action)) this.remap.set(action, ''); // the old key no longer does it
      this.remap.set(key, action);
    }
  }

  private map(code: string) {
    return this.remap.has(code) ? this.remap.get(code)! : code;
  }
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (this.capture) { e.preventDefault(); const c = this.capture; this.capture = null; c(e.code); return; }
      if (e.code === 'Tab' || e.code === 'F3' || e.code === 'Space') e.preventDefault();
      const code = this.map(e.code);
      if (!code) return;
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(this.map(e.code)));
    window.addEventListener('blur', () => this.down.clear());
    canvas.addEventListener('click', () => {
      if (document.pointerLockElement !== canvas) canvas.requestPointerLock?.();
    });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }

  /** Touch controls: press or release a key. */
  setHeld(code: string, on: boolean) {
    if (on && !this.down.has(code)) this.pressed.add(code);
    if (on) this.down.add(code); else this.down.delete(code);
  }

  /** Touch controls: a single key press. */
  tap(code: string) {
    this.pressed.add(code);
  }

  held(code: string) {
    return this.down.has(code) || this.padDown.has(code);
  }

  /**
   * Gamepad (standard mapping, PROMPT §9.9), polled once per frame: left stick / triggers drive, right
   * stick looks; A jump/brake, Y get on/off, X horn, B reset, Back map, Start menu, LB activities, RB sandbox,
   * L3 sprint, R3 camera, D-pad up photo, D-pad down discovery log.
   */
  poll() {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p) => p && p.connected && p.mapping === 'standard') ?? null;
    const next = new Set<string>();
    if (pad) {
      this.gamepad = true;
      const [lx, ly, rx, ry] = pad.axes;
      const dz = 0.3;
      const btn = (k: number) => !!pad.buttons[k]?.pressed;
      if (ly < -dz || (pad.buttons[7]?.value ?? 0) > 0.2) next.add('KeyW');
      if (ly > dz || (pad.buttons[6]?.value ?? 0) > 0.2) next.add('KeyS');
      if (lx < -dz) next.add('KeyA');
      if (lx > dz) next.add('KeyD');
      const look = (v: number) => (Math.abs(v) > 0.12 ? Math.sign(v) * (Math.abs(v) - 0.12) * 22 : 0);
      this.mouseDX += look(rx);
      this.mouseDY += look(ry);
      const map: [number, string][] = [[0, 'Space'], [3, 'KeyE'], [2, 'KeyH'], [1, 'KeyR'], [8, 'KeyM'], [9, 'Escape'],
        [4, 'KeyJ'], [5, 'Tab'], [10, 'ShiftLeft'], [11, 'KeyC'], [12, 'KeyP'], [13, 'KeyL']];
      for (const [k, code] of map) if (btn(k)) next.add(code);
    }
    for (const code of next) if (!this.padDown.has(code) && !this.down.has(code)) this.pressed.add(code);
    this.padDown = next;
  }

  /** True once per key press. */
  hit(code: string) {
    return this.pressed.has(code);
  }

  axis(neg: string, pos: string) {
    return (this.held(pos) ? 1 : 0) - (this.held(neg) ? 1 : 0);
  }

  /** Call at the end of each frame. */
  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = this.wheel = 0;
  }
}
