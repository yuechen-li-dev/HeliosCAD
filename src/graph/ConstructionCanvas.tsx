import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import type { SketchShape } from '@aetheris/cad';
import { arcEnd, snap, snapStep } from './draftGeometry';

type Point = [number, number];
export type CanvasBounds = { x: number; y: number; width: number; height: number };
export type CanvasShape = { shape: SketchShape; bounds: CanvasBounds; owner: string };
type Alignment = { axis: 'x' | 'y'; value: number; label: string };
type Gesture = { pointer: number; start: Point; current: Point; shape?: CanvasShape; pan?: CanvasBounds; guides: Alignment[]; step: number; startName?: string; currentName?: string };
export type DrawnRectangle = { x: number; y: number; width: number; height: number };
/** A picked stroke point: grid-snapped coordinates, or an existing named point it snapped onto. */
export type StrokePoint = { at: Point; name?: string };
export type StrokeKind = 'segment' | 'axis' | 'arc';
type ArcStage = { center: StrokePoint; start: StrokePoint; end: StrokePoint | null };

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
const clean = (n: number) => Number(n.toFixed(9));
const rectangle = (a: Point, b: Point): DrawnRectangle => ({ x: clean((a[0] + b[0]) / 2), y: clean((a[1] + b[1]) / 2), width: clean(Math.abs(b[0] - a[0])), height: clean(Math.abs(b[1] - a[1])) });

/** Pointer interaction over compiler-projected construction. Drag previews are disposable SVG
 * transforms. Only pointer-up submits dimensions to the existing compiler edit transaction. */
