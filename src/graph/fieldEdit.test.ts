import { describe, expect, it } from 'vitest';
import type { OutlineField } from '@aetheris/cad';
import { resolveLayoutRows } from 'machinalayout';
import { graphBodyRows, INSPECTOR_WIDTH } from './graphBodyLayout';
import { editorFor, formatNumber, parameterSource, parameterizable, nudge, parseQuantity, refuseValue, spliceField, splitSequence, vectorText } from './fieldEdit';

const field = (name: string, text: string, shape: OutlineField['shape'], start = 0): OutlineField =>
  ({ name, text, shape, span: { start, length: text.length }, valueSpan: { start, length: text.length } });

describe('field edits', () => {
  it('reads quantities with and without units', () => {
    expect(parseQuantity('22mm')).toEqual({ number: 22, unit: 'mm' });
    expect(parseQuantity(' -3.5 deg ')).toEqual({ number: -3.5, unit: 'deg' });
    expect(parseQuantity('.5')).toEqual({ number: 0.5, unit: '' });
    expect(parseQuantity('Width * 2')).toBeNull();
  });

  it('keeps float noise out of the source', () => {
    expect(formatNumber(0.1 + 0.2)).toBe('0.3');
    expect(formatNumber(-0)).toBe('0');
    expect(nudge('0.2mm', 1, { alt: true })).toBe('0.3mm');
    expect(nudge('8mm', -1, { shift: true })).toBe('-2mm');
  });

  it('splits only top-level list commas', () => {
    expect(splitSequence('[50mm, 40mm, 8mm]')).toEqual(['50mm', '40mm', '8mm']);
    expect(splitSequence('[Point2(0mm, 1mm), Point2(2mm, 3mm)]')).toEqual(['Point2(0mm, 1mm)', 'Point2(2mm, 3mm)']);
    expect(splitSequence('[]')).toEqual([]);
    expect(splitSequence('Stock')).toBeNull();
  });

  it('chooses an editor from the value shape', () => {
    expect(editorFor(field('Diameter', '22mm', 'quantity')).kind).toBe('quantity');
    const size = editorFor(field('Size', '[50mm, 40mm, 8mm]', 'sequence'));
    expect(size.kind).toBe('vector');
    if (size.kind === 'vector') expect(vectorText(size.parts.map((p, i) => i === 0 && p.kind === 'quantity' ? { kind: 'quantity' as const, value: { ...p.value, number: 60 } } : p))).toBe('[60mm, 40mm, 8mm]');
    // A component taken over by a parameter stays a vector, with the name in its place.
    const mixed = editorFor(field('Size', '[50mm, 40mm, Thickness]', 'sequence'));
    expect(mixed.kind === 'vector' && mixed.parts[2]).toEqual({ kind: 'name', name: 'Thickness' });
    if (mixed.kind === 'vector') expect(vectorText(mixed.parts)).toBe('[50mm, 40mm, Thickness]');
    const point = editorFor(field('Center', 'Point2(0mm, Offset)', 'call'));
    expect(point.kind).toBe('vector');
    if (point.kind === 'vector') expect(vectorText(point.parts, point.pointType)).toBe('Point2(0mm, Offset)');
    expect(editorFor(field('Center', 'Point3(0mm, 1mm, 2mm)', 'call'))).toMatchObject({ kind: 'vector', pointType: 'Point3' });
    expect(editorFor(field('Center', 'Point2(Width / 2, 0mm)', 'call')).kind).toBe('text');
    expect(editorFor(field('Center', 'Point2(0mm, 1mm, 2mm)', 'call')).kind).toBe('text');
    expect(editorFor(field('Center', 'Other(0mm, 0mm)', 'call')).kind).toBe('text');
    expect(editorFor(field('Size', '[Width * 2, 40mm]', 'sequence')).kind).toBe('text');
    expect(editorFor(field('Size', '[Width, Depth]', 'sequence')).kind).toBe('text');
  });

  it('refuses structural text', () => {
    const diameter = field('Diameter', '22mm', 'quantity');
    expect(refuseValue(diameter, 'wide')).toMatch(/number with a unit/);
    expect(refuseValue(field('Kind', 'Chamfer', 'reference'), 'Chamfer }')).toMatch(/Braces/);
    expect(refuseValue(field('Center', 'Point2(0mm, 0mm)', 'call'), 'Point2(0mm, 0mm')).toMatch(/unbalanced/);
    expect(refuseValue(field('Kind', 'Chamfer', 'reference'), '')).toMatch(/needs a value/);
  });

  it('splices exactly the value span, and only when the source still matches', () => {
    const source = 'Hole Pilot { Diameter: 22mm }';
    const diameter = field('Diameter', '22mm', 'quantity', source.indexOf('22mm'));
    const result = spliceField(source, diameter, '24.5mm');
    expect(result).toMatchObject({ source: 'Hole Pilot { Diameter: 24.5mm }', before: '22mm', after: '24.5mm' });
    expect(spliceField('Hole Pilot { Diameter: 23mm }', diameter, '24mm')).toHaveProperty('error');
  });
});

describe('graph body layout', () => {
  it('puts the inspector beside a wide canvas and below a narrow one', () => {
    const wide = resolveLayoutRows(graphBodyRows(1000, 700).rows, { x: 0, y: 0, width: 1000, height: 700 }).nodes;
    expect(wide.inspector.rect).toMatchObject({ x: 1000 - INSPECTOR_WIDTH, y: 0, width: INSPECTOR_WIDTH, height: 700 });
    expect(wide.canvas.rect.width).toBe(1000 - INSPECTOR_WIDTH);
    const narrow = resolveLayoutRows(graphBodyRows(500, 800).rows, { x: 0, y: 0, width: 500, height: 800 }).nodes;
    expect(narrow.inspector.rect).toMatchObject({ x: 0, width: 500 });
    expect(narrow.canvas.rect.height + narrow.inspector.rect.height).toBe(800);
  });
});

describe('parameters', () => {
  it('declares a parameter with the type its value implies', () => {
    expect(parameterSource('Thickness', '8mm')).toBe('Static Thickness: Length = 8mm');
    expect(parameterSource('Tilt', '15deg')).toBe('Static Tilt: Angle = 15deg');
    expect(parameterSource('Count', '4')).toBe('Static Count: Int = 4');
    expect(parameterSource('Ratio', '0.5')).toBe('Static Ratio: Float = 0.5');
    expect(parameterSource('Face', '+Z')).toBeNull();
  });
  it('knows which fields can become Feature parameters', () => {
    expect(parameterizable(field('Center', 'Point2(0mm, 0mm)', 'call'))).toBe(true);
    expect(parameterizable(field('Diameter', '8mm', 'quantity'))).toBe(true);
    expect(parameterizable(field('On', '+Z', 'expression'))).toBe(false);
    expect(parameterizable(field('End', 'ThroughAll', 'reference'))).toBe(false);
  });
});
