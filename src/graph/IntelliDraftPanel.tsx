import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { DraftOperation, DraftSpan, DraftTrace, LanguageEdit, SketchEditRequest, SketchProjection, SketchShape } from '@aetheris/cad';
import { sketchCurvePoints } from '@aetheris/three-telos';
import type { WebSdkCadRuntime } from '../sdk/CadRuntime';
import { ConstructionShapeList } from './ConstructionShapeList';
import { ConstructionShapes } from './ConstructionShapes';
import { ConstructionCanvas, type CanvasShape, type StrokePoint } from './ConstructionCanvas';
import { STROKE_KINDS, alignedNeighbours, explainRefusal, freshName, nameStem, predictedBounds, shapeLabel, traceClosure, translation, type AlignedNeighbour } from './draftGeometry';
import './IntelliDraftPanel.css';

const blank = 'Model DraftPart {\n  units: mm\n}\n';
const DOCUMENT = 'intellidraft.firmament';
type Tool = 'Layout' | 'Shapes' | 'Rectangle' | 'Trace' | 'Extrude' | 'Point' | 'Line' | 'Circle' | 'Path' | 'Line step' | 'Arc step';
type Dimension = { owner: string; field: string; value: number; unit: string };
type Change = { control: string; value: number };
type Problem = { text: string; detail?: string };
type AlignPrompt = { shape: SketchShape; changes: Change[]; neighbours: AlignedNeighbour[] };
type DimensionEdit = { shape: SketchShape; control: SketchShape['controls'][number]; draft: string; left: number; top: number };
type Step = (text: string, previous: LanguageEdit | null) => Promise<LanguageEdit>;
type Runtime = Pick<WebSdkCadRuntime, 'sketch' | 'sketchEdit'> & Partial<Pick<WebSdkCadRuntime, 'edit'>>;

type DrawTool = { kind: string; label: string; short: string; key: string; group: string; option?: string };
// Tools sharing a group sit behind one hotbar button with a type menu; the key picks the group's current type.
const DRAW_TOOLS: readonly DrawTool[] = [
  { kind: 'Line2', label: 'line', short: 'Line', key: 'l', group: 'line', option: 'Line · Line2' },
  { kind: 'Axis2', label: 'axis', short: 'Axis', key: 'l', group: 'line', option: 'Axis · Axis2' },
  { kind: 'Rect2', label: 'rectangle', short: 'Rect', key: 'r', group: 'rect' },
  { kind: 'Circle2', label: 'circle', short: 'Circle', key: 'c', group: 'circle', option: 'Circle · Circle2' },
  { kind: 'Arc', label: 'arc', short: 'Arc', key: 'a', group: 'circle', option: 'Arc · Arc2' },
  { kind: 'Ellipse2', label: 'ellipse', short: 'Ellipse', key: 'e', group: 'ellipse' }, { kind: 'Slot2', label: 'slot', short: 'Slot', key: 's', group: 'slot' },
  { kind: 'RoundedRect2', label: 'rounded rectangle', short: 'Rounded', key: 'u', group: 'rounded', option: 'Rounded · RoundedRect2' },
  { kind: 'SmoothRoundedRect2', label: 'smooth rounded rectangle', short: 'Smooth', key: 'u', group: 'rounded', option: 'Smooth (squircle) · SmoothRoundedRect2' },
];
const TOOL_GROUPS = [...new Set(DRAW_TOOLS.map(t => t.group))];
const GUIDE_KINDS = new Set(['Line2', 'Arc2', 'Axis2', 'Circle2']);

/** Source is the construction model. The browser selects compiler-resolved entities and stages
 * ordinary source transactions; it neither solves constraints nor evaluates engineering geometry. */
