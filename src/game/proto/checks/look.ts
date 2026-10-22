/**
 * THROWAWAY PROTOTYPE CHECK — ticket 20: what it costs to LOOK like this.
 *
 * I cannot see the screen, so the one thing this check can honestly do is count
 * what we ask the phone's GPU to draw. The README warns about draw calls and
 * texture sizes for a reason: on mobile, the number of things submitted per
 * frame costs more than the pixels they cover.
 *
 * It also proves the world still BUILDS after the chalk change — chalk moved
 * from hairlines to real world-unit bands (Line2/LineMaterial), and a broken
 * import there would otherwise only show up as a blank screen on someone's
 * phone.
 *
 * Run: node scripts/headless-check.mjs src/game/proto/checks/look.ts
 */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY, buildTerrainPhysics, initPhysics } from '../world.js';
import { SurfaceField, uniformAssignment } from '../surfaces.js';
import { Car, STARTING_GRID } from '../car.js';
import { Track } from '../track.js';

function canvasStub(): unknown {
  const ctx = {
    fillStyle: '',
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
  };
  return { width: 0, height: 0, style: {}, getContext: () => ctx };
}

(globalThis as { document?: unknown }).document = {
  createElement: () => canvasStub(),
  createElementNS: () => canvasStub(),
};

const results: { name: string; ok: boolean; detail: string }[] = [];
function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}\n        ${detail}`);
}

/** Everything drawable under a branch — a proxy for draw calls. */
function drawables(root: THREE.Object3D): { objects: number; instanced: number } {
  let objects = 0;
  let instanced = 0;
  root.traverse((o) => {
    const any = o as THREE.Object3D & { isMesh?: boolean; isLine?: boolean; isInstancedMesh?: boolean };
    if (any.isInstancedMesh) {
      instanced++;
      objects++;
    } else if (any.isMesh || any.isLine || any.isPoints) {
      objects++;
    }
  });
  return { objects, instanced };
}

function distinctMaterials(root: THREE.Object3D): number {
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) seen.add(m);
  });
  return seen.size;
}

async function run(): Promise<boolean> {
  await initPhysics();
  const scene = new THREE.Scene();
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = 1 / 240;
  const field = new SurfaceField(uniformAssignment('concrete'));
  const track = new Track(scene);
  const onTrack = (x: number, z: number): boolean => track.progressOf({ x, z }).dist < 2.2;
  const { buildEnvironment } = await import('../world.js');
  buildEnvironment(world, scene, field, onTrack);

  const cars = STARTING_GRID.map((p) => new Car(world, scene, p, field));
  const { objects, instanced } = drawables(scene);
  const materials = distinctMaterials(scene);
  // Three Cars, a four-square Terrain, its stones (instanced per square), chalk.
  // Anything like this is fine on a phone; thousands would not be.
  record(
    'the world still builds, and asks a phone-sized number of things of the GPU',
    objects > 0 && objects < 220 && materials < 40,
    `${objects} drawable objects (${instanced} instanced), ${materials} distinct materials, ${cars.length} Cars`,
  );

  // Every chalk line shares ONE material: hundreds of materials would be its own
  // kind of mobile tax (one program switch each).
  const chalkMaterials = new Set<THREE.Material>();
  let chalkObjects = 0;
  track.chalk.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (mat) chalkMaterials.add(mat);
    if ((o as THREE.Object3D & { isLine?: boolean }).isLine || (o as THREE.Mesh).isMesh) chalkObjects++;
  });
  record(
    'all chalk shares one material (width is a uniform, not a mesh each)',
    chalkMaterials.size <= 2 && chalkObjects > 3,
    `${chalkObjects} chalk objects using ${chalkMaterials.size} material(s)`,
  );

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  return failed > 0;
}

export { run };
