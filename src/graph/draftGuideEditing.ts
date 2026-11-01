import type { DraftConstruction, DraftElement, LanguageEditOperation, LanguageOutline, SketchShape } from '@aetheris/cad';
import { parseQuantity, splitSequence } from './fieldEdit';
import type { Point } from './draftGeometry';

const field = (element: DraftElement, name: string) => element.fields.find(f => f.name.toLowerCase() === name);
// A drag may replace literal placement only. Reuse the field editor's literal admission;
// expressions and parameter references remain owned by the source/compiler.
const literalPosition = (text: string | undefined) => {
  const parts = text && splitSequence(text);
  return !!parts && parts.length === 2 && parts.every(p => !!parseQuantity(p));
};

/** Resolve the declarations a guide translates from the compiler's construction index.
 * Shared named points stay shared; all positions change in one compiler transaction so
 * an arc is never validated with only its centre or one endpoint moved. */
export function guidePlacements(element: DraftElement, construction: DraftConstruction): { node: DraftElement; field: string; at: Point }[] | null {
  if (element.kind === 'Axis2') {
    const axis = construction.axes?.find(a => a.id === element.id), origin = field(element, 'origin');
    return axis && origin && literalPosition(origin.value) ? [{ node: element, field: origin.name, at: axis.origin }] : null;
  }
  const keys = element.kind === 'Point2' ? [] : element.kind === 'Line2' ? ['from', 'to']
    : element.kind === 'Arc2' ? ['center', 'from', 'to'] : element.kind === 'Circle2' ? ['center'] : null;
  if (!keys) return null;
  const nodes = element.kind === 'Point2' ? [element] : keys.map(key => {
    const name = field(element, key)?.value;
    return construction.elements.find(e => e.kind === 'Point2' && e.parent === element.parent && e.name === name);
  });
  const result: { node: DraftElement; field: string; at: Point }[] = [];
  for (const node of nodes) {
    if (!node) return null;
    const position = field(node, 'position'), points = construction.points.filter(p => p.name === node.name);
    if (!position || !literalPosition(position.value) || points.length !== 1) return null;
    const point = points[0];
    if (!result.some(p => p.node.id === node.id)) result.push({ node, field: position.name, at: [point.x, point.y] });
  }
  return result.length ? result : null;
}

export function translateGuide(element: DraftElement, construction: DraftConstruction, offset: Point): LanguageEditOperation[] | null {
  return guidePlacements(element, construction)?.map(p => ({ kind: 'setField', node: p.node.id, field: p.field,
    value: `[${Number((p.at[0] + offset[0]).toFixed(9))}mm, ${Number((p.at[1] + offset[1]).toFixed(9))}mm]` })) ?? null;
}

const mm = (value: number) => { if (!Number.isFinite(value)) throw new Error('The requested coordinates exceed the finite range.'); return `${Number(value.toFixed(9))}mm`; };
const pointValue = (at: Point) => `[${at.map(mm).join(', ')}]`;

/** Compiler spans identify the literal controls; the outline resolves their parameter targets.
 * Merge changes to the same field/parameter before submitting one AST transaction. */
