import * as THREE from 'three';
import { FollowCamera } from './actors/camera';
import { Player } from './actors/player';
import { FreeCamera } from './actors/freecam';
import { Garage } from './actors/garage';
import { Props } from './actors/props';
import { Weather, type WeatherKind } from './render/weather';
import { PhotoMode } from './ui/photo';
import { FOOD_SHOP, OUTFIT_SHOP, SandboxMenu, type SandboxHooks } from './ui/sandbox';
import { OUTFITS } from './actors/character';
import type { ActivityContext } from './activities/activity';
import { Activities } from './activities/manager';
import { exportSave, freshSave, importSave, loadSave, storeSave } from './app/save';
import { DiscoveryLog } from './ui/discovery';
import { Credits } from './ui/credits';
import { Onboarding } from './ui/onboarding';
import { enableTouch, isTouchDevice } from './app/touch';
import { loadSettings, type Settings } from './app/settings';
import { kindOfModel, SPECS, type Vehicle, type VehicleKind } from './actors/vehicle';
import { Audio } from './app/audio';
import { Input } from './app/input';
import { DynamicResolution, pickQuality } from './app/quality';
import { Physics } from './physics/physics';
import { worldUniforms } from './render/materials';
import { Clock, Environment, goldenHour } from './render/sky';
import { Hud } from './ui/hud';
import { CityMap } from './ui/map';
import { Life } from './actors/life';
import { Signals } from './world/signals';
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
  const world = await World.load('world', physics, shadowSize > 0, quality.stream);
  scene.add(world.root);

  let graph: RoadGraph | null = null;
  try {
    graph = world.manifest.map ? await RoadGraph.load(`world/${world.manifest.map}`) : null;
  } catch (e) {
    console.warn('map unavailable', e);
  }
  // Private places from this machine's pipeline/local.yaml (world/private.local.json, never published):
  // a new session starts at home, on the road outside the gate. Automated tests keep the public spawn.
  let home: { x: number; n: number } | null = null;
  try {
    const r = await fetch('world/private.local.json');
    if (r.ok) home = (await r.json())?.places?.home ?? null;
  } catch { /* no private places on this machine */ }
  const useHome = !!home && (params.get('home') === '1' || (!navigator.webdriver && params.get('spawn') !== 'default'));
  // Your neighbourhood is always drawn in full detail (props, signs, full trees), whatever the preset.
  if (home) world.detailZones.push({ x: home.x, n: home.n, r: 800 });
  const spawn = { ...world.manifest.spawn };
  if (useHome && home) {
    let [x, n] = [home.x, home.n];
    let heading = 0;
    if (graph) {
      const u = graph.nearestNode(x, n, true);
      [x, n] = graph.nodeXY(u);
      const out = graph.outgoing(u)[0];
      if (out) { const p = graph.pointAt(out[0], out[1], 0); heading = Math.atan2(p.dx, p.dn); }
    }
    Object.assign(spawn, { x, z: -n, heading });
  }
  // Playable once the ground around the spawn is in (PROMPT §8.1); the rest streams in the background.
  await world.ensure(spawn.x, spawn.z, 350, (d, t) => { bar.style.width = `${(100 * d) / t}%`; });

  // Rapier scene queries only see new colliders after a step, so spawn heights come from the tile grid.
  const gy = world.terrainAt(spawn.x, spawn.z) ?? 30;
  const player = new Player(physics, scene, spawn.x, gy, spawn.z);
  // Your scooter parked 2.4 m to the left of the road's direction (keep-left), facing along it.
  // spawn.heading is a compass heading (0 = north); three.js headings have 0 = +z (south).
  const sx = spawn.x - Math.cos(spawn.heading) * 2.4, sz = spawn.z - Math.sin(spawn.heading) * 2.4;
  const garage = new Garage(physics, scene, sx, world.terrainAt(sx, sz) ?? gy, sz, Math.PI - spawn.heading);
  const scooter = garage.own;
  const env = new Environment(scene, renderer, shadowSize);
  // Spawn in the golden hour: 40 minutes before today's real sunset in Rajkot (PROMPT §3.1).
  // ?date=YYYY-MM-DD pins the calendar day (tests compare screenshots across builds).
  const day = params.has('date') ? new Date(`${params.get('date')}T12:00:00`) : new Date();
  const clock = new Clock(params.has('hour') ? Number(params.get('hour')) : goldenHour(day), day);
  const input = new Input(canvas);
  const follow = new FollowCamera(camera, physics);
  const audio = new Audio();
  const hud = new Hud(world);
  /** The vehicle being driven (null on foot). */
  let drivingV: Vehicle | null = null;
  const props = new Props(physics, scene);
  const weather = new Weather(scene);
  if (params.has('weather')) weather.set(params.get('weather') as WeatherKind, true);
  // Camera modes: following the player, the free-flying drone, or photo mode (PROMPT §3.5).
  let camMode: 'follow' | 'drone' | 'photo' = 'follow';
  const drone = new FreeCamera(25, 4, 250);
  const photoCam = new FreeCamera(4, 0.5, 40);
  const photo = new PhotoMode(renderer, scene, camera);
  function setCamMode(mode: 'follow' | 'drone' | 'photo') {
    if (mode === camMode) mode = 'follow';
    if (mode === 'drone') drone.begin(camera);
    if (mode === 'photo') photoCam.begin(camera);
    photo.toggle(mode === 'photo');
    camMode = mode;
    if (mode === 'drone') hud.flash('Drone: WASD fly · Space/Ctrl up/down · wheel speed · Esc back');
  }

  // --- Map, GPS and fast travel (PROMPT §3.5, §9.8). The game still works if the map fails to load.
  // Settings (Esc menu): volume, mouse, field of view, key hints.
  const settings = loadSettings();
  function applySettings(s: Settings) {
    audio.setVolume(s.volume);
    follow.sensitivity = s.sensitivity;
    follow.invertY = s.invertY;
    follow.baseFov = s.fov;
    document.getElementById('help')!.hidden = !s.help;
  }
  applySettings(settings);
  const touch = isTouchDevice() || params.get('touch') === '1';
  if (touch) { enableTouch(input); document.body.classList.add('touch'); }
  const onboarding = new Onboarding(touch, (t) => hud.flash(t), useHome);
  const pause = new PauseMenu(quality.name, {
    exportSave: () => { writeSave(); exportSave(save); },
    importSave: () => {
      void importSave().then((d) => {
        if (!d) { hud.flash('That file is not a Rangilu Rajkot save'); return; }
        storeSave(d);
        location.reload();
      });
    },
  }, settings, applySettings, () => { pause.toggle(false); credits.toggle(true); });
  const credits = new Credits();
  let routeTimer = 0;
  let traveling = false;
  let travelTo: THREE.Vector3 | null = null; // streaming follows the destination while travelling
  const here = () => (drivingV ? drivingV.position : player.position);
  const fade = document.createElement('div');
  fade.id = 'travel-fade';
  document.body.appendChild(fade);
  const frames = (k: number) => new Promise<void>((r) => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
  /**
   * Teleport (map, discoveries, activities, safety net). The screen fades while the area loads.
   * exact: land right where asked (the map) unless that's inside a building; otherwise on the nearest road.
   */
  async function fastTravel(x: number, n: number, exact = false) {
    if (traveling) return;
    traveling = true;
    fade.textContent = 'Travelling…';
    fade.classList.add('on');
    await new Promise((r) => setTimeout(r, 220)); // let the fade cover the jump
    const road = graph ? graph.nodeXY(graph.nearestNode(x, n, true)) : [x, n];
    if (!exact || !world.isTile(x, -n)) [x, n] = road;
    travelTo = new THREE.Vector3(x, 0, -n);
    await world.ensure(x, -n, 180, (d, t) => { fade.textContent = `Loading ${Math.round((100 * d) / t)}%`; });
    await frames(2); // physics queries see new colliders after a step
    let ground = world.terrainAt(x, -n) ?? 30;
    if (exact) {
      const top = physics.groundAt(x, -n, ground + 200);
      if (top !== null && top > ground + 2.5) {
        // Inside a building (or under a flyover): the street outside instead.
        [x, n] = road;
        travelTo.set(x, 0, -n);
        await world.ensure(x, -n, 150);
        await frames(2);
        ground = world.terrainAt(x, -n) ?? ground;
      } else if (top !== null) ground = top;
    }
    const y = ground + 0.3;
    if (drivingV) drivingV.teleport(x, y, -n);
    else player.teleport(x, y, -n);
    routeTimer = 0;
    travelTo = null;
    await frames(3);
    fade.classList.remove('on');
    traveling = false;
  }
  // Traffic, pedestrians and cows on the real road network (PROMPT §3.4).
  const life = graph ? new Life(graph, world, physics, scene, quality.life, shadowSize > 0) : null;
  if (life) life.onHorn = (x, y, z, kind) => audio.hornAt(here().distanceTo(new THREE.Vector3(x, y, z)), kind);
  // Signals at major junctions (not at roundabouts/chowks).
  const signals = graph ? new Signals(graph, scene, [
    ...graph.data.labels.filter((l) => l.kind === 'chowk'), ...(graph.data.chowks ?? []).map(([x, n]) => ({ x, n }))]) : null;
  if (life) life.signals = signals;
  if (life && home) life.denseZones.push({ x: home.x, n: home.n, r: 800 });
  const cityMap = graph ? new CityMap(graph, {
    player: () => { const p = here(); return { x: p.x, n: -p.z, heading: -follow.yaw }; },
    onWaypoint: () => { routeTimer = 0; },
    onClearWaypoint: () => { routeTimer = 0; },
    onFastTravel: (x, n) => { void fastTravel(x, n, true); },
    home,
  }) : null;
  function updateRoute(dt: number) {
    if (!graph || !cityMap?.waypoint) return;
    routeTimer -= dt;
    if (routeTimer > 0) return;
    routeTimer = 1.5;
    const p = here(), w = cityMap.waypoint;
    if (Math.hypot(p.x - w.x, -p.z - w.n) < 30 && !activities?.current) {
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

  // --- Saves, money, discoveries (PROMPT §3.5, §9.10) ---------------------------------
  const save = params.get('save') === '0' ? freshSave() : loadSave();
  hud.setMoney(save.money);
  const discovery = new DiscoveryLog(graph?.data.labels ?? [], save.discovered, (id, total) => {
    save.discovered = discovery.discovered;
    pay(25, `New discovery (${total}/${discovery.total}) — ₹25`);
    void id;
  }, (x, n) => { void fastTravel(x, n); });
  function pay(rupees: number, why: string) {
    save.money += rupees;
    hud.setMoney(save.money);
    hud.flash(why);
  }
  function writeSave() {
    const p = here();
    save.pos = [p.x, p.y, p.z];
    save.vehicle = drivingV?.kind ?? null;
    save.discovered = discovery.discovered;
    save.settings = { weather: weather.kind, traffic: life?.trafficScale ?? 1, people: life?.pedScale ?? 1 };
    storeSave(save);
  }
  addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });
  addEventListener('pagehide', writeSave);

  // --- Activities (PROMPT §3.6, §10): J opens the list, X quits ------------------------
  const activityCtx: ActivityContext | null = graph ? {
    graph,
    scene,
    input,
    here,
    driving: () => drivingV,
    groundY: (x, n) => world.terrainAt(x, -n) ?? here().y,
    putInVehicle: async (kind, x, n, heading) => {
      await fastTravel(x, n);
      exitVehicle();
      const y = world.terrainAt(x, -n) ?? here().y;
      enterVehicle(garage.spawn(kind, x, y + 0.2, -n, heading));
    },
    setWaypoint: (x, n) => { cityMap?.setWaypoint(x, n); routeTimer = 0; routeAge = 99; },
    clearWaypoint: () => { cityMap?.clearWaypoint(); cityMap?.setRoute(null, 0); },
    flash: (t) => hud.flash(t),
    pay: (r, why) => pay(r, why),
    record: (id, score) => {
      const prev = save.records[id];
      if (prev !== undefined && prev >= score) return false;
      save.records[id] = score;
      return true;
    },
    best: (id) => save.records[id],
    roads: (re) => {
      const out: number[][] = [];
      const e = graph!.data.edges;
      for (let k = 0; k < e.a.length; k++) {
        const nm = e.name[k] >= 0 ? world.strings[e.name[k]] : '';
        if (nm && re.test(nm)) out.push(graph!.edgePoints(k, true));
      }
      return out;
    },
    places: () => (graph!.data.labels ?? []).filter((l) => l.kind === 'landmark' || l.kind === 'chowk' || l.kind === 'suburb' || l.kind === 'neighbourhood' || l.kind === 'locality'),
    sound: (k) => audio.chime(k),
  } : null;
  const activities = activityCtx ? new Activities(activityCtx, (a) => {
    const b = save.records[a.id];
    if (b === undefined) return '';
    return a.id === 'timetrial' ? `${Math.floor(-b / 60)}:${String(Math.floor(-b % 60)).padStart(2, '0')} lap` : a.id === 'garba' ? `${b} points` : `₹${b} in one go`;
  }) : null;

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
  function enterVehicle(v: Vehicle) {
    drivingV = v;
    garage.current = v;
    v.setFrozen(false);
    player.setVisible(false);
    player.object.visible = true;
    player.character.pose = 'ride';
    v.setRider(player.object);
    follow.yaw = v.yaw() + Math.PI;
    follow.distance = Math.max(follow.distance, v.spec.camera);
  }

  function exitVehicle() {
    const v = drivingV;
    if (!v) return;
    drivingV = null;
    garage.current = null;
    v.setRider(null);
    player.character.pose = 'stand';
    const yaw = v.yaw();
    const p = v.position;
    // Step off on the right-hand side (-x in the vehicle frame), clear of the body.
    const off = v.spec.half[0] + 0.6;
    const ox = -Math.cos(yaw) * off, oz = Math.sin(yaw) * off;
    player.setVisible(true);
    scene.add(player.object);
    // Ray from just above the vehicle, so stepping off never lands on a roof or flyover.
    player.teleport(p.x + ox, (physics.groundAt(p.x + ox, p.z + oz, p.y + 2) ?? p.y) + 0.05, p.z + oz);
    audio.setEngine(null);
  }

  /** Spawn menu (PROMPT §3.5): a vehicle just ahead of the camera, facing the way you look. */
  function spawnVehicle(kind: VehicleKind, enter = false): Vehicle {
    const p = here();
    const { forward } = follow.basis();
    const d = SPECS[kind].half[2] + (drivingV ? drivingV.spec.half[2] : 0) + 2.5;
    const x = p.x + forward.x * d, z = p.z + forward.z * d;
    const y = physics.groundAt(x, z, p.y + 4) ?? world.terrainAt(x, z) ?? p.y;
    const v = garage.spawn(kind, x, y + 0.2, z, Math.atan2(forward.x, forward.z));
    if (enter) {
      exitVehicle();
      enterVehicle(v);
    }
    return v;
  }

  /** Put the scooter on the nearest road beside the player, facing along it. */
  function bringScooter() {
    const p = player.position;
    let x = p.x + 1.5, z = p.z;
    if (graph) {
      const [nx, nn] = graph.nodeXY(graph.nearestNode(p.x, -p.z, true));
      if (Math.hypot(nx - p.x, -nn - p.z) < 40) { x = nx; z = -nn; }
    }
    const y = physics.groundAt(x, z, p.y + 3) ?? world.terrainAt(x, z) ?? p.y;
    scooter.setFrozen(false);
    scooter.teleport(x, y + 0.1, z);
    hud.flash('Your scooter is here');
  }

  /**
   * Safety net against falling through the ground (colliders still building, or a shove from traffic):
   * nothing we control may sink below the terrain surface. Cheap: one height-grid lookup each.
   */
  function keepAboveGround() {
    if (traveling) return;
    const s = scooter.position;
    const gs = world.terrainAt(s.x, s.z);
    if (gs !== null && s.y < gs - 0.8) {
      scooter.teleport(s.x, gs + 0.2, s.z);
      if (drivingV !== scooter && s.distanceTo(player.position) > 150) scooter.setFrozen(true);
    }
    if (drivingV && drivingV !== scooter) {
      const v = drivingV.position, gv = world.terrainAt(v.x, v.z);
      if (gv !== null && v.y < gv - 0.8) drivingV.teleport(v.x, gv + 0.2, v.z);
    }
    if (!drivingV) {
      const p = player.position;
      const gp = world.terrainAt(p.x, p.z);
      if (gp !== null && p.y < gp - 0.8) player.teleport(p.x, gp + 0.1, p.z);
    }
  }

  // --- Sandbox menu (Tab, PROMPT §3.5) ---------------------------------------------
  const clockSpeed = clock.speed;
  const sandboxHooks: SandboxHooks = {
    spawnVehicle: (kind) => {
      spawnVehicle(kind, true);
      hud.flash(`${SPECS[kind].label} — E to get off`);
    },
    spawnProp: (kind) => {
      const p = here();
      const { forward } = follow.basis();
      const d = (drivingV ? drivingV.spec.half[2] : 0) + (kind === 'ramp' ? 6 : 2.5);
      const x = p.x + forward.x * d, z = p.z + forward.z * d;
      const y = physics.groundAt(x, z, p.y + 4) ?? world.terrainAt(x, z) ?? p.y;
      // Facing the way you look: a ramp rises away from you, so you ride straight up it.
      props.spawn(kind, x, y + (kind === 'ramp' ? 0 : 0.05), z, Math.atan2(forward.x, forward.z));
    },
    clearProps: () => props.clear(),
    getHour: () => clock.hours,
    setHour: (h) => { clock.hours = h; },
    setClockRunning: (on) => { clock.speed = on ? clockSpeed : 0; },
    getMonth: () => clock.date.getUTCMonth(),
    setMonth: (m) => { clock.date = new Date(Date.UTC(clock.date.getUTCFullYear(), m, 15)); },
    setWeather: (w) => weather.set(w),
    setTraffic: (s) => { if (life) life.trafficScale = s; },
    setPeople: (s) => { if (life) life.pedScale = s; },
    drone: () => setCamMode('drone'),
    photo: () => setCamMode('photo'),
    outfit: (id) => {
      const item = OUTFIT_SHOP.find((o) => o.id === id);
      if (!item || !OUTFITS[id]) return 'Not sold here';
      if (!save.owned.includes(id)) {
        if (save.money < item.price) return `Not enough money (₹${item.price})`;
        save.money -= item.price;
        save.owned.push(id);
        hud.setMoney(save.money);
      }
      save.outfit = id;
      player.character.setOutfit(OUTFITS[id]);
      return `Wearing: ${item.label}`;
    },
    food: (id) => {
      const item = FOOD_SHOP.find((f) => f.id === id);
      if (!item) return 'Not sold here';
      if (save.money < item.price) return `Not enough money (₹${item.price})`;
      save.money -= item.price;
      hud.setMoney(save.money);
      player.boost = id === 'ganthiya' ? 120 : 60;
      audio.chime('good');
      return item.note;
    },
    shopState: () => ({ money: save.money, owned: save.owned, wearing: save.outfit }),
  };
  if (OUTFITS[save.outfit]) player.character.setOutfit(OUTFITS[save.outfit]);
  const sandbox = new SandboxMenu(sandboxHooks);
  // Pick up where you left off (unless a test pins the start).
  if (!params.has('hour') && save.pos && !useHome) {
    const [x, , z] = save.pos;
    if (world.isTile(x, z)) void fastTravel(x, -z).then(() => {
      if (save.vehicle && save.vehicle in SPECS) spawnVehicle(save.vehicle as VehicleKind, true);
    });
  }
  if (!params.has('weather') && save.settings.weather !== 'clear') weather.set(save.settings.weather as WeatherKind, true);
  if (life) { life.trafficScale = save.settings.traffic; life.pedScale = save.settings.people; }

  let showPerf = false;
  let fixedView: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;

  addEventListener('pointerdown', () => audio.unlock(), { once: true });
  addEventListener('keydown', () => audio.unlock(), { once: true });

  loadingEl.classList.add('done');
  setTimeout(() => loadingEl.remove(), 700);

  let acc = 0;
  let minimapTimer = 0, minimapYaw = 0;
  let frameNo = 0;
  let saveTimer = 15;
  let simTime = 0;
  let lifeMs = 0;
  const worst: Record<string, number> = { sim: 0, hud: 0, route: 0 };
  let tMark = 0;
  const avg: Record<string, number> = {};
  const mark = (name: string) => {
    const t = performance.now(), d = t - tMark;
    worst[name] = Math.max(worst[name] ?? 0, d);
    avg[name] = (avg[name] ?? d) * 0.97 + d * 0.03;
    tMark = t;
  };
  let last = performance.now();
  const frameTimes: number[] = [];

  function frame(now: number) {
    const dt = FIXED_STEP ? STEP : Math.min((now - last) / 1000, 0.1);
    last = now;
    const tFrame = performance.now();
    tMark = tFrame;

    // --- Input-driven actions -------------------------------------------------
    if (!cityMap?.open && input.hit('Escape')) {
      // Esc backs out of the innermost thing: photo/drone, then the sandbox menu, then pauses.
      if (camMode !== 'follow') setCamMode('follow');
      else if (sandbox.open) sandbox.toggle(false);
      else if (activities?.open) activities.toggle(false);
      else if (discovery.open) discovery.toggle(false);
      else if (credits.open) credits.toggle(false);
      else pause.toggle();
    }
    const mapOpen = !!cityMap?.open || pause.open;
    if (cityMap?.open) {
      for (const code of ['KeyM', 'Escape', 'KeyF', 'Delete', 'Backspace']) if (input.hit(code)) cityMap!.key(code);
    } else if (!pause.open && input.hit('KeyM') && cityMap) cityMap.toggle(true);
    if (!mapOpen && input.hit('Tab')) sandbox.toggle();
    if (!mapOpen && input.hit('KeyJ')) activities?.toggle();
    if (!mapOpen && input.hit('KeyL')) discovery.toggle();
    if (!mapOpen && input.hit('KeyX') && activities?.current) activities.quit('Activity ended');
    if (!mapOpen && !sandbox.open && input.hit('KeyP')) setCamMode('photo');
    if (camMode === 'photo') for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'KeyF', 'Enter']) if (input.hit(code)) photo.key(code);
    const freeCam = camMode === 'drone' ? drone : camMode === 'photo' ? photoCam : null;
    const menuOpen = sandbox.open || !!activities?.open || discovery.open || onboarding.blocking || credits.open;
    onboarding.update(dt);
    const controls = mapOpen || traveling || menuOpen || freeCam ? null : input;
    // Something to get on: a parked vehicle of ours, or one from traffic (PROMPT §3.3: take any vehicle).
    const nearV = drivingV ? null : garage.nearest(player.position);
    const nearTraffic = !drivingV && !nearV && !!life?.vehicleNear(player.position.x, -player.position.z);
    if (controls && input.hit('KeyE')) {
      if (drivingV) exitVehicle();
      else if (nearV) enterVehicle(nearV);
      else if (nearTraffic && life) {
        const t = life.takeVehicle(player.position.x, -player.position.z);
        const kind = t ? kindOfModel(t.model) : null;
        if (t && kind) {
          const v = garage.spawn(kind, t.x, t.y, -t.n, Math.PI - t.yaw, kind === 'scooter' ? { color: 0x2f5fa8 } : { model: t.model });
          enterVehicle(v);
          hud.flash(`You took the ${SPECS[kind].label.toLowerCase()}`);
        }
      }
    }
    if (controls && !drivingV && input.hit('Space')) player.requestJump();
    if (controls && drivingV && input.hit('KeyH')) audio.horn(drivingV.spec.horn); // the horn belongs to the vehicle
    // On foot, R brings your scooter to the roadside next to you (handy if you lost it).
    if (controls && !drivingV && input.hit('KeyR') && scooter.position.distanceTo(player.position) > 8) bringScooter();
    if (input.hit('KeyT')) clock.hours = (clock.hours + 1) % 24;
    if (controls && input.hit('KeyR') && drivingV) drivingV.resetUpright();
    if (input.hit('F3')) showPerf = !showPerf;

    mark('input');
    // --- Fixed-step simulation --------------------------------------------------
    const tSim = performance.now();
    acc += dt;
    while (acc >= STEP) {
      garage.drive(controls, STEP);
      if (!drivingV && controls) player.update(controls, follow, STEP);
      physics.step();
      player.capture();
      garage.capture();
      simTime += STEP;
      acc -= STEP;
    }
    worst.sim = Math.max(worst.sim, performance.now() - tSim);
    clock.advance(dt);
    const tLife = performance.now();
    if (life) life.update(dt, here(), clock.hours, [here(), ...garage.parked()]);
    lifeMs = lifeMs * 0.95 + (performance.now() - tLife) * 0.05;
    keepAboveGround();
    if (signals) { const h = here(); signals.update(dt, h.x, -h.z, (x, n) => world.terrainAt(x, -n)); }
    if (!traveling) {
      const h = here();
      discovery.update(h.x, -h.z, dt);
      activities?.update(dt);
    }
    saveTimer -= dt;
    if (saveTimer <= 0) { saveTimer = 15; writeSave(); }

    mark('simAll');
    // --- Visuals ----------------------------------------------------------------
    const alpha = acc / STEP;
    if (drivingV) player.ridePose(dt);
    else player.render(alpha, dt);
    garage.sync(dt, worldUniforms.uNight.value, alpha);
    const focus = drivingV ? drivingV.focus : player.focus;
    props.sync();
    if (fixedView) {
      camera.position.copy(fixedView.pos);
      camera.lookAt(fixedView.look);
    } else if (freeCam) {
      if (!mapOpen && !sandbox.open) freeCam.update(input, camera, dt, (x, z) => world.terrainAt(x, z));
    } else {
      follow.update(input, focus, dt, drivingV
        ? { minDist: drivingV.spec.camera, fovBoost: Math.min(Math.abs(drivingV.speed) * 0.5, 12), chaseYaw: drivingV.yaw() + Math.PI }
        : {});
    }
    mark('visuals');
    weather.update(dt, camera, clock.date.getUTCMonth());
    env.overcast = weather.overcast;
    env.haze = weather.haze;
    audio.setRain(weather.rain);
    {
      const h = here(), c = life?.near(h.x, -h.z, 70) ?? { vehicles: 0, peds: 0 };
      audio.ambience(dt, { traffic: Math.min(1, c.vehicles / 14), crowd: Math.min(1, c.peds / 14), night: worldUniforms.uNight.value,
        hour: clock.hours, rain: weather.rain });
    }
    env.update(clock, fixedView ? fixedView.look : freeCam ? camera.position : focus, camera);
    mark('env');
    {
      const v = drivingV ? drivingV.chassis.linvel() : { x: 0, z: 0 };
      const p = fixedView ? fixedView.pos : freeCam ? camera.position : travelTo ?? here();
      // The parked scooter keeps the ground under it; if that isn't loaded it is frozen in place.
      const anchors = garage.anchors();
      const fwd = camera.getWorldDirection(new THREE.Vector3());
      const fl = Math.hypot(fwd.x, fwd.z) || 1;
      world.viewDir = { x: fwd.x / fl, z: fwd.z / fl };
      // The player stays loaded while the drone flies elsewhere.
      if (freeCam) anchors.push(here());
      world.update(p.x, p.z, v.x, v.z, fixedView ? 50 : 4, anchors);
      garage.park(world, here());
      guard(dt);
    }
    mark('stream');
    const res = params.get('dynres') === '0' ? null : dynres.sample(dt);
    if (res !== null) renderer.setPixelRatio(res);
    mark('dynres');
    const tRender = performance.now();
    // Shadows render every other frame on High/Ultra: the shadow map keeps its own matrix, so they stay
    // put in the world; only the shadowed area trails the player by one frame.
    frameNo++;
    if (renderer.shadowMap.enabled) {
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = quality.name === 'medium' || frameNo % 2 === 0 || !!fixedView;
    }
    if (photo.open) {
      // Focus on whatever is in the middle of the view (for depth of field).
      const dir = camera.getWorldDirection(new THREE.Vector3());
      const hit = physics.world.castRay(new physics.R.Ray(camera.position, dir), 500, true);
      photo.render(hit ? hit.timeOfImpact : 50);
    } else renderer.render(scene, camera);
    const renderMs = performance.now() - tRender;
    avg.render = (avg.render ?? renderMs) * 0.97 + renderMs * 0.03;

    tMark = performance.now();
    // --- HUD ----------------------------------------------------------------------
    const p = here();
    const tRoute = performance.now();
    updateRoute(dt);
    worst.route = Math.max(worst.route, performance.now() - tRoute);
    const tHud = performance.now();
    // The minimap redraws at ~20 Hz (or at once when you turn quickly): plenty for a 300 m map.
    minimapTimer -= dt;
    if (minimapTimer <= 0 || Math.abs(follow.yaw - minimapYaw) > 0.08) {
      minimapTimer = 0.05;
      minimapYaw = follow.yaw;
      hud.drawMinimap(p.x, -p.z, follow.yaw, cityMap?.index ?? null, cityMap?.route ?? null, cityMap?.waypoint ?? null);
    }
    hud.setClock(clock.label());
    hud.setSpeed(drivingV ? Math.abs(drivingV.speed) * 3.6 : null);
    if (!traveling) {
      hud.setPrompt(nearV ? `E — ${nearV.spec.twoWheeler ? 'ride' : 'drive'} the ${nearV.spec.label.toLowerCase()}`
        : nearTraffic ? 'E — take this vehicle' : '');
    }
    hud.updateArea(p.x, -p.z, dt);
    worst.hud = Math.max(worst.hud, performance.now() - tHud);
    if (drivingV && drivingV.spec.engineSound) {
      audio.setEngine(Math.min(Math.abs(drivingV.speed) / (drivingV.spec.topKmh / 3.6), 1), drivingV.spec.engineSound);
    }
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
    life: () => life?.stats() ?? null,
    lifeMs: () => lifeMs,
    // Triangles by material for visible meshes inside the camera frustum, and those casting shadows.
    triBreakdown: () => {
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const out: Record<string, number> = {};
      scene.traverseVisible((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh || !m.geometry) return;
        const g = m.geometry;
        const inst = (m as unknown as THREE.InstancedMesh).isInstancedMesh ? (m as unknown as THREE.InstancedMesh).count : 1;
        const tris = ((g.index ? g.index.count : g.attributes.position.count) / 3) * inst;
        if (!g.boundingSphere) g.computeBoundingSphere();
        const inView = !m.frustumCulled || fr.intersectsSphere(g.boundingSphere!.clone().applyMatrix4(m.matrixWorld));
        const key = (m.material as THREE.Material).name || (m.material as THREE.Material).type;
        const k2 = key + (inst > 1 ? '[inst]' : '');
        if (inView) out[k2 + ' view'] = (out[k2 + ' view'] ?? 0) + tris;
        if (m.castShadow) out[k2 + ' cast'] = (out[k2 + ' cast'] ?? 0) + tris;
      });
      return out;
    },
    agents: () => (life?.agents ?? []).map((a) => ({ kind: a.kind, x: a.x, n: a.n, y: a.y, yaw: a.yaw, v: a.v })),
    debugScene: () => { const out: Record<string, number> = {}; scene.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { const k = (mm.material as THREE.Material).type + ((mm.material as THREE.MeshStandardMaterial).map ? ":map" : "") + (mm.visible ? "" : ":hidden") + ((mm.material as THREE.MeshStandardMaterial).map ? "@" + mm.parent?.name : ""); out[k] = (out[k] ?? 0) + 1; } }); return out; },
    signals: () => ({ count: signals?.junctions.length ?? 0, near: (signals?.junctions ?? []).map((j) => [Math.round(j.x), Math.round(j.n)]).sort((a, b) => Math.hypot(a[0] - here().x, a[1] + here().z) - Math.hypot(b[0] - here().x, b[1] + here().z)).slice(0, 3) }),
    roadNear: (x: number, n: number) => (graph ? graph.nodeXY(graph.nearestNode(x, n, true)) : [x, n]),
    idle: () => world.stats().queued === 0,
    heap: () => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
    geometries: () => renderer.info.memory.geometries,
    frameTimes: () => frameTimes.slice(),
    worst: () => ({ ...world.worst, ...worst }),
    avg: () => ({ ...avg }),
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
    spawnVehicle: (kind: VehicleKind, enter = true) => { spawnVehicle(kind, enter); },
    sandbox: sandboxHooks,
    money: () => save.money,
    discovered: () => discovery.discovered,
    startActivity: (id: string) => { const a = activities?.list.find((q) => q.id === id); return a ? (a.canStart(activityCtx!) ?? activities!.start(a).then(() => 'started')) : 'none'; },
    activity: () => activities?.current ? { id: activities.current.id, status: activities.current.status() } : null,
    waypoint: () => cityMap?.waypoint ?? null,
    // Put whatever we're on (or the player) at (x, n), stopped.
    moveTo: (x: number, n: number) => {
      const y = (world.terrainAt(x, -n) ?? here().y) + 0.2;
      if (drivingV) drivingV.teleport(x, y, -n); else player.teleport(x, y, -n);
    },
    weather: () => ({ kind: weather.kind, rain: weather.rain, haze: weather.haze }),
    setWeather: (w: WeatherKind) => weather.set(w, true),
    driving: () => {
      if (!drivingV) return null;
      const q = drivingV.chassis.rotation();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
      const contacts = drivingV.spec.wheels.map((_, k) => drivingV!.controller.wheelIsInContact(k));
      return { kind: drivingV.kind, pos: drivingV.position.toArray(), speed: drivingV.speed, up: up.toArray(), contacts };
    },
    scooter: () => {
      const riding = drivingV === scooter;
      const q = scooter.chassis.rotation();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
      const contacts = [0, 1, 2, 3].map((k) => scooter.controller.wheelIsInContact(k));
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
