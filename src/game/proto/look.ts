import * as THREE from 'three';
import type { Game } from '../Game.js';
import { CHALK, DISTANT_GROUND, LIGHT, SKY } from './palette.js';
import { contactShadowTexture, skyTexture } from './textures.js';

/**
 * THROWAWAY PROTOTYPE CODE — the look.
 *
 * The direction lives in `docs/visual-direction.md`; this file is its
 * implementation. In one sentence: *make the phone feel like looking down at
 * your own pocket-sized world — chalk is drawn by a hand, the Cars are small
 * painted toys, and one honest afternoon sun leaves a shadow you can read.*
 *
 * What changed, and why each one was a real defect rather than a taste:
 *
 *  - **A real sky.** `scene.background` was one flat colour, so the horizon
 *    was a razor line where the 80-unit ground slab ended. Now the sky is a
 *    gradient with a baked sun, the ground runs out to a distant plane, and
 *    the haze carries one into the other.
 *  - **One sun, and a fill.** A hemisphere light plus a sun with no opposing
 *    fill left the shadow sides of everything at the same value as the lit
 *    sides. The fill is dim and cool; it exists to keep the dark side
 *    readable, not to flatten the image.
 *  - **Shadows that fit.** The shadow camera covered 46 units with a 2048 map
 *    — 2.2 cm per texel, for a car 4.5 cm long. Nothing readable came out of
 *    it. The frustum now follows what the player is looking at, and every
 *    Car additionally gets a soft contact smudge, which is what actually
 *    grounds a 1:64 car on the screen.
 *  - **Tone mapping and an environment**, so highlights roll off and metal
 *    and glass have something to reflect.
 *  - **Haze relative to the camera.** Fixed fog distances are only ever right
 *    at one zoom level; with a free camera they have to follow it.
 *
 * Every knob is in the GUI, because the user owns the numbers.
 */

export interface LookParams {
  /** Tone-mapped exposure. This is the single most useful dial. */
  exposure: number;
  toneMapping: boolean;
  /** Reflectance: how much the environment shows in metal and glass. */
  envIntensity: number;
  /** Multiplies the whole environment map (0 = off, no cost). */
  skyBrightness: number;
  shadows: boolean;
  /** Chalk band width, world units (1 unit = 10 real cm). */
  chalkWidth: number;
  /** How much the ground/air haze eats distance. 0 = none. */
  haze: number;
  /** Sun strength. */
  sun: number;
  /** How dark the contact smudge under a Car is. */
  contact: number;
}

export const DEFAULT_LOOK: LookParams = {
  exposure: 1.0,
  toneMapping: true,
  envIntensity: 0.42,
  skyBrightness: 1.0,
  shadows: true,
  chalkWidth: 0.07, // 7 mm real: a proper chalk line
  haze: 1.0,
  sun: 3.6,
  contact: 0.85,
};

/**
 * Where the sun is.
 *
 * The same numbers go into the sky texture and into the directional light, so
 * the bright patch in the sky and the shadows on the ground agree by
 * construction instead of by luck. About 45° up, over the car's right
 * shoulder.
 */
export const SUN_DIR = new THREE.Vector3(20, 24, 9).normalize();

export interface LookHandles {
  /** Call after changing params: tone mapping and env need re-applying. */
  refresh(): void;
  /** Once per frame: keeps haze honest whatever the camera is doing. */
  update(cameraDistance: number): void;
  /**
   * Keep the shadow frustum over what the player is looking at. A tight
   * frustum is the only way a 4.5 cm car gets a readable shadow.
   */
  focus(x: number, z: number): void;
  /** Match the shadow frustum to how far away the player is. */
  frameShadow(distance: number): void;
  /** Chalk width in world units — shared by every chalk line drawn. */
  chalkWidth(): number;
  dispose(): void;
}

/**
 * The soft smudge under each Car.
 *
 * A shadow map cannot resolve a 4.5 cm car over 30 m of ground, so this decal
 * is what makes the Car sit ON the ground instead of hovering over it. It is
 * skewed away from the sun and stretched along the sun's direction, so it
 * agrees with the real shadow rather than sitting under the car like a
 * sticker.
 */
