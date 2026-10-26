import { describe, expect, it } from 'vitest';
import type { DraftSpan, SketchShape } from '@aetheris/cad';
import { alignedNeighbours, arcEnd, explainRefusal, freshName, predictedBounds, snap, snapStep, traceClosure, translation, type Point } from './draftGeometry';

const rect = (id: string, cx: number, cy: number, w: number, h: number, editable = true): SketchShape => ({
  id, name: id, kind: 'Rect2', center: [cx, cy], controls: [
    { id: `${id}/w`, label: 'Width', value: w }, { id: `${id}/h`, label: 'Height', value: h },
    { id: `${id}/cx`, label: 'Center X', value: cx }, { id: `${id}/cy`, label: 'Center Y', value: cy },
  ].map(c => ({ ...c, authored: String(c.value), unit: 'mm', editable, parameter: null, readOnlyReason: null, span: { start: 0, length: 0 } })),
});

describe('snapping', () => {
  it('chooses a round step that stays visible at the current zoom', () => {
    expect(snapStep(9)).toBe(1); expect(snapStep(2)).toBe(5); expect(snapStep(100)).toBe(0.1); expect(snapStep(0.01)).toBe(100);
  });
  it('snaps without binary noise', () => {
    expect(snap(0.30000001, 0.1)).toBe(0.3); expect(snap(-12.6, 5)).toBe(-15); expect(snap(3.8, 1)).toBe(4);
  });
});

describe('aligned neighbours', () => {
  // The L-bracket from the UX pass: notch lined up with outer's top-right corner.
  const outer = rect('outer', 0, 0, 55.6, 37.6), notch = rect('notch', 13.35, 8.25, 28.9, 21.1);
  const others = [{ shape: notch, bounds: predictedBounds(notch)! }];

  it('offers to keep the notch on the corner when outer gets wider', () => {
    const before = predictedBounds(outer)!, after = predictedBounds(outer, new Map([['outer/w', 80]]))!;
    const [found] = alignedNeighbours(outer, before, after, others);
    expect(found.shape.id).toBe('notch');
    expect(found.offset[0]).toBeCloseTo(12.2, 9); expect(found.offset[1]).toBe(0);
    expect(found.reasons[0]).toBe("notch's right edge is lined up with outer's right edge");
    expect(translation(notch, found.offset)).toEqual([{ control: 'notch/cx', value: 25.55 }]);
  });
  it('ignores a centre line that merely coincides with a moving edge', () => {
    const small = rect('small', -10, 0, 20, 20), big = rect('big', 0, 0, 60, 40);
    const before = predictedBounds(small)!, after = predictedBounds(small, new Map([['small/w', 52]]))!;
    expect(alignedNeighbours(small, before, after, [{ shape: big, bounds: predictedBounds(big)! }])).toEqual([]);
  });
  it('asks nothing when the moving edges touch no other shape', () => {
    const before = predictedBounds(outer)!, after = predictedBounds(outer, new Map([['outer/h', 50]]))!;
    expect(alignedNeighbours(outer, before, after, [{ shape: notch, bounds: { x: -100, y: -100, width: 1, height: 1 } }])).toEqual([]);
  });
  it('never offers shapes whose position is driven by an expression', () => {
    const driven = rect('driven', 13.35, 8.25, 28.9, 21.1, false);
    const before = predictedBounds(outer)!, after = predictedBounds(outer, new Map([['outer/w', 80]]))!;
    expect(alignedNeighbours(outer, before, after, [{ shape: driven, bounds: predictedBounds(driven)! }])).toEqual([]);
  });
  it('treats quarter-turned slots and refuses to guess at other rotations', () => {
    const slot: SketchShape = { ...rect('slot', 0, 0, 0, 0), kind: 'Slot2', controls: [
      { id: 's/l', label: 'Overall length', value: 40 }, { id: 's/w', label: 'Width', value: 10 }, { id: 's/r', label: 'Rotation', value: 90 },
      { id: 's/cx', label: 'Center X', value: 0 }, { id: 's/cy', label: 'Center Y', value: 0 },
    ].map(c => ({ ...c, authored: '', unit: 'mm', editable: true, parameter: null, readOnlyReason: null, span: { start: 0, length: 0 } })) };
    expect(predictedBounds(slot)).toEqual({ x: -5, y: -20, width: 10, height: 40 });
    expect(predictedBounds(slot, new Map([['s/r', 30]]))).toBeNull();
  });
});

describe('trace closure', () => {
  const line = (id: string, a: Point, b: Point): DraftSpan => ({ id, owner: 'o', reference: id, from: id + 'A', to: id + 'B',
    curve: { id, name: id, kind: 'Line', points: [a, b], center: null, radius: 0, startAngle: 0, sweep: 0, minorRadius: 0, rotation: 0 } });
  const square = [line('a', [0, 0], [1, 0]), line('b', [1, 1], [1, 0]), line('c', [1, 1], [0, 1]), line('d', [0, 1], [0, 0])];
  const pts = (s: DraftSpan) => s.curve.points.map(p => [p[0], p[1]] as const);
  const pick = (...ids: string[]) => ids.map(id => ({ reference: id, from: id + 'A', to: id + 'B' }));
  it('joins spans in either direction and reports a closed outline', () => {
    const result = traceClosure(pick('a', 'b', 'c', 'd'), square, pts);
    expect(result.closed).toBe(true); expect(result.polygon).toHaveLength(5);
  });
  it('reports where an open outline currently ends', () => {
    const result = traceClosure(pick('a', 'b'), square, pts);
    expect(result.closed).toBe(false); expect(result.open).toEqual([1, 1]);
  });
  it('leaves guide entries it cannot place to the compiler', () => {
    expect(traceClosure([{ reference: 'bottom' }, ...pick('a')], square, pts)).toMatchObject({ known: false, closed: false });
  });
  it('treats a whole-shape outline as closed', () => {
    expect(traceClosure([{ reference: 'rect1', wholeLoop: true }], [], pts).closed).toBe(true);
  });
});

describe('words', () => {
  it('names shapes rect1, rect2, …', () => { expect(freshName('rect', new Set(['rect1']))).toBe('rect2'); });
  it('explains a pulled-apart trace in terms of the shapes involved', () => {
    const text = 'sketch-profile-invalid: firmament-pipeline-endpoint-not-on-guide:outer.Right:outer.BottomRight:notch.BottomRight firmament-profile-pipeline-disconnected:notch.Bottom';
    expect(explainRefusal(text)).toMatch(/^This change pulls the traced outline apart: outer and notch no longer meet/);
  });
  it('passes unknown compiler text through unchanged', () => { expect(explainRefusal('something else')).toBe('something else'); });
});

describe('arc ends', () => {
  it('lands on the circle at 15° steps and is exact on the axes', () => {
    expect(arcEnd([0, 20], [20, 20], [-19, 21])).toEqual([-20, 20]);
    const [x, y] = arcEnd([0, 0], [10, 0], [7, 7.5]);
    expect(Math.hypot(x, y)).toBeCloseTo(10, 12); expect(Math.atan2(y, x) * 180 / Math.PI).toBeCloseTo(45, 9);
  });
  it('follows the cursor freely with Alt', () => {
    const [x, y] = arcEnd([0, 0], [10, 0], [3, 4], 15, true);
    expect([x, y].map(v => Number(v.toFixed(9)))).toEqual([6, 8]);
  });
});
