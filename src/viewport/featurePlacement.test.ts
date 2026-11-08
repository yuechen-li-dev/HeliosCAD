import { describe, expect, it } from 'vitest';
import type { PlanarFaceSupport } from '@aetheris/cad';
import { constrainCenter, localPoint, worldPoint } from './featurePlacement';

const face: PlanarFaceSupport = { origin: [3,0,3], x: [1,0,0], y: [0,-1,0], normal: [0,0,-1], boundary: [[0,0],[27,0],[27,20],[0,20]] };
describe('face placement geometry', () => {
  it('keeps a dragged disk inside every boundary with a positive margin', () => {
    const clamped = constrainCenter(face, [-100,100], 6)!;
    expect(clamped[0]).toBeCloseTo(3.01001, 9); expect(clamped[1]).toBeCloseTo(16.98999, 9);
    expect(constrainCenter(face, [13,10], 6)).toEqual([13,10]);
  });
  it('refuses zero diameter, oversized and non-finite candidates', () => {
    expect(constrainCenter(face, [13,10], 0)).toBeNull();
    expect(constrainCenter(face, [13,10], 21)).toBeNull();
    expect(constrainCenter(face, [NaN,10], 6)).toBeNull();
  });
  it('round-trips coordinates through the selected face frame', () => {
    expect(worldPoint(face, [13,10])).toEqual([16,-10,3]);
    expect(localPoint(face, [16,-10,3])).toEqual([13,10]);
  });
  it('moves a preview clear of an existing circular opening without changing its diameter', () => {
    const support = { ...face, excludedDisks: [{ center: [13,10], radius: 3 }] };
    const result = constrainCenter(support, [13,10], 6)!;
    expect(Math.hypot(result[0] - 13, result[1] - 10)).toBeCloseTo(6.01001, 9);
    expect(constrainCenter(support, [23,10], 6)).toEqual([23,10]);
  });
  it('finds the nearest feasible point between two hole exclusions', () => {
    const support = { ...face, excludedDisks: [{ center: [8,10], radius: 3 }, { center: [18,10], radius: 3 }] };
    const result = constrainCenter(support, [13,10], 6)!;
    expect(result[0]).toBeCloseTo(13, 8);
    for (const disk of support.excludedDisks) expect(Math.hypot(result[0] - disk.center[0], result[1] - disk.center[1])).toBeGreaterThanOrEqual(6.01);
  });
  it('finds a corner pocket when radial projections alone would be outside the face', () => {
    const support = { ...face, boundary: [[0,0],[10,0],[10,10],[0,10]], excludedDisks: [{ center: [5,5], radius: 3 }] };
    const result = constrainCenter(support, [5,5], 2)!;
    expect(result).not.toBeNull(); expect(Math.hypot(result[0] - 5, result[1] - 5)).toBeCloseTo(4.01001, 8);
    expect(constrainCenter({ ...support, excludedDisks: [{ center: [5,5], radius: 100 }] }, [5,5], 2)).toBeNull();
  });
});