export function IntelliDraftPanel({ runtime, initialSource = blank, document = DOCUMENT, initialNode = null, onCommit, onClose, onNew, onSource }: {
  runtime: Runtime; initialSource?: string;
  /** The open document's name, so compiler spans and diagnostics point at the real file. */
  document?: string;
  /** A Profile (or a shape it consumes) to open on; defaults to the document's first Profile. */
  initialNode?: string | null;
  onCommit(source: string): Promise<void>; onClose(): void; onNew?(): void;
  /** Leave the draft and show a driven value's expression in the source editor. */
  onSource?(span: { start: number; length: number }): void;
}) {
  const fresh = initialSource === blank;
  const [history, setHistory] = useState([initialSource]), [index, setIndex] = useState(0);
  const source = history[index];
  const [view, setView] = useState<SketchProjection | null>(null);
  const [node, setNode] = useState<string | null>(initialNode);
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<Problem | null>(null);
  const [pendingDimensions, setPendingDimensions] = useState(false);
  const [tool, setTool] = useState<Tool>(fresh ? 'Rectangle' : 'Shapes'), [name, setName] = useState(fresh ? 'rect1' : 'layout');
  const [owner, setOwner] = useState(''), [plane, setPlane] = useState('XY');
  const [x, setX] = useState(0), [y, setY] = useState(0);
  const [drawKind, setDrawKind] = useState('Rect2');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [width, setWidth] = useState(60), [rectHeight, setRectHeight] = useState(40);
  const [reference, setReference] = useState(''), [selectedShape, setSelectedShape] = useState('');
  const [insetX, setInsetX] = useState(8), [insetY, setInsetY] = useState(8), [sharedInset, setSharedInset] = useState(true);
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [length, setLength] = useState(40), [radius, setRadius] = useState(10), [turn, setTurn] = useState(0);
  const [height, setHeight] = useState(6);
  const [guide, setGuide] = useState(''), [arc, setArc] = useState(false), [reverse, setReverse] = useState(false);
  const [trace, setTrace] = useState<DraftTrace[]>([]);
  const [hoveredSpan, setHoveredSpan] = useState<string | null>(null);
  const [editingPoint, setEditingPoint] = useState<string | null>(null), [dimension, setDimension] = useState<Dimension | null>(null);
  const [addOpen, setAddOpen] = useState(false), [fitRequest, setFitRequest] = useState(0);
  const [alignPrompt, setAlignPrompt] = useState<AlignPrompt | null>(null), [dimensionEdit, setDimensionEdit] = useState<DimensionEdit | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [variant, setVariant] = useState<Record<string, string>>({ line: 'Line2', circle: 'Circle2', rounded: 'RoundedRect2' });
  const [pickedGuide, setPickedGuide] = useState('');
  const dialog = useRef<HTMLDialogElement>(null), mounted = useRef(true);
  const inspector = useRef<HTMLElement>(null);
  useEffect(() => { if (inspector.current) inspector.current.scrollTop = 0; }, [tool]);
  useEffect(() => {
    mounted.current = true; const element = dialog.current!; element.showModal(); element.focus();
    return () => { mounted.current = false; element.close(); };
  }, []);
  useEffect(() => {
    let current = true;
    void runtime.sketch(source, node, document, String(index)).then(result => {
      if (!current) return;
      setView(result); setProblem(null);
      if (index === 0 && !fresh) setTool('Shapes');
    }).catch(e => { if (current) report(e); });
    return () => { current = false; };
  }, [source, index, runtime, fresh, node, document]);

  const construction = view?.construction, elements = construction?.elements ?? [];
  const layouts = elements.filter(e => e.kind === 'Struct'), paths = elements.filter(e => e.kind === 'Path');
  const selectedOwner = elements.find(e => e.id === owner) ?? layouts[0] ?? paths[0];
  // A Circle2 centred on a named point is the arc tool's guide circle, not a placed shape.
  const constructionShapes = (construction?.shapes ?? []).filter(s => !(s.kind === 'Circle2' && !s.controls.some(c => c.label === 'Center X')));
  // Shapes the open Profile consumes outside any layout (code-authored parts) are edited through the
  // Profile itself, the way the old Sketch workspace did.
  const profileShapes = (view?.shapes ?? []).filter(s => !constructionShapes.some(c => c.id === s.id));
  const shapes = [...constructionShapes, ...profileShapes];
  const dimensionRequest = (shape: { id: string }, changes: Change[]): SketchEditRequest =>
    profileShapes.some(p => p.id === shape.id) ? { kind: 'dimensions', node: view?.node, changes } : { kind: 'constructionDimensions', changes };
  const shownShapes = shapes.filter(shape => !hidden.has(shape.id));
  const rectangles = shownShapes.filter(shape => shape.kind === 'Rect2');
  const selected = shapes.find(s => s.id === selectedShape) ?? (tool === 'Rectangle' ? undefined : shapes[0]);
  const shownGuide = (value: string) => !elements.some(e => hidden.has(e.id) && (value === e.name || value.startsWith(e.name + '.')));
  const points = (construction?.points ?? []).filter(p => shownGuide(p.name)), spans = construction?.spans ?? [];
  const sourceOrder = (value: string) => elements.findIndex(e => e.name === value || (e.kind === 'Path' || shapes.some(shape => shape.id === e.id)) && value.startsWith(e.name + '.'));
  const guides = [...(construction?.guides ?? [])].filter(g => shownGuide(g.name)).sort((a, b) => sourceOrder(a.name) - sourceOrder(b.name));
  const selectedGuide = guides.find(g => g.name === guide) ?? guides[0];
  const wholeOutlineShape = selected && !hidden.has(selected.id) ? selected : shownShapes[0];
  // Every visible shape's edges are traceable; the outline may cross between shapes freely.
  // Line2 and Circle2 guides own spans too: lines between named points, arcs between points on a circle.
  const selectable = spans.filter(s => shownShapes.some(shape => shape.id === s.owner) || !shapes.some(shape => shape.id === s.owner) && !hidden.has(s.owner));
  const pickedSpans = spans.filter(span => trace.some(t => t.reference === span.reference && t.from === span.from && t.to === span.to));
  const closure = traceClosure(trace, spans, span => sketchCurvePoints(span.curve).map(p => [p[0], p[1]] as const));
  const firstPoint = from || points[0]?.name || '', secondPoint = to || points[1]?.name || points[0]?.name || '';
  const profile = elements.find(e => e.kind === 'Profile'), body = elements.find(e => e.kind === 'Extrude');
  const usedNames = new Set(elements.map(e => e.name));
  const freshLegacy = (stem: string) => { let value = stem; for (let n = 2; usedNames.has(value); n++) value = stem + n; return value; };
  const drawing = tool === 'Rectangle';
  const stroking = drawing && STROKE_KINDS.has(drawKind);
  // Lines, arc circles and axes drawn as construction: not closed shapes, listed and deletable on their own.
  const strokeGuides = elements.filter(e => GUIDE_KINDS.has(e.kind) && !shapes.some(shape => shape.id === e.id));
  const axes = construction?.axes ?? [];

  function report(error: unknown) {
    const raw = message(error), text = explainRefusal(raw);
    setProblem({ text, detail: text === raw ? undefined : raw });
  }
  const choose = (next: Tool) => {
    if (pendingDimensions) { setProblem({ text: 'Apply or discard the dimension edits before changing tools.' }); return; }
    setEditingPoint(null); setDimensionEdit(null); setAlignPrompt(null); setTool(next);
    if (next === 'Rectangle') setReference('');
    setName(next === 'Trace' ? profile?.name ?? 'section' : ({ Layout: freshLegacy('layout'), Rectangle: freshName(nameStem(drawKind), usedNames), Point: freshLegacy('a'), Line: freshLegacy('edge'), Circle: freshLegacy('rim'), Path: freshLegacy('outline') } as Partial<Record<Tool, string>>)[next] ?? 'body');
    if (next !== 'Trace') setOwner(layouts[0]?.id ?? '');
  };
  const chooseDraw = (kind: string) => {
    if (pendingDimensions) { setProblem({ text: 'Apply or discard the dimension edits before changing tools.' }); return; }
    const group = DRAW_TOOLS.find(t => t.kind === kind)?.group; if (group) setVariant(v => ({ ...v, [group]: kind }));
    if (STROKE_KINDS.has(kind)) setAddOpen(false);
    setEditingPoint(null); setDimensionEdit(null); setAlignPrompt(null); setTool('Rectangle'); setReference(''); setDrawKind(kind);
    setName(freshName(nameStem(kind), usedNames)); setOwner(layouts[0]?.id ?? '');
  };

  /** One undoable source transaction made of one or more compiler edits. */
  const transactSteps = async (steps: Step[]) => {
    if (busy) return null;
    setBusy(true); setProblem(null);
    try {
      let text = source, last: LanguageEdit | null = null;
      for (const step of steps) { last = await step(text, last); text = last.text; }
      const projection = await runtime.sketch(text, node, document, String(index + 1));
      const diagnostic = [...projection.diagnostics, ...(projection.construction?.diagnostics ?? [])].find(d => d.severity === 'error' || d.severity === 'fatal');
      if (diagnostic) throw new Error(`${diagnostic.code}: ${diagnostic.message}`);
      if (!mounted.current) return null;
      setHistory([...history.slice(0, index + 1), text]); setIndex(index + 1); setView(projection);
      return last;
    } catch (e) { if (mounted.current) report(e); return null; }
    finally { if (mounted.current) setBusy(false); }
  };
  const sketchStep = (request: SketchEditRequest | ((previous: LanguageEdit | null) => SketchEditRequest)): Step =>
    (text, previous) => runtime.sketchEdit(text, typeof request === 'function' ? request(previous) : request, document, String(index));
  const transact = (request: SketchEditRequest) => transactSteps([sketchStep(request)]);
  const editStep = (operation: Parameters<NonNullable<Runtime['edit']>>[1][number], refuseWarnings = false): Step => async text => {
    if (!runtime.edit) throw new Error('This runtime cannot edit declarations.');
    const edit = await runtime.edit(text, [operation], document, String(index));
    if (refuseWarnings && edit.warnings.length) throw new Error(edit.warnings.join(' '));
    return edit;
  };

  const apply = async (operation: DraftOperation) => {
    const draws = operation.action === 'rectangle' || operation.action === 'shape';
    // The first drawn shape creates its XY (or chosen-plane) layout in the same undoable step.
    const steps = draws && !layouts.length
      ? [sketchStep({ kind: 'construction', construction: { action: 'layout', name: freshLegacy('layout'), plane } }),
        sketchStep(previous => ({ kind: 'construction', construction: { ...operation, parent: previous?.nodes.at(-1) } }))]
      : [sketchStep({ kind: 'construction', construction: operation })];
    const edit = await transactSteps(steps); if (!edit) return;
    if (operation.action === 'layout') { chooseDraw('Rect2'); }
    if (draws) {
      const created = edit.nodes.at(-1) ?? '';
      setSelectedShape(created); setHidden(previous => { const next = new Set(previous); next.delete(created); return next; }); setReference('');
      // The drawing tool stays active; the next shape gets the next free name.
      setName(freshName(nameStem(drawKind), new Set([...usedNames, operation.name ?? ''])));
      setAddOpen(false);
    }
    if (operation.action === 'path') { setTool('Line step'); setName('bottom'); setTurn(0); }
    if (['point', 'line', 'step'].includes(operation.action)) setName(nextName(name));
    if (operation.action === 'line') { setFrom(operation.to ?? ''); setTo(points[points.findIndex(p => p.name === operation.to) + 1]?.name ?? operation.to ?? ''); }
    if (operation.action === 'movePoint') setEditingPoint(null);
    if (operation.action === 'dimension') setDimension(null);
    if (operation.action === 'trace') { setTrace([]); setTool('Extrude'); }
  };

  /** Lines, axes and arcs: the points they need, then the guide, as one undoable step. A stroke end
   * that snapped onto an existing named point reuses it, so drawn construction joins exactly. */
  const drawStroke = (picked: StrokePoint[]) => {
    const own = name.trim() || freshName(nameStem(drawKind), usedNames);
    const taken = new Set([...usedNames, own]);
    const pointName = (suffix: string) => { let value = own + suffix; for (let n = 2; taken.has(value); n++) value = own + suffix + n; taken.add(value); return value; };
    let parent: string | undefined = selectedOwner?.kind === 'Struct' ? selectedOwner.id : layouts[0]?.id;
    const op = (make: () => DraftOperation): Step => (text, previous) => {
      void previous; return runtime.sketchEdit(text, { kind: 'construction', construction: make() }, document, String(index));
    };
    const steps: Step[] = [];
    if (!parent) steps.push(async (text, previous) => {
      const edit = await op(() => ({ action: 'layout', name: freshLegacy('layout'), plane }))(text, previous); parent = edit.nodes.at(-1) ?? parent; return edit;
    });
    const ensure = (point: StrokePoint, suffix: string) => {
      if (point.name) return point.name;
      const created = pointName(suffix); steps.push(op(() => ({ action: 'point', parent, name: created, x: point.at[0], y: point.at[1] }))); return created;
    };
    const [a, b, c] = picked, clean = (n: number) => Number(n.toFixed(9));
    if (drawKind === 'Axis2') steps.push(op(() => ({ action: 'axis', parent, name: own, x: a.at[0], y: a.at[1], directionX: clean(b.at[0] - a.at[0]), directionY: clean(b.at[1] - a.at[1]) })));
    else if (drawKind === 'Line2') { const start = ensure(a, 'Start'), end = ensure(b, 'End'); steps.push(op(() => ({ action: 'line', parent, name: own, from: start, to: end }))); }
    else {
      // Arc2: counter-clockwise from its start to its end around a named centre.
      const center = ensure(a, 'Center'), start = ensure(b, 'Start'), end = ensure(c, 'End');
      steps.push(op(() => ({ action: 'arc', parent, name: own, reference: center, from: start, to: end })));
    }
    void transactSteps(steps).then(edit => { if (edit) { setPickedGuide(own); setName(freshName(nameStem(drawKind), taken)); } });
  };
  const removeGuide = (element: { id: string; name: string }) => {
    if (busy || pendingDimensions) return;
    // Its own endpoints (named <guide>Start/End/Center by the tools) go too when nothing else uses them.
    const owned = elements.filter(e => e.kind === 'Point2' && new RegExp(`^${element.name}(Start|End|Center)\\d*$`).test(e.name));
    const dropIfUnused = (point: { id: string; name: string }): Step => async (text, previous) => {
      const uses = text.match(new RegExp(`\\b${point.name}\\b`, 'g'))?.length ?? 0;
      return uses > 1 ? previous! : editStep({ kind: 'removeDeclaration', node: point.id }, true)(text, previous);
    };
    void transactSteps([editStep({ kind: 'removeDeclaration', node: element.id }, true), ...owned.map(dropIfUnused)])
      .then(edit => { if (edit) { setPickedGuide(''); setTrace([]); } });
  };

  /** Size edits that move an edge another shape is lined up with ask once whether to bring it along. */
  const applyShapeChanges = (shape: SketchShape, changes: Change[]) => {
    if (!changes.length || alignPrompt) return;
    const resizes = changes.some(change => !shape.controls.find(c => c.id === change.control)?.label.startsWith('Center'));
    const before = predictedBounds(shape), after = predictedBounds(shape, new Map(changes.map(c => [c.control, c.value])));
    const owner = canvasShapes.find(c => c.shape.id === shape.id)?.owner;
    const others = canvasShapes.filter(c => c.owner === owner && c.shape.id !== shape.id)
      .map(c => ({ shape: c.shape, bounds: predictedBounds(c.shape) ?? c.bounds }));
    const neighbours = resizes && before && after ? alignedNeighbours(shape, before, after, others) : [];
    if (neighbours.length) { setAlignPrompt({ shape, changes, neighbours }); return; }
    void transact(dimensionRequest(shape, changes));
  };
  const resolveAlignment = (moveToo: boolean) => {
    if (!alignPrompt) return;
    const extra = moveToo ? alignPrompt.neighbours.flatMap(n => translation(n.shape, n.offset)) : [];
    setAlignPrompt(null);
    void transact(dimensionRequest(alignPrompt.shape, [...alignPrompt.changes, ...extra]));
  };

  const removeShape = (shape: SketchShape) => {
    if (busy || pendingDimensions) return;
    // Rectangles drawn here own generated Static inputs; remove those too unless another shape uses them.
    const others = shapes.filter(s => s.id !== shape.id).flatMap(s => s.controls.flatMap(c => [c.parameter ?? '', c.authored])).join(' ');
    const inputs = new Set(shape.controls.map(c => c.parameter).filter((p): p is string => !!p));
    const statics = elements.filter(e => e.kind === 'Static' && inputs.has(e.name) && !new RegExp(`\\b${e.name}\\b`).test(others));
    void transactSteps([editStep({ kind: 'removeDeclaration', node: shape.id }, true), ...statics.map(s => editStep({ kind: 'removeDeclaration', node: s.id }, true))])
      .then(edit => { if (edit) { setSelectedShape(''); setTrace([]); } });
  };
  const renameShape = (shape: SketchShape, next: string) => {
    setRenaming(null);
    if (!next || next === shape.name) return;
    void transactSteps([editStep({ kind: 'renameDeclaration', node: shape.id, name: next })]).then(edit => { if (edit) setSelectedShape(edit.nodes.at(-1) ?? ''); });
  };

  const commit = async () => {
    if (busy) return; setBusy(true); setProblem(null);
    try { await onCommit(source); } catch (e) { if (mounted.current) report(e); }
    finally { if (mounted.current) setBusy(false); }
  };
  const cancel = () => { if (!busy && (index === 0 || confirm('Discard this construction draft? The current part has not changed.'))) onClose(); };
  const pickSpan = (span: DraftSpan) => {
    const existing = trace.findIndex(t => t.reference === span.reference && t.from === span.from && t.to === span.to);
    const parent = elements.find(e => e.id === span.owner)?.parent; if (parent) setOwner(parent);
    setTrace(existing >= 0 ? trace.filter((_, i) => i !== existing) : [...trace, { reference: span.reference, from: span.from, to: span.to, connect: true }]);
  };
  const numberField = (label: string, value: number, update: (value: number) => void, unit = 'mm', aria = label) => <label>{label} ({unit})<input aria-label={aria} type="number" step="any" required disabled={busy} value={Number.isNaN(value) ? '' : value} onChange={e => update(e.target.valueAsNumber)} /></label>;
  const choice = (label: string, value: string, update: (value: string) => void, options: readonly string[]) => <label>{label}<select aria-label={label} disabled={busy} value={value} onChange={e => update(e.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
  const ownerOptions = [...layouts, ...(tool === 'Trace' ? paths : [])];
  const ownerChoice = ownerOptions.length > 1 && <label>Layout<select aria-label="Construction owner" disabled={busy} value={selectedOwner?.id ?? ''} onChange={e => setOwner(e.target.value)}>{ownerOptions.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>;
  const submit = () => {
    const common = { parent: selectedOwner?.id, name };
    if (tool === 'Layout') void apply({ action: 'layout', name, plane });
    if (tool === 'Rectangle') void apply(drawKind === 'Rect2' ? { action: 'rectangle', ...common, x, y, width, height: rectHeight, reference: reference || undefined, insetX, insetY, sharedInset } : { action: 'shape', kind: drawKind, ...common, x, y, width, height: rectHeight, radius });
    if (tool === 'Point') void apply(editingPoint ? { action: 'movePoint', parent: editingPoint, x, y } : { action: 'point', ...common, x, y });
    if (tool === 'Line') void apply({ action: 'line', ...common, from: firstPoint, to: secondPoint });
    if (tool === 'Circle') void apply({ action: 'circle', ...common, from: firstPoint, radius });
    if (tool === 'Path') void apply({ action: 'path', name, x, y, turn });
    if (tool === 'Trace') void apply({ action: 'trace', ...common, trace, targetProfile: profile?.id });
  };

  const polylines = [...guides.map(curve => ({ curve, construction: true })), ...(view?.loops.flatMap(loop => loop.curves) ?? []).map(curve => ({ curve, construction: false }))].map(item => ({ ...item, points: sketchCurvePoints(item.curve) }));
  const all = [...polylines.flatMap(p => p.points), ...points.map(p => [p.x, p.y])];
  const minX = all.length ? Math.min(...all.map(p => p[0])) : -50, maxX = all.length ? Math.max(...all.map(p => p[0])) : 50;
  const minY = all.length ? Math.min(...all.map(p => p[1])) : -40, maxY = all.length ? Math.max(...all.map(p => p[1])) : 40;
  const scale = Math.max(10, maxX - minX, maxY - minY) / 80, margin = scale * 10;
  const ownsCurve = (shape: { name: string }, curveName: string) => curveName === shape.name || curveName.startsWith(shape.name + '.');
  const canvasShapes: CanvasShape[] = shownShapes.flatMap(shape => {
    const vertices = polylines.filter(p => p.construction && ownsCurve(shape, p.curve.name)).flatMap(p => p.points);
    if (!vertices.length) {
      const predicted = predictedBounds(shape);
      return predicted ? [{ shape, owner: elements.find(e => e.id === shape.id)?.parent ?? '', bounds: predicted }] : [];
    }
    const xs = vertices.map(p => p[0]), ys = vertices.map(p => p[1]);
    return [{ shape, owner: elements.find(e => e.id === shape.id)?.parent ?? '', bounds: { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) } }];
  });
  const pointLabels: { x: number; y: number; names: string[] }[] = [];
  for (const point of points) {
    const same = pointLabels.find(p => Math.abs(p.x - point.x) < 1e-8 && Math.abs(p.y - point.y) < 1e-8);
    if (same) same.names.push(point.name); else pointLabels.push({ x: point.x, y: point.y, names: [point.name] });
  }
  const selectedCanvas = canvasShapes.find(c => c.shape.id === selected?.id);
  const showDimensions = !!selectedCanvas && (tool === 'Shapes' || drawing) && !pendingDimensions;

  const keyDown = (event: ReactKeyboardEvent<HTMLDialogElement>) => {
    event.stopPropagation();
    const target = event.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.ctrlKey || event.metaKey) {
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey && index > 0 && !busy && !pendingDimensions) { event.preventDefault(); setIndex(index - 1); }
      if ((key === 'y' || key === 'z' && event.shiftKey) && index + 1 < history.length && !busy && !pendingDimensions) { event.preventDefault(); setIndex(index + 1); }
      return;
    }
    if (event.altKey || busy) return;
    const draw = DRAW_TOOLS.find(t => t.key === event.key.toLowerCase());
    if (draw) { event.preventDefault(); chooseDraw(draw.key === 'a' ? 'Arc' : variant[draw.group] ?? draw.kind); return; }
    switch (event.key) {
      case 'v': case 'V': event.preventDefault(); choose('Shapes'); return;
      case 't': case 'T': if (shapes.length || paths.length || guides.length) { event.preventDefault(); choose('Trace'); } return;
      case 'f': case 'F': event.preventDefault(); setFitRequest(n => n + 1); return;
      case 'Delete': case 'Backspace': {
        const guide = strokeGuides.find(g => g.name === pickedGuide);
        if (guide && (tool === 'Shapes' || drawing)) { event.preventDefault(); removeGuide(guide); }
        else if (selected && (tool === 'Shapes' || drawing)) { event.preventDefault(); removeShape(selected); }
        return;
      }
      case 'Escape':
        // Escape steps back (prompt → drawing tool → selection) before it offers to close.
        if (alignPrompt) { event.preventDefault(); setAlignPrompt(null); }
        else if (drawing || tool === 'Trace' && trace.length) { event.preventDefault(); if (drawing) choose('Shapes'); else setTrace([]); }
        return;
    }
  };

  const status = busy ? 'Checking with compiler…' : pendingDimensions ? 'Apply or discard dimension edits before building.'
    : body ? 'Ready to build · Build and use part checks the solid' : profile ? 'Outline traced · extrude it to make a part' : 'Draft · nothing is built until Build and use part';
  const hint = drawing && drawKind === 'Arc' ? 'Drag from the arc centre to its start, then click its end. Points snap to named points.'
    : drawing && drawKind === 'Axis2' ? 'Drag through two points on the axis. Axis2 is a reference direction; it is not traced.'
    : drawing && drawKind === 'Line2' ? 'Drag from one end to the other. Ends snap to named points; Alt draws freely.'
    : drawing ? `Drag to draw a ${shapeLabel(drawKind).toLowerCase()}. Esc returns to select.` : tool === 'Shapes' ? 'Drag a shape to move it. Pink guides line shapes up; Alt moves freely.' : tool === 'Trace' ? 'Click edges in order around the outline you want.' : 'Middle-drag to pan.';

  return <dialog ref={dialog} tabIndex={-1} className="intellidraft" aria-label="IntelliDraft" onKeyDown={keyDown} onCancel={e => { e.preventDefault(); cancel(); }}>
    <header><strong>IntelliDraft</strong><span>Draw → Trace → Extrude</span>
      {!fresh && onNew && <button disabled={busy} onClick={() => { if (!index || confirm('Discard these staged edits and start a new part?')) onNew(); }}>New profile part</button>}
      <button disabled={busy || pendingDimensions || index === 0} title="Undo · Ctrl+Z" onClick={() => setIndex(index - 1)}>Undo</button><button disabled={busy || pendingDimensions || index + 1 === history.length} title="Redo · Ctrl+Y" onClick={() => setIndex(index + 1)}>Redo</button><button disabled={busy} onClick={cancel}>Cancel</button>
    </header>
    <div className="draft-body"><aside ref={inspector}>
      <nav className="draft-steps" aria-label="Construction workflow">{([['Shapes', 'Draw'], ['Trace', 'Trace'], ['Extrude', 'Extrude']] as const).map(([t, label], i) => <button key={t} aria-pressed={tool === t || t === 'Shapes' && drawing}
        disabled={busy || pendingDimensions || t === 'Trace' && !shapes.length && !paths.length && !guides.length || t === 'Extrude' && !profile} onClick={() => choose(t)}><span aria-hidden="true">{i + 1}</span> {label}</button>)}</nav>
      {(view?.profiles.length ?? 0) > 1 && <label className="draft-profile-choice">Profile<select aria-label="Profile" value={view?.node ?? ''} disabled={busy || pendingDimensions}
        onChange={e => { setNode(e.target.value); setSelectedShape(''); }}>{view!.profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      {view?.frame && view.frame.name !== 'XY' && <small className="draft-frame">Plane {view.frame.name} · normal ({view.frame.normal.map(n => Number(n.toFixed(3))).join(', ')})</small>}

      {drawing && !reference && <section className="draft-new-shape" aria-label="Next shape">
        <label>Name<input aria-label="Construction name" value={name} disabled={busy} onChange={e => setName(e.target.value)} required /></label>
        {ownerChoice}
        {!stroking && <details open={addOpen} onToggle={e => setAddOpen(e.currentTarget.open)}><summary>Add by dimensions</summary>
          {addOpen && <form onSubmit={e => { e.preventDefault(); submit(); }}>
            {drawKind === 'Rect2' && rectangles.length > 0 && <label>Relationship<select aria-label="Rectangle relationship" disabled={busy} value="independent" onChange={e => { if (e.target.value === 'inset') { setReference(rectangles[0].id); setName(freshLegacy('notch')); } }}><option value="independent">Independent dimensions and position</option><option value="inset">Top-right aligned inset (explicit expression)</option></select></label>}
            {drawKind !== 'Circle2' && <div className="draft-pair">{numberField(drawKind === 'Slot2' ? 'Overall length' : 'Width', width, setWidth, 'mm', drawKind === 'Slot2' ? 'New overall length' : 'New width')}{numberField(drawKind === 'Slot2' ? 'Slot width' : 'Height', rectHeight, setRectHeight, 'mm', drawKind === 'Slot2' ? 'New slot width' : 'New height')}</div>}
            <div className="draft-pair">{numberField('Center X', x, setX, 'mm', 'New center X')}{numberField('Center Y', y, setY, 'mm', 'New center Y')}</div>
            {(drawKind === 'Circle2' || drawKind === 'RoundedRect2') && numberField('Radius', radius, setRadius, 'mm', 'New radius')}
            {drawKind === 'SmoothRoundedRect2' && numberField('Corner extent', radius, setRadius, 'mm', 'New corner extent')}
            <button className="draft-primary" disabled={busy}>{drawKind === 'Rect2' ? 'Add Rectangle' : 'Add shape'}</button>
          </form>}
        </details>}
      </section>}

      {!!shapes.length && <ConstructionShapeList shapes={shapes} selected={selected?.id ?? ''} hidden={hidden} disabled={busy || pendingDimensions}
        onSelect={id => { setSelectedShape(id); if (tool !== 'Shapes' && tool !== 'Trace' && !drawing) choose('Shapes'); }}
        onToggle={id => setHidden(previous => { const next = new Set(previous); if (!next.delete(id)) next.add(id); return next; })} onShowAll={() => setHidden(new Set())} />}

      {!!(strokeGuides.length) && (tool === 'Shapes' || drawing) && <section className="draft-guides" aria-label="Lines, arcs and axes">
        <h3>Lines, arcs and axes ({strokeGuides.length})</h3>
        <ul>{strokeGuides.map(g => <li key={g.id}><button type="button" aria-pressed={pickedGuide === g.name} disabled={busy} onClick={() => setPickedGuide(pickedGuide === g.name ? '' : g.name)}>
          <b>{g.name}</b><small>{({ Circle2: 'Guide circle · Circle2', Arc2: 'Arc · Arc2', Axis2: 'Axis · Axis2', Line2: 'Line · Line2' } as Record<string, string>)[g.kind] ?? g.kind}</small></button>
          <button type="button" aria-label={`Delete ${g.name}`} title="Delete · Del" disabled={busy || pendingDimensions || !runtime.edit} onClick={() => removeGuide(g)}>×</button></li>)}</ul>
      </section>}

      {(tool === 'Shapes' || drawing && !reference) && construction && selected && <>
        <div className="draft-shape-actions">
          {renaming === selected.id
            ? <input aria-label={`New name for ${selected.name}`} defaultValue={selected.name} autoFocus disabled={busy}
                onKeyDown={e => { if (e.key === 'Enter') renameShape(selected, e.currentTarget.value.trim()); if (e.key === 'Escape') { e.stopPropagation(); setRenaming(null); } }}
                onBlur={e => renameShape(selected, e.currentTarget.value.trim())} />
            : <button type="button" disabled={busy || pendingDimensions || !runtime.edit} onClick={() => setRenaming(selected.id)}>Rename {selected.name}</button>}
          <button type="button" disabled={busy || pendingDimensions || !runtime.edit} title="Delete · Del" onClick={() => removeShape(selected)}>Delete {selected.name}</button>
        </div>
        <ConstructionShapes construction={{ ...construction, shapes }} selected={selected.id} onSource={onSource} busy={busy || !!alignPrompt} revision={index}
          onRelated={id => { setDrawKind('Rect2'); setTool('Rectangle'); setReference(id); setName(freshLegacy('notch')); }}
          onDimensions={changes => applyShapeChanges(selected, changes)} onParameter={(id, value) => void apply({ action: 'parameter', parent: id, value })} onPending={setPendingDimensions} />
      </>}

      {drawing && reference && <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3>Related rectangle</h3>
        <label>Name<input aria-label="Construction name" value={name} disabled={busy} onChange={e => setName(e.target.value)} required /></label>
        <label>Relationship<select aria-label="Rectangle relationship" disabled={busy} value="inset" onChange={e => { if (e.target.value === 'independent') setReference(''); }}><option value="independent">Independent dimensions and position</option><option value="inset">Top-right aligned inset (explicit expression)</option></select></label>
        <label>Reference rectangle<select aria-label="Reference rectangle" disabled={busy} value={reference} onChange={e => setReference(e.target.value)}>{rectangles.map(shape => <option key={shape.id} value={shape.id}>{shape.name}</option>)}</select></label>
        <label className="draft-check"><input type="checkbox" disabled={busy} checked={sharedInset} onChange={e => setSharedInset(e.target.checked)} />Use one shared wall dimension</label>
        {numberField(sharedInset ? 'Wall thickness' : 'Left inset', insetX, setInsetX)}{!sharedInset && numberField('Bottom inset', insetY, setInsetY)}
        <small>Top and right edges follow the reference through source expressions. Width, height and center stay driven by its dimensions and the inset.</small>
        <button className="draft-primary" disabled={busy}>Add Rectangle</button>
      </form>}

      {tool === 'Trace' && <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3>Trace the outline</h3>
        <label>Name<input aria-label="Construction name" value={name} disabled={busy} onChange={e => setName(e.target.value)} required /></label>
        {ownerChoice}
        {selectedOwner?.kind === 'Struct' && <>
          <p className={closure.closed ? 'draft-closure closed' : 'draft-closure'} role="note">{!closure.known ? `${trace.length} ${trace.length === 1 ? 'entry' : 'entries'} in the boundary · checked when you use it.` : closure.closed ? `Outline closed ✓${trace.some(t => t.wholeLoop) ? '' : ` · ${trace.length} edges`}` : trace.length ? `Open · ${trace.length} ${trace.length === 1 ? 'edge' : 'edges'} so far. Keep clicking edges around the outline.` : 'Click edges on the canvas in order around the outline you want.'}</p>
          {!!trace.length && <button className="draft-primary" disabled={busy || closure.known && !closure.closed}>{profile ? 'Replace outline' : 'Use this outline'}</button>}
          {wholeOutlineShape && <button type="button" disabled={busy} onClick={() => setTrace([{ reference: wholeOutlineShape.name, wholeLoop: true }])} title={`Use the whole outline of ${wholeOutlineShape.name}`}>{wholeOutlineShape.kind === 'Rect2' ? 'Use whole rectangle outline' : 'Use whole shape outline'}</button>}
          {wholeOutlineShape && <small>Whole outline uses {wholeOutlineShape.name}. Select another shape in the list to change it.</small>}
          <details><summary>Edges as a list</summary><div className="span-choices">{selectable.map(span => <button type="button" key={span.id} disabled={busy} onClick={() => pickSpan(span)} aria-label={`Add span ${span.reference} from ${span.from} to ${span.to}`}>{span.reference}<small>{span.from} → {span.to}</small></button>)}</div></details>
        </>}
        <details open={selectedOwner?.kind === 'Path' || !shapes.length && !!guides.length}><summary>Manual guide trace</summary>
          {choice('Guide', selectedGuide?.name ?? '', setGuide, guides.map(g => g.name))}
          <label className="draft-check"><input type="checkbox" disabled={busy} checked={arc} onChange={e => setArc(e.target.checked)} />Trace a span between named points</label>
          {arc && <>{choice('Span from', firstPoint, setFrom, points.map(p => p.name))}{choice('Span to', secondPoint, setTo, points.map(p => p.name))}</>}
          <label className="draft-check"><input type="checkbox" disabled={busy} checked={reverse} onChange={e => setReverse(e.target.checked)} />Reverse this guide</label>
          <button type="button" disabled={busy || !selectedGuide} onClick={() => { setTrace([...trace, { reference: selectedGuide!.name, ...(arc ? { from: firstPoint, to: secondPoint, alias: `${selectedGuide!.name}Arc` } : {}), reverse }]); setGuide(guides[guides.findIndex(g => g.name === selectedGuide!.name) + 1]?.name ?? selectedGuide!.name); setArc(false); setReverse(false); }}>Add to boundary</button>
        </details>
        <ol aria-label="Trace order">{trace.map((entry, i) => <li key={i}><span>{entry.reference}{entry.wholeLoop ? ' · full outline' : entry.from ? ` · ${entry.from} → ${entry.to}` : ''}{entry.reverse ? ' · reversed' : ''}</span><button type="button" aria-label={`Move ${entry.reference} up`} disabled={busy || !i} onClick={() => { const next = [...trace]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setTrace(next); }}>↑</button><button type="button" disabled={busy} aria-label={`Remove ${entry.reference} from trace`} onClick={() => setTrace(trace.filter((_, n) => n !== i))}>×</button></li>)}</ol>
        {!!trace.length && <button type="button" disabled={busy} onClick={() => setTrace([])}>Clear trace selection</button>}
        {profile && <small>This replaces the current outline only when the new trace resolves.</small>}
        {selectedOwner?.kind !== 'Struct' && <button className="draft-primary" disabled={busy || !selectedOwner}>Trace Profile</button>}
      </form>}

      {['Layout', 'Point', 'Line', 'Circle', 'Path'].includes(tool) && <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3>{editingPoint ? `Edit Point: ${name}` : `Add ${tool}`}</h3>
        <label>Name<input aria-label="Construction name" value={name} readOnly={!!editingPoint} disabled={busy} onChange={e => setName(e.target.value)} required /></label>
        {['Point', 'Line', 'Circle'].includes(tool) && ownerChoice}
        {tool === 'Layout' && choice('Plane', plane, setPlane, ['XY', 'XZ', 'YZ'])}
        {['Point', 'Path'].includes(tool) && <div className="draft-pair">{numberField('X', x, setX)}{numberField('Y', y, setY)}</div>}
        {tool === 'Path' && <>{numberField('Initial heading', turn, setTurn, 'deg')}<small>Paths use local XY. Positive turns go counterclockwise.</small></>}
        {['Line', 'Circle'].includes(tool) && choice(tool === 'Circle' ? 'Center point' : 'From point', firstPoint, setFrom, points.map(p => p.name))}
        {tool === 'Line' && choice('To point', secondPoint, setTo, points.map(p => p.name))}
        {tool === 'Circle' && numberField('Radius', radius, setRadius)}
        <button className="draft-primary" disabled={busy || ['Point', 'Line', 'Circle'].includes(tool) && !layouts.length}>{editingPoint ? 'Update Point' : `Add ${tool}`}</button>
      </form>}
      {!body && ['Path', 'Line step', 'Arc step'].includes(tool) && paths.map(path => <form key={path.id} onSubmit={e => { e.preventDefault(); void apply({ action: 'step', parent: path.id, name, kind: tool === 'Arc step' ? 'Arc' : 'Line', length, radius, turn }); }}>
        <h3>Path: {path.name}</h3><p>Each step starts at the previous endpoint.</p>
        <div className="draft-pair"><button type="button" aria-pressed={tool === 'Line step'} onClick={() => { setTool('Line step'); setName('line'); }}>Line step</button><button type="button" aria-pressed={tool === 'Arc step'} onClick={() => { setTool('Arc step'); setName('arc'); }}>Arc step</button></div>
        {['Line step', 'Arc step'].includes(tool) && <><label>Step name<input aria-label="Step name" disabled={busy} value={name} onChange={e => setName(e.target.value)} required /></label>{tool === 'Arc step' ? numberField('Arc radius', radius, setRadius) : numberField('Step length', length, setLength)}{numberField('Turn', turn, setTurn, 'deg')}<button disabled={busy || !!profile || elements.some(e => e.parent === path.id && e.kind === 'Close')}>Append step</button></>}
        <ol>{elements.filter(e => e.parent === path.id).map(e => <li key={e.id}>{e.name} · {e.kind}</li>)}</ol>
        <button type="button" disabled={busy || !!profile || !elements.some(e => e.parent === path.id) || elements.some(e => e.parent === path.id && e.kind === 'Close')} onClick={() => void apply({ action: 'step', parent: path.id, name: freshLegacy('closingEdge'), kind: 'Close' })}>Close Path with line</button>
        <button type="button" disabled={busy || !!profile} onClick={() => { setOwner(path.id); choose('Trace'); }}>Trace this Path</button>
      </form>)}
      {profile && !body && tool === 'Extrude' && <form onSubmit={e => { e.preventDefault(); void apply({ action: 'extrude', parent: profile.id, name: freshLegacy('body'), length: height }); }}><h3>Extrude {profile.name}</h3>{numberField('Extrusion depth', height, setHeight)}<button className="draft-primary" disabled={busy}>Extrude Profile</button></form>}
      {tool === 'Extrude' && body && <p>The outline is extruded. Edit shapes in Draw, then Build and use part.</p>}

      {!!view?.openingReferences.length && view.node && <ProfileOpening references={view.openingReferences} disabled={busy || pendingDimensions}
        onAdd={opening => void transact({ kind: 'opening', node: view.node, ...opening })} />}
      <details className="construction-advanced"><summary>Advanced: points, lines and Paths</summary><nav aria-label="Construction tools">{(['Layout', 'Point', 'Line', 'Circle', 'Path'] as const).map(t => <button key={t} disabled={busy} aria-pressed={tool === t} onClick={() => choose(t)}>{t}</button>)}</nav>
        {construction?.frames?.map(({ owner: id, frame }) => <small key={id}>{frame.name}: local X ({frame.x.join(', ')}), Y ({frame.y.join(', ')}), normal ({frame.normal.join(', ')})</small>)}</details>
      <details><summary>Advanced construction objects and dimensions</summary>{elements.filter(e => !['Model', 'Struct', 'Profile', 'Static'].includes(e.kind) && !shapes.some(shape => shape.id === e.id)).map(e => <div className="draft-object" key={e.id}><b>{e.name} · {e.kind}</b>
        {e.kind === 'Point2' && <button disabled={busy} onClick={() => { const point = points.find(p => p.name === e.name); if (!point) return; setTool('Point'); setEditingPoint(e.id); setName(e.name); setX(point.x); setY(point.y); }}>Edit point {e.name}</button>}
        {e.fields.filter(f => typeof f.number === 'number').map(f => <button key={f.name} disabled={busy || !f.editable || !['Line', 'Arc', 'Circle2', 'Path', 'Extrude'].includes(e.kind)} onClick={() => setDimension({ owner: e.id, field: f.name, value: f.number!, unit: f.unit! })}>{e.name}.{f.name}: {f.value}</button>)}
      </div>)}</details>
      {dimension && <form onSubmit={e => { e.preventDefault(); void apply({ action: 'dimension', parent: dimension.owner, field: dimension.field, value: dimension.value }); }}><h3>Edit {dimension.field}</h3>{numberField('Driving dimension', dimension.value, value => setDimension({ ...dimension, value }), dimension.unit)}<button disabled={busy}>Update dimension</button><button type="button" disabled={busy} onClick={() => setDimension(null)}>Cancel dimension edit</button></form>}
    </aside>
    <ConstructionCanvas bounds={{ x: minX - margin, y: -maxY - margin, width: maxX - minX + margin * 2, height: maxY - minY + margin * 2 }} shapes={canvasShapes}
      autoFit={!fresh} fitRequest={fitRequest}
      stroke={stroking ? drawKind === 'Arc' ? 'arc' : drawKind === 'Axis2' ? 'axis' : 'segment' : undefined} snapPoints={points} onStroke={drawStroke}
      revision={index} selected={selected?.id ?? ''} drawKind={drawKind} drawing={drawing && !reference} movable={tool === 'Shapes'} disabled={busy || pendingDimensions || !!alignPrompt}
      onSelect={id => { setSelectedShape(id); setDimensionEdit(null); }} onDraw={rect => void apply(drawKind === 'Rect2' ? { action: 'rectangle', parent: selectedOwner?.id, name, ...rect } : {
        action: 'shape', kind: drawKind, parent: selectedOwner?.id, name, ...rect,
        ...(drawKind === 'Slot2' ? { width: Math.max(rect.width, rect.height), height: Math.min(rect.width, rect.height), turn: rect.height > rect.width ? 90 : 0 } : {}),
        radius: Math.min(rect.width, rect.height) / (drawKind === 'Circle2' ? 2 : drawKind === 'SmoothRoundedRect2' ? 4 : 8),
      })}
      onMove={(shape, center) => void transact(dimensionRequest(shape, shape.controls.filter(c => c.label === 'Center X' || c.label === 'Center Y').map(c => ({ control: c.id, value: center[c.label === 'Center X' ? 0 : 1] }))))}
      onPoint={tool === 'Point' ? point => { setX(point[0]); setY(point[1]); } : undefined}
      hint={hint}
      header={<>
        <div className="draft-hotbar" role="toolbar" aria-label="Drawing tools">
          <button type="button" aria-pressed={tool === 'Shapes'} disabled={busy || pendingDimensions} aria-label="Select and move" title="Select and move · V" onClick={() => choose('Shapes')}>Select <kbd>V</kbd></button>
          {TOOL_GROUPS.map(group => {
            const options = DRAW_TOOLS.filter(t => t.group === group), t = options.find(o => o.kind === variant[group]) ?? options[0];
            const active = drawing && options.some(o => o.kind === drawKind) && !reference;
            return <span key={group} className={options.length > 1 ? 'draft-tool-split' : undefined}>
              <button type="button" aria-label={`Draw ${t.label}`} aria-pressed={active} disabled={busy || pendingDimensions}
                title={`Draw ${t.label} · ${t.key.toUpperCase()}`} onClick={() => chooseDraw(t.kind)}>{t.short} <kbd>{t.key.toUpperCase()}</kbd></button>
              {options.length > 1 && <select aria-label={`${options[0].short} type`} title={`${options[0].short} type`} value={t.kind} disabled={busy || pendingDimensions}
                onChange={e => chooseDraw(e.target.value)}>{options.map(o => <option key={o.kind} value={o.kind}>{o.option}</option>)}</select>}
            </span>;
          })}
        </div>
        {!layouts.length && <label className="draft-plane">Plane<select aria-label="Drawing plane" value={plane} disabled={busy} onChange={e => setPlane(e.target.value)}><option>XY</option><option>XZ</option><option>YZ</option></select></label>}
      </>}
      overlay={<>
        {dimensionEdit && <form className="draft-dimension-input" style={{ left: dimensionEdit.left, top: dimensionEdit.top }}
          onSubmit={e => { e.preventDefault(); const value = Number(dimensionEdit.draft.replace(/mm$/i, '').trim()); setDimensionEdit(null);
            if (Number.isFinite(value) && value !== dimensionEdit.control.value) applyShapeChanges(dimensionEdit.shape, [{ control: dimensionEdit.control.id, value }]); }}>
          <input aria-label={`${dimensionEdit.control.label} of ${dimensionEdit.shape.name}`} autoFocus inputMode="decimal" value={dimensionEdit.draft}
            onChange={e => setDimensionEdit({ ...dimensionEdit, draft: e.target.value })} onBlur={() => setDimensionEdit(null)}
            onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setDimensionEdit(null); } }} /><span>mm</span>
        </form>}
        {alignPrompt && <div className="draft-align-prompt" role="dialog" aria-label="Aligned shapes">
          <p>{alignPrompt.neighbours.flatMap(n => n.reasons).slice(0, 3).join('. ')}.</p>
          <div>
            <button type="button" className="draft-primary" autoFocus onClick={() => resolveAlignment(true)}>Move {alignPrompt.neighbours.map(n => n.shape.name).join(', ')} too</button>
            <button type="button" onClick={() => resolveAlignment(false)}>Don't move {alignPrompt.neighbours.length === 1 ? alignPrompt.neighbours[0].shape.name : 'them'}</button>
            <button type="button" onClick={() => setAlignPrompt(null)}>Cancel</button>
          </div>
        </div>}
      </>}
      layer={viewScale => <>
      {(tool === 'Shapes' || drawing) && canvasShapes.filter(item => canvasShapes.length <= 12 || item.shape.id === selected?.id).map(({ shape, bounds }) => <text key={shape.id} role="button" tabIndex={pendingDimensions ? -1 : 0} aria-disabled={pendingDimensions} aria-label={`Select construction ${shape.name}`}
        x={bounds.x + viewScale * .6} y={-(bounds.y + bounds.height) + viewScale * 2} fontSize={viewScale * 1.5} className={shape.id === selected?.id ? 'draft-shape-name selected' : 'draft-shape-name'}
        style={{ paintOrder: 'stroke', stroke: 'var(--draft-label-halo)', strokeWidth: viewScale * .35 }}
        onPointerDown={e => e.stopPropagation()}
        onClick={() => { if (!pendingDimensions) setSelectedShape(shape.id); }} onKeyDown={e => { if (!pendingDimensions && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelectedShape(shape.id); } }}>{shape.name}</text>)}
        {showDimensions && <DimensionAnnotations item={selectedCanvas!} scale={viewScale} disabled={busy || !!alignPrompt}
          onEdit={(control, anchor) => setDimensionEdit({ shape: selectedCanvas!.shape, control, draft: String(control.value), left: anchor.left, top: anchor.top })} />}
      </>}>
      <line x1={minX - margin} x2={maxX + margin} y1={0} y2={0} style={{ stroke: 'var(--draft-axis)' }} strokeWidth={scale * .6} /><line x1={0} x2={0} y1={-maxY - margin} y2={-minY + margin} style={{ stroke: 'var(--draft-axis)' }} strokeWidth={scale * .6} />
      {tool === 'Trace' && closure.closed && closure.polygon.length > 2 && <polygon className="draft-closed-fill" points={closure.polygon.map(p => `${p[0]},${-p[1]}`).join(' ')} pointerEvents="none" />}
      {polylines.map(item => {
        const isSelected = item.construction && (tool === 'Shapes' || drawing) && (pickedGuide ? item.curve.name === pickedGuide : !!selected && ownsCurve(selected, item.curve.name));
        // Arc circles stay faint and dashed; the arcs between their points are what gets traced.
        const arcCircle = item.construction && item.curve.kind === 'Circle' && strokeGuides.some(g => g.name === item.curve.name);
        return <polyline key={(item.construction ? 'guide:' : 'trace:') + item.curve.id} aria-label={item.curve.name} points={item.points.map(p => `${p[0]},${-p[1]}`).join(' ')} fill="none" strokeDasharray={arcCircle && !isSelected ? '6 5' : undefined}
          style={{ stroke: isSelected ? 'var(--draft-selected)' : item.construction ? 'var(--draft-construction)' : 'var(--draft-profile)' }} strokeWidth={isSelected ? 2.5 : item.construction ? 1.5 : 2.5}
          opacity={item.construction && view?.loops.length && !isSelected ? .5 : 1} vectorEffect="non-scaling-stroke"><title>{item.curve.name}</title></polyline>;
      })}
      {axes.filter(axis => !hidden.has(axis.id)).map(axis => { const far = Math.max(maxX - minX, maxY - minY, 100) * 4, [ox, oy] = axis.origin, [dx, dy] = axis.direction;
        return <g key={axis.id} className={pickedGuide === axis.name ? 'draft-axis-guide selected' : 'draft-axis-guide'} pointerEvents="none"><title>{axis.name} · Axis2</title>
          <line x1={ox - dx * far} y1={-(oy - dy * far)} x2={ox + dx * far} y2={-(oy + dy * far)} vectorEffect="non-scaling-stroke" />
          <circle cx={ox} cy={-oy} r={scale * .6} /><text x={ox + scale} y={-oy - scale} fontSize={scale * 1.8}>{axis.name}</text></g>; })}
      {tool === 'Trace' && pickedSpans.map(span => <polyline key={'picked:' + span.id} points={sketchCurvePoints(span.curve).map(p => `${p[0]},${-p[1]}`).join(' ')} fill="none" style={{ stroke: 'var(--draft-profile)' }} strokeWidth="3" vectorEffect="non-scaling-stroke" />)}
      {tool === 'Trace' && selectable.map(span => <TraceSpanTarget key={span.id} span={span} scale={scale} selected={pickedSpans.some(p => p.id === span.id)} hovered={hoveredSpan === span.id} onHover={setHoveredSpan}
        onPick={(clicked, at) => pickSpan(at ? nearestSpan(selectable, at, scale * 1.5, closure.known && !closure.closed ? closure.open : undefined) ?? clicked : clicked)} />)}
      {(!['Shapes', 'Rectangle', 'Extrude'].includes(tool) || stroking) && pointLabels.filter(p => tool !== 'Trace' || spans.some(s => s.id === hoveredSpan && p.names.some(name => name === s.from || name === s.to))).map(p => <g key={p.names[0]}><title>{p.names.join(', ')}</title><circle cx={p.x} cy={-p.y} r={scale * .7} style={{ fill: 'var(--draft-construction)' }} /><text x={p.x + scale} y={-p.y - scale} fontSize={scale * 2.1} style={{ fill: 'var(--draft-construction-label)', paintOrder: 'stroke', stroke: 'var(--draft-label-halo)', strokeWidth: scale * .45 }}>{p.names[0]}{p.names.length > 1 ? ` (+${p.names.length - 1})` : ''}</text></g>)}
    </ConstructionCanvas></div>
    <footer><div role="status">{status}{problem && <div role="alert" className="draft-problem">{problem.text}{problem.detail && <details><summary>Compiler detail</summary><code>{problem.detail}</code></details>}</div>}{construction?.diagnostics.map((d, i) => <p key={i}>{d.code}: {d.message}</p>)}</div><button className="draft-primary" disabled={busy || pendingDimensions || !body} onClick={() => void commit()}>Build and use part</button></footer>
  </dialog>;
}
function nextName(name: string) { const match = name.match(/^(.*?)(\d+)$/); return match ? match[1] + (Number(match[2]) + 1) : name.length === 1 && name >= 'a' && name < 'z' ? String.fromCharCode(name.charCodeAt(0) + 1) : name + '2'; }
function message(error: unknown) { const text = error instanceof Error ? error.message : String(error); const code = (error as { code?: unknown })?.code; const details = (error as { details?: unknown })?.details; if (code === 'internal-error' && typeof details === 'string' && details) return `${code}: ${text} ${details}`; return typeof code === 'string' && !text.startsWith(code) ? `${code}: ${text}` : text; }

