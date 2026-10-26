import type { DraftSpan, SketchShape } from '@aetheris/cad';

/** Presentation helpers for IntelliDraft. Nothing here evaluates source or solves constraints:
 * the compiler owns geometry, and these functions only read its projection to guide the user. */

export type Point = readonly [number, number];
export type Bounds = { x: number; y: number; width: number; height: number };

const SNAP_STEPS = [0.1, 0.5, 1, 2, 5, 10, 20, 50, 100];

/** The finest round step that is still at least `minimumPixels` apart on screen. */
export function snapStep(pixelsPerMillimetre: number, minimumPixels = 8) {
  return SNAP_STEPS.find(step => step * pixelsPerMillimetre >= minimumPixels) ?? SNAP_STEPS.at(-1)!;
}

/** Snap to a step without accumulating binary noise (0.1 * 3 → 0.3, not 0.30000000000000004). */
export function snap(value: number, step: number) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

const control = (shape: SketchShape, label: string) => shape.controls.find(c => c.label === label);
const value = (shape: SketchShape, label: string, changes: ReadonlyMap<string, number>) => {
  const c = control(shape, label); return c ? changes.get(c.id) ?? c.value : undefined;
};

/** Axis-aligned bounds a shape will have once `changes` (control id → value) apply, or null when the
 * shape's kind or rotation makes that unpredictable. Used only to ask about aligned neighbours. */
