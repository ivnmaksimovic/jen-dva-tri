import * as THREE from 'three';
import type { Game } from './Game.js';

/**
 * Placeholder scene: a lit, spinning icosahedron you can drag to orbit.
 * Replace this module with the real game once the design is settled.
 */
export function createDemoScene(scene: THREE.Scene, game?: Game): void {
  scene.background = new THREE.Color('#101018');

  scene.add(new THREE.AmbientLight('#404060', 2));
  const key = new THREE.DirectionalLight('#ffffff', 3);
  key.position.set(2, 3, 4);
  scene.add(key);

  const mesh = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1),
    new THREE.MeshStandardMaterial({ color: '#e05d5d', flatShading: true }),
  );
  scene.add(mesh);

  // Slow idle spin.
  mesh.rotation.x = 0.35;
  mesh.rotation.y = 0.5;
  game?.onUpdate((dt) => {
    mesh.rotation.y += dt * 0.4;
  });

  // Drag (touch or mouse) to spin the shape directly.
  let lastX = 0;
  let dragging = false;
  const el = game?.renderer.domElement ?? document.body;
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    mesh.rotation.y += (e.clientX - lastX) * 0.01;
    lastX = e.clientX;
  });
  el.addEventListener('pointerup', () => (dragging = false));
  el.addEventListener('pointerleave', () => (dragging = false));
}