/** Dimension lines for the selected shape, drawn in the same world frame as the construction.
 * Writable values are buttons that open a draft field; driven values show their expression. */
function DimensionAnnotations({ item, scale, disabled, onEdit }: {
  item: CanvasShape; scale: number; disabled: boolean;
  onEdit(control: SketchShape['controls'][number], anchor: { left: number; top: number }): void;
}) {
  const { shape, bounds: b } = item;
  const rotation = shape.controls.find(c => c.label === 'Rotation')?.value ?? 0;
  const vertical = (label: string) => {
    const turned = Math.abs(Math.round(rotation / 90)) % 2 === 1;
    const along = label === 'Width' && shape.kind !== 'Slot2' || label === 'Overall length';
    return label === 'Height' || label === 'Width' && shape.kind === 'Slot2' ? !turned : along ? turned : false;
  };
  const gap = scale * 3.5, tick = scale * .9, font = scale * 1.8;
  const open = (control: SketchShape['controls'][number]) => (event: { currentTarget: Element }) => {
    if (disabled || !control.editable) return;
    const box = event.currentTarget.getBoundingClientRect(), host = event.currentTarget.closest('.draft-canvas')!.getBoundingClientRect();
    onEdit(control, { left: box.left - host.left + box.width / 2, top: box.top - host.top + box.height / 2 });
  };
  const text = (control: SketchShape['controls'][number]) => `${control.label === 'Radius' ? 'R ' : control.label === 'Diameter' ? 'Ø ' : ''}${Number(control.value.toFixed(3))}`;
  return <g className="draft-dimensions">{shape.controls.filter(c => !c.label.startsWith('Center') && c.label !== 'Rotation').map(control => {
    const label = `${control.label} of ${shape.name}: ${text(control)} mm${control.editable ? '' : ` (driven by ${control.authored})`}`;
    const target = control.editable && !disabled
      ? { role: 'button', tabIndex: 0, 'aria-label': `Edit ${control.label} of ${shape.name}`, onClick: open(control), onPointerDown: (e: { stopPropagation(): void }) => e.stopPropagation(), onKeyDown: (e: ReactKeyboardEvent<SVGGElement>) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(control)(e); } } }
      : { 'aria-label': label };
    const cls = control.editable ? 'draft-dimension' : 'draft-dimension driven';
    if (control.label === 'Radius' || control.label === 'Diameter' || control.label === 'Corner extent') {
      const cx = b.x + b.width, cy = b.y + b.height;
      return <g key={control.id} className={cls} {...target}><title>{label}</title>
        <line x1={cx - b.width * .15} y1={-(cy - b.height * .15)} x2={cx + gap} y2={-(cy + gap)} vectorEffect="non-scaling-stroke" />
        <text x={cx + gap + scale * .4} y={-(cy + gap)} fontSize={font}>{text(control)}</text></g>;
    }
    if (vertical(control.label)) {
      const lx = b.x + b.width + gap, y0 = -(b.y), y1 = -(b.y + b.height);
      return <g key={control.id} className={cls} {...target}><title>{label}</title>
        <line x1={lx} x2={lx} y1={y0} y2={y1} vectorEffect="non-scaling-stroke" /><line x1={lx - tick} x2={lx + tick} y1={y0} y2={y0} vectorEffect="non-scaling-stroke" /><line x1={lx - tick} x2={lx + tick} y1={y1} y2={y1} vectorEffect="non-scaling-stroke" />
        <text x={lx + scale * .8} y={(y0 + y1) / 2 + font * .35} fontSize={font}>{text(control)}</text></g>;
    }
    const ly = -(b.y - gap), x0 = b.x, x1 = b.x + b.width;
    return <g key={control.id} className={cls} {...target}><title>{label}</title>
      <line x1={x0} x2={x1} y1={ly} y2={ly} vectorEffect="non-scaling-stroke" /><line x1={x0} x2={x0} y1={ly - tick} y2={ly + tick} vectorEffect="non-scaling-stroke" /><line x1={x1} x2={x1} y1={ly - tick} y2={ly + tick} vectorEffect="non-scaling-stroke" />
      <text x={(x0 + x1) / 2} y={ly + font * 1.15} fontSize={font} textAnchor="middle">{text(control)}</text></g>;
  })}</g>;
}

