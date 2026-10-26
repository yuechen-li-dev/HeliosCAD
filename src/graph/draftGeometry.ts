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

// ---------------------------------------------------------------------------------------------
// Areas and ends of the drawn construction, read from the compiler's spans. Presentation only:
// a picked area becomes an ordinary trace, which the compiler still checks.

type Graph = { nodes: Point[]; edges: { span: DraftSpan; a: number; b: number; points: Point[] }[] };

function graphOf(spans: readonly DraftSpan[], points: (span: DraftSpan) => Point[], tolerance = 1e-6): Graph {
  const nodes: Point[] = [];
  const node = (p: Point) => {
    const found = nodes.findIndex(n => Math.abs(n[0] - p[0]) <= tolerance && Math.abs(n[1] - p[1]) <= tolerance);
    if (found >= 0) return found;
    nodes.push(p); return nodes.length - 1;
  };
  const edges: Graph['edges'] = [];
  for (const span of spans) {
    const polyline = points(span);
    if (polyline.length < 2) continue;
    const a = node(polyline[0]), b = node(polyline.at(-1)!);
    if (a === b) continue;
    // The same stretch of boundary can belong to two shapes (an inset's edge on its envelope's): keep one.
    const middle = polyline[Math.floor(polyline.length / 2)];
    if (edges.some(e => (e.a === a && e.b === b || e.a === b && e.b === a)
      && Math.hypot(e.points[Math.floor(e.points.length / 2)][0] - middle[0], e.points[Math.floor(e.points.length / 2)][1] - middle[1]) < 1e-4)) continue;
    edges.push({ span, a, b, points: polyline });
  }
  return { nodes, edges };
}

