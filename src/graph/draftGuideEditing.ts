import type { DraftConstruction, DraftElement, LanguageEditOperation } from '@aetheris/cad';
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
