import type { PlanarFaceSupport, SelectionDescription } from '@aetheris/cad';
import type { TelosLine } from '@aetheris/three-telos';

export interface PlacementGuide { selection: SelectionDescription; center: readonly number[]; diameter: number; shaftDiameter?: number }
export interface PlacementActions {
  place(selection: SelectionDescription, point: readonly number[]): void;
  move(point: readonly number[]): void;
  reject(reason: string): void;
}
export interface FeaturePlacementProps {
  placingFeature?: boolean;
  placementGuide?: PlacementGuide | null;
  placementActions?: React.MutableRefObject<PlacementActions | null>;
}
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
export function localPoint(frame: PlanarFaceSupport, point: readonly number[]): [number, number] {
  const p = point.map((v, i) => v - frame.origin[i]); return [dot(p, frame.x), dot(p, frame.y)];
}
export function worldPoint(frame: PlanarFaceSupport, center: readonly number[]): number[] {
  return frame.origin.map((v, i) => v + frame.x[i] * center[0] + frame.y[i] * center[1]);
}
/** Nearest feasible disk center in a convex support minus circular exclusions.
 * Candidates are line/circle projections and boundary intersections in 2D;
 * no surface intersections or iterative guesses decide the material geometry. */
export function constrainCenter(frame: PlanarFaceSupport, center: readonly number[], diameter: number): [number, number] | null {
  if (!Number.isFinite(diameter) || diameter <= 0 || !center.every(Number.isFinite)) return null;
  type Point = [number, number];
  const clearance = diameter / 2 + .01001, lines: { n: Point; c: number }[] = [];
  const circles = (frame.excludedDisks ?? []).map(d => ({ center: d.center, radius: d.radius + clearance }));
  for (let i = 0; i < frame.boundary.length; i++) {
    const a = frame.boundary[i], b = frame.boundary[(i + 1) % frame.boundary.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < 1e-9) return null;
    const n: Point = [-dy / length, dx / length]; lines.push({ n, c: dot(n, a) + clearance });
  }
  const valid = (p: Point) => p.every(Number.isFinite) && lines.every(l => dot(l.n, p) >= l.c - 1e-8)
    && circles.every(c => Math.hypot(p[0] - c.center[0], p[1] - c.center[1]) >= c.radius - 1e-8);
  const query: Point = [center[0], center[1]];
  if (valid(query)) return query;
  const candidates: Point[] = [];
  for (const line of lines) {
    const distance = line.c - dot(line.n, center);
    candidates.push([center[0] + line.n[0] * distance, center[1] + line.n[1] * distance]);
    for (const other of lines) {
      const determinant = line.n[0] * other.n[1] - line.n[1] * other.n[0];
      if (Math.abs(determinant) > 1e-10) candidates.push([(line.c * other.n[1] - line.n[1] * other.c) / determinant, (line.n[0] * other.c - line.c * other.n[0]) / determinant]);
    }
    for (const circle of circles) {
      const offset = line.c - dot(line.n, circle.center), delta = circle.radius ** 2 - offset ** 2;
      if (delta < -1e-10) continue;
      const foot = circle.center.map((v, i) => v + line.n[i] * offset), extent = Math.sqrt(Math.max(0, delta));
      for (const sign of [-1, 1]) candidates.push([foot[0] - sign * line.n[1] * extent, foot[1] + sign * line.n[0] * extent]);
    }
  }
  for (let i = 0; i < circles.length; i++) {
    const circle = circles[i], dx = center[0] - circle.center[0], dy = center[1] - circle.center[1], length = Math.hypot(dx, dy);
    if (length > 1e-10) candidates.push([circle.center[0] + dx / length * circle.radius, circle.center[1] + dy / length * circle.radius]);
    else for (const [x, y] of [[1,0],[-1,0],[0,1],[0,-1]]) candidates.push([circle.center[0] + x * circle.radius, circle.center[1] + y * circle.radius]);
    for (const other of circles.slice(i + 1)) {
      const dx = other.center[0] - circle.center[0], dy = other.center[1] - circle.center[1], distance = Math.hypot(dx, dy);
      if (distance < 1e-10 || distance > circle.radius + other.radius || distance < Math.abs(circle.radius - other.radius)) continue;
      const along = (circle.radius ** 2 - other.radius ** 2 + distance ** 2) / (2 * distance), height = Math.sqrt(Math.max(0, circle.radius ** 2 - along ** 2));
      for (const sign of [-1, 1]) candidates.push([circle.center[0] + dx / distance * along - sign * dy / distance * height, circle.center[1] + dy / distance * along + sign * dx / distance * height]);
    }
  }
  return candidates.filter(valid).sort((a, b) => Math.hypot(a[0] - center[0], a[1] - center[1]) - Math.hypot(b[0] - center[0], b[1] - center[1]) || a[0] - b[0] || a[1] - b[1])[0] ?? null;
}
export function placementLines(guide?: PlacementGuide | null): TelosLine[] {
  const frame = guide?.selection.support;
  if (!guide || !frame || guide.diameter <= 0 || !Number.isFinite(guide.diameter)) return [];
  const diameters = guide.shaftDiameter && guide.shaftDiameter < guide.diameter ? [guide.diameter, guide.shaftDiameter] : [guide.diameter];
  const rings = diameters.map(diameter => { const points: number[] = [];
    for (let i = 0; i <= 64; i++) points.push(...worldPoint(frame, [guide.center[0] + diameter / 2 * Math.cos(i * Math.PI / 32), guide.center[1] + diameter / 2 * Math.sin(i * Math.PI / 32)]));
    return points;
  });
  const center = worldPoint(frame, guide.center), tick = Math.min(guide.diameter / 3, 2);
  const cross = [0, 1].map(axis => [-1, 1].flatMap(sign => worldPoint(frame, guide.center.map((v, i) => v + (axis === i ? sign * tick : 0)))));
  const tip = center.map((v, i) => v - frame.normal[i] * tick);
  const head = [-1, 1].map(sign => [...tip, ...tip.map((v, i) => v + frame.normal[i] * tick * .35 + sign * frame.x[i] * tick * .2)]);
  return [...rings, ...cross, [...center, ...tip], ...head].flatMap((points, i) => {
    const line: TelosLine = { id: `feature-placement:${i}`, points, identity: { occurrenceId: guide.selection.occurrenceId, overlayId: 'feature-placement' },
      transform: [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1], overlay: true, pickable: false, depthMode: 'always-on-top', widthPixels: 2, color: [1,.72,.15,1] };
    return [{ ...line, id: `${line.id}:halo`, widthPixels: 8, color: [1,.62,.05,.18] }, line];
  });
}

