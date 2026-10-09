import * as THREE from 'three';
import GUI from 'lil-gui';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Game } from '../Game.js';
import { buildEnvironment, GRAVITY, initPhysics, terrainY } from './world.js';
import { Track } from './track.js';
import { CAR_PRESETS, STARTING_GRID, Car, carHalfWidth, type CarParams } from './car.js';
import { setupSlingshot, type PushParams } from './slingshot.js';
import { Rules, START_S } from './rules.js';
import { createHud } from './hud.js';

/**
 * THROWAWAY PROTOTYPE CODE — v0 slingshot vertical slice.
 * Assembles: Rapier world, chalk loop Track with sidewalk Terrain, one
 * tunable Car, slingshot controls, rules/HUD, follow camera (fixed heading,
 * near top-down), lil-gui tuning panel. Replace wholesale when the controls
 * experiments are done — do NOT grow the real game out of this module.
 */

export async function createProtoScene(game: Game): Promise<void> {
  await initPhysics();
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  // Small timestep: at 1/60 the solver sinks bodies ~36% of a wheel radius
  // per step before contacts engage (g·dt² ≈ 0.027 units) and the correction
  // impulse launches the Car. 1/240 keeps that under 3%. Scale-invariant —
  // resizing the world would NOT fix it; the timestep does.
  world.timestep = 1 / 240;
  // Extra solver iterations: the tiny bodies + 4 wheel joints benefit from
  // tighter convergence (less residual jitter at rest).
  world.integrationParameters.numSolverIterations = 8;

  // --- Scene: outdoor light, sky, shadows ---
  const scene = game.scene;
  scene.background = new THREE.Color('#b9c6d4');
  scene.fog = new THREE.Fog('#b9c6d4', 40, 90);

  const hemi = new THREE.HemisphereLight('#dfe8f2', '#6b6f66', 1.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
  sun.position.set(14, 26, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  sc.left = -20;
  sc.right = 26;
  sc.top = 24;
  sc.bottom = -8;
  sc.far = 60;
  scene.add(sun);

  game.renderer.shadowMap.enabled = true;
  game.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  buildEnvironment(world, scene);
  const track = new Track(scene);

  // --- Several Cars, each with its own params (ticket 12) ---
  const pushParams: PushParams = { impulseScale: 8.0, maxDrag: 2.5 };
  const camParams = { height: 5.2, back: 1.8, follow: 5 };

  // Persist tuning across reloads (per browser). testField is NOT persisted.
  // v1 stored ONE global CarParams; v2 stores one set per Car, so v1 saves are
  // ignored for the Cars but still restore Push/camera tuning.
  const STORE_KEY = 'jdt-v0-tuning';
  const STORE_VERSION = 2;
  const carList: CarParams[] = STARTING_GRID.map((p) => ({ ...p }));
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as {
      version?: number;
      cars?: Partial<CarParams>[];
      pushParams?: Partial<PushParams>;
      camParams?: { height?: number; back?: number };
    } | null;
    if (saved) {
      if (saved.version === STORE_VERSION && Array.isArray(saved.cars)) {
        saved.cars.forEach((patch, i) => {
          if (carList[i]) Object.assign(carList[i], patch);
        });
      }
      Object.assign(pushParams, saved.pushParams ?? {});
      Object.assign(camParams, saved.camParams ?? {});
    }
  } catch {
    /* fresh start */
  }
  function persist(): void {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ version: STORE_VERSION, cars: carList, pushParams, camParams }),
    );
  }

  const cars: Car[] = carList.map((p) => new Car(world, scene, p));
  /** The Car being aimed at: camera, rules reads and the tuning panel's
   *  target. Tapping a Car in the scene selects it. */
  let active = 0;
  const getCar = (): Car => cars[active];

  /** Clearance between two Cars placed abreast (2 mm real). */
  const GRID_GAP = 0.02;
  /**
   * Starting grid: two Cars abreast and NEARLY TOUCHING (whether two Cars rest
   * honestly side by side is the question ticket 12 exists to answer — it
   * should be visible before anything is pushed), the odd Car out in front.
   */
  function placeOnTrack(): void {
    const AHEAD = 1.1; // third Car sits this far down the Track
    for (let i = 0; i < cars.length; i++) {
      const lat =
        i === 0
          ? -(carHalfWidth(carList[0]) + carHalfWidth(carList[1]) + GRID_GAP) / 2
          : i === 1
            ? (carHalfWidth(carList[0]) + carHalfWidth(carList[1]) + GRID_GAP) / 2
            : 0;
      const ds = i === 2 ? AHEAD : 0;
      const p = track.pointAt(START_S + ds);
      const yaw = Math.atan2(-p.dz, p.dx);
      const nx = -p.dz;
      const nz = p.dx; // left of travel
      cars[i].reset(new THREE.Vector3(p.x + nx * lat, p.y, p.z + nz * lat), yaw);
    }
  }

  /** Bare concrete row (Test field): all facing +X, gaps `GRID_GAP` apart. */
  function placeTestRow(): void {
    let x = 12.2;
    for (const car of cars) {
      car.reset(new THREE.Vector3(x, 0, 11), 0);
      x += 2 * carHalfWidth(car.params) + GRID_GAP;
    }
  }

  placeOnTrack();

  const rulesRef: { rules?: Rules } = {};
  const hud = createHud(
    () => rulesRef.rules?.nextTurn(),
    () => {
      placeOnTrack();
      rulesRef.rules?.setMode(rulesRef.rules.mode);
      hud.flash('Cars back on the grid');
    },
    (m) => rulesRef.rules?.setMode(m),
  );
  const rules = new Rules(
    track,
    () => cars,
    () => active,
    hud,
  );
  rulesRef.rules = rules;

  setupSlingshot(
    game,
    getCar,
    () => cars,
    (picked) => setActive(cars.indexOf(picked)),
    pushParams,
    () => rules.pushUsed(),
    (reason) => hud.flash(reason),
    () => rules.canPush(),
  );

  // --- Camera: follows the Car, fixed heading, near top-down ---
  const camTarget = new THREE.Vector3();
  game.camera.position.set(track.pointAt(START_S).x, camParams.height, 2);

  // --- Tuning panel ---
  const gui = new GUI({ title: 'v0 prototype' });

  // --- Which Car the tuning below applies to. Tapping a Car in the scene
  // selects it, so the GUI and the aim are the SAME selection — they cannot
  // drift apart and leave you tuning a Car you are not pushing.
  const selected = { car: 0 };
  const carOptions = () =>
    Object.fromEntries(cars.map((c, i) => [`#${i + 1} ${c.params.name}`, i]));
  const selectCtrl = gui
    .add(selected, 'car', carOptions())
    .name('Tune Car')
    .onChange((i: number) => setActive(Number(i)));

  // Surfaces: presets of the grip values (sideFriction/rollFriction are the
  // Surface — the distributed wheel friction makes them feel physical).
  const SURFACES = {
    'Rough concrete': { rollFriction: 0.05, sideFriction: 1.0, angularDamping: 0.3 },
    'Smooth concrete': { rollFriction: 0.03, sideFriction: 0.7, angularDamping: 0.2 },
    'Paved sidewalk': { rollFriction: 0.04, sideFriction: 0.8, angularDamping: 0.25 },
    'Tiled balcony': { rollFriction: 0.02, sideFriction: 0.4, angularDamping: 0.12 },
    'Ice (raw strikes)': { rollFriction: 0.005, sideFriction: 0.08, angularDamping: 0.03 },
  } as const;
  function applySurface(name: string): void {
    Object.assign(carList[active], SURFACES[name as keyof typeof SURFACES]);
    rebuildCar(active);
    persist();
    buildCarFolder();
  }
  gui
    .add({ surface: 'Smooth concrete' }, 'surface', Object.keys(SURFACES))
    .name('Surface (this Car)')
    .onChange(applySurface);

  const carFolder = gui.addFolder('Car (rebuilds)');
  function buildCarFolder(): void {
    for (const c of [...carFolder.children]) c.destroy();
    const p = carList[active];
    carFolder.title(`Car — ${p.name} (rebuilds)`);
    carFolder.add(p, 'name').name('model').disable();
    carFolder.addColor(p, 'color').onFinishChange(() => { rebuildCar(active); persist(); });
    carFolder.add(p, 'mass', 0.3, 4, 0.05).onFinishChange(() => { rebuildCar(active); persist(); });
    carFolder.add(p, 'wheelRadius', 0.045, 0.13, 0.005).onFinishChange(() => { rebuildCar(active); persist(); });
    carFolder.add(p, 'wheelHalfWidth', 0.02, 0.05, 0.005).onFinishChange(() => { rebuildCar(active); persist(); });
    carFolder.add(p, 'rollFriction', 0.005, 0.15, 0.005).onFinishChange(() => { rebuildCar(active); persist(); });
    carFolder.add(p, 'sideFriction', 0.05, 1.5, 0.05).onFinishChange(() => { rebuildCar(active); persist(); });
    carFolder.add(p, 'angularDamping', 0, 2, 0.05).onFinishChange(() => { rebuildCar(active); persist(); });
  }
  buildCarFolder();
  gui
    .add({ preset: CAR_PRESETS[1].name }, 'preset', CAR_PRESETS.map((p) => p.name))
    .name('Preset (this Car)')
    .onChange((name: string) => {
      const preset = CAR_PRESETS.find((p) => p.name === name);
      if (!preset) return;
      // Keep the paint: colour is how you tell the Cars apart.
      carList[active] = { ...preset, color: carList[active].color };
      rebuildCar(active);
      persist();
      syncCarLabels();
    });
  const pushFolder = gui.addFolder('Push');
  pushFolder.add(pushParams, 'impulseScale', 0.5, 12, 0.1).onFinishChange(persist);
  pushFolder.add(pushParams, 'maxDrag', 0.5, 5, 0.1).onFinishChange(persist);

  // --- Test field: bare speckled concrete, no chalk, no rules ---
  const fieldState = { testField: false };
  function setTestField(on: boolean): void {
    fieldState.testField = on;
    track.chalk.visible = !on;
    rules.enabled = !on;
    if (on) {
      hud.setPushes('∞');
      hud.setLapTime(null);
      hud.flash('Test field — no track, no rules, tune the feel');
      placeTestRow(); // open ground inside the loop
    } else {
      hud.flash('Back on the Track');
      rules.setMode(rules.mode);
      placeOnTrack();
    }
  }
  gui.add(fieldState, 'testField').onChange(setTestField);

  const camFolder = gui.addFolder('Camera');
  camFolder.add(camParams, 'height', 2, 14, 0.1).onFinishChange(persist);
  camFolder.add(camParams, 'back', 0, 8, 0.1).onFinishChange(persist);

  gui
    .add({ resetTuning: () => {
      localStorage.removeItem(STORE_KEY);
      location.reload();
    } }, 'resetTuning')
    .name('Reset tuning');

  function rebuildCar(i: number): void {
    const pos = cars[i].position;
    const quat = cars[i].quaternion;
    cars[i].dispose();
    cars[i] = new Car(world, scene, carList[i]);
    cars[i].resetPose(pos, quat); // rebuild in place (tuning mid-race is fine)
    if (i === active) hud.setCarLabel(carList[i].name, carList[i].color);
  }

  /**
   * Make Car `i` the aimed Car: it is what the camera follows, whose Turn the
   * HUD counts, and what the tuning panel edits.
   */
  function setActive(i: number): void {
    if (!Number.isFinite(i) || i === active) return;
    active = Math.max(0, Math.min(cars.length - 1, i));
    selected.car = active;
    // setValue() is a no-op once the property already holds the value, and
    // this is exactly that case — ask the display to catch up explicitly.
    selectCtrl.updateDisplay();
    buildCarFolder();
    rules.refreshHud();
    hud.setCarLabel(cars[active].params.name, cars[active].params.color);
  }

  /** Keep the selector's labels honest after a name/colour change. */
  function syncCarLabels(): void {
    selectCtrl.options(carOptions());
    selectCtrl.updateDisplay();
    buildCarFolder();
    hud.setCarLabel(cars[active].params.name, cars[active].params.color);
  }

  /** Debug/tuning hook: patch the SELECTED Car's params and rebuild in place. */
  function setCarParams(patch: Partial<CarParams>): void {
    Object.assign(carList[active], patch);
    rebuildCar(active);
    persist();
    syncCarLabels();
  }
  hud.setCarLabel(cars[active].params.name, cars[active].params.color);

  // Which Car the next Push belongs to: colours already tell the Cars apart,
  // the ring says which one is AIMED AT before you press (unambiguous even
  // when two Cars sit touching).
  const ringGeom = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 49 }, (_, k) => {
      const a = (k / 48) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    }),
  );
  const ring = new THREE.Line(
    ringGeom,
    new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
    }),
  );
  ring.renderOrder = 5; // under the strike overlay (arrow 10, marker 20)
  scene.add(ring);

  // --- Main loop: physics, sync, rules, camera ---
  game.onUpdate((dt) => {
    for (let i = 0; i < 4; i++) world.step(); // 4 × 1/240 = one 60 fps frame
    for (const c of cars) c.sync(dt);
    rules.update(dt);

    const car = getCar();
    ring.position.set(car.position.x, terrainY(car.position.x, car.position.z) + 0.02, car.position.z);
    ring.scale.setScalar(carHalfWidth(car.params) + 0.07);

    const p = car.position;
    camTarget.set(p.x, p.y, p.z);
    const k = 1 - Math.exp(-camParams.follow * dt);
    const desired = new THREE.Vector3(
      p.x,
      p.y + camParams.height,
      p.z + camParams.back, // fixed world heading — map stays oriented, car turns
    );
    game.camera.position.lerp(desired, k);
    game.camera.lookAt(camTarget);
  });

  // Debug handle for the phone's remote console / tests (throwaway code).
  // `car` is a getter so it stays live across car rebuilds.
  (window as unknown as Record<string, unknown>).__jdt = {
    /** The aimed Car (kept working for the older single-Car commands). */
    get car() {
      return cars[active];
    },
    cars,
    get active() {
      return active;
    },
    setActive,
    placeOnTrack,
    placeTestRow,
    world,
    track,
    rules,
    camera: game.camera,
    setTestField,
    setCarParams,
  };
}
