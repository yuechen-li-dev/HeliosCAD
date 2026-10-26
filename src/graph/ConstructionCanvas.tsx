import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import type { SketchShape } from '@aetheris/cad';

type Point = [number, number];
export type CanvasBounds = { x: number; y: number; width: number; height: number };
export type CanvasShape = { shape: SketchShape; bounds: CanvasBounds; owner: string };
type Alignment = { axis: 'x' | 'y'; value: number; label: string };
type Gesture = { pointer: number; start: Point; current: Point; shape?: CanvasShape; pan?: CanvasBounds; guides: Alignment[] };
export type DrawnRectangle = { x: number; y: number; width: number; height: number };

// Presentation-only snapping. Results are coordinates for one placement transaction;
// no reference or relationship is created, and no source expression is evaluated here.
export function alignPlacement(bounds: CanvasBounds, targets: CanvasShape[], tolerance: number, bypass: boolean) {
  const guides: Alignment[] = []; const offset: Point = [0, 0];
  if (!bypass) for (const [axis, size, index] of [['x', 'width', 0], ['y', 'height', 1]] as const) {
    let best = tolerance;
    for (const target of targets) for (const anchor of [0, .5, 1]) for (const ownAnchor of [0, .5, 1]) {
      const value = target.bounds[axis] + target.bounds[size] * anchor;
      const delta = value - (bounds[axis] + bounds[size] * ownAnchor);
      if (Math.abs(delta) < best) {
        best = Math.abs(delta); offset[index] = delta;
        const label = `${target.shape.name} ${anchor === .5 ? 'center' : axis === 'x' ? anchor ? 'right' : 'left' : anchor ? 'top' : 'bottom'}`;
        guides[index] = { axis, value, label };
      }
    }
  }
  return { offset, guides: guides.filter(Boolean) };
}
const grid = (n: number) => Math.round(n * 10) / 10;
const clean = (n: number) => Number(n.toFixed(9));
const rectangle = (a: Point, b: Point): DrawnRectangle => ({ x: clean((a[0] + b[0]) / 2), y: clean((a[1] + b[1]) / 2), width: clean(Math.abs(b[0] - a[0])), height: clean(Math.abs(b[1] - a[1])) });

/** Pointer interaction over compiler-projected construction. Drag previews are disposable SVG
 * transforms. Only pointer-up submits dimensions to the existing compiler edit transaction. */