function TraceSpanTarget({ span, scale, selected, hovered, onHover, onPick }: {
  span: DraftSpan; scale: number; selected: boolean; hovered: boolean; onHover(id: string | null): void; onPick(span: DraftSpan, at?: readonly [number, number]): void;
}) {
  const points = sketchCurvePoints(span.curve), first = points[0], last = points.at(-1)!;
  return <g className="draft-span-target" role="button" tabIndex={0} aria-pressed={selected} aria-label={`Trace ${span.reference} from ${span.from} to ${span.to}`}
    style={{ cursor: 'pointer' }} onMouseEnter={() => onHover(span.id)} onMouseLeave={() => onHover(null)}
    onClick={e => {
      e.stopPropagation();
      // Overlapping hit areas (a line tangent to a circle) are resolved by distance, not paint order.
      const matrix = (e.currentTarget as SVGGraphicsElement).ownerSVGElement?.getScreenCTM();
      const p = matrix ? new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()) : null;
      onPick(span, p ? [p.x, -p.y] : undefined);
    }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(span); } }}>
    <title>{span.reference}: {span.from} → {span.to}</title>
    <polyline points={points.map(p => `${p[0]},${-p[1]}`).join(' ')} fill="none" style={{ stroke: hovered ? 'var(--draft-hover)' : selected ? 'var(--draft-profile)' : 'var(--draft-span)' }} strokeWidth="3" vectorEffect="non-scaling-stroke" />
    <polyline points={points.map(p => `${p[0]},${-p[1]}`).join(' ')} fill="none" stroke="transparent" strokeWidth="14" vectorEffect="non-scaling-stroke" />
    {/* A display-only target makes horizontal/vertical spans focusable and clickable even
        for accessibility clients that otherwise see a zero-area SVG bounding box. */}
    <circle cx={(first[0] + last[0]) / 2} cy={-(first[1] + last[1]) / 2} r={scale * 1.2} fill="transparent" />
  </g>;
}

