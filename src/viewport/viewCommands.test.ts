import { describe, expect, it } from 'vitest';
import { TelosCamera } from '@aetheris/three-telos';
import { applyNamedView, VIEW_DIRECTIONS, WORLD_UP } from './viewCommands';
import { gridStep, referenceGrid } from './referenceGrid';
import { HELIOS_PRESENTATIONS } from './presentation';

const fitted = () => {
  const camera = new TelosCamera();
  camera.up.set(...WORLD_UP);
  camera.resize(800, 600);
  camera.fit([-40, -30, 0], [40, 30, 8]);
  return camera;
};
const direction = (camera: TelosCamera) => camera.position.clone().sub(camera.target).normalize().toArray().map(v => Math.round(v * 1e6) / 1e6 + 0);

describe('named views', () => {
  it('frames Z-up: the model rests on XY and fit looks down at it from the front right', () => {
    const camera = fitted();
    expect(camera.up.toArray()).toEqual([0, 0, 1]);
    const [x, y, z] = direction(camera);
    expect(x).toBeGreaterThan(0); expect(y).toBeLessThan(0); expect(z).toBeGreaterThan(0);
  });

  it.each(Object.entries(VIEW_DIRECTIONS))('%s looks along its axis and keeps the distance', (view, axis) => {
    const camera = fitted();
    const distance = camera.position.distanceTo(camera.target);
    expect(applyNamedView(camera, view)).toBe(true);
    const length = Math.hypot(...axis);
    expect(direction(camera)).toEqual(axis.map(v => Math.round(v / length * 1e6) / 1e6 + 0));
    expect(camera.position.distanceTo(camera.target)).toBeCloseTo(distance, 9);
    expect(camera.mode).toBe(view === 'iso' ? 'perspective' : 'orthographic');
    // Top looks down Z, so Y is up on screen; every other view keeps Z up.
    expect(camera.up.toArray()).toEqual(view === 'top' ? [0, 1, 0] : [0, 0, 1]);
  });

  it('ignores commands that are not views', () => {
    const camera = fitted();
    const before = camera.position.toArray();
    expect(applyNamedView(camera, 'fit')).toBe(false);
    expect(camera.position.toArray()).toEqual(before);
  });
});

describe('reference grid', () => {
  it('steps by 1, 2 or 5 × a power of ten', () => {
    expect(gridStep(74, 14)).toBe(10);
    expect(gridStep(20, 14)).toBe(2);
    expect(gridStep(3, 14)).toBe(0.5);
    expect(gridStep(900, 14)).toBe(100);
  });

  it('lies on the ground plane under the target, with every fifth line major', () => {
    const camera = fitted();
    const style = HELIOS_PRESENTATIONS.apollonia.grid;
    const grid = referenceGrid(camera, style);
    expect(grid.step).toBe(gridStep(Math.max(camera.span, camera.position.distanceTo(camera.target) * 0.5), style.targetCells));
    const zs = [...grid.minor, ...grid.major].filter((_, i) => i % 3 === 2);
    expect(new Set(zs)).toEqual(new Set([style.offset]));
    // Lines on multiples of the major spacing are major.
    const majorX = grid.major.filter((_, i) => i % 6 === 0 && grid.major[i] === grid.major[i + 3]);
    for (const x of majorX) expect(Math.abs(Math.round(x / grid.step) % style.majorStep)).toBe(0);
    expect(grid.minor.length).toBeGreaterThan(grid.major.length);
  });

  it('keeps its key while the view barely moves, and changes it when the scale does', () => {
    const camera = fitted();
    const before = referenceGrid(camera).key;
    camera.position.multiplyScalar(1.0001); camera.update();
    expect(referenceGrid(camera).key).toBe(before);
    camera.position.multiplyScalar(6); camera.update();
    expect(referenceGrid(camera).key).not.toBe(before);
  });
});