export function ConstructionCanvas({ bounds, shapes, selected, drawing, movable, disabled, children, onSelect, onDraw, onMove, onPoint, hint, revision, drawKind = 'Rect2', autoFit = true, fitRequest = 0, header, overlay, layer, stroke, snapPoints = [], onStroke }: {
  bounds: CanvasBounds; shapes: CanvasShape[]; selected: string; drawing: boolean; movable: boolean; disabled: boolean;
  children: ReactNode; onSelect(id: string): void; onDraw(rectangle: DrawnRectangle): void;
  onMove(shape: SketchShape, center: Point): void; onPoint?(point: Point): void; hint: string; revision: number; drawKind?: string;
  /** Fit once when existing construction first arrives. A fresh draft keeps its view so drawing never jumps. */
  autoFit?: boolean; fitRequest?: number; header?: ReactNode; overlay?: ReactNode;
  /** World-space annotations sized to the current zoom (scale is one percent of the visible width). */
  layer?: (scale: number) => ReactNode;
  /** Line and axis strokes are one drag; an arc drags centre → start, then clicks where it ends. */
  stroke?: StrokeKind; snapPoints?: readonly { name: string; x: number; y: number }[]; onStroke?(points: StrokePoint[]): void;
}) {
  const svg = useRef<SVGSVGElement>(null), gesture = useRef<Gesture | null>(null), fitted = useRef(!autoFit);
  const [camera, setCamera] = useState<CanvasBounds>(bounds), [active, setActive] = useState<Gesture | null>(null);
  const [notice, setNotice] = useState('');
  const [arcStage, setArcStage] = useState<ArcStage | null>(null);
  useEffect(() => setArcStage(null), [stroke, revision, disabled]);
  const [pixels, setPixels] = useState(0);
  useEffect(() => { gesture.current = null; setActive(null); }, [revision, disabled]);
  useEffect(() => { if (!fitted.current && shapes.length) { setCamera(bounds); fitted.current = true; } }, [bounds, shapes.length]);
  const latestBounds = useRef(bounds); latestBounds.current = bounds;
  useEffect(() => { if (fitRequest) setCamera(latestBounds.current); }, [fitRequest]);
  useEffect(() => {
    const element = svg.current; if (!element) return;
    const observer = new ResizeObserver(() => setPixels(element.clientWidth)); observer.observe(element); setPixels(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  // Round, zoom-dependent increments: the grid you see is the grid you snap to. Alt is fine (0.1 mm).
  const pixelsPerMillimetre = pixels && camera.width ? pixels / camera.width : 8;
  const step = snapStep(pixelsPerMillimetre);
  const stepFor = (event: { altKey: boolean }) => event.altKey ? 0.1 : step;
  const change = (next: Gesture | null) => { gesture.current = next; setActive(next); };
  const position = (event: { clientX: number; clientY: number }): Point => {
    const matrix = svg.current!.getScreenCTM()!;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return [point.x, -point.y];
  };
  // Named points win over the grid within a few pixels, so strokes join existing construction exactly.
  const pick = (event: { clientX: number; clientY: number; altKey: boolean }, gridStep: number): StrokePoint => {
    const raw = position(event), reach = 8 / Math.abs(svg.current!.getScreenCTM()!.a);
    const near = event.altKey ? undefined : snapPoints.map(p => ({ p, d: Math.hypot(p.x - raw[0], p.y - raw[1]) })).filter(c => c.d <= reach).sort((a, b) => a.d - b.d)[0]?.p;
    return near ? { at: [near.x, near.y], name: near.name } : { at: [snap(raw[0], gridStep), snap(raw[1], gridStep)] };
  };
  const arcFinish = (stage: ArcStage, event: { clientX: number; clientY: number; altKey: boolean }): StrokePoint => {
    const named = pick(event, step), radius = Math.hypot(stage.start.at[0] - stage.center.at[0], stage.start.at[1] - stage.center.at[1]);
    if (named.name && Math.abs(Math.hypot(named.at[0] - stage.center.at[0], named.at[1] - stage.center.at[1]) - radius) < 1e-6) return named;
    const [x, y] = arcEnd(stage.center.at, stage.start.at, position(event), 15, event.altKey); return { at: [x, y] };
  };
  const begin = (event: PointerEvent<SVGElement>, shape?: CanvasShape) => {
    if (disabled || ![0, 1].includes(event.button)) return;
    if (stroke && drawing && !shape && event.button === 0) {
      event.preventDefault(); event.stopPropagation(); setNotice(''); svg.current!.focus();
      if (arcStage) {
        const end = arcFinish(arcStage, event); setArcStage(null);
        if (Math.hypot(end.at[0] - arcStage.start.at[0], end.at[1] - arcStage.start.at[1]) < 1e-6) { setNotice('An arc needs an end point away from its start.'); return; }
        onStroke?.([arcStage.center, arcStage.start, end]); return;
      }
      svg.current!.setPointerCapture(event.pointerId);
      const first = pick(event, stepFor(event));
      change({ pointer: event.pointerId, start: first.at, current: first.at, startName: first.name, guides: [], step: stepFor(event) }); return;
    }
    if (shape) {
      onSelect(shape.shape.id);
      if (!['Center X', 'Center Y'].every(label => shape.shape.controls.some(c => c.label === label && c.editable))) {
        setNotice('This position is driven by an expression. Edit its inputs; dragging will not replace the expression.'); return;
      }
    }
    if (!shape && !drawing && event.button !== 1) return;
    event.preventDefault(); event.stopPropagation(); setNotice(''); svg.current!.focus();
    svg.current!.setPointerCapture(event.pointerId);
    const gestureStep = stepFor(event), raw = position(event);
    const start: Point = shape ? raw : [snap(raw[0], gestureStep), snap(raw[1], gestureStep)];
    change({ pointer: event.pointerId, start, current: start, shape, pan: event.button === 1 ? camera : undefined, guides: [], step: gestureStep });
  };
  const update = (event: PointerEvent<SVGElement>) => {
    const previous = gesture.current; if (!previous || previous.pointer !== event.pointerId) return;
    const p = position(event);
    if (previous.pan) {
      // Use screen deltas, since the SVG camera itself is changing while panning.
      const matrix = svg.current!.getScreenCTM()!;
      setCamera(current => ({ ...current, x: current.x - event.movementX / matrix.a, y: current.y - event.movementY / matrix.d })); return;
    }
    const gestureStep = event.altKey ? 0.1 : previous.step;
    if (stroke && !previous.shape) { const next = pick(event, gestureStep); change({ ...previous, current: next.at, currentName: next.name }); return; }
    let current: Point = [snap(p[0], gestureStep), snap(p[1], gestureStep)], guides: Alignment[] = [];
    if (previous.shape) {
      const shape = previous.shape, center = shape.shape.center;
      current = [snap(center[0] + p[0] - previous.start[0], gestureStep), snap(center[1] + p[1] - previous.start[1], gestureStep)];
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
    if (stroke && !final.shape) {
      const a: StrokePoint = { at: final.start, name: final.startName }, b: StrokePoint = { at: final.current, name: final.currentName };
      if (Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]) < .1) { setNotice(stroke === 'arc' ? 'Drag from the arc centre to where it starts.' : 'Drag from one end to the other.'); return; }
      if (stroke === 'arc') { setArcStage({ center: a, start: b, end: null }); setNotice('Click where the arc ends, counter-clockwise from its start. Esc cancels.'); }
      else onStroke?.([a, b]);
      return;
    }
    if (final.shape) {
      if (final.current !== final.start && final.current.some((value, axis) => Math.abs(value - final.shape!.shape.center[axis]) > 1e-9)) onMove(final.shape.shape, final.current);
    } else {
      const rect = rectangle(final.start, final.current);
      if (rect.width >= .1 && rect.height >= .1) onDraw(rect);
      else setNotice('Drag between two corners to draw a shape, or enter its dimensions in the inspector.');
    }
  };
  const zoom = (factor: number) => setCamera(c => ({ x: c.x + c.width * (1 - factor) / 2, y: c.y + c.height * (1 - factor) / 2, width: c.width * factor, height: c.height * factor }));
  const moving = active?.shape;
  const preview = active && !moving && !active.pan && !stroke ? rectangle(active.start, active.current) : null;
  const strokeLine = active && !moving && !active.pan && stroke ? [active.start, active.current] as const : null;
  const far = Math.max(camera.width, camera.height) * 4;
  const scale = camera.width / 100;
  // Show the snap grid when its dots are far enough apart; otherwise a coarser multiple of it.
  const shownStep = [1, 5, 10].map(n => n * step).find(s => s * pixelsPerMillimetre >= 12) ?? step * 10;
  return <div className="draft-canvas">
    {header && <div className="draft-canvas-header">{header}</div>}
    <div className="draft-canvas-tools"><button type="button" disabled={!!active} title="Fit construction · F" onClick={() => setCamera(bounds)}>Fit construction</button><button type="button" aria-label="Zoom in construction" disabled={!!active} onClick={() => zoom(.8)}>+</button><button type="button" aria-label="Zoom out construction" disabled={!!active} onClick={() => zoom(1.25)}>−</button></div>
    <svg ref={svg} role="group" tabIndex={-1} aria-label="Construction and Profile preview" className={drawing ? 'drawing' : ''}
      viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`} onPointerDown={event => begin(event)} onPointerUp={finish}
      onPointerMove={event => { if (arcStage && !gesture.current) setArcStage({ ...arcStage, end: arcFinish(arcStage, event) }); else update(event); }}
      onPointerCancel={() => change(null)} onLostPointerCapture={() => { if (gesture.current) change(null); }}
      onKeyDown={event => { if (event.key === 'Escape' && (gesture.current || arcStage)) { event.preventDefault(); event.stopPropagation(); change(null); setArcStage(null); setNotice(''); } }}
      onClick={event => { if (!onPoint || disabled) return; const p = position(event), s = stepFor(event); onPoint([snap(p[0], s), snap(p[1], s)]); }}>
      <defs><pattern id="draft-grid" patternUnits="userSpaceOnUse" x={0} y={0} width={shownStep} height={shownStep}>
        <circle cx={0} cy={0} r={1 / pixelsPerMillimetre} className="draft-grid-dot" /><circle cx={shownStep} cy={0} r={1 / pixelsPerMillimetre} className="draft-grid-dot" />
        <circle cx={0} cy={shownStep} r={1 / pixelsPerMillimetre} className="draft-grid-dot" /><circle cx={shownStep} cy={shownStep} r={1 / pixelsPerMillimetre} className="draft-grid-dot" />
      </pattern></defs>
      <rect x={camera.x} y={camera.y} width={camera.width} height={camera.height} fill="url(#draft-grid)" pointerEvents="none" />
      {children}
      {layer?.(scale)}
      {movable && shapes.map(item => <g key={item.shape.id} className="draft-shape-target" role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled} aria-label={`Move ${item.shape.name}`} aria-pressed={item.shape.id === selected}
        onPointerDown={event => { if (event.button === 1) return; begin(event, item); }}
        onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!disabled) onSelect(item.shape.id); } }}>
        <rect x={item.bounds.x} y={-item.bounds.y - item.bounds.height} width={item.bounds.width} height={item.bounds.height} fill="transparent" style={{ stroke: item.shape.id === selected ? 'var(--draft-construction)' : 'transparent' }} strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
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
      {strokeLine && stroke !== 'arc' && <line x1={strokeLine[0][0]} y1={-strokeLine[0][1]} x2={strokeLine[1][0]} y2={-strokeLine[1][1]} className="draft-gesture-preview" pointerEvents="none" vectorEffect="non-scaling-stroke" />}
      {strokeLine && stroke === 'axis' && (() => { const [a, b] = strokeLine, d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
        return <line x1={a[0] - u[0] * far} y1={-(a[1] - u[1] * far)} x2={a[0] + u[0] * far} y2={-(a[1] + u[1] * far)} className="draft-axis-preview" pointerEvents="none" vectorEffect="non-scaling-stroke" />; })()}
      {strokeLine && stroke === 'arc' && <g pointerEvents="none"><circle cx={strokeLine[0][0]} cy={-strokeLine[0][1]} r={Math.hypot(strokeLine[1][0] - strokeLine[0][0], strokeLine[1][1] - strokeLine[0][1])} className="draft-axis-preview" vectorEffect="non-scaling-stroke" />
        <line x1={strokeLine[0][0]} y1={-strokeLine[0][1]} x2={strokeLine[1][0]} y2={-strokeLine[1][1]} className="draft-gesture-preview" vectorEffect="non-scaling-stroke" /></g>}
      {arcStage && <g pointerEvents="none">
        <circle cx={arcStage.center.at[0]} cy={-arcStage.center.at[1]} r={Math.hypot(arcStage.start.at[0] - arcStage.center.at[0], arcStage.start.at[1] - arcStage.center.at[1])} className="draft-axis-preview" vectorEffect="non-scaling-stroke" />
        {arcStage.end && <path className="draft-gesture-preview" fill="none" vectorEffect="non-scaling-stroke" d={arcPath(arcStage.center.at, arcStage.start.at, arcStage.end.at)} />}
      </g>}
      {active?.guides.map(guide => <g key={guide.axis} pointerEvents="none" className="draft-alignment-guide">
        {guide.axis === 'x' ? <line x1={guide.value} x2={guide.value} y1={camera.y} y2={camera.y + camera.height} vectorEffect="non-scaling-stroke" /> : <line x1={camera.x} x2={camera.x + camera.width} y1={-guide.value} y2={-guide.value} vectorEffect="non-scaling-stroke" />}
        <text x={guide.axis === 'x' ? guide.value + scale : camera.x + scale} y={guide.axis === 'x' ? camera.y + 8 * scale : -guide.value - scale} fontSize={scale * 1.7}>{guide.label}</text>
      </g>)}
    </svg>
    {overlay}
    <div className="draft-axes" aria-live="polite">{notice || (strokeLine ? strokeText(stroke!, strokeLine[0], strokeLine[1], active?.currentName) : preview ? `${preview.width} × ${preview.height} mm` : moving ? `Center ${active!.current.join(', ')} mm${active!.guides.length ? ' · aligned' : ''}` : hint)}<span className="draft-snap"> · Snap {step} mm · Alt: 0.1 mm</span></div>
  </div>;
}

/** Counter-clockwise arc (clockwise on screen, sweep flag 1, since the SVG frame is y-down), from `start` to `end` around `center`. */
function arcPath(center: Point, start: Point, end: Point) {
  const r = Math.hypot(start[0] - center[0], start[1] - center[1]);
  let sweep = Math.atan2(end[1] - center[1], end[0] - center[0]) - Math.atan2(start[1] - center[1], start[0] - center[0]);
  while (sweep <= 0) sweep += 2 * Math.PI;
  return `M ${start[0]} ${-start[1]} A ${r} ${r} 0 ${sweep > Math.PI ? 1 : 0} 1 ${end[0]} ${-end[1]}`;
}
function strokeText(kind: StrokeKind, a: Point, b: Point, onto?: string) {
  const length = Number(Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(3)), angle = Number((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI).toFixed(1));
  const text = kind === 'arc' ? `R ${length} mm` : `${length} mm at ${angle}°`;
  return onto ? `${text} · on ${onto}` : text;
}