/** Capture only primary placement gestures, preserving Shift-drag/right-drag orbit and pan.
 * Both renderers supply their own camera rays and compiler-mapped face picks. */
export function bindFeaturePlacement(element: HTMLCanvasElement, current: () => FeaturePlacementProps,
  ray: (pixel: [number, number]) => { origin: readonly number[]; direction: readonly number[] },
  pick: (pixel: [number, number]) => SelectionDescription | null) {
  let dragging = false;
  const pixel = (event: PointerEvent): [number, number] => { const rect = element.getBoundingClientRect(); return [event.clientX - rect.left, event.clientY - rect.top]; };
  const intersect = (event: PointerEvent, selection: SelectionDescription) => {
    const frame = selection.support; if (!frame) return null;
    const r = ray(pixel(event)), denominator = dot(r.direction, frame.normal);
    if (Math.abs(denominator) < 1e-8) return null;
    const t = dot(frame.origin.map((v, i) => v - r.origin[i]), frame.normal) / denominator;
    return t >= 0 ? r.origin.map((v, i) => v + t * r.direction[i]) : null;
  };
  const down = (event: PointerEvent) => {
    const value = current(); if (!value.placingFeature || event.button !== 0 || event.shiftKey || !value.placementActions?.current) return;
    const selection = pick(pixel(event));
    if (!selection?.support || !selection.selector) {
      if (selection) value.placementActions.current.reject('Choose a convex planar face with straight boundaries in the part workspace. This face does not have a supported placement frame.');
      return;
    }
    const point = intersect(event, selection); if (!point) return;
    event.stopImmediatePropagation(); event.preventDefault(); dragging = true; element.setPointerCapture(event.pointerId);
    value.placementActions.current.place(selection, point);
  };
  const move = (event: PointerEvent) => {
    if (!dragging) return;
    event.stopImmediatePropagation(); event.preventDefault();
    const value = current(), selection = value.placementGuide?.selection;
    const point = selection ? intersect(event, selection) : null;
    if (point) value.placementActions?.current?.move(point);
  };
  const up = (event: PointerEvent) => {
    if (!dragging) return; move(event); dragging = false;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
  };
  const click = (event: MouseEvent) => { if (current().placingFeature && !event.shiftKey) { event.stopImmediatePropagation(); event.preventDefault(); } };
  element.addEventListener('pointerdown', down, true); element.addEventListener('pointermove', move, true);
  element.addEventListener('pointerup', up, true); element.addEventListener('pointercancel', up, true); element.addEventListener('click', click, true);
  return () => { element.removeEventListener('pointerdown', down, true); element.removeEventListener('pointermove', move, true); element.removeEventListener('pointerup', up, true); element.removeEventListener('pointercancel', up, true); element.removeEventListener('click', click, true); };
}
