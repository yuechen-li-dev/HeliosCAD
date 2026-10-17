import type { TelosCamera } from '@aetheris/three-telos';

// One camera convention for both renderers. Aetheris geometry is Z-up in millimetres: the WebGPU
// viewport and the WebGL fallback both drive a TelosCamera with these rules, so a model is framed,
// oriented and sized the same whichever renderer draws it.

/** World up for every model view. */
export const WORLD_UP: readonly [number, number, number] = [0, 0, 1];

/** Named views look from these directions; Front, Top and Right switch to orthographic. */
export const VIEW_DIRECTIONS: Readonly<Record<string, readonly [number, number, number]>> = {
  front: [0, -1, 0],
  top: [0, 0, 1],
  right: [1, 0, 0],
  iso: [1, 1, 1],
};

/** Move the camera to a named view around its current target, keeping its distance. Returns false for
 * commands that are not named views (fit, fitselection, authored). */
export function applyNamedView(camera: TelosCamera, command: string): boolean {
  const direction = VIEW_DIRECTIONS[command];
  if (!direction) return false;
  if (command !== 'iso') camera.mode = 'orthographic';
  const distance = Math.max(camera.position.distanceTo(camera.target), camera.near * 10);
  camera.position.set(...direction).normalize().multiplyScalar(distance).add(camera.target);
  // Looking straight down Z, screen up is +Y; every other view keeps Z up.
  if (command === 'top') camera.up.set(0, 1, 0);
  else camera.up.set(...WORLD_UP);
  return true;
}
