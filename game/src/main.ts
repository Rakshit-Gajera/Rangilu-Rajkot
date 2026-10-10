import * as THREE from 'three';
import { FollowCamera } from './actors/camera';
import { Player } from './actors/player';
import { Scooter } from './actors/scooter';
import { Audio } from './app/audio';
import { Input } from './app/input';
import { DynamicResolution, pickQuality } from './app/quality';
import { Physics } from './physics/physics';
import { worldUniforms } from './render/materials';
import { Clock, Environment, goldenHour } from './render/sky';
import { Hud } from './ui/hud';
import { CityMap } from './ui/map';
import { PauseMenu } from './ui/pause';
import { distanceToPolyline, RoadGraph } from './world/roadgraph';
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
// Test mode: every rendered frame advances exactly one physics step, independent of wall time.
const FIXED_STEP = params.get('fixedstep') === '1';

async function main() {
  const loadingEl = document.getElementById('loading')!;
  const bar = document.getElementById('loading-bar')!;
  const status = document.getElementById('loading-status')!;
  document.getElementById('loading-fact')!.textContent = FACTS[Math.floor(Math.random() * FACTS.length)];

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const quality = pickQuality(params, renderer.getContext() as WebGL2RenderingContext);
  const dynres = new DynamicResolution(Math.min(devicePixelRatio, quality.maxPixelRatio), quality.targetFps);
  renderer.setPixelRatio(dynres.ratio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const shadowSize = params.get('shadows') === '0' ? 0 : quality.shadowSize;
  renderer.shadowMap.enabled = shadowSize > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.2, quality.stream.far + 1500);
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  status.textContent = 'Starting physics…';
  const physics = await Physics.create();
  status.textContent = 'Loading Rajkot…';
  // Signboards are drawn with Noto Sans / Noto Sans Gujarati; wait briefly for them (system fonts otherwise).
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 20px "Noto Sans"', 'A'), document.fonts.load('600 20px "Noto Sans Gujarati"', 'શ્રી')]),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch { /* fonts unavailable: fall back to system fonts */ }
  // Signboards are drawn with Noto Sans / Noto Sans Gujarati; wait briefly for them (system fonts otherwise).
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 20px "Noto Sans"', 'A'), document.fonts.load('600 20px "Noto Sans Gujarati"', 'શ્રી')]),
      new Promise((r) => setTimeout(r, 3000)),
    ]);
  } catch { /* fonts unavailable: fall back */ }
  const world = await World.load('world', physics, shadowSize > 0, quality.stream);
  scene.add(world.root);

  const spawn = world.manifest.spawn;
  // Playable once the ground around the spawn is in (PROMPT §8.1); the rest streams in the background.
  await world.ensure(spawn.x, spawn.z, 350, (d, t) => { bar.style.width = `${(100 * d) / t}%`; });

  // Rapier scene queries only see new colliders after a step, so spawn heights come from the tile grid.
  const gy = world.terrainAt(spawn.x, spawn.z) ?? 30;
  const player = new Player(physics, scene, spawn.x, gy, spawn.z);
  const sx = spawn.x + 2.2, sz = spawn.z + 1.0;
  // Parked at the roadside facing along the ring road (yaw π = facing north).
  const scooter = new Scooter(physics, scene, sx, world.terrainAt(sx, sz) ?? gy, sz, spawn.heading + Math.PI);
  const env = new Environment(scene, renderer, shadowSize);
  // Spawn in the golden hour: 40 minutes before today's real sunset in Rajkot (PROMPT §3.1).
  // ?date=YYYY-MM-DD pins the calendar day (tests compare screenshots across builds).
  const day = params.has('date') ? new Date(`${params.get('date')}T12:00:00`) : new Date();
  const clock = new Clock(params.has('hour') ? Number(params.get('hour')) : goldenHour(day), day);
  const input = new Input(canvas);
  const follow = new FollowCamera(camera, physics);
  const audio = new Audio();
  const hud = new Hud(world);
  let riding = false;

  // --- Map, GPS and fast travel (PROMPT §3.5, §9.8). The game still works if the map fails to load.
  let graph: RoadGraph | null = null;
  try {
    graph = world.manifest.map ? await RoadGraph.load(`world/${world.manifest.map}`) : null;
  } catch (e) {
    console.warn('map unavailable', e);
  }
  const pause = new PauseMenu(quality.name);
  let routeTimer = 0;
  let traveling = false;
  let travelTo: THREE.Vector3 | null = null; // streaming follows the destination while travelling
  const here = () => (riding ? scooter.position : player.position);
  async function fastTravel(x: number, n: number) {
    if (traveling) return;
    traveling = true;
    hud.setPrompt('Travelling…');
    // Land on the nearest road so you never appear inside a building.
    if (graph) [x, n] = graph.nodeXY(graph.nearestNode(x, n, true));
    travelTo = new THREE.Vector3(x, 0, -n);
    await world.ensure(x, -n, 350);
    const y = (world.terrainAt(x, -n) ?? 30) + 0.3;
    if (riding) scooter.teleport(x, y, -n);
    else player.teleport(x, y, -n);
    routeTimer = 0;
    travelTo = null;
    traveling = false;
  }
  const cityMap = graph ? new CityMap(graph, {
    player: () => { const p = here(); return { x: p.x, n: -p.z, heading: -follow.yaw }; },
    onWaypoint: () => { routeTimer = 0; },
    onClearWaypoint: () => { routeTimer = 0; },
    onFastTravel: (x, n) => { void fastTravel(x, n); },
  }) : null;
  function updateRoute(dt: number) {
    if (!graph || !cityMap?.waypoint) return;
    routeTimer -= dt;
    if (routeTimer > 0) return;
    routeTimer = 1.5;
    const p = here(), w = cityMap.waypoint;
    if (Math.hypot(p.x - w.x, -p.z - w.n) < 30) {
      cityMap.clearWaypoint();
      hud.flash('You have arrived');
      return;
    }
    // Re-route only when off the route (or every 15 s), so GPS costs nothing while you follow it.
    const off = cityMap.route ? distanceToPolyline(p.x, -p.z, cityMap.route) > 40 : true;
    if (!off && routeAge < 15) { routeAge += 1.5; return; }
    routeAge = 0;
    const r = graph.route(p.x, -p.z, w.x, w.n);
    cityMap.setRoute(r?.points ?? null, r?.length ?? 0);
    if (!r) routeTimer = 10;
  }
  let routeAge = 0;

  // Edge of the world and safety net (PROMPT §7.1, §9.1): checked twice a second.
  let guardTimer = 0;
  let edgeNotice = 0;
  function guard(dt: number) {
    guardTimer -= dt;
    edgeNotice -= dt;
    if (guardTimer > 0 || traveling || fixedView) return;
    guardTimer = 0.5;
    const p = here();
    const ground = world.terrainAt(p.x, p.z);
    const outside = !world.isTile(p.x, p.z);
    if (outside || (ground !== null && p.y < ground - 5)) {
      // Fell through the world or slipped past the edge: back onto the nearest road.
      void fastTravel(p.x, -p.z);
      return;
    }
    const nearEdge = [[30, 0], [-30, 0], [0, 30], [0, -30]].some(([dx, dz]) => !world.isTile(p.x + dx, p.z + dz));
    if (nearEdge && edgeNotice <= 0) {
      hud.flash("You've reached the edge of Rajkot");
      edgeNotice = 8;
    }
  }
  let showPerf = false;
  let fixedView: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;

  addEventListener('pointerdown', () => audio.unlock(), { once: true });
  addEventListener('keydown', () => audio.unlock(), { once: true });

  loadingEl.classList.add('done');
  setTimeout(() => loadingEl.remove(), 700);

  let acc = 0;
  let simTime = 0;
  const worst: Record<string, number> = { sim: 0, hud: 0, route: 0 };
  let tMark = 0;
  const mark = (name: string) => { const t = performance.now(); worst[name] = Math.max(worst[name] ?? 0, t - tMark); tMark = t; };
  let last = performance.now();
  const frameTimes: number[] = [];

  function frame(now: number) {
    const dt = FIXED_STEP ? STEP : Math.min((now - last) / 1000, 0.1);
    last = now;
    const tFrame = performance.now();
    tMark = tFrame;

    // --- Input-driven actions -------------------------------------------------
    if (!cityMap?.open && input.hit('Escape')) pause.toggle();
    const mapOpen = !!cityMap?.open || pause.open;
    if (cityMap?.open) {
      for (const code of ['KeyM', 'Escape', 'KeyF', 'Delete', 'Backspace']) if (input.hit(code)) cityMap!.key(code);
    } else if (!pause.open && input.hit('KeyM') && cityMap) cityMap.toggle(true);
    const controls = mapOpen || traveling ? null : input;
    const near = scooter.position.distanceTo(player.position) < 2.6;
    if (controls && input.hit('KeyE')) {
      if (riding) {
        riding = false;
        scooter.setRider(null);
        const yaw = scooter.yaw();
        const p = scooter.position;
        const ox = Math.cos(yaw) * -1.0, oz = -Math.sin(yaw) * -1.0; // step off to the right side
        player.setVisible(true);
        scene.add(player.object);
        // Ray from just above the scooter, so stepping off never lands on a roof or flyover.
        player.teleport(p.x + ox, (physics.groundAt(p.x + ox, p.z + oz, p.y + 2) ?? p.y) + 0.05, p.z + oz);
        audio.setEngine(null);
      } else if (near) {
        riding = true;
        player.setVisible(false);
        player.object.visible = true;
        scooter.setRider(player.object);
        follow.yaw = scooter.yaw() + Math.PI;
      }
    }
    if (controls && !riding && input.hit('Space')) player.requestJump();
    if (input.hit('KeyH')) audio.horn();
    if (input.hit('KeyT')) clock.hours = (clock.hours + 1) % 24;
    if (input.hit('KeyR') && riding) scooter.resetUpright();
    if (input.hit('F3')) showPerf = !showPerf;

    mark('input');
    // --- Fixed-step simulation --------------------------------------------------
    const tSim = performance.now();
    acc += dt;
    while (acc >= STEP) {
      scooter.drive(riding ? controls : null, STEP);
      if (!riding && controls) player.update(controls, follow, STEP);
      physics.step();
      player.capture();
      scooter.capture();
      simTime += STEP;
      acc -= STEP;
    }
    worst.sim = Math.max(worst.sim, performance.now() - tSim);
    clock.advance(dt);

    mark('simAll');
    // --- Visuals ----------------------------------------------------------------
    const alpha = acc / STEP;
    player.render(alpha, dt);
    scooter.sync(dt, worldUniforms.uNight.value, alpha);
    const focus = riding ? scooter.focus : player.focus;
    if (fixedView) {
      camera.position.copy(fixedView.pos);
      camera.lookAt(fixedView.look);
    } else {
      follow.update(input, focus, dt, riding
        ? { minDist: 4.5, fovBoost: Math.min(Math.abs(scooter.speed) * 0.5, 12), chaseYaw: scooter.yaw() + Math.PI }
        : {});
    }
    mark('visuals');
    env.update(clock, fixedView ? fixedView.look : focus, camera);
    mark('env');
    {
      const v = riding ? scooter.chassis.linvel() : { x: 0, z: 0 };
      const p = fixedView ? fixedView.pos : travelTo ?? (riding ? scooter.position : player.position);
      // The parked scooter keeps the ground under it; if that isn't loaded it is frozen in place.
      const anchors = riding ? [] : [scooter.position];
      world.update(p.x, p.z, v.x, v.z, fixedView ? 50 : 4, anchors);
      if (!riding) scooter.setFrozen(!world.readyAt(scooter.position.x, scooter.position.z));
      guard(dt);
    }
    mark('stream');
    const res = params.get('dynres') === '0' ? null : dynres.sample(dt);
    if (res !== null) renderer.setPixelRatio(res);
    mark('dynres');
    const tRender = performance.now();
    renderer.render(scene, camera);
    const renderMs = performance.now() - tRender;

    tMark = performance.now();
    // --- HUD ----------------------------------------------------------------------
    const p = riding ? scooter.position : player.position;
    const tRoute = performance.now();
    updateRoute(dt);
    worst.route = Math.max(worst.route, performance.now() - tRoute);
    const tHud = performance.now();
    hud.drawMinimap(p.x, -p.z, follow.yaw, cityMap?.index ?? null, cityMap?.route ?? null, cityMap?.waypoint ?? null);
    hud.setClock(clock.label());
    hud.setSpeed(riding ? Math.abs(scooter.speed) * 3.6 : null);
    if (!traveling) hud.setPrompt(!riding && near ? 'E — ride the scooter' : '');
    hud.updateArea(p.x, -p.z, dt);
    worst.hud = Math.max(worst.hud, performance.now() - tHud);
    if (riding) audio.setEngine(Math.min(Math.abs(scooter.speed) / 24, 1));
    mark('hudAll');
    frameTimes.push(performance.now() - tFrame - renderMs); // our own main-thread work (rendering excluded)
    if (frameTimes.length > 120) frameTimes.shift();
    if (showPerf) {
      const info = renderer.info;
      const s = world.stats();
      const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
      hud.setPerf(`fps ${(1 / Math.max(dt, 1e-3)).toFixed(0)}  game ${avg.toFixed(1)} ms  render ${renderMs.toFixed(1)} ms\n` +
        `draw calls ${info.render.calls}  tris ${(info.render.triangles / 1e6).toFixed(2)} M\n` +
        `quality ${quality.name}  res ${dynres.ratio.toFixed(2)}  near ${s.tiles}  far ${s.farTiles}  phys ${s.colliders}\n` +
        `queue ${s.queued}  buildings ${s.buildings}  geo ${info.memory.geometries}\n` +
        `pos ${p.x.toFixed(0)}, ${(-p.z).toFixed(0)}  y ${p.y.toFixed(1)}`);
    } else hud.setPerf(null);
    input.endFrame();
    requestAnimationFrame(frame);
  }

  // Hooks for automated tests (Playwright): fixed camera poses, time, stats.
  (window as unknown as { __game: unknown }).__game = {
    ready: true,
    simTime: () => simTime,
    quality: () => quality.name,
    route: (x0: number, n0: number, x1: number, n1: number) => graph?.route(x0, n0, x1, n1)?.points ?? null,
    worldStats: () => world.stats(),
    debugScene: () => { const out: Record<string, number> = {}; scene.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { const k = (mm.material as THREE.Material).type + ((mm.material as THREE.MeshStandardMaterial).map ? ":map" : "") + (mm.visible ? "" : ":hidden") + ((mm.material as THREE.MeshStandardMaterial).map ? "@" + mm.parent?.name : ""); out[k] = (out[k] ?? 0) + 1; } }); return out; },
    roadNear: (x: number, n: number) => (graph ? graph.nodeXY(graph.nearestNode(x, n, true)) : [x, n]),
    idle: () => world.stats().queued === 0,
    heap: () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
    geometries: () => renderer.info.memory.geometries,
    frameTimes: () => frameTimes.slice(),
    worst: () => ({ ...world.worst, ...worst }),
    stats: () => ({ ...world.stats(), calls: renderer.info.render.calls, drawnTriangles: renderer.info.render.triangles,
      busy: world.tiles.size, frameMs: frameTimes.reduce((a, b) => a + b, 0) / Math.max(frameTimes.length, 1) }),
    setView: (pos: number[], look: number[], hour?: number) => {
      document.getElementById('hud')!.hidden = true;
      fixedView = { pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look) };
      if (hour !== undefined) clock.hours = hour;
      clock.speed = 0;
    },
    freeView: () => { fixedView = null; document.getElementById('hud')!.hidden = false; },
    ensure: (x: number, z: number, r: number) => world.ensure(x, z, r),
    ground: (x: number, z: number) => physics.groundAt(x, z),
    terrain: (x: number, z: number) => world.terrainAt(x, z),
    player: () => player.position.toArray(),
    teleportPlayer: (x: number, y: number, z: number) => player.teleport(x, y, z),
    scooter: () => {
      const q = scooter.chassis.rotation();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
      const contacts = [0, 1, 2, 3].map((k) => scooter.vehicle.wheelIsInContact(k));
      return { pos: scooter.position.toArray(), speed: scooter.speed, riding, up: up.toArray(), contacts };
    },
  };
  requestAnimationFrame(frame);
}

main().catch((e) => {
  console.error(e);
  const s = document.getElementById('loading-status');
  if (s) s.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`;
});