export function translateSelection(ids: readonly string[], shapes: readonly SketchShape[], construction: DraftConstruction,
  outline: LanguageOutline, source: string, offset: Point): LanguageEditOperation[] {
  if (!offset.every(Number.isFinite)) throw new Error('Movement must use finite distances.');
  const owners = new Set(ids.map(id => construction.elements.find(element => element.id === id)?.parent ?? null));
  if (owners.size > 1) throw new Error('Select elements from one drawing layout for a group move.');
  const edits = new Map<string, { node: string; field?: string; text: string; start: number; pieces: Map<number, { length: number; value: string }> }>();
  const whole = new Map<string, LanguageEditOperation>();
  const putWhole = (operation: LanguageEditOperation & { kind: 'setField' }) => {
    const key = operation.node + '/' + operation.field, previous = whole.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(operation)) throw new Error('Selected objects request conflicting shared positions.');
    whole.set(key, operation);
  };
  for (const id of new Set(ids)) {
    const shape = shapes.find(s => s.id === id);
    if (!shape) {
      const element = construction.elements.find(e => e.id === id), operations = element && translateGuide(element, construction, offset);
      if (!operations) throw new Error('A selected guide has driven or unsupported positions. Edit its inputs instead.');
      operations.forEach(op => putWhole(op as LanguageEditOperation & { kind: 'setField' })); continue;
    }
    for (const [axis, label] of ['Center X', 'Center Y'].entries()) {
      const control = shape.controls.find(c => c.label === label);
      if (!control?.editable) throw new Error(`${shape.name} has a driven placement. Edit its inputs instead.`);
      const node = outline.nodes.find(n => n.id === shape.id);
      if (!node) throw new Error('The selected shape is no longer in the compiler outline.');
      const edge = control.parameter ? outline.edges.filter(e => e.from === shape.id && !e.ambiguous && e.span.start === control.span.start && e.span.length === control.span.length) : [];
      const parameter = edge.length === 1 ? outline.nodes.find(n => n.id === edge[0].to && n.kind === 'Static') : undefined;
      const field = control.parameter ? parameter?.value : node.fields.find(f => f.valueSpan.start <= control.span.start && control.span.start + control.span.length <= f.valueSpan.start + f.valueSpan.length);
      if (!field || control.parameter && !parameter) throw new Error('The compiler did not resolve a writable placement target.');
      const target = parameter ?? node, span = parameter ? field.valueSpan : control.span;
      const key = target.id + '/' + (parameter ? '=' : field.name);
      let edit = edits.get(key);
      if (!edit) { edit = { node: target.id, field: parameter ? undefined : field.name, text: source.slice(field.valueSpan.start, field.valueSpan.start + field.valueSpan.length), start: field.valueSpan.start, pieces: new Map() }; edits.set(key, edit); }
      const value = mm(control.value + offset[axis]), previous = edit.pieces.get(span.start);
      if (previous && previous.value !== value) throw new Error('The selection shares a parameter with conflicting requested values.');
      edit.pieces.set(span.start, { length: span.length, value });
    }
  }
  for (const edit of edits.values()) {
    let value = edit.text;
    for (const [start, piece] of [...edit.pieces].sort((a, b) => b[0] - a[0])) value = value.slice(0, start - edit.start) + piece.value + value.slice(start - edit.start + piece.length);
    if (edit.field) putWhole({ kind: 'setField', node: edit.node, field: edit.field, value });
    else whole.set(edit.node + '/=', { kind: 'setValue', node: edit.node, value });
  }
  return [...whole.values()];
}

export type GuideValues = Record<string, number>;
export function guideValues(element: DraftElement, construction: DraftConstruction): GuideValues | null {
  const points = guidePlacements(element, construction); if (!points) return null;
  const [first, second, third] = points.map(p => p.at);
  if (element.kind === 'Line2' && second) return { 'Start X': first[0], 'Start Y': first[1], 'End X': second[0], 'End Y': second[1] };
  if (element.kind === 'Arc2' && second && third) {
    const radius = Math.hypot(second[0] - first[0], second[1] - first[1]);
    return Number.isFinite(radius) && radius > 0 ? { 'Center X': first[0], 'Center Y': first[1], Radius: radius } : null;
  }
  if (element.kind === 'Circle2') {
    const radius = field(element, 'radius');
    return radius && parseQuantity(radius.value) && radius.number != null && radius.number > 0 ? { 'Center X': first[0], 'Center Y': first[1], Radius: radius.number } : null;
  }
  if (element.kind === 'Axis2') return { 'Origin X': first[0], 'Origin Y': first[1] };
  return null;
}

/** Circular radius edits preserve center, angles and sweep. Shared endpoint references survive. */
export function editGuide(element: DraftElement, construction: DraftConstruction, values: GuideValues): LanguageEditOperation[] {
  const original = guideValues(element, construction), placements = guidePlacements(element, construction);
  if (!original || !placements) throw new Error('This guide has driven or unsupported inputs. Edit its defining source inputs.');
  if (Object.keys(original).some(key => !Number.isFinite(values[key]))) throw new Error('Guide dimensions must be finite.');
  if ('Radius' in original && values.Radius <= 0) throw new Error('Radius must be greater than zero.');
  let positions: Point[];
  if (element.kind === 'Line2') positions = [[values['Start X'], values['Start Y']], [values['End X'], values['End Y']]];
  else if (element.kind === 'Axis2') positions = [[values['Origin X'], values['Origin Y']]];
  else {
    const center: Point = [values['Center X'], values['Center Y']];
    positions = placements.map((p, i) => i === 0 ? center : [center[0] + (p.at[0] - placements[0].at[0]) / original.Radius * values.Radius,
      center[1] + (p.at[1] - placements[0].at[1]) / original.Radius * values.Radius]);
  }
  const operations: LanguageEditOperation[] = placements.map((p, i) => ({ kind: 'setField', node: p.node.id, field: p.field, value: pointValue(positions[i]) }));
  if (element.kind === 'Circle2') operations.push({ kind: 'setField', node: element.id, field: field(element, 'radius')!.name, value: mm(values.Radius) });
  return operations;
}
