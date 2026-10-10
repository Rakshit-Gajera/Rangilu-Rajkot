import * as THREE from 'three';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';

/** Photo mode (P, PROMPT §3.5): hide the HUD, colour filters, depth of field, save the picture. */
const FILTERS: [string, string][] = [
  ['Natural', 'none'],
  ['Warm', 'sepia(0.25) saturate(1.25) brightness(1.03)'],
  ['Vivid', 'saturate(1.55) contrast(1.08)'],
  ['Black & white', 'grayscale(1) contrast(1.15)'],
  ['Vintage', 'sepia(0.6) contrast(0.92) brightness(1.06) saturate(0.85)'],
  ['Monsoon', 'saturate(0.8) hue-rotate(-12deg) brightness(1.04) contrast(0.95)'],
];

export class PhotoMode {
  open = false;
  dof = false;
  private filter = 0;
  private overlay: HTMLDivElement;
  private composer: EffectComposer | null = null;
  private bokeh: BokehPass | null = null;
  private wantShot = false;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.overlay = document.createElement('div');
    this.overlay.id = 'photo';
    this.overlay.hidden = true;
    document.body.appendChild(this.overlay);
  }

  toggle(force?: boolean) {
    this.open = force ?? !this.open;
    this.overlay.hidden = !this.open;
    document.getElementById('hud')!.hidden = this.open;
    this.renderer.domElement.style.filter = this.open ? FILTERS[this.filter][1] : 'none';
    this.label();
  }

  private label() {
    this.overlay.innerHTML = `<b>Photo mode</b> · ${FILTERS[this.filter][0]}${this.dof ? ' · depth of field' : ''}<br>
      WASD fly · mouse look · wheel speed · <b>1–6</b> filter · <b>F</b> depth of field · <b>Enter</b> save photo · <b>P</b> exit`;
  }

  key(code: string) {
    const n = Number(code.replace('Digit', ''));
    if (code.startsWith('Digit') && n >= 1 && n <= FILTERS.length) {
      this.filter = n - 1;
      this.renderer.domElement.style.filter = FILTERS[this.filter][1];
    } else if (code === 'KeyF') this.dof = !this.dof;
    else if (code === 'Enter') this.wantShot = true;
    this.label();
  }

  /** Render the frame (with depth of field when on). focus = distance to what's in the middle of the view. */
  render(focus: number) {
    if (this.dof) {
      if (!this.composer) {
        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bokeh = new BokehPass(this.scene, this.camera, { focus: 10, aperture: 0.004, maxblur: 0.012 });
        this.composer.addPass(this.bokeh);
        this.composer.addPass(new OutputPass());
      }
      const u = this.bokeh!.uniforms as Record<string, THREE.IUniform>;
      u.focus.value = THREE.MathUtils.lerp(u.focus.value as number, focus, 0.2);
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(innerWidth, innerHeight);
      this.composer.render();
    } else this.renderer.render(this.scene, this.camera);
    if (this.wantShot) {
      this.wantShot = false;
      this.save();
    }
  }

  /** Save right after rendering (the drawing buffer is still intact), with the filter baked in. */
  private save() {
    const src = this.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d')!;
    ctx.filter = FILTERS[this.filter][1];
    ctx.drawImage(src, 0, 0);
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const d = new Date();
      a.download = `rangilu-rajkot-${d.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
    this.overlay.classList.add('flash');
    setTimeout(() => this.overlay.classList.remove('flash'), 300);
  }
}