export class ContactShadows {
  readonly mesh: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly flat = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -Math.PI / 2,
  );

  constructor(scene: THREE.Scene, count: number) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.MeshBasicMaterial({
      map: contactShadowTexture(),
      transparent: true,
      opacity: 1,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
  }

  /**
   * Put the smudge under one Car.
   *
   * `sunAzimuth` is the horizontal direction the light comes FROM; the
   * shadow lies the other way.
   */
  set(
    index: number,
    x: number,
    groundY: number,
    z: number,
    radius: number,
    strength: number,
    sunAzimuth: number,
  ): void {
    const away = sunAzimuth + Math.PI;
    const offset = radius * 0.42 * strength;
    this.pos.set(x + Math.cos(away) * offset, groundY + 0.004, z + Math.sin(away) * offset);
    this.quat.copy(this.flat);
    this.scale.set(radius * 2.1, radius * 2.9, 1);
    this.matrix.compose(this.pos, this.quat, this.scale);
    this.mesh.setMatrixAt(index, this.matrix);
  }

  commit(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/**
 * A tiny procedural sky: bright above, dull ground below, sun-side warmer.
 * Deliberately NOT a photograph — an environment map here exists to tell metal
 * and glass which way is up, and a gradient does that for almost no memory.
 */
function skyEnvironment(renderer: THREE.WebGLRenderer, source: THREE.Texture): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(source).texture;
  pmrem.dispose();
  return env;
}

export function setupLook(game: Game, params: LookParams): LookHandles {
  const scene = game.scene;
  const renderer = game.renderer;
  let env: THREE.Texture | null = null;
  let sky: THREE.Texture | null = null;

  /** How far the camera sits at default zoom — the haze's reference distance. */
  const DEFAULT_ARM = 5.5;
  const baseFog = {
    near: 40,
    far: 90,
    color: new THREE.Color(SKY.haze),
  };

  /**
   * The haze is OWNED here, and its colour is the sky's horizon colour.
   *
   * That equality is the whole point: the sky dome and the fog both go
   * through the same tone curve, so if they carry the same colour they
   * render identically and the horizon has no seam. With a fog colour that
   * was merely *similar* to the sky's horizon there was a visible band
   * across the screen at exactly eye level.
   */
  if (!scene.fog) scene.fog = new THREE.Fog(SKY.haze, baseFog.near, baseFog.far);
  else (scene.fog as THREE.Fog).color.setHex(SKY.haze);

  /**
   * The sky dome.
   *
   * A big sphere with the sky texture on the inside. It is a scene object
   * rather than `scene.background` so that it is tone-mapped like the rest
   * of the world and can meet the fog at the horizon without a seam.
   */
  const skyDome = new THREE.Mesh(
    new THREE.SphereGeometry(1200, 32, 20),
    new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
      toneMapped: true,
    }),
  );
  skyDome.renderOrder = -1000;
  skyDome.frustumCulled = false;
  scene.add(skyDome);

  /**
   * The ground beyond the play area.
   *
   * The world is an 80-unit slab, and at a low camera angle the slab's edge
   * was a hard line across the screen with sky under it. This is a much larger
   * sheet of the same pavement, sitting a hair below the slab so the step is
   * invisible, and the haze takes it from there. It never receives a shadow:
   * outside the shadow frustum a shadow map would clamp to "fully shadowed"
   * and paint the whole distance black.
   */
  const distant = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshStandardMaterial({
      color: DISTANT_GROUND,
      roughness: 1,
      metalness: 0,
    }),
  );
  distant.rotation.x = -Math.PI / 2;
  distant.position.set(13, -0.02, 11);
  distant.receiveShadow = false;
  scene.add(distant);

  function applyRenderer(): void {
    renderer.toneMapping = params.toneMapping
      ? THREE.ACESFilmicToneMapping
      : THREE.NoToneMapping;
    renderer.toneMappingExposure = params.exposure;
    renderer.shadowMap.enabled = params.shadows;
  }

  function applyEnvironment(): void {
    if (env) {
      scene.environment = null;
      env.dispose();
      env = null;
    }
    if (sky) {
      sky.dispose();
      sky = null;
    }
    // The sky is the BACKGROUND and the source of the environment: one
    // texture, so the reflection in a windscreen and the sky above it are
    // the same sky.
    sky = skyTexture();

    // The sky is a DOME, not `scene.background`.
    //
    // three.js does NOT tone-map a background texture (its material sets
    // `toneMapped = false` for an sRGB source), but it DOES tone-map the
    // fog. So a background sky and a fogged horizon could never meet: there
    // was a hard grey seam straight across the middle of the screen. As a
    // mesh, the sky goes through the same tone curve as everything else,
    // and the horizon disappears.
    skyDome.material.map = sky;
    skyDome.material.needsUpdate = true;
    skyDome.visible = params.skyBrightness > 0;

    if (params.skyBrightness <= 0) {
      scene.environmentIntensity = 0;
      return;
    }
    env = skyEnvironment(renderer, sky);
    scene.environment = env;
    scene.environmentIntensity = params.envIntensity * params.skyBrightness;
  }

  function refresh(): void {
    applyRenderer();
    applyEnvironment();
    for (const obj of scene.children) {
      const mat = (obj as THREE.Mesh).material as THREE.Material | undefined;
      if (mat) mat.needsUpdate = true;
    }
  }

  refresh();

  return {
    refresh,
    /**
     * Haze anchored to how far away we are looking from. With a free camera the
     * alternative — fixed distances — is only ever right at one zoom level.
     */
    update(cameraDistance: number): void {
      const fog = scene.fog as THREE.Fog | null;
      if (!fog) return;
      if (params.haze <= 0) {
        // There is no off switch on a Fog, and equal near/far divides by zero.
        // Push the pair out of reach — strictly ordered — so the factor is 0
        // everywhere instead of NaN.
        fog.near = cameraDistance + 1e6;
        fog.far = fog.near + 1;
        return;
      }
      const span = (baseFog.far - baseFog.near) * params.haze;
      fog.near = cameraDistance + (baseFog.near - DEFAULT_ARM);
      fog.far = fog.near + span;
    },
    focus(x: number, z: number): void {
      const sun = scene.getObjectByName('sun') as THREE.DirectionalLight | undefined;
      if (!sun) return;
      sun.target.position.set(x, 0, z);
      sun.target.updateMatrixWorld();
    },
    /**
     * Widen or narrow the shadow frustum to match how far away the player is.
     *
     * At the default framing the frustum is 22 units wide, so one shadow
     * texel is about a millimetre and a 4.5 cm car casts a shadow you can
     * read. Zoomed out to see the whole test ground it widens to 60, and
     * the cars are too small for their shadows to matter anyway.
     */
    frameShadow(distance: number): void {
      const sun = scene.getObjectByName('sun') as THREE.DirectionalLight | undefined;
      if (!sun) return;
      const sc = sun.shadow.camera as THREE.OrthographicCamera;
      const extent = THREE.MathUtils.clamp(distance * 1.9, 11, 30);
      if (Math.abs(sc.right - extent) < 0.05) return;
      sc.left = -extent;
      sc.right = extent;
      sc.top = extent;
      sc.bottom = -extent;
      sc.updateProjectionMatrix();
    },
    chalkWidth(): number {
      return params.chalkWidth;
    },
    dispose(): void {
      if (env) env.dispose();
      if (sky) sky.dispose();
      scene.environment = null;
      skyDome.geometry.dispose();
      (skyDome.material as THREE.Material).dispose();
      distant.geometry.dispose();
      (distant.material as THREE.Material).dispose();
    },
  };
}

