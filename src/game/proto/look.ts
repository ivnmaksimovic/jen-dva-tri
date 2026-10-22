import * as THREE from 'three';
import type { Game } from '../Game.js';

/**
 * THROWAWAY PROTOTYPE CODE — ticket 20: make it look like the thing it is.
 *
 * Chalk on concrete, outdoors, lit by one sun. Nothing here invents a mood:
 * it removes the reasons a correct scene still reads as a rendering.
 *
 *  - **Tone mapping.** Without it every highlight past 1.0 clips to a flat white
 *    patch, so sunlit concrete looks like paper. ACESFilmic rolls the highlights
 *    off the way film (and eyes) do.
 *  - **An environment.** Metals and the glass Surface were lit by two lights and
 *    nothing else, which leaves them looking like grey plastic: metal can only
 *    show you what is around it. One small procedural sky/ground cube gives them
 *    something true to reflect. Built once; costs nothing per frame.
 *  - **Fog relative to the camera.** It was absolute (40–90 units), which is
 *    invisible up close and catastrophic when zoomed out — once zoom reaches
 *    x60 the whole world sits beyond `far` and fades to nothing exactly when you
 *    zoom out to look at it. Anchoring it to how far the camera actually is
 *    makes depth read the same at every distance.
 *  - **Shadow bias.** `normalBias` pushes acne off surfaces without the classic
 *    side effect of the shadow creeping away from the object's feet.
 *
 * Every knob exists because the user owns the numbers and I cannot see the
 * screen; defaults are deliberately conservative.
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
}

export const DEFAULT_LOOK: LookParams = {
  exposure: 1.0,
  toneMapping: true,
  envIntensity: 1.0,
  skyBrightness: 1.0,
  shadows: true,
  chalkWidth: 0.05, // ~5 mm real: a chalk line, not the edge of a road
  haze: 1.0,
};

/**
 * A tiny procedural sky: bright above, dull ground below, sun-side warmer.
 * Deliberately NOT a photograph — an environment map here exists to tell metal
 * and glass which way is up, and a gradient does that for almost no memory.
 */
function skyEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2; // equirectangular: two units wide for one up
  const ctx = canvas.getContext('2d')!;

  const horizon = canvas.height * 0.5;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#dfeaf7');
  sky.addColorStop(1, '#b9c6d4');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, horizon);

  const ground = ctx.createLinearGradient(0, horizon, 0, canvas.height);
  ground.addColorStop(0, '#8d8b82');
  ground.addColorStop(1, '#5a5952');
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, canvas.width, horizon);

  // One soft sun, so highlights have a direction to come from.
  const sun = ctx.createRadialGradient(size * 0.72, horizon * 0.45, 0, size * 0.72, horizon * 0.45, size * 0.22);
  sun.addColorStop(0, 'rgba(255,248,230,0.95)');
  sun.addColorStop(1, 'rgba(255,248,230,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, canvas.width, horizon);

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
}

export interface LookHandles {
  /** Call after changing params: tone mapping and env need re-applying. */
  refresh(): void;
  /** Once per frame: keeps haze honest whatever the camera is doing. */
  update(cameraDistance: number): void;
  /** Chalk width in world units — shared by every chalk line drawn. */
  chalkWidth(): number;
  dispose(): void;
}

export function setupLook(game: Game, params: LookParams): LookHandles {
  const scene = game.scene;
  const renderer = game.renderer;
  let env: THREE.Texture | null = null;

  /** How far the camera sits at default zoom — the haze's reference distance. */
  const DEFAULT_ARM = 5.5;
  const baseFog = {
    near: 40,
    far: 90,
    color: (scene.fog as THREE.Fog | null)?.color.clone() ?? new THREE.Color('#b9c6d4'),
  };

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
    if (params.skyBrightness <= 0) {
      scene.environmentIntensity = 0;
      return;
    }
    env = skyEnvironment(renderer);
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
    chalkWidth(): number {
      return params.chalkWidth;
    },
    dispose(): void {
      if (env) env.dispose();
      scene.environment = null;
    },
  };
}
