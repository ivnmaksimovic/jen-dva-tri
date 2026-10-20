import * as THREE from 'three';
import GUI from 'lil-gui';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Game } from '../Game.js';
import { buildEnvironment, GRAVITY, initPhysics, terrainY } from './world.js';
import {
  SQUARES,
  SQUARE_LABELS,
  SURFACES,
  SURFACE_KEYS,
  SurfaceField,
  type SurfaceKey,
} from './surfaces.js';
import { Track } from './track.js';
import { CAR_PRESETS, STARTING_GRID, Car, carHalfWidth, type CarParams } from './car.js';
import { setupSlingshot, type PushParams } from './slingshot.js';
import { setupFlick, DEFAULT_FLICK_PARAMS, MARKER_LINGER, type FlickParams } from './flick.js';
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

  // Surfaces: what each wheel stands on (ADR-0002 — grip is a property of the
  // contact, so this is World state, never Car state).
  const field = new SurfaceField();
  const track = new Track(scene);
  // Stones only go where a car can actually drive over them: on the Track. A
  // whole square's worth costs milliseconds a frame and nobody ever rolls on
  // the other 90% of it (see ticket 17 for the measured numbers).
  const onTrack = (x: number, z: number): boolean => track.progressOf({ x, z }).dist < 2.2;
  const { terrain, refresh: refreshTerrainView } = buildEnvironment(world, scene, field, onTrack);

  // --- Several Cars, each with its own params (ticket 12) ---
  const pushParams: PushParams = { impulseScale: 8.0, maxDrag: 2.5 };
  const camParams = { height: 5.2, back: 1.8, follow: 5 };
  // Which control scheme is live. Both input layers listen to the same canvas,
  // so exactly one must be deaf at a time — see `schemeActive()` below.
  const flickParams: FlickParams = { ...DEFAULT_FLICK_PARAMS };

  // Persist tuning across reloads (per browser). testField is NOT persisted.
  // v1 stored ONE global CarParams; v2 stores one set per Car, so v1 saves are
  // ignored for the Cars but still restore Push/camera tuning.
  const STORE_KEY = 'jdt-v0-tuning';
  // v3: grip moved off the Car onto the contact (Surface × tire, ticket 16),
  // so saved per-Car roll/side numbers are meaningless — v2 saves are dropped.
  const STORE_VERSION = 5; // 5: adds the flick scheme (option C, ticket 18)
  const carList: CarParams[] = STARTING_GRID.map((p) => ({ ...p }));
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as {
      version?: number;
      cars?: Partial<CarParams>[];
      surfaces?: Partial<Record<SurfaceKey, { grip?: number; roll?: number; gravel?: number }>>;
      squares?: Partial<Record<string, SurfaceKey>>;
      pushParams?: Partial<PushParams>;
      flickParams?: Partial<FlickParams>;
      camParams?: { height?: number; back?: number };
    } | null;
    if (saved) {
      if (saved.version === STORE_VERSION) {
        if (Array.isArray(saved.cars)) {
          saved.cars.forEach((patch, i) => {
            if (carList[i]) Object.assign(carList[i], patch);
          });
        }
        // Surface numbers and which square is made of what: both are tuning
        // the user owns, so both come back.
        for (const key of SURFACE_KEYS) {
          Object.assign(SURFACES[key], saved.surfaces?.[key] ?? {});
        }
        for (const q of SQUARES) {
          const savedKey = saved.squares?.[q];
          if (savedKey && SURFACE_KEYS.includes(savedKey)) field.put(q, savedKey);
        }
        if (saved.squares?.base && SURFACE_KEYS.includes(saved.squares.base)) {
          field.put('base', saved.squares.base);
        }
        refreshTerrainView();
      }
      Object.assign(pushParams, saved.pushParams ?? {});
      Object.assign(flickParams, saved.flickParams ?? {});
      Object.assign(camParams, saved.camParams ?? {});
    }
  } catch {
    /* fresh start */
  }
  function persist(): void {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        version: STORE_VERSION,
        cars: carList,
        surfaces: Object.fromEntries(
          SURFACE_KEYS.map((k) => [
            k,
            { grip: SURFACES[k].grip, roll: SURFACES[k].roll, gravel: SURFACES[k].gravel },
          ]),
        ),
        squares: field.squares,
        pushParams,
        flickParams,
        camParams,
      }),
    );
  }

  const cars: Car[] = carList.map((p) => new Car(world, scene, p, field));
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

  /**
   * Bare row for the Test field: all facing +X, gaps `GRID_GAP` apart, well
   * inside ONE square (Asphalt) so every comparison starts on the same
   * Surface — the whole point of hiding the Track is to feel one Surface
   * against another, not to start arguing about where the row was standing.
   */
  function placeTestRow(): void {
    let x = 15;
    for (const car of cars) {
      car.reset(new THREE.Vector3(x, 0, 5), 0);
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

  /**
   * Things that have to run BETWEEN physics steps rather than once per frame.
   * The world runs 4 steps per frame, and anything driving a body has to keep
   * pace with the steps — the finger most of all, since it asks for contact to
   * be resolved between its own moves.
   */
  const stepHooks = new Set<() => void>();

  /**
   * ONE owner per gesture. Both control schemes listen to the same canvas, and
   * they disagree about what a touch means: a touch ON the Car starts the
   * slingshot's aim, while for the flick that same touch must stay silent. If
   * each layer decides for itself, the loser still hears the pointer and can
   * act later — so the owner is claimed once, by whoever is enabled, and the
   * other layer sees nothing at all.
   */
  const gestureOwner = { id: -1 };
  const claimGesture = (id: number): boolean => {
    if (gestureOwner.id !== -1) return false;
    gestureOwner.id = id;
    return true;
  };
  const releaseGesture = (): void => {
    gestureOwner.id = -1;
  };

  /**
   * Which scheme is listening. A and C are the same gesture with opposite
   * meanings (a touch ON the Car starts the slingshot's aim and must stay deaf
   * for C), so exactly one may hear a given pointer — the GUI decides which.
   */
  const scheme = { active: flickParams.on ? 'flick' : 'slingshot' };
  const flickActive = (): boolean => scheme.active === 'flick';

  setupSlingshot(
    game,
    getCar,
    () => cars,
    (picked) => setActive(cars.indexOf(picked)),
    pushParams,
    () => rules.pushUsed(),
    (reason) => hud.flash(reason),
    () => rules.canPush(), // the Turn budget: its own question, not the switch
    claimGesture,
    releaseGesture,
    () => !flickActive(), // slingshot mode only: otherwise hear nothing at all
  );

  /**
   * Where the last strike landed, kept readable for a couple of seconds. The
   * flick has no aiming pause, so this IS how the player learns where they hit
   * — with nothing on screen there is nothing to compare against the hand that
   * did it. The user asked for exactly this read.
   */
  const strikeMark = new THREE.Sprite(
    new THREE.SpriteMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      map: (() => {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(12,12,12,0.92)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2 - 12, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.13, 0, Math.PI * 2);
        ctx.fillStyle = '#141414';
        ctx.fill();
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
      })(),
    }),
  );
  strikeMark.scale.setScalar(0.13);
  strikeMark.renderOrder = 20;
  strikeMark.visible = false;
  scene.add(strikeMark);
  let strikeAge = 0;

  setupFlick(
    game,
    world,
    getCar,
    () => cars,
    (picked) => setActive(cars.indexOf(picked)),
    flickParams,
    () => rules.pushUsed(),
    (reason) => hud.flash(reason),
    () => rules.canPush() && flickActive(),
    (point) => {
      strikeMark.position.copy(point);
      strikeMark.visible = true;
      strikeAge = 0;
    },
    (text, illegal) => hud.setStrike(text, illegal),
    stepHooks.add.bind(stepHooks),
    flickActive,
    claimGesture,
    releaseGesture,
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

  // Surfaces are materials OF THE WORLD: each owns its share of the grip
  // (× this Car's tires). They can be swapped between the four squares below,
  // so any two can be compared along the same stretch of Track.
  const surfaceFolder = gui.addFolder('Surfaces (the world)');
  const surfaceOptions = Object.fromEntries(
    SURFACE_KEYS.map((k) => [SURFACES[k].label, k]),
  ) as Record<string, SurfaceKey>;
  function buildSurfaceFolder(): void {
    for (const c of [...surfaceFolder.children]) c.destroy();
    for (const key of SURFACE_KEYS) {
      const s = SURFACES[key];
      const folder = surfaceFolder.addFolder(s.label);
      // Roll ranges are ~1/10 of grip: grip decides g-force sideways, roll is
      // the gentle drag of keeping the Car rolling.
      folder.add(s, 'grip', 0.05, 1.5, 0.01).onFinishChange(persist);
      folder.add(s, 'roll', 0.001, 0.12, 0.001).name('roll resistance').onFinishChange(persist);
      folder
        .add(s, 'gravel', 0, 25, 1)
        .name('gravel (stones/unit²)')
        .onFinishChange(() => {
          // Stones are objects in the world, not a property of the plane, so
          // both the colliders and their meshes have to be rebuilt to change
          // how many there are (the cost of that is measured in ticket 17).
          terrain.reground();
          refreshTerrainView();
          persist();
        });
    }
    for (const q of SQUARES) {
      surfaceFolder
        .add({ [q]: field.squares[q] }, q, surfaceOptions)
        .name(SQUARE_LABELS[q])
        .onChange((key: SurfaceKey) => {
          field.put(q, key);
          refreshTerrainView();
          persist();
        });
    }
    surfaceFolder
      .add({ base: field.squares.base }, 'base', surfaceOptions)
      .name(SQUARE_LABELS.base)
      .onChange((key: SurfaceKey) => {
        field.put('base', key);
        refreshTerrainView();
        persist();
      });
  }
  buildSurfaceFolder();

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
    // Tires: this Car's HALF of the grip. The contact multiplies them with
    // the Surface's (µ = surface.grip × tireGrip) — see ADR-0002.
    carFolder.add(p, 'tireGrip', 0.1, 1.5, 0.05).name('tire grip (× Surface)')
      .onFinishChange(() => { rebuildCar(active); persist(); });
    carFolder.add(p, 'tireRoll', 0.1, 3, 0.05).name('tire roll (× Surface)')
      .onFinishChange(() => { rebuildCar(active); persist(); });
    carFolder.add(p, 'angularDamping', 0, 2, 0.05).name('bearing damping (Car only)')
      .onFinishChange(() => { rebuildCar(active); persist(); });
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

  // The scheme switch sits above the two folders it gates: which Push numbers
  // mean anything depends on which scheme is hearing the screen.
  gui
    .add(scheme, 'active', { Slingshot: 'slingshot', Flick: 'flick' })
    .name('Control scheme (A / C)')
    .onChange((v: string) => {
      flickParams.on = v === 'flick';
      hud.flash(v === 'flick' ? 'Flick — swipe through the Car' : 'Slingshot — touch the Car, drag, release');
      persist();
    });

  const flickFolder = gui.addFolder('Flick (option C)');
  // Ranges, not recommendations: the first seed defaults (mass 5, strength 300)
  // were far too strong — over 3 m of roll from one flick — and the user dialled
  // them DOWN to 0.5 and 100. So both go an order of magnitude below that and
  // the mass slider reaches well under the Car's own mass, which is where the
  // interesting combinations with a stronger hand live.
  flickFolder.add(flickParams, 'maxAccel', 5, 2000, 5).name('hand strength (max accel)').onFinishChange(persist);
  flickFolder.add(flickParams, 'massFactor', 0.02, 20, 0.01).name('finger mass (× Car)').onFinishChange(persist);
  flickFolder.add(flickParams, 'maxPenetration', 0.002, 0.03, 0.001).name('max penetration (m)').onFinishChange(persist);
  flickFolder.add(flickParams, 'across', 0.01, 0.15, 0.005).name('knuckle across (m)').onFinishChange(persist);
  flickFolder.add(flickParams, 'deep', 0.01, 0.15, 0.005).name('knuckle along (m)').onFinishChange(persist);
  flickFolder.add(flickParams, 'tall', 0.01, 0.15, 0.005).name('knuckle tall (m)').onFinishChange(persist);
  flickFolder.add(flickParams, 'window', 0.1, 1, 0.05).name('legal strike window (s)').onFinishChange(persist);
  flickFolder
    .add({ recentre: () => setActive(active) }, 'recentre')

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
    cars[i] = new Car(world, scene, carList[i], field);
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
    for (let i = 0; i < 4; i++) {
      // Input that drives a body acts per step, before that step is taken.
      for (const hook of stepHooks) hook();
      world.step(); // 4 × 1/240 = one 60 fps frame
    }
    for (const c of cars) c.sync(dt);
    // The strike marker outlives the gesture, then goes: nothing here is a
    // permanent mark on the world.
    if (strikeMark.visible) {
      strikeAge += dt;
      strikeMark.material.opacity = Math.max(0, 1 - strikeAge / MARKER_LINGER);
      if (strikeAge >= MARKER_LINGER) strikeMark.visible = false;
    }
    rules.update(dt);

    const car = getCar();
    // Which Surface is under each wheel — the whole point of ticket 16 has to
    // be watchable, not just true.
    hud.setWheelSurfaces(
      car
        .wheelSurfaces()
        .map((s) => (s ? { label: s.label, color: s.color } : { label: 'air', color: 0xffffff })),
    );
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
    field,
    track,
    rules,
    camera: game.camera,
    setTestField,
    setCarParams,
  };
}
