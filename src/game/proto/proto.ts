import * as THREE from 'three';
import GUI from 'lil-gui';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Game } from '../Game.js';
import { buildEnvironment, GRAVITY, initPhysics } from './world.js';
import { Track } from './track.js';
import { CAR_PRESETS, Car, type CarParams } from './car.js';
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

  // --- Car + rules + HUD ---
  let carParams: CarParams = { ...CAR_PRESETS[1] };
  const pushParams: PushParams = { impulseScale: 8.0, maxDrag: 2.5 };
  const camParams = { height: 5.2, back: 1.8, follow: 5 };

  // Persist tuning across reloads (per browser). testField is NOT persisted.
  const STORE_KEY = 'jdt-v0-tuning';
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as {
      carParams?: Partial<CarParams>;
      pushParams?: Partial<PushParams>;
      camParams?: { height?: number; back?: number };
    } | null;
    if (saved) {
      Object.assign(carParams, saved.carParams ?? {});
      Object.assign(pushParams, saved.pushParams ?? {});
      Object.assign(camParams, saved.camParams ?? {});
    }
  } catch {
    /* fresh start */
  }
  function persist(): void {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({ carParams, pushParams, camParams }),
    );
  }

  let car = new Car(world, scene, carParams);

  function placeAtStart(): void {
    const p = track.pointAt(START_S);
    car.reset(new THREE.Vector3(p.x, p.y, p.z), Math.atan2(-p.dz, p.dx));
  }
  placeAtStart();

  const rulesRef: { rules?: Rules } = {};
  const hud = createHud(
    () => rulesRef.rules?.nextTurn(),
    () => placeAtStart(),
    (m) => rulesRef.rules?.setMode(m),
  );
  const rules = new Rules(track, () => car, hud);
  rulesRef.rules = rules;

  setupSlingshot(
    game,
    () => car,
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

  // Surfaces: presets of the grip values (sideFriction/rollFriction are the
  // Surface — the distributed wheel friction makes them feel physical).
  const SURFACES = {
    'Rough concrete': { rollFriction: 0.05, sideFriction: 1.0, angularDamping: 0.3 },
    'Smooth concrete': { rollFriction: 0.03, sideFriction: 0.7, angularDamping: 0.2 },
    'Paved sidewalk': { rollFriction: 0.04, sideFriction: 0.8, angularDamping: 0.25 },
    'Tiled balcony': { rollFriction: 0.02, sideFriction: 0.4, angularDamping: 0.12 },
    'Ice (raw strikes)': { rollFriction: 0.005, sideFriction: 0.08, angularDamping: 0.03 },
  } as const;
  gui
    .add({ surface: 'Smooth concrete' }, 'surface', Object.keys(SURFACES))
    .onChange((name: string) => {
      Object.assign(carParams, SURFACES[name as keyof typeof SURFACES]);
      rebuildCar();
      persist();
      for (const c of carFolder.children) {
        if ('updateDisplay' in c) c.updateDisplay();
      }
    });

  const carFolder = gui.addFolder('Car (rebuilds)');
  carFolder.add(carParams, 'mass', 0.3, 4, 0.05).onFinishChange(() => { rebuildCar(); persist(); });
  carFolder.add(carParams, 'wheelRadius', 0.045, 0.13, 0.005).onFinishChange(() => { rebuildCar(); persist(); });
  carFolder.add(carParams, 'wheelHalfWidth', 0.02, 0.05, 0.005).onFinishChange(() => { rebuildCar(); persist(); });
  carFolder.add(carParams, 'rollFriction', 0.005, 0.15, 0.005).onFinishChange(() => { rebuildCar(); persist(); });
  carFolder.add(carParams, 'sideFriction', 0.05, 1.5, 0.05).onFinishChange(() => { rebuildCar(); persist(); });
  carFolder.add(carParams, 'angularDamping', 0, 2, 0.05).onFinishChange(() => { rebuildCar(); persist(); });
  gui
    .add({ preset: CAR_PRESETS[1].name }, 'preset', CAR_PRESETS.map((p) => p.name))
    .onChange((name: string) => {
      const preset = CAR_PRESETS.find((p) => p.name === name);
      if (!preset) return;
      carParams = { ...preset };
      rebuildCar();
      persist();
      for (const c of carFolder.children) {
        if ('updateDisplay' in c) c.updateDisplay();
      }
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
      car.reset(new THREE.Vector3(13, 0, 11), 0); // open ground inside the loop
    } else {
      hud.flash('Back on the Track');
      rules.setMode(rules.mode);
      placeAtStart();
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

  function rebuildCar(): void {
    const pos = car.position;
    const quat = car.quaternion;
    car.dispose();
    car = new Car(world, scene, carParams);
    car.resetPose(pos, quat); // rebuild in place (tuning mid-race is fine)
  }

  /** Debug/tuning hook: patch car params and rebuild in place. */
  function setCarParams(patch: Partial<CarParams>): void {
    Object.assign(carParams, patch);
    rebuildCar();
    persist();
    for (const c of carFolder.children) {
      if ('updateDisplay' in c) c.updateDisplay();
    }
  }

  // --- Main loop: physics, sync, rules, camera ---
  game.onUpdate((dt) => {
    for (let i = 0; i < 4; i++) world.step(); // 4 × 1/240 = one 60 fps frame
    car.sync(dt);
    rules.update(dt);

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
    get car() {
      return car;
    },
    world,
    track,
    rules,
    camera: game.camera,
    setTestField,
    setCarParams,
  };
}
