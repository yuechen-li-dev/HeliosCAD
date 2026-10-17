import type { TelosCamera, TelosPresentation } from '@aetheris/three-telos';

/** Grid lines on the XY ground plane, as segment endpoints (x0, y0, z0, x1, y1, z1, …). */
export interface ReferenceGrid {
  /** Spacing between adjacent lines, in model units: always 1, 2 or 5 × a power of ten. */
  readonly step: number;
  readonly minor: readonly number[];
  readonly major: readonly number[];
  /** Changes only when the lines do, so a renderer can skip rebuilding them. */
  readonly key: string;
}

/** The step for a view `span` wide: about `targetCells` cells across, rounded up to 2, 5 or 10. */
export function gridStep(span: number, targetCells = 12) {
  const desired = Math.max(span, 1e-8) / targetCells;
  const decade = Math.pow(10, Math.floor(Math.log10(desired)));
  const ratio = desired / decade;
  return decade * (ratio < 2 ? 2 : ratio < 5 ? 5 : 10);
}

/**
 * The reference grid the WebGPU viewport draws for this camera. It follows the view: the step comes
 * from how much is in view and the lines are centred under the target. The WebGL viewport draws it
 * too, so a cell is the same size whichever renderer the device uses. Mirrors `updateGrid` in
 * three-telos' host for the XY plane.
 */
export function referenceGrid(camera: TelosCamera, style?: TelosPresentation['grid']): ReferenceGrid {
  const corners: [number, number][] = [[0, 0], [camera.width, 0], [0, camera.height], [camera.width, camera.height]];
  const reach: number[] = [];
  for (const pixel of corners) {
    const ray = camera.worldRay(pixel);
    const t = -ray.origin.z / ray.direction.z;
    if (Number.isFinite(t) && t > 0 && t < camera.far) reach.push(ray.origin.clone().addScaledVector(ray.direction, t).distanceTo(camera.target));
  }
  const span = Math.max(camera.span, camera.position.distanceTo(camera.target) * 0.5, 1e-8);
  const extent = Math.min(span * 20, Math.max(span, ...reach));
  const step = gridStep(span, style?.targetCells ?? 12);
  const centerX = Math.round(camera.target.x / step) * step;
  const centerY = Math.round(camera.target.y / step) * step;
  const count = Math.min(style?.maxLines ?? 32, Math.ceil(extent * (style?.extentScale ?? 1) / step));
  const every = style?.majorStep ?? 5;
  const z = style?.offset ?? 0;
  const minor: number[] = [], major: number[] = [];
  for (let i = -count; i <= count; i++) {
    (Math.round(centerX / step + i) % every === 0 ? major : minor)
      .push(centerX + i * step, centerY - count * step, z, centerX + i * step, centerY + count * step, z);
    (Math.round(centerY / step + i) % every === 0 ? major : minor)
      .push(centerX - count * step, centerY + i * step, z, centerX + count * step, centerY + i * step, z);
  }
  return { step, minor, major, key: `${step}:${centerX}:${centerY}:${count}:${z}` };
}
