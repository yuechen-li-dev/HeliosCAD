import { describe, expect, it } from 'vitest';
import type { DraftConstruction, DraftElement } from '@aetheris/cad';
import { guidePlacements, translateGuide } from './draftGuideEditing';

const element = (name: string, kind: string, fields: Record<string, string>): DraftElement => ({ id: `layout/${name}`, name, kind, parent: 'layout', span: { start: 0, length: 0 },
  fields: Object.entries(fields).map(([name, value]) => ({ name, value, number: null, unit: null, editable: false })) });
const a = element('a', 'Point2', { position: '[0mm, 0mm]' }), b = element('b', 'Point2', { position: '[10mm, 0mm]' }), c = element('c', 'Point2', { position: '[0mm, 10mm]' });
const arc = element('arc', 'Arc2', { center: 'a', from: 'b', to: 'c' });
const construction: DraftConstruction = { elements: [a, b, c, arc], points: [{ name: 'a', x: 0, y: 0 }, { name: 'b', x: 10, y: 0 }, { name: 'c', x: 0, y: 10 }],
  guides: [], frames: [], diagnostics: [], validationLevel: 'ConstructionResolvedNotTraced' };

describe('guide translation admission', () => {
  it('moves the three defining arc positions atomically while preserving named references', () => {
    expect(translateGuide(arc, construction, [3, 4])).toEqual([
      { kind: 'setField', node: a.id, field: 'position', value: '[3mm, 4mm]' },
      { kind: 'setField', node: b.id, field: 'position', value: '[13mm, 4mm]' },
      { kind: 'setField', node: c.id, field: 'position', value: '[3mm, 14mm]' },
    ]);
  });
  it('refuses the entire move when any defining position is driven or missing', () => {
    const driven = element('c', 'Point2', { position: '[offset, 10mm]' });
    expect(guidePlacements(arc, { ...construction, elements: [a, b, driven, arc] })).toBeNull();
    expect(translateGuide(arc, { ...construction, elements: [a, b, arc] }, [3, 4])).toBeNull();
  });
  it('uses resolved millimetres for a literal axis origin without changing its direction', () => {
    const axis = element('axis', 'Axis2', { origin: '[1cm, 2cm]', direction: '[1, 0]' });
    const index = { ...construction, elements: [axis], axes: [{ id: axis.id, name: axis.name, owner: 'layout', origin: [10, 20] as const, direction: [1, 0] as const }] };
    expect(translateGuide(axis, index, [5, -5])).toEqual([{ kind: 'setField', node: axis.id, field: 'origin', value: '[15mm, 15mm]' }]);
  });
});