const signedArea = (polygon: readonly Point[]) => polygon.reduce((sum, p, i) => { const q = polygon[(i + 1) % polygon.length]; return sum + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;
function inside(polygon: readonly Point[], [x, y]: Point) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

export type Area = { spans: DraftSpan[]; polygon: Point[]; area: number };

/** Bounded areas enclosed by the spans: faces of the planar graph their named ends make, with
 * dangling edges pruned. Crossings without a named point are not split, so such areas are skipped. */
export function areasOf(spans: readonly DraftSpan[], points: (span: DraftSpan) => Point[]): Area[] {
  const graph = graphOf(spans, points);
  let edges = graph.edges;
  for (let pruned = true; pruned;) {
    const degree = new Map<number, number>();
    for (const e of edges) { degree.set(e.a, (degree.get(e.a) ?? 0) + 1); degree.set(e.b, (degree.get(e.b) ?? 0) + 1); }
    const kept = edges.filter(e => degree.get(e.a)! > 1 && degree.get(e.b)! > 1);
    pruned = kept.length !== edges.length; edges = kept;
  }
  type Half = { edge: number; from: number; to: number; points: Point[]; angle: number };
  const halves: Half[] = edges.flatMap((e, edge) => {
    const forward = e.points, backward = [...e.points].reverse();
    const angle = (p: Point[]) => Math.atan2(p[1][1] - p[0][1], p[1][0] - p[0][0]);
    return [{ edge, from: e.a, to: e.b, points: forward, angle: angle(forward) }, { edge, from: e.b, to: e.a, points: backward, angle: angle(backward) }];
  });
  const out = new Map<number, number[]>();
  halves.forEach((h, i) => out.set(h.from, [...out.get(h.from) ?? [], i]));
  for (const list of out.values()) list.sort((i, j) => halves[i].angle - halves[j].angle);
  const twin = (i: number) => i ^ 1;
  const used = new Set<number>(), areas: Area[] = [];
  for (let start = 0; start < halves.length; start++) {
    if (used.has(start)) continue;
    const cycle: number[] = [];
    for (let h = start, guard = 0; !used.has(h) && guard <= halves.length; guard++) {
      used.add(h); cycle.push(h);
      const around = out.get(halves[h].to)!, at = around.indexOf(twin(h));
      h = around[(at - 1 + around.length) % around.length];
    }
    const polygon = cycle.flatMap(h => halves[h].points.slice(0, -1));
    const area = signedArea(polygon);
    if (area > 1e-9 && new Set(cycle.map(h => halves[h].edge)).size === cycle.length)
      areas.push({ spans: cycle.map(h => edges[halves[h].edge].span), polygon, area });
  }
  return areas;
}

/** The smallest drawn area around a point, if any. */
export function areaAt(areas: readonly Area[], at: Point) {
  return areas.filter(a => inside(a.polygon, at)).sort((a, b) => a.area - b.area)[0] ?? null;
}

export type EndMark = { at: Point; kind: 'open' | 'untied'; names: string[] };

/**
 * Ends worth showing: an **open** end meets no other span, so no outline runs through it; an
 * **untied** end meets other spans only by position (different named points that happen to
 * coincide), so it holds now but nothing keeps it together when one side moves.
 */
export function endMarks(spans: readonly DraftSpan[], points: (span: DraftSpan) => Point[]): EndMark[] {
  const graph = graphOf(spans, points), names = graph.nodes.map(() => new Set<string>()), degree = graph.nodes.map(() => 0);
  for (const e of graph.edges) { degree[e.a]++; degree[e.b]++; }
  // Names come from every span, including a stretch two shapes share, so coincidence is seen.
  const nodeAt = (p: Point) => graph.nodes.findIndex(n => Math.abs(n[0] - p[0]) <= 1e-6 && Math.abs(n[1] - p[1]) <= 1e-6);
  for (const span of spans) {
    const polyline = points(span); if (polyline.length < 2) continue;
    const a = nodeAt(polyline[0]), b = nodeAt(polyline.at(-1)!);
    if (a >= 0) names[a].add(span.from); if (b >= 0) names[b].add(span.to);
  }
  return graph.nodes.flatMap((at, i): EndMark[] => degree[i] === 1 ? [{ at, kind: 'open', names: [...names[i]] }]
    : degree[i] > 1 && names[i].size > 1 ? [{ at, kind: 'untied', names: [...names[i]] }] : []);
}

// ---------------------------------------------------------------------------------------------
// Snap inference while drawing: where a click lands, and why. It only places a point; no
// relationship is stored, so nothing later moves because of it.

export type SnapCurve = { name: string; kind: string; points: readonly Point[]; center?: Point | null; radius?: number };
export type SnapKind = 'point' | 'midpoint' | 'on' | 'aligned' | 'horizontal' | 'vertical' | 'grid';
export type Snap = { at: Point; kind: SnapKind; name?: string; label: string; guides: [Point, Point][] };

function nearestOn(curve: SnapCurve, p: Point): Point {
  if ((curve.kind === 'Circle' || curve.kind === 'Arc') && curve.center && curve.radius) {
    const [cx, cy] = curve.center, d = Math.hypot(p[0] - cx, p[1] - cy) || 1;
    const on: Point = [cx + (p[0] - cx) / d * curve.radius, cy + (p[1] - cy) / d * curve.radius];
    if (curve.kind === 'Circle') return on;
    // An arc: only its own sweep; otherwise the nearest polyline point.
    const near = nearestPolyline(curve.points, on);
    return Math.hypot(near[0] - on[0], near[1] - on[1]) < curve.radius * 0.02 ? on : near;
  }
  return nearestPolyline(curve.points, p);
}
function nearestPolyline(points: readonly Point[], p: Point): Point {
  let best: Point = points[0], distance = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const [ax, ay] = points[i], [bx, by] = points[i + 1], dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len)) : 0;
    const q: Point = [ax + t * dx, ay + t * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < distance) { distance = d; best = q; }
  }
  return best;
}

/**
 * The best snap for a raw cursor position, in priority order: a named point, a line's midpoint,
 * a crossing of horizontal and vertical alignment, a point on a curve, a single alignment, the grid.
 * `reach` is in world units (a few pixels at the current zoom).
 */
