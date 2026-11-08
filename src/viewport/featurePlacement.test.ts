import { describe, expect, it } from 'vitest';
import type { PlanarFaceSupport, SelectionDescription } from '@aetheris/cad';
import { bindFeaturePlacement, constrainCenter, localPoint, placementLines, worldPoint } from './featurePlacement';

const face: PlanarFaceSupport = { origin: [3,0,3], x: [1,0,0], y: [0,-1,0], normal: [0,0,-1], boundary: [[0,0],[27,0],[27,20],[0,20]] };
describe('face placement geometry', () => {
  it('keeps a newly picked face through pointerup while React still exposes the previous face guide', () => {
    const element = document.createElement('canvas');
    element.setPointerCapture = () => {}; element.hasPointerCapture = () => true; element.releasePointerCapture = () => {};
    const base: SelectionDescription = { occurrenceId: 'part', semanticEntityId: 'part', faceId: 'face:1', definitionId: 'part', semanticTopologyId: null,
      topologyKind: 'Face', outputRole: null, originFeature: null, selector: null, sourceAddressability: 'DerivedStable', selectorReason: null,
      source: null, buildRevision: 0, sourceAddressable: true };
    const old: SelectionDescription = { ...base, selector: 'old', support: { ...face, origin: [0,0,0] } };
    const picked: SelectionDescription = { ...base, selector: 'upright', support: { ...face, origin: [3,0,0], normal: [1,0,0], x: [0,1,0], y: [0,0,1] } };
    const placements: { selector: string | null | undefined; point: readonly number[] }[] = [];
    const record = (selection: SelectionDescription, point: readonly number[]) => placements.push({ selector: selection.selector, point });
    const unbind = bindFeaturePlacement(element, () => ({ placingFeature: true, placementGuide: { selection: old, center: [0,0], diameter: 6 },
      placementActions: { current: { place: record, move: point => record(old, point), reject: () => {} } } }),
      () => ({ origin: [10,10,10], direction: [-1,0,-1] }), () => picked);
    element.dispatchEvent(new MouseEvent('pointerdown', { button: 0 }));
    element.dispatchEvent(new MouseEvent('pointerup', { button: 0 }));
    unbind();
    expect(placements).toEqual([{ selector: 'upright', point: [3,10,3] }, { selector: 'upright', point: [3,10,3] }]);
  });
  it('draws the cutting arrow into the material for either face-normal sign', () => {
    for (const normal of [[0,0,1],[0,0,-1],[1,0,0],[-1,0,0]]) {
      const support = { ...face, normal, x: normal[0] ? [0,1,0] : [1,0,0], y: normal[0] ? [0,0,normal[0]] : [0,normal[2],0] };
      const selection: SelectionDescription = { support, occurrenceId: 'part', semanticEntityId: 'part', faceId: 'face:1', definitionId: 'part', semanticTopologyId: null,
        topologyKind: 'Face', outputRole: null, originFeature: null, selector: 'face(part.Side("edge"))', sourceAddressability: 'DerivedStable', selectorReason: null,
        source: null, buildRevision: 0, sourceAddressable: true };
      const lines = placementLines({ selection, center: [5,5], diameter: 7, shaftDiameter: 4 }).filter(l => !l.id.endsWith(':halo'));
      const arrow = Array.from(lines.at(-3)!.points), inward = arrow.slice(3).map((v,i) => v - arrow[i]);
      expect(inward.reduce((sum,v,i) => sum + v * normal[i], 0)).toBeLessThan(0);
      const tip = arrow.slice(3);
      for (const wing of lines.slice(-2)) expect(Array.from(wing.points).slice(0,3)).toEqual(tip);
    }
  });
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