/** The span under a click: the nearest within reach, preferring one that continues the open trace
 * when several are about as close. */
function nearestSpan(spans: readonly DraftSpan[], at: readonly [number, number], reach: number, openEnd?: readonly [number, number]) {
  const distance = (span: DraftSpan) => {
    const points = sketchCurvePoints(span.curve); let best = Infinity;
    for (let i = 0; i + 1 < points.length; i++) {
      const [ax, ay] = points[i], [bx, by] = points[i + 1], dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
      const t = len ? Math.max(0, Math.min(1, ((at[0] - ax) * dx + (at[1] - ay) * dy) / len)) : 0;
      best = Math.min(best, Math.hypot(at[0] - ax - t * dx, at[1] - ay - t * dy));
    }
    return best;
  };
  const touches = (span: DraftSpan) => {
    if (!openEnd) return false;
    const points = sketchCurvePoints(span.curve);
    return [points[0], points.at(-1)!].some(p => Math.hypot(p[0] - openEnd[0], p[1] - openEnd[1]) < 1e-6);
  };
  const ranked = spans.map(span => ({ span, d: distance(span) })).filter(c => c.d <= reach).sort((a, b) => a.d - b.d);
  if (!ranked.length) return undefined;
  return (ranked.find(c => c.d - ranked[0].d < reach / 3 && touches(c.span)) ?? ranked[0]).span;
}