export function ConstructionCanvas({ bounds, shapes, selected, drawing, movable, disabled, children, onSelect, onDraw, onMove, onPoint, hint, revision, drawKind = 'Rect2' }: {
  bounds: CanvasBounds; shapes: CanvasShape[]; selected: string; drawing: boolean; movable: boolean; disabled: boolean;
  children: ReactNode; onSelect(id: string): void; onDraw(rectangle: DrawnRectangle): void;
  onMove(shape: SketchShape, center: Point): void; onPoint?(point: Point): void; hint: string; revision: number; drawKind?: string;
}) {
  const svg = useRef<SVGSVGElement>(null), gesture = useRef<Gesture | null>(null), fitted = useRef(false);
  const [camera, setCamera] = useState<CanvasBounds>(bounds), [active, setActive] = useState<Gesture | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => { gesture.current = null; setActive(null); }, [revision, disabled]);
  useEffect(() => { if (!fitted.current && shapes.length) { setCamera(bounds); fitted.current = true; } }, [bounds, shapes.length]);
  const change = (next: Gesture | null) => { gesture.current = next; setActive(next); };
  const position = (event: { clientX: number; clientY: number }): Point => {
    const matrix = svg.current!.getScreenCTM()!;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return [point.x, -point.y];
  };
  const begin = (event: PointerEvent<SVGElement>, shape?: CanvasShape) => {
    if (disabled || ![0, 1].includes(event.button)) return;
    if (shape) {
      onSelect(shape.shape.id);
      if (!['Center X', 'Center Y'].every(label => shape.shape.controls.some(c => c.label === label && c.editable))) {
        setNotice('This position is driven by an expression. Edit its inputs; dragging will not replace the expression.'); return;
      }
    }
    if (!shape && !drawing && event.button !== 1) return;
    event.preventDefault(); event.stopPropagation(); setNotice(''); svg.current!.focus();
    svg.current!.setPointerCapture(event.pointerId);
    const start = position(event);
    change({ pointer: event.pointerId, start, current: start, shape, pan: event.button === 1 ? camera : undefined, guides: [] });
  };
  const update = (event: PointerEvent<SVGElement>) => {
    const previous = gesture.current; if (!previous || previous.pointer !== event.pointerId) return;
    const p = position(event);
    if (previous.pan) {
      // Use screen deltas, since the SVG camera itself is changing while panning.
      const matrix = svg.current!.getScreenCTM()!;
      setCamera(current => ({ ...current, x: current.x - event.movementX / matrix.a, y: current.y - event.movementY / matrix.d })); return;
    }
    let current: Point = [grid(p[0]), grid(p[1])], guides: Alignment[] = [];
    if (previous.shape) {
      const shape = previous.shape, center = shape.shape.center;
      current = [grid(center[0] + p[0] - previous.start[0]), grid(center[1] + p[1] - previous.start[1])];
      const moving = { ...shape.bounds, x: shape.bounds.x + current[0] - center[0], y: shape.bounds.y + current[1] - center[1] };
      const matrix = svg.current!.getScreenCTM()!;
      const alignment = alignPlacement(moving, shapes.filter(s => s.shape.id !== shape.shape.id && s.owner === shape.owner), 7 / Math.abs(matrix.a), event.altKey);
      current = [clean(current[0] + alignment.offset[0]), clean(current[1] + alignment.offset[1])]; guides = alignment.guides;
    }
    change({ ...previous, current, guides });
  };
  const finish = (event: PointerEvent<SVGElement>) => {
    const final = gesture.current; if (!final || final.pointer !== event.pointerId) return;
    change(null); svg.current!.releasePointerCapture(event.pointerId);
    if (final.pan) return;
    if (final.shape) {
      if (final.current !== final.start && final.current.some((value, axis) => Math.abs(value - final.shape!.shape.center[axis]) > 1e-9)) onMove(final.shape.shape, final.current);
    } else {
      const rect = rectangle([grid(final.start[0]), grid(final.start[1])], final.current);
      if (rect.width >= .1 && rect.height >= .1) onDraw(rect);
      else setNotice('Drag between two corners to draw a shape, or enter its dimensions in the inspector.');
    }
  };
  const zoom = (factor: number) => setCamera(c => ({ x: c.x + c.width * (1 - factor) / 2, y: c.y + c.height * (1 - factor) / 2, width: c.width * factor, height: c.height * factor }));
  const moving = active?.shape;
  const preview = active && !moving && !active.pan ? rectangle([grid(active.start[0]), grid(active.start[1])], active.current) : null;
  const scale = camera.width / 100;
  return <div className="draft-canvas">
    <div className="draft-canvas-tools"><button type="button" disabled={!!active} onClick={() => setCamera(bounds)}>Fit construction</button><button type="button" aria-label="Zoom in construction" disabled={!!active} onClick={() => zoom(.8)}>+</button><button type="button" aria-label="Zoom out construction" disabled={!!active} onClick={() => zoom(1.25)}>−</button></div>
    <svg ref={svg} role="group" tabIndex={-1} aria-label="Construction and Profile preview" className={drawing ? 'drawing' : ''}
      viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`} onPointerDown={event => begin(event)} onPointerMove={update} onPointerUp={finish}
      onPointerCancel={() => change(null)} onLostPointerCapture={() => { if (gesture.current) change(null); }}
      onKeyDown={event => { if (event.key === 'Escape' && gesture.current) { event.preventDefault(); event.stopPropagation(); change(null); } }}
      onClick={event => { if (!onPoint || disabled) return; const p = position(event); onPoint([grid(p[0]), grid(p[1])]); }}>
      {children}
      {movable && shapes.map(item => <g key={item.shape.id} className="draft-shape-target" role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label={`Move ${item.shape.name}`} aria-pressed={item.shape.id === selected}
        onPointerDown={event => { if (event.button === 1) return; begin(event, item); }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!disabled) onSelect(item.shape.id); } }}>
        <rect x={item.bounds.x} y={-item.bounds.y - item.bounds.height} width={item.bounds.width} height={item.bounds.height} fill="transparent" stroke={item.shape.id === selected ? '#b78a29' : 'transparent'} strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        <title>Drag {item.shape.name}. Soft alignment only; hold Alt to bypass snapping.</title>
      </g>)}
      {moving && <g pointerEvents="none" transform={`translate(${active!.current[0] - moving.shape.center[0]},${-(active!.current[1] - moving.shape.center[1])})`}><rect x={moving.bounds.x} y={-moving.bounds.y - moving.bounds.height} width={moving.bounds.width} height={moving.bounds.height} className="draft-gesture-preview" vectorEffect="non-scaling-stroke" /></g>}
      {preview && (drawKind === 'Circle2' || drawKind === 'Ellipse2' ? <ellipse cx={preview.x} cy={-preview.y}
        rx={drawKind === 'Circle2' ? Math.min(preview.width, preview.height) / 2 : preview.width / 2}
        ry={drawKind === 'Circle2' ? Math.min(preview.width, preview.height) / 2 : preview.height / 2}
        className="draft-gesture-preview" pointerEvents="none" vectorEffect="non-scaling-stroke" /> :
        <rect x={preview.x - preview.width / 2} y={-preview.y - preview.height / 2} width={preview.width} height={preview.height}
          rx={drawKind === 'Slot2' ? Math.min(preview.width, preview.height) / 2 : drawKind === 'RoundedRect2' ? Math.min(preview.width, preview.height) / 8 : 0}
          className="draft-gesture-preview" pointerEvents="none" vectorEffect="non-scaling-stroke" />)}
      {active?.guides.map(guide => <g key={guide.axis} pointerEvents="none" className="draft-alignment-guide">
        {guide.axis === 'x' ? <line x1={guide.value} x2={guide.value} y1={camera.y} y2={camera.y + camera.height} vectorEffect="non-scaling-stroke" /> : <line x1={camera.x} x2={camera.x + camera.width} y1={-guide.value} y2={-guide.value} vectorEffect="non-scaling-stroke" />}
        <text x={guide.axis === 'x' ? guide.value + scale : camera.x + scale} y={guide.axis === 'x' ? camera.y + 8 * scale : -guide.value - scale} fontSize={scale * 1.7}>{guide.label}</text>
      </g>)}
    </svg>
    <div className="draft-axes" aria-live="polite">{notice || (preview ? `${preview.width} × ${preview.height} mm` : moving ? `Center ${active!.current.join(', ')} mm${active!.guides.length ? ' · aligned' : ''}` : hint)}</div>
  </div>;
}