export function predictedBounds(shape: SketchShape, changes: ReadonlyMap<string, number> = new Map()): Bounds | null {
  const cx = value(shape, 'Center X', changes), cy = value(shape, 'Center Y', changes);
  if (cx === undefined || cy === undefined) return null;
  const rotation = value(shape, 'Rotation', changes) ?? 0;
  const quarterTurns = Math.round(rotation / 90);
  if (Math.abs(rotation - quarterTurns * 90) > 1e-9) return null;
  const turned = Math.abs(quarterTurns) % 2 === 1;
  let width: number | undefined, height: number | undefined;
  switch (shape.kind) {
    case 'Rect2': case 'RoundedRect2': case 'SmoothRoundedRect2': case 'Ellipse2':
      width = value(shape, 'Width', changes); height = value(shape, 'Height', changes); break;
    case 'Circle2': {
      const radius = value(shape, 'Radius', changes), diameter = value(shape, 'Diameter', changes);
      width = height = radius !== undefined ? radius * 2 : diameter; break;
    }
    case 'Slot2':
      width = value(shape, 'Overall length', changes); height = value(shape, 'Width', changes); break;
    default: return null;
  }
  if (width === undefined || height === undefined) return null;
  if (turned) [width, height] = [height, width];
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

export type AlignedNeighbour = { shape: SketchShape; offset: Point; reasons: string[] };
type Anchor = { axis: 0 | 1; at: number; name: string };
// Edges only. Centres sit on shared defaults (often the origin), so a centre that happens to meet
// another shape's edge or centre is coincidence, not a user's alignment.
const anchors = (b: Bounds): Anchor[] => [
  { axis: 0, at: b.x, name: 'left edge' }, { axis: 0, at: b.x + b.width, name: 'right edge' },
  { axis: 1, at: b.y, name: 'bottom edge' }, { axis: 1, at: b.y + b.height, name: 'top edge' },
];

/**
 * Shapes with an edge lined up with an edge of `before` that this edit moves. Each neighbour gets the
 * offset that would keep it lined up. Only shapes with writable centres are offered: positions driven
 * by expressions already follow their inputs. Nothing is stored; this is asked once, per edit.
 */
export function alignedNeighbours(edited: SketchShape, before: Bounds, after: Bounds,
  others: readonly { shape: SketchShape; bounds: Bounds }[], tolerance = 1e-6): AlignedNeighbour[] {
  const old = anchors(before), next = anchors(after);
  const moved = old.map((a, i) => ({ ...a, delta: next[i].at - a.at })).filter(a => Math.abs(a.delta) > tolerance);
  if (!moved.length) return [];
  const result: AlignedNeighbour[] = [];
  for (const other of others) {
    if (other.shape.id === edited.id) continue;
    if (!['Center X', 'Center Y'].every(label => control(other.shape, label)?.editable)) continue;
    const offset: [number, number] = [0, 0], found = [false, false], reasons: string[] = [];
    for (const theirs of anchors(other.bounds)) {
      if (found[theirs.axis]) continue;
      const match = moved.find(m => m.axis === theirs.axis && Math.abs(m.at - theirs.at) <= tolerance);
      if (!match) continue;
      found[theirs.axis] = true; offset[theirs.axis] = match.delta;
      reasons.push(`${other.shape.name}'s ${theirs.name} is lined up with ${edited.name}'s ${match.name}`);
    }
    if (found.some(Boolean)) result.push({ shape: other.shape, offset, reasons });
  }
  return result;
}

/** Control changes that translate `shape` by `offset`, keeping every other dimension. */
export function translation(shape: SketchShape, offset: Point) {
  return (['Center X', 'Center Y'] as const).flatMap((label, axis) => {
    const c = control(shape, label);
    return c && offset[axis] !== 0 ? [{ control: c.id, value: Number((c.value + offset[axis]).toFixed(9)) }] : [];
  });
}

export type TraceEntry = { reference: string; from?: string; to?: string; wholeLoop?: boolean };
/** `known` is false when the trace holds guide or Path entries this preview cannot place; the compiler decides those. */
export type TraceClosure = { known: boolean; closed: boolean; polygon: Point[]; open?: Point };

/**
 * Whether the picked spans, in pick order, form one closed outline, plus a polygon for display.
 * The compiler decides the real Profile; this only tells the user what they have so far.
 */
export function traceClosure(trace: readonly TraceEntry[], spans: readonly DraftSpan[], points: (span: DraftSpan) => Point[], tolerance = 1e-6): TraceClosure {
  if (trace.some(t => t.wholeLoop)) return { known: true, closed: true, polygon: [] };
  const found = trace.map(t => spans.find(s => s.reference === t.reference && s.from === t.from && s.to === t.to));
  if (found.some(s => !s)) return { known: false, closed: false, polygon: [] };
  const ordered = found as DraftSpan[];
  if (!ordered.length) return { known: true, closed: false, polygon: [] };
  const same = (a: Point, b: Point) => Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
  let polygon = [...points(ordered[0])];
  if (ordered.length > 1) {
    const next = points(ordered[1]);
    const joinsEnd = same(polygon.at(-1)!, next[0]) || same(polygon.at(-1)!, next.at(-1)!);
    if (!joinsEnd) polygon.reverse();
  }
  for (const span of ordered.slice(1)) {
    const curve = points(span), end = polygon.at(-1)!;
    if (same(end, curve[0])) polygon.push(...curve.slice(1));
    else if (same(end, curve.at(-1)!)) polygon.push(...[...curve].reverse().slice(1));
    else return { known: true, closed: false, polygon, open: end };
  }
  const closed = ordered.length > 1 && same(polygon[0], polygon.at(-1)!);
  return { known: true, closed, polygon, open: closed ? undefined : polygon.at(-1) };
}

/** Plain names for compiler shape kinds. */
export const shapeLabel = (kind: string) => ({ Rect2: 'Rectangle', Circle2: 'Circle', Ellipse2: 'Ellipse', Slot2: 'Slot', RoundedRect2: 'Rounded rectangle',
  SmoothRoundedRect2: 'Smooth rounded rectangle', Line2: 'Line', Axis2: 'Axis', Arc: 'Arc' } as Record<string, string>)[kind] ?? kind;

/** Default name stem per drawable kind: rect1, circle1, … */
export const nameStem = (kind: string) => ({ Rect2: 'rect', Circle2: 'circle', Ellipse2: 'ellipse', Slot2: 'slot', RoundedRect2: 'rounded',
  SmoothRoundedRect2: 'smooth', Line2: 'line', Axis2: 'axis', Arc: 'arc' } as Record<string, string>)[kind] ?? 'shape';

/** Drawing kinds that are strokes between picked points rather than closed shapes. */
export const STROKE_KINDS = new Set(['Line2', 'Axis2', 'Arc']);

/** Where an arc ends: on its circle, at the cursor's angle, snapped to `degrees` steps unless `free`. */
export function arcEnd(center: Point, start: Point, cursor: Point, degrees = 15, free = false): Point {
  const radius = Math.hypot(start[0] - center[0], start[1] - center[1]);
  let angle = Math.atan2(cursor[1] - center[1], cursor[0] - center[0]);
  if (!free) { const step = degrees * Math.PI / 180; angle = Math.round(angle / step) * step; }
  const exact = (value: number) => Math.abs(value - Math.round(value)) < 1e-9 ? Math.round(value) : value;
  return [exact(center[0] + radius * Math.cos(angle)), exact(center[1] + radius * Math.sin(angle))];
}

/** The first unused `stem1`, `stem2`, … */
export function freshName(stem: string, used: ReadonlySet<string>) {
  for (let n = 1; ; n++) if (!used.has(stem + n)) return stem + n;
}

/**
 * A short explanation for a refused construction edit. The compiler's text stays available as
 * detail; this is what a person reads first.
 */
export function explainRefusal(text: string): string {
  const disconnected = /firmament-profile-pipeline-disconnected|firmament-pipeline-endpoint-not-on-guide|draft-trace-open|profile-not-closed/i.test(text);
  if (disconnected) {
    const names = [...new Set([...text.matchAll(/\b([A-Za-z_]\w*)\.(?:Top|Bottom|Left|Right)\w*/g)].map(m => m[1]))];
    const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? 'the traced shapes';
    return `This change pulls the traced outline apart: ${who} no longer meet where the outline crosses between them. `
      + 'Move the aligned shapes too, move them back into contact, or retrace the outline.';
  }
  if (/draft-name-exists|edit-name-taken/.test(text)) return 'That name is already used. Choose another.';
  if (/draft-point-driven|draft-dimension-driven|draft-parameter-driven/.test(text)) return 'That value is driven by an expression. Edit the dimensions it is built from instead.';
  if (/still used by|no longer resolve/.test(text)) return 'This shape is part of the traced outline. Retrace the outline without it, then delete it.';
  if (/must be positive|Positive|greater than zero/i.test(text)) return 'Sizes must be greater than zero.';
  return text;
}