const ANCHORS = ['BottomLeft', 'BottomRight', 'TopRight', 'TopLeft', 'Center', 'Left', 'Right', 'Bottom', 'Top'] as const;
/** A circular opening that follows a rectangle anchor through shared inputs (from the Sketch workspace). */
function ProfileOpening({ references, disabled, onAdd }: {
  references: readonly { id: string; name: string }[]; disabled: boolean;
  onAdd(opening: { reference: string; anchor: string; x: number; y: number; diameter: number }): void;
}) {
  const [reference, setReference] = useState(references[0]?.id ?? ''), [anchor, setAnchor] = useState<string>('BottomLeft');
  const [x, setX] = useState(8), [y, setY] = useState(8), [diameter, setDiameter] = useState(4);
  const field = (label: string, value: number, update: (n: number) => void, off = false) => <label>{label} (mm)<input aria-label={label} type="number" step="any" min="0" required disabled={disabled || off} value={Number.isNaN(value) ? '' : value} onChange={e => update(e.target.valueAsNumber)} /></label>;
  return <details className="draft-opening"><summary>Add circular opening</summary>
    <form onSubmit={e => { e.preventDefault(); onAdd({ reference: reference || references[0].id, anchor, x, y, diameter }); }}>
      <small>Follows a rectangle anchor through shared inputs. Insets are inward from its edges.</small>
      <label>Rectangle<select aria-label="Opening reference" value={reference} disabled={disabled} onChange={e => setReference(e.target.value)}>{references.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <label>Anchor<select aria-label="Opening anchor" value={anchor} disabled={disabled} onChange={e => setAnchor(e.target.value)}>{ANCHORS.map(a => <option key={a} value={a}>{a.replace(/([a-z])([A-Z])/g, '$1 $2')}{['Left', 'Right', 'Bottom', 'Top'].includes(a) ? ' midpoint' : ''}</option>)}</select></label>
      <div className="draft-pair">{field('X inset', x, setX, ['Center', 'Top', 'Bottom'].includes(anchor))}{field('Y inset', y, setY, ['Center', 'Left', 'Right'].includes(anchor))}</div>
      {field('Opening diameter', diameter, setDiameter)}
      <button className="draft-primary" disabled={disabled}>Add opening</button>
    </form></details>;
}