export function inferSnap(raw: Point, reach: number, grid: number, context: {
  points: readonly { name: string; x: number; y: number }[]; curves: readonly SnapCurve[]; from?: Point | null;
}): Snap {
  const candidates: (Snap & { score: number })[] = [];
  for (const p of context.points) {
    const d = Math.hypot(p.x - raw[0], p.y - raw[1]);
    if (d <= reach) candidates.push({ at: [p.x, p.y], kind: 'point', name: p.name, label: p.name, guides: [], score: d * .5 });
  }
  for (const curve of context.curves) {
    if (curve.kind === 'Line' && curve.points.length >= 2) {
      const a = curve.points[0], b = curve.points.at(-1)!, m: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], d = Math.hypot(m[0] - raw[0], m[1] - raw[1]);
      if (d <= reach) candidates.push({ at: m, kind: 'midpoint', label: `midpoint of ${curve.name}`, guides: [], score: d * .6 });
    }
    const on = nearestOn(curve, raw), d = Math.hypot(on[0] - raw[0], on[1] - raw[1]);
    if (d <= reach) candidates.push({ at: on, kind: 'on', label: `on ${curve.name}`, guides: [], score: d + reach * .5 });
  }
  // Level with, or plumb under, the stroke's start or a named point.
  const references = [...context.from ? [{ name: 'start', x: context.from[0], y: context.from[1] }] : [], ...context.points];
  const level = references.map(p => ({ p, d: Math.abs(p.y - raw[1]) })).filter(c => c.d <= reach && Math.abs(c.p.x - raw[0]) > reach).sort((a, b) => a.d - b.d)[0];
  const plumb = references.map(p => ({ p, d: Math.abs(p.x - raw[0]) })).filter(c => c.d <= reach && Math.abs(c.p.y - raw[1]) > reach).sort((a, b) => a.d - b.d)[0];
  if (level && plumb) {
    const at: Point = [plumb.p.x, level.p.y];
    candidates.push({ at, kind: 'aligned', label: `level with ${level.p.name}, under ${plumb.p.name}`, guides: [[[level.p.x, level.p.y], at], [[plumb.p.x, plumb.p.y], at]], score: level.d + plumb.d + reach * .2 });
  }
  if (level) { const at: Point = [snap(raw[0], grid), level.p.y]; candidates.push({ at, kind: 'horizontal', label: `level with ${level.p.name}`, guides: [[[level.p.x, level.p.y], at]], score: level.d + reach }); }
  if (plumb) { const at: Point = [plumb.p.x, snap(raw[1], grid)]; candidates.push({ at, kind: 'vertical', label: `in line with ${plumb.p.name}`, guides: [[[plumb.p.x, plumb.p.y], at]], score: plumb.d + reach }); }
  const best = candidates.sort((a, b) => a.score - b.score)[0];
  if (best) { const { score, ...chosen } = best; void score; return chosen; }
  return { at: [snap(raw[0], grid), snap(raw[1], grid)], kind: 'grid', label: '', guides: [] };
}

export type Alignment = 'left' | 'centerX' | 'right' | 'bottom' | 'centerY' | 'top' | 'center';
export const ALIGNMENTS: readonly { id: Alignment; label: string }[] = [
  { id: 'left', label: 'Left edges' }, { id: 'centerX', label: 'Centre X' }, { id: 'right', label: 'Right edges' },
  { id: 'bottom', label: 'Bottom edges' }, { id: 'centerY', label: 'Centre Y' }, { id: 'top', label: 'Top edges' }, { id: 'center', label: 'Both centres' },
];
/** How far `moving` travels to line up with `target`, which stays put. One-shot: nothing is stored. */
export function alignOffset(moving: Bounds, target: Bounds, how: Alignment): Point {
  const x = (b: Bounds, at: number) => b.x + b.width * at, y = (b: Bounds, at: number) => b.y + b.height * at;
  const dx = (at: number) => x(target, at) - x(moving, at), dy = (at: number) => y(target, at) - y(moving, at);
  switch (how) {
    case 'left': return [dx(0), 0]; case 'centerX': return [dx(.5), 0]; case 'right': return [dx(1), 0];
    case 'bottom': return [0, dy(0)]; case 'centerY': return [0, dy(.5)]; case 'top': return [0, dy(1)];
    case 'center': return [dx(.5), dy(.5)];
  }
}
