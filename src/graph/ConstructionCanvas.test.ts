import { expect, it } from 'vitest';
import type { SketchShape } from '@aetheris/cad';
import { alignPlacement } from './ConstructionCanvas';

const target = { shape: { id: 'outer', name: 'outer' } as SketchShape, owner: 'layout', bounds: { x: -30, y: -20, width: 60, height: 40 } };
it('offers all four corner alignments and center alignment without requiring a relationship', () => {
  for (const [x, y] of [[-30, -20], [20, -20], [-30, 12], [20, 12], [-5, -4]]) {
    const result = alignPlacement({ x: x + .2, y: y - .3, width: 10, height: 8 }, [target], .5, false);
    expect(result.offset[0]).toBeCloseTo(-.2); expect(result.offset[1]).toBeCloseTo(.3);
    expect(result.guides).toHaveLength(2);
  }
  // No alignment is imposed outside the screen-space attraction distance.
  expect(alignPlacement({ x: 7, y: 6, width: 10, height: 8 }, [target], .5, false).offset).toEqual([0, 0]);
});
it('bypasses snapping entirely with Alt and does not mutate either projected shape', () => {
  const original = structuredClone(target);
  expect(alignPlacement({ x: -29.8, y: -19.7, width: 10, height: 8 }, [target], .5, true)).toEqual({ offset: [0, 0], guides: [] });
  expect(target).toEqual(original);
});