/**
 * The light rig, built once and returned so the caller can aim the shadow.
 *
 * Exported separately from `setupLook` because the Lights are part of the
 * SCENE, not of the look parameters: they must exist exactly once, and the
 * GUI's shadow toggle has to be able to find them.
 */
export function buildLightRig(scene: THREE.Scene, params: LookParams): THREE.DirectionalLight {
  // Sky bounce: cool from above, warm from the ground it bounces off.
  //
  // Kept DELIBERATELY weak. A strong hemisphere light plus a bright sky
  // environment made every white surface — the chalk above all — read as
  // cold blue, because the skylight was doing as much work as the sun. In
  // real daylight the sun is roughly five times the skylight, and the
  // difference is the entire colour of the scene.
  const hemi = new THREE.HemisphereLight(LIGHT.sky, LIGHT.bounce, 0.4);
  scene.add(hemi);

  // The sun: one source, one direction, the only thing that casts.
  const sun = new THREE.DirectionalLight(LIGHT.sun, params.sun);
  sun.position.copy(SUN_DIR).multiplyScalar(42);
  sun.castShadow = true;
  sun.name = 'sun';
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera as THREE.OrthographicCamera;
  // The frustum follows what the player is looking at, and its SIZE follows
  // how far away they are: a 1:64 car only casts a readable shadow if the
  // shadow map is not also covering thirty metres of ground.
  sc.left = -11;
  sc.right = 11;
  sc.top = 11;
  sc.bottom = -11;
  sc.near = 1;
  sc.far = 120;
  sun.shadow.bias = -0.0004;
  // normalBias pushes the acne off a flat ground without the shadow
  // creeping away from the object's feet.
  sun.shadow.normalBias = 0.03;
  scene.add(sun);
  scene.add(sun.target);

  // A dim, cool fill from the opposite side. It exists so the SHADOW side of
  // a Car still shows its shape — without it, the dark side is a silhouette.
  const fill = new THREE.DirectionalLight(LIGHT.fill, 0.45);
  fill.position.set(-16, 12, -14);
  scene.add(fill);

  return sun;
}

/** The colour the chalk should be, exposed so the HUD can match it. */
export const CHALK_COLOUR = CHALK;
