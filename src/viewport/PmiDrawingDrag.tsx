import { useEffect, useRef, type KeyboardEvent, type MutableRefObject, type PointerEvent } from 'react';
import type { PmiDisplayAnnotation, PmiOffsets } from '@aetheris/cad';
import type { Project } from './PmiMarkers';
import { offsetFromDrag, pointOnDrawing, translate, zeroOffset, type Point3, type ViewRay } from './pmiDrawingLayout';

export type DrawingLabel = {
  key: string;
  name: string;
  bounds: readonly (readonly number[])[];
  normal: readonly number[];
};

export function drawingLabels(annotations: readonly PmiDisplayAnnotation[]): DrawingLabel[] {
  return annotations.flatMap(({ placement, name }) => placement?.bounds
    ? [{ key: placement.key, name: placement.key === 'notes' ? 'Notes' : name, bounds: placement.bounds, normal: placement.normal }] : []);
}

export function PmiDrawingDrag({ labels, offsets, projectRef, rayRef, preview, commit }: {
  labels: readonly DrawingLabel[];
  offsets: PmiOffsets;
  projectRef: MutableRefObject<Project | null>;
  rayRef: MutableRefObject<ViewRay | null>;
  preview: (key: string, offset: Point3) => void;
  commit: (key: string, offset?: Point3) => void;
}) {
  const layer = useRef<SVGSVGElement>(null);
  const polygons = useRef(new Map<string, SVGPolygonElement>());
  const currentOffsets = useRef(offsets); currentOffsets.current = offsets;
  const drag = useRef<{ pointer: number; label: DrawingLabel; origin: Point3; from: Point3; original: Point3; offset: Point3 } | null>(null);

  useEffect(() => {
    let frame = 0;
    const projectLabels = () => {
      const project = projectRef.current;
      if (project) for (const { key, bounds } of labels) {
        const polygon = polygons.current.get(key);
        if (!polygon) continue;
        const offset = currentOffsets.current[key] ?? zeroOffset;
        const projected = bounds.map(point => project(translate(point, offset)));
        if (projected.some(point => !point || !point.every(Number.isFinite))) {
          polygon.removeAttribute('points');
          continue;
        }
        const points = projected.map(point => `${point![0].toFixed(2)},${point![1].toFixed(2)}`).join(' ');
        if (polygon.getAttribute('points') !== points) polygon.setAttribute('points', points);
      }
      frame = requestAnimationFrame(projectLabels);
    };
    frame = requestAnimationFrame(projectLabels);
    return () => cancelAnimationFrame(frame);
  }, [labels, projectRef]);

  const localPixel = (event: PointerEvent): [number, number] => {
    const rect = layer.current!.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  };
  const hitPlane = (pixel: [number, number], origin: Point3, label: DrawingLabel) =>
    pointOnDrawing(rayRef.current?.(pixel) ?? null, origin, label.normal);
  function begin(event: PointerEvent<SVGPolygonElement>, label: DrawingLabel) {
    if (event.button !== 0 || drag.current) return;
    const original = offsets[label.key] ?? zeroOffset;
    const origin = translate(label.bounds[0], original);
    const from = hitPlane(localPixel(event), origin, label);
    if (!from) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.dragging = 'true';
    drag.current = { pointer: event.pointerId, label, origin, from, original, offset: original };
  }
  function move(event: PointerEvent<SVGPolygonElement>) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    const to = hitPlane(localPixel(event), active.origin, active.label);
    const offset = to && offsetFromDrag(active.original, active.from, to, active.label.normal);
    if (!offset) return;
    active.offset = offset;
    preview(active.label.key, offset);
  }
  function stop(event: PointerEvent<SVGPolygonElement>, accept: boolean) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
    commit(active.label.key, accept ? active.offset : undefined);
  }
  function nudge(event: KeyboardEvent<SVGPolygonElement>, label: DrawingLabel) {
    const pixels = event.shiftKey ? 24 : 8;
    const directions: Record<string, [number, number]> = { ArrowLeft: [-pixels, 0], ArrowRight: [pixels, 0], ArrowUp: [0, -pixels], ArrowDown: [0, pixels] };
    const direction = directions[event.key];
    if (!direction || drag.current) return;
    event.preventDefault();
    event.stopPropagation();
    const original = offsets[label.key] ?? zeroOffset;
    const origin = translate(label.bounds[0], original);
    const at = projectRef.current?.(origin);
    if (!at) return;
    const to = hitPlane([at[0] + direction[0], at[1] + direction[1]], origin, label);
    const offset = to && offsetFromDrag(original, origin, to, label.normal);
    if (offset) commit(label.key, offset);
  }

  return <svg ref={layer} className="pmi-drawing-placement" aria-label="Draggable drawing callouts">
    {labels.map(label => <polygon key={label.key} ref={node => { if (node) polygons.current.set(label.key, node); else polygons.current.delete(label.key); }}
      aria-label={`Move ${label.name}`} aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight" role="button" tabIndex={0}
      onKeyDown={event => nudge(event, label)} onPointerDown={event => begin(event, label)} onPointerMove={move}
      onPointerUp={event => { move(event); stop(event, true); }} onPointerCancel={event => stop(event, false)} onLostPointerCapture={event => stop(event, false)}>
      <title>{`Drag ${label.name}`}</title>
    </polygon>)}
  </svg>;
}
