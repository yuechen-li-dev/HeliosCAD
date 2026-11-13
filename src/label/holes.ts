import type { LanguageOutline } from '@aetheris/cad';
import { sameCylinder, type LabelFace } from './geometry';

/** A hole recognized on an imported body: `Recognize part { Region H1 { kind: HoleShaft stepFaceEntities: [...] } }`. */
export interface RecognizedHole { readonly name: string; readonly body: string; readonly nodeId: string; readonly entities: readonly string[] }

const field = (fields: readonly { name: string; text: string }[], name: string) => fields.find(f => f.name.toLowerCase() === name.toLowerCase())?.text ?? null;

export function recognizedHoles(outline: LanguageOutline | null): RecognizedHole[] {
  const nodes = outline?.nodes ?? [];
  const blocks = new Map(nodes.filter(n => n.kind === 'Recognize' && n.name).map(n => [n.id, n.name!]));
  return nodes.filter(n => n.kind === 'Region' && n.name && n.parentId && blocks.has(n.parentId)
      && /^(HoleShaft|Hole<Shaft>)$/i.test(field(n.fields, 'kind')?.trim() ?? ''))
    .map(n => ({ name: n.name!, body: blocks.get(n.parentId!)!, nodeId: n.id,
      entities: [...(field(n.fields, 'stepFaceEntities') ?? '').matchAll(/"(#\d+)"/g)].map(m => m[1]!) }))
    .filter(h => h.entities.length > 0);
}

/** The hole a native wall selector names. */
export const nativeHoleOf = (selector: string) => selector.match(/^face\(([A-Za-z_]\w*)\.Wall\)$/)?.[1] ?? null;
/** What a requirement on one hole targets: its recognized region, its native name, or its face. */
export const unitTarget = (unit: HoleUnit) => unit.kind === 'recognized' ? holeTarget(unit.hole) : unit.kind === 'native' ? unit.name : unit.face.selector;
export const unitName = (unit: HoleUnit) => unit.kind === 'recognized' ? unit.hole.name : unit.kind === 'native' ? unit.name : null;
const entityOf = (selector: string) => selector.match(/^([A-Za-z_]\w*)\.face\("(#\d+)"\)$/);
export const holeTarget = (hole: RecognizedHole) => `${hole.body}.region("${hole.name}")`;

/** One hole of the selection: either recognized (named), or a cylinder not yet recognized, with every face of it. */
export type HoleUnit =
  | { readonly kind: 'recognized'; readonly hole: RecognizedHole; readonly diameterMm: number | null; readonly face: LabelFace }
  /** A hole of a native part, named by its construction: `face(mount.Wall)` is hole `mount`. */
  | { readonly kind: 'native'; readonly name: string; readonly diameterMm: number | null; readonly face: LabelFace }
  | { readonly kind: 'cylinder'; readonly body: string; readonly selectors: readonly string[]; readonly diameterMm: number | null; readonly face: LabelFace };

/** Groups cylindrical faces into holes. A face of a recognized hole is that hole; any other face takes every face of its
 * cylinder (`siblings`), so a hole the exporting system split into halves is one hole. Faces of one hole collapse. */
export function holeUnits(faces: readonly LabelFace[], holes: readonly RecognizedHole[], siblings: readonly LabelFace[]): HoleUnit[] {
  const units: HoleUnit[] = [];
  for (const face of faces) {
    const native = nativeHoleOf(face.selector);
    if (native) { if (!units.some(u => u.kind === 'native' && u.name === native)) units.push({ kind: 'native', name: native, diameterMm: face.diameterMm, face }); continue; }
    const match = entityOf(face.selector);
    const hole = match && holes.find(h => h.body === match[1] && h.entities.includes(match[2]!));
    if (hole) { if (!units.some(u => u.kind === 'recognized' && u.hole.nodeId === hole.nodeId)) units.push({ kind: 'recognized', hole, diameterMm: face.diameterMm, face }); continue; }
    if (units.some(u => u.kind === 'cylinder' && u.selectors.includes(face.selector))) continue;
    const selectors = [face.selector, ...siblings.filter(s => s.selector !== face.selector && sameCylinder(face, s)).map(s => s.selector)];
    units.push({ kind: 'cylinder', body: match?.[1] ?? 'part', selectors, diameterMm: face.diameterMm, face });
  }
  return units;
}

/** Faces to highlight for a pick: the whole recognized hole, or every face of the picked cylinder. */
export function holeFaceSelectors(face: LabelFace, holes: readonly RecognizedHole[], siblings: readonly LabelFace[]): string[] {
  const [unit] = holeUnits([face], holes, siblings);
  if (!unit) return [face.selector];
  return unit.kind === 'cylinder' ? [...unit.selectors] : unit.kind === 'native' ? [face.selector] : unit.hole.entities.map(e => `${unit.hole.body}.face("${e}")`);
}
