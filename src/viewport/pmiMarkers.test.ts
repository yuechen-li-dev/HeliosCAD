import { describe, expect, it } from 'vitest';
import type { PmiDisplayAnnotation } from '@aetheris/cad';
import { layoutTags, leaderStart, markerColor, markerTags } from './pmiMarkers';

const annotation = (id: string, name: string, text: string, positions?: number[]) => ({
  id, kind: 'Diameter', name, text, value: null, tolerancePlus: null, toleranceMinus: null, stepFaceEntities: [], anchor: [9, 9, 9], labelPosition: [0, 0, 0],
  textHeight: 3, lines: [], target: positions ? { kind: 'PlanePatch', normal: [0, 0, 1], stemLength: 1, surfaceOffset: 0, positions, normals: [], indices: [], lines: [] } : null,
}) as PmiDisplayAnnotation;

describe('PMI markers', () => {
  it('numbers records in Pmi order, colours them apart and anchors them at their target', () => {
    const tags = markerTags([annotation('a', 'Bore', 'Ø10 +0.02/-0.01', [0, 0, 0, 2, 0, 0, 0, 2, 0, 2, 2, 0]), annotation('b', 'A', 'Datum A')]);
    expect(tags.map(t => [t.number, t.label])).toEqual([[1, 'Ø10 +0.02/-0.01 · Bore'], [2, 'Datum A']]);
    expect(tags[0]!.anchor).toEqual([1, 1, 0]);
    expect(tags[1]!.anchor).toEqual([9, 9, 9]);
    expect(markerColor(0)).not.toBe(markerColor(1));
  });
  it('lays tags out without overlaps, inside the view, leaders leaving the near edge', () => {
    // Five records whose targets crowd one spot.
    const tags = [0, 1, 2, 3, 4].map(i => ({ id: String(i), ax: 400 + i * 3, ay: 300 + i * 2, width: 140, height: 22 }));
    const placed = layoutTags(tags, 800, 600);
    expect(placed).toHaveLength(5);
    for (const a of placed) {
      expect(a.x).toBeGreaterThanOrEqual(4); expect(a.y).toBeGreaterThanOrEqual(4);
      expect(a.x + a.width).toBeLessThanOrEqual(796); expect(a.y + a.height).toBeLessThanOrEqual(596);
      for (const b of placed) if (a !== b) expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
      const [sx, sy] = leaderStart(a);
      expect(sx).toBeGreaterThanOrEqual(a.x); expect(sx).toBeLessThanOrEqual(a.x + a.width);
      expect(sy).toBeGreaterThanOrEqual(a.y); expect(sy).toBeLessThanOrEqual(a.y + a.height);
    }
    expect(layoutTags(tags, 800, 600)).toEqual(placed);
  });
});
