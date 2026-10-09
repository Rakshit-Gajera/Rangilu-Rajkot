import * as THREE from 'three';
import { FollowCamera } from './actors/camera';
import { Player } from './actors/player';
import { Scooter } from './actors/scooter';
import { Audio } from './app/audio';
import { Input } from './app/input';
import { Physics } from './physics/physics';
import { worldUniforms } from './render/materials';
import { Clock, Environment } from './render/sky';
import { Hud } from './ui/hud';
import { World } from './world/world';

const FACTS = [
  'Rajkot\'s nickname is "Rangilu Rajkot" — colourful Rajkot.',
  'Every Janmashtami, Race Course hosts the lokmelo, the city\'s big public fair.',
  'In the afternoon rest, many shutters come down and the roads go quiet.',
  'The chhakdo — Saurashtra\'s motorcycle three-wheeler — is a Rajkot street icon.',
  'Mahatma Gandhi grew up in Rajkot, at Kaba Gandhi no Delo.',
];
const STEP = 1 / 60;
const params = new URLSearchParams(location.search);

async function main() {
  const loadingEl = document.getElementById('loading')!;
  const bar = document.getElementById('loading-bar')!;
  const status = document.getElementById('loading-status')!;
  document.getElementById('loading-fact')!.textContent = FACTS[Math.floor(Math.random() * FACTS.length)];

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.AgXToneMapping;
  const shadowSize = params.get('shadows') === '0' ? 0 : 2048;
  renderer.shadowMap.enabled = shadowSize > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.2, 6000);
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  status.textContent = 'Starting physics…';
  const physics = await Physics.create();
  status.textContent = 'Loading Rajkot…';
  const world = await World.load('world', physics, shadowSize > 0);
  scene.add(world.root);

  const spawn = world.manifest.spawn;
  await world.ensure(spawn.x, spawn.z, 700, (d, t) => { bar.style.width = `${(100 * d) / t}%`; });
  // The rest of the slice streams in the background.
  void world.ensure(spawn.x, spawn.z, 3000);

  const gy = physics.groundAt(spawn.x, spawn.z) ?? 30;
  const player = new Player(physics, scene, spawn.x, gy, spawn.z);
  const sx = spawn.x + 2.2, sz = spawn.z + 1.0;
  const scooter = new Scooter(physics, scene, sx, physics.groundAt(sx, sz) ?? gy, sz, spawn.heading + Math.PI / 2);
  const env = new Environment(scene, renderer, shadowSize);
  const clock = new Clock(Number(params.get('hour') ?? 18.5));
  const input = new Input(canvas);
  const follow = new FollowCamera(camera, physics);
  const audio = new Audio();
  const hud = new Hud(world);
  let riding = false;
  let showPerf = false;
  let fixedView: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;

  addEventListener('pointerdown', () => audio.unlock(), { once: true });
  addEventListener('keydown', () => audio.unlock(), { once: true });

  loadingEl.classList.add('done');
  setTimeout(() => loadingEl.remove(), 700);

  let acc = 0;
  let last = performance.now();
  const frameTimes: number[] = [];

  function frame(now: number) {
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    const tFrame = performance.now();

    // --- Input-driven actions -------------------------------------------------
    const near = scooter.position.distanceTo(player.position) < 2.6;
    if (input.hit('KeyE')) {
      if (riding) {
        riding = false;
        scooter.setRider(null);
        const yaw = scooter.yaw();
        const p = scooter.position;
        const ox = Math.cos(yaw) * -1.0, oz = -Math.sin(yaw) * -1.0; // step off to the right side
        player.setVisible(true);
        scene.add(player.object);
        player.teleport(p.x + ox, (physics.groundAt(p.x + ox, p.z + oz) ?? p.y) + 0.05, p.z + oz);
        audio.setEngine(null);
      } else if (near) {
        riding = true;
        player.setVisible(false);
        player.object.visible = true;
        scooter.setRider(player.object);
        follow.yaw = scooter.yaw() + Math.PI;
      }
    }
    if (input.hit('KeyH')) audio.horn();
    if (input.hit('KeyT')) clock.hours = (clock.hours + 1) % 24;
    if (input.hit('KeyR') && riding) scooter.resetUpright();
    if (input.hit('F3')) showPerf = !showPerf;

    // --- Fixed-step simulation --------------------------------------------------
    acc += dt;
    while (acc >= STEP) {
      scooter.drive(riding ? input : null, STEP);
      if (!riding) player.update(input, follow, STEP);
      physics.step();
      acc -= STEP;
    }
    clock.advance(dt);

    // --- Visuals ----------------------------------------------------------------
    scooter.sync(dt, worldUniforms.uNight.value);
    const focus = riding ? scooter.focus : player.focus;
    if (fixedView) {
      camera.position.copy(fixedView.pos);
      camera.lookAt(fixedView.look);
    } else {
      follow.update(input, focus, dt, riding ? { minDist: 4.5, fovBoost: Math.min(Math.abs(scooter.speed) * 0.5, 12) } : {});
    }
    env.update(clock, fixedView ? fixedView.look : focus);
    world.flushUploads(4);
    renderer.render(scene, camera);

    // --- HUD ----------------------------------------------------------------------
    const p = riding ? scooter.position : player.position;
    hud.drawMinimap(p.x, -p.z, follow.yaw);
    hud.setClock(clock.label());
    hud.setSpeed(riding ? Math.abs(scooter.speed) * 3.6 : null);
    hud.setPrompt(!riding && near ? 'E — ride the scooter' : '');
    hud.updateArea(p.x, -p.z, dt);
    if (riding) audio.setEngine(Math.min(Math.abs(scooter.speed) / 24, 1));
    frameTimes.push(performance.now() - tFrame);
    if (frameTimes.length > 120) frameTimes.shift();
    if (showPerf) {
      const info = renderer.info;
      const s = world.stats();
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      hud.setPerf(`fps ${(1 / Math.max(dt, 1e-3)).toFixed(0)}  cpu ${avg.toFixed(1)} ms\n` +
        `draw calls ${info.render.calls}  tris ${(info.render.triangles / 1e6).toFixed(2)} M\n` +
        `tiles ${s.tiles}  buildings ${s.buildings}  geo ${(info.memory.geometries)}\n` +
        `pos ${p.x.toFixed(0)}, ${(-p.z).toFixed(0)}  y ${p.y.toFixed(1)}`);
    } else hud.setPerf(null);
    input.endFrame();
    requestAnimationFrame(frame);
  }

  // Hooks for automated tests (Playwright): fixed camera poses, time, stats.
  (window as unknown as { __game: unknown }).__game = {
    ready: true,
    stats: () => ({ ...world.stats(), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      busy: world.tiles.size, frameMs: frameTimes.reduce((a, b) => a + b, 0) / Math.max(frameTimes.length, 1) }),
    setView: (pos: number[], look: number[], hour?: number) => {
      fixedView = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) };
      if (hour !== undefined) clock.hours = hour;
      clock.speed = 0;
    },
    freeView: () => { fixedView = null; },
    ensure: (x: number, z: number, r: number) => world.ensure(x, z, r),
    ground: (x: number, z: number) => physics.groundAt(x, z),
    player: () => player.position.toArray(),
    scooter: () => ({ pos: scooter.position.toArray(), speed: scooter.speed, riding }),
  };
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  const s = document.getElementById('loading-status');
  if (s) s.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`;
});
