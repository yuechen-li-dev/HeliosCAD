import { describe, expect, it } from 'vitest';
import type { DraftConstruction, DraftElement, LanguageOutline, SketchShape } from '@aetheris/cad';
import { editGuide, guidePlacements, translateGuide, translateSelection } from './draftGuideEditing';

const element = (name: string, kind: string, fields: Record<string, string>): DraftElement => ({ id: `layout/${name}`, name, kind, parent: 'layout', span: { start: 0, length: 0 },
  fields: Object.entries(fields).map(([name, value]) => ({ name, value, number: null, unit: null, editable: false })) });
const a = element('a', 'Point2', { position: '[0mm, 0mm]' }), b = element('b', 'Point2', { position: '[10mm, 0mm]' }), c = element('c', 'Point2', { position: '[0mm, 10mm]' });
const arc = element('arc', 'Arc2', { center: 'a', from: 'b', to: 'c' });
const construction: DraftConstruction = { elements: [a, b, c, arc], points: [{ name: 'a', x: 0, y: 0 }, { name: 'b', x: 10, y: 0 }, { name: 'c', x: 0, y: 10 }],
  guides: [], frames: [], diagnostics: [], validationLevel: 'ConstructionResolvedNotTraced' };

describe('guide translation admission', () => {
  const outline: LanguageOutline = { version: 'firmament-outline/1', document: 'part.firmament', revision: '0', nodes: [], edges: [], externals: [], diagnostics: [] };
  it('deduplicates shared arc/chord endpoints in one group transaction', () => {
    const chord = element('chord', 'Line2', { from: 'b', to: 'c' });
    expect(translateSelection([arc.id, chord.id], [], { ...construction, elements: [...construction.elements, chord] }, outline, '', [3, 4])).toEqual(translateGuide(arc, construction, [3, 4]));
  });
  it('edits circular radius without changing center or endpoint angles', () => {
    expect(editGuide(arc, construction, { 'Center X': 0, 'Center Y': 0, Radius: 20 })).toEqual([
      { kind: 'setField', node: a.id, field: 'position', value: '[0mm, 0mm]' },
      { kind: 'setField', node: b.id, field: 'position', value: '[20mm, 0mm]' },
      { kind: 'setField', node: c.id, field: 'position', value: '[0mm, 20mm]' },
    ]);
    expect(() => editGuide(arc, construction, { 'Center X': 0, 'Center Y': 0, Radius: 0 })).toThrow('greater than zero');
  });
  it('merges literal shape placement components using compiler spans, and refuses driven placement', () => {
    const source = '[0mm, 2mm]', span = { start: 0, length: source.length };
    const shape: SketchShape = { id: 'rect', name: 'rect', kind: 'Rect2', center: [0, 2], controls: [
      { id: 'x', label: 'Center X', authored: '0mm', value: 0, unit: 'mm', editable: true, parameter: null, readOnlyReason: null, span: { start: 1, length: 3 } },
      { id: 'y', label: 'Center Y', authored: '2mm', value: 2, unit: 'mm', editable: true, parameter: null, readOnlyReason: null, span: { start: 6, length: 3 } },
    ] };
    const view: LanguageOutline = { ...outline, nodes: [{ id: 'rect', name: 'rect', kind: 'Rect2', occurrence: false, parentId: null, order: 0, variant: null, modifiers: [], span, nameSpan: null, schemaId: null, parameters: [], children: [],
      fields: [{ name: 'center', text: source, shape: 'sequence', span, valueSpan: span }] }] };
    expect(translateSelection(['rect'], [shape], construction, view, source, [3, 4])).toEqual([{ kind: 'setField', node: 'rect', field: 'center', value: '[3mm, 6mm]' }]);
    expect(() => translateSelection(['rect'], [{ ...shape, controls: shape.controls.map(control => ({ ...control, editable: false })) }], construction, view, source, [3, 4])).toThrow('driven');
  });
  it('keeps shared parameter references and rejects conflicting translations of the same input', () => {
    const source = 'Static Offset = 3mm\nRect2 r { center: [Offset, Offset] }', start = source.indexOf('['), valueSpan = { start, length: '[Offset, Offset]'.length };
    const uses = [source.indexOf('Offset', start), source.lastIndexOf('Offset')];
    const shape: SketchShape = { id: 'r', name: 'r', kind: 'Rect2', center: [3, 3], controls: uses.map((at, i) => ({ id: `r/center/${i}`, label: ['Center X', 'Center Y'][i], authored: 'Offset', value: 3, unit: 'mm', editable: true, parameter: 'Offset', readOnlyReason: null, span: { start: at, length: 6 } })) };
    const base = { variant: null, occurrence: false, modifiers: [], parentId: null, order: 0, span: { start: 0, length: source.length }, nameSpan: null, schemaId: null, parameters: [], children: [] };
    const initial = { start: source.indexOf('3mm'), length: 3 };
    const view: LanguageOutline = { ...outline, nodes: [
      { ...base, id: 'r', name: 'r', kind: 'Rect2', fields: [{ name: 'center', text: '[Offset, Offset]', shape: 'sequence', span: valueSpan, valueSpan }] },
      { ...base, id: 'Offset', name: 'Offset', kind: 'Static', fields: [], value: { name: '=', text: '3mm', shape: 'quantity', span: initial, valueSpan: initial } },
    ], edges: uses.map(at => ({ from: 'r', to: 'Offset', kind: 'reference', via: 'field:center', member: null, ambiguous: false, toDocument: null, span: { start: at, length: 6 } })) };
    expect(translateSelection(['r'], [shape], construction, view, source, [2, 2])).toEqual([{ kind: 'setValue', node: 'Offset', value: '5mm' }]);
    expect(() => translateSelection(['r'], [shape], construction, view, source, [2, 4])).toThrow('conflicting');
  });
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
