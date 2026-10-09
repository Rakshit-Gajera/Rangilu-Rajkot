/** Keyboard + mouse state. Mouse look uses pointer lock (click the canvas). */
export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'F3' || e.code === 'Space') e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
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

  held(code: string) {
    return this.down.has(code);
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
