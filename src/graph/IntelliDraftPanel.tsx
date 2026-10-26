import { useEffect, useRef, useState } from 'react';
import type { DraftOperation, DraftSpan, DraftTrace, SketchEditRequest, SketchProjection } from '@aetheris/cad';
import { sketchCurvePoints } from '@aetheris/three-telos';
import type { WebSdkCadRuntime } from '../sdk/CadRuntime';
import { ConstructionShapes } from './ConstructionShapes';
import './IntelliDraftPanel.css';

const blank = 'Model DraftPart {\n  units: mm\n}\n';
type Tool = 'Layout' | 'Shapes' | 'Rectangle' | 'Trace' | 'Extrude' | 'Point' | 'Line' | 'Circle' | 'Path' | 'Line step' | 'Arc step';
type Dimension = { owner: string; field: string; value: number; unit: string };

/** Source is the construction model. The browser selects compiler-resolved entities and stages
 * ordinary source transactions; it neither solves constraints nor evaluates engineering geometry. */
export function IntelliDraftPanel({ runtime, initialSource = blank, onCommit, onClose, onNew }: {
  runtime: Pick<WebSdkCadRuntime, 'sketch' | 'sketchEdit'>; initialSource?: string;
  onCommit(source: string): Promise<void>; onClose(): void; onNew?(): void;
}) {
  const [history, setHistory] = useState([initialSource]), [index, setIndex] = useState(0);
  const source = history[index];
  const [view, setView] = useState<SketchProjection | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [pendingDimensions, setPendingDimensions] = useState(false);
  const [tool, setTool] = useState<Tool>('Layout'), [name, setName] = useState('layout');
  const [owner, setOwner] = useState(''), [plane, setPlane] = useState('XY');
  const [x, setX] = useState(0), [y, setY] = useState(0);
  const [width, setWidth] = useState(60), [rectHeight, setRectHeight] = useState(40);
  const [reference, setReference] = useState(''), [selectedShape, setSelectedShape] = useState('');
  const [insetX, setInsetX] = useState(8), [insetY, setInsetY] = useState(8), [sharedInset, setSharedInset] = useState(true);
  const [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [length, setLength] = useState(40), [radius, setRadius] = useState(10), [turn, setTurn] = useState(0);
  const [height, setHeight] = useState(6);
  const [guide, setGuide] = useState(''), [arc, setArc] = useState(false), [reverse, setReverse] = useState(false);
  const [trace, setTrace] = useState<DraftTrace[]>([]), [traceShape, setTraceShape] = useState('');
  const [hoveredSpan, setHoveredSpan] = useState<string | null>(null);
  const [editingPoint, setEditingPoint] = useState<string | null>(null), [dimension, setDimension] = useState<Dimension | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), mounted = useRef(true);
  const inspector = useRef<HTMLElement>(null);
  useEffect(() => { if (inspector.current) inspector.current.scrollTop = 0; }, [tool]);
  useEffect(() => {
    mounted.current = true; const element = dialog.current!; element.showModal(); element.focus();
    return () => { mounted.current = false; element.close(); };
  }, []);
  useEffect(() => {
    let current = true;
    void runtime.sketch(source, null, 'intellidraft.firmament', String(index)).then(result => {
      if (!current) return;
      setView(result); setError('');
      if (index === 0 && initialSource !== blank) setTool('Shapes');
    }).catch(e => { if (current) setError(message(e)); });
    return () => { current = false; };
  }, [source, index, runtime, initialSource]);

  const construction = view?.construction, elements = construction?.elements ?? [];
  const layouts = elements.filter(e => e.kind === 'Struct'), paths = elements.filter(e => e.kind === 'Path');
  const selectedOwner = elements.find(e => e.id === owner) ?? layouts[0] ?? paths[0];
  const shapes = construction?.shapes ?? [], rectangles = shapes.filter(s => s.kind === 'Rect2');
  const points = construction?.points ?? [], spans = construction?.spans ?? [];
  const sourceOrder = (value: string) => elements.findIndex(e => e.name === value || ['Rect2', 'Path'].includes(e.kind) && value.startsWith(e.name + '.'));
  const guides = [...(construction?.guides ?? [])].sort((a, b) => sourceOrder(a.name) - sourceOrder(b.name));
  const selectedGuide = guides.find(g => g.name === guide) ?? guides[0];
  const traceRectangle = rectangles.find(s => s.id === traceShape) ?? rectangles[0];
  const selectable = spans.filter(s => s.owner === traceRectangle?.id);
  const pickedSpans = spans.filter(span => trace.some(t => t.reference === span.reference && t.from === span.from && t.to === span.to));
  const firstPoint = from || points[0]?.name || '', secondPoint = to || points[1]?.name || points[0]?.name || '';
  const profile = elements.find(e => e.kind === 'Profile'), body = elements.find(e => e.kind === 'Extrude');
  const fresh = (stem: string) => { let value = stem; for (let n = 2; elements.some(e => e.name === value); n++) value = stem + n; return value; };
  const choose = (next: Tool) => {
    if (pendingDimensions) { setError('Apply or discard the dimension edits before changing tools.'); return; }
    setEditingPoint(null); setTool(next);
    setName(next === 'Trace' ? profile?.name ?? 'section' : ({ Layout: 'layout', Rectangle: fresh('rectangle'), Point: fresh('a'), Line: fresh('edge'), Circle: fresh('rim'), Path: fresh('outline') } as Partial<Record<Tool, string>>)[next] ?? 'body');
    if (next !== 'Trace') setOwner(layouts[0]?.id ?? '');
  };
  const transact = async (request: SketchEditRequest) => {
    if (busy) return null;
    setBusy(true); setError('');
    try {
      const edit = await runtime.sketchEdit(source, request, 'intellidraft.firmament', String(index));
      const projection = await runtime.sketch(edit.text, null, 'intellidraft.firmament', String(index + 1));
      const diagnostic = [...projection.diagnostics, ...(projection.construction?.diagnostics ?? [])].find(d => d.severity === 'error' || d.severity === 'fatal');
      if (diagnostic) throw new Error(`${diagnostic.code}: ${diagnostic.message}`);
      if (!mounted.current) return null;
      setHistory([...history.slice(0, index + 1), edit.text]); setIndex(index + 1); setView(projection);
      return edit;
    } catch (e) { if (mounted.current) setError(message(e)); return null; }
    finally { if (mounted.current) setBusy(false); }
  };
  const apply = async (operation: DraftOperation) => {
    const edit = await transact({ kind: 'construction', construction: operation }); if (!edit) return;
    if (operation.action === 'layout') { setTool('Rectangle'); setName(fresh('outer')); }
    if (operation.action === 'rectangle') { setTool('Shapes'); setSelectedShape(edit.nodes.at(-1) ?? ''); setReference(''); }
    if (operation.action === 'path') { setTool('Line step'); setName('bottom'); setTurn(0); }
    if (['point', 'line', 'step'].includes(operation.action)) setName(nextName(name));
    if (operation.action === 'line') { setFrom(operation.to ?? ''); setTo(points[points.findIndex(p => p.name === operation.to) + 1]?.name ?? operation.to ?? ''); }
    if (operation.action === 'movePoint') setEditingPoint(null);
    if (operation.action === 'dimension') setDimension(null);
    if (operation.action === 'trace') { setTrace([]); setTool('Extrude'); }
  };
  const commit = async () => {
    if (busy) return; setBusy(true); setError('');
    try { await onCommit(source); } catch (e) { if (mounted.current) setError(message(e)); }
    finally { if (mounted.current) setBusy(false); }
  };
  const cancel = () => { if (!busy && (index === 0 || confirm('Discard this construction draft? The current part has not changed.'))) onClose(); };
  const pickSpan = (span: DraftSpan) => {
    const existing = trace.findIndex(t => t.reference === span.reference && t.from === span.from && t.to === span.to);
    setTrace(existing >= 0 ? trace.filter((_, i) => i !== existing) : [...trace, { reference: span.reference, from: span.from, to: span.to, connect: true }]);
  };
  const numberField = (label: string, value: number, update: (value: number) => void, unit = 'mm') => <label>{label} ({unit})<input aria-label={label} type="number" step="any" required disabled={busy} value={Number.isNaN(value) ? '' : value} onChange={e => update(e.target.valueAsNumber)} /></label>;
  const choice = (label: string, value: string, update: (value: string) => void, options: readonly string[]) => <label>{label}<select aria-label={label} disabled={busy} value={value} onChange={e => update(e.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select></label>;
  const ownerChoice = <label>Owner<select aria-label="Construction owner" disabled={busy} value={selectedOwner?.id ?? ''} onChange={e => setOwner(e.target.value)}>{[...layouts, ...(tool === 'Trace' ? paths : [])].map(e => <option key={e.id} value={e.id}>{e.name} · {e.kind}</option>)}</select></label>;
  const submit = () => {
    const common = { parent: selectedOwner?.id, name };
    if (tool === 'Layout') void apply({ action: 'layout', name, plane });
    if (tool === 'Rectangle') void apply({ action: 'rectangle', ...common, x, y, width, height: rectHeight, reference: reference || undefined, insetX, insetY, sharedInset });
    if (tool === 'Point') void apply(editingPoint ? { action: 'movePoint', parent: editingPoint, x, y } : { action: 'point', ...common, x, y });
    if (tool === 'Line') void apply({ action: 'line', ...common, from: firstPoint, to: secondPoint });
    if (tool === 'Circle') void apply({ action: 'circle', ...common, from: firstPoint, radius });
    if (tool === 'Path') void apply({ action: 'path', name, x, y, turn });
    if (tool === 'Trace') void apply({ action: 'trace', ...common, trace, targetProfile: profile?.id });
  };

  const polylines = [...guides.map(curve => ({ curve, construction: true })), ...(view?.loops.flatMap(loop => loop.curves) ?? []).map(curve => ({ curve, construction: false }))].map(item => ({ ...item, points: sketchCurvePoints(item.curve) }));
  const all = [...polylines.flatMap(p => p.points), ...points.map(p => [p.x, p.y])];
  const minX = all.length ? Math.min(...all.map(p => p[0])) : -5, maxX = all.length ? Math.max(...all.map(p => p[0])) : 45;
  const minY = all.length ? Math.min(...all.map(p => p[1])) : -5, maxY = all.length ? Math.max(...all.map(p => p[1])) : 35;
  const scale = Math.max(10, maxX - minX, maxY - minY) / 80, margin = scale * 10;
  const pointLabels: { x: number; y: number; names: string[] }[] = [];
  for (const point of points) {
    const same = pointLabels.find(p => Math.abs(p.x - point.x) < 1e-8 && Math.abs(p.y - point.y) < 1e-8);
    if (same) same.names.push(point.name); else pointLabels.push({ x: point.x, y: point.y, names: [point.name] });
  }

  return <dialog ref={dialog} tabIndex={-1} className="intellidraft" aria-label="IntelliDraft" onKeyDown={e => e.stopPropagation()} onCancel={e => { e.preventDefault(); cancel(); }}>
    <header><strong>IntelliDraft</strong><span>Construction shapes → Trace → Part</span>
      {initialSource !== blank && onNew && <button disabled={busy} onClick={() => { if (!index || confirm('Discard these staged edits and start a new part?')) onNew(); }}>New profile part</button>}
      <button disabled={busy || pendingDimensions || index === 0} onClick={() => setIndex(index - 1)}>Undo</button><button disabled={busy || pendingDimensions || index + 1 === history.length} onClick={() => setIndex(index + 1)}>Redo</button><button disabled={busy} onClick={cancel}>Cancel</button>
    </header>
    <p className="draft-intro">Define shapes and their driving dimensions. Select their boundary spans to make a Profile. Your current part stays unchanged until <b>Build and use part</b>.
      {construction?.frames?.map(({ owner: id, frame }) => <span key={id}> · {frame.name}: local X ({frame.x.join(', ')}), Y ({frame.y.join(', ')}), normal ({frame.normal.join(', ')})</span>)}</p>
    <div className="draft-body"><aside ref={inspector}>
      <nav aria-label="Construction workflow">{(['Shapes', 'Trace', 'Extrude'] as const).map(t => <button key={t} aria-pressed={tool === t || t === 'Shapes' && tool === 'Rectangle'} disabled={busy || pendingDimensions || t === 'Shapes' && !layouts.length || t === 'Extrude' && !profile} onClick={() => choose(t)}>{t}</button>)}</nav>
      {tool === 'Shapes' && construction && <ConstructionShapes construction={construction} selected={selectedShape} onSelect={setSelectedShape} busy={busy} revision={index}
        onCreate={() => { choose('Rectangle'); setReference(''); }} onRelated={id => { choose('Rectangle'); setReference(id); setName(fresh('notch')); }}
        onDimensions={changes => void transact({ kind: 'constructionDimensions', changes })} onParameter={(id, value) => void apply({ action: 'parameter', parent: id, value })} onPending={setPendingDimensions} />}
      <details className="construction-advanced"><summary>Advanced: points, lines and Paths</summary><nav aria-label="Construction tools">{(['Layout', 'Point', 'Line', 'Circle', 'Path'] as const).map(t => <button key={t} disabled={busy} aria-pressed={tool === t} onClick={() => choose(t)}>{t}</button>)}</nav></details>
      {!['Shapes', 'Extrude', 'Line step', 'Arc step'].includes(tool) && <form onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3>{editingPoint ? `Edit Point: ${name}` : tool === 'Trace' ? 'Trace a Profile' : `Add ${tool}`}</h3>
        <label>Name<input aria-label="Construction name" value={name} readOnly={!!editingPoint} disabled={busy} onChange={e => setName(e.target.value)} required /></label>
        {['Rectangle', 'Point', 'Line', 'Circle', 'Trace'].includes(tool) && ownerChoice}
        {tool === 'Layout' && choice('Plane', plane, setPlane, ['XY', 'XZ', 'YZ'])}
        {tool === 'Rectangle' && <>
          <label>Relationship<select aria-label="Rectangle relationship" disabled={busy} value={reference ? 'inset' : 'independent'} onChange={e => setReference(e.target.value === 'inset' ? rectangles[0]?.id ?? '' : '')}><option value="independent">Independent dimensions and position</option><option value="inset" disabled={!rectangles.length}>Top-right aligned inset</option></select></label>
          {reference ? <><label>Reference rectangle<select aria-label="Reference rectangle" disabled={busy} value={reference} onChange={e => setReference(e.target.value)}>{rectangles.map(shape => <option key={shape.id} value={shape.id}>{shape.name}</option>)}</select></label>
            <label className="draft-check"><input type="checkbox" disabled={busy} checked={sharedInset} onChange={e => setSharedInset(e.target.checked)} />Use one shared wall dimension</label>
            {numberField(sharedInset ? 'Wall thickness' : 'Left inset', insetX, setInsetX)}{!sharedInset && numberField('Bottom inset', insetY, setInsetY)}
            <small>Top and right edges follow the reference. Width, height and center remain driven by its dimensions and the inset.</small>
          </> : <><div className="draft-pair">{numberField('Width', width, setWidth)}{numberField('Height', rectHeight, setRectHeight)}</div><div className="draft-pair">{numberField('Center X', x, setX)}{numberField('Center Y', y, setY)}</div></>}
          <small>Rect2 supplies right angles and equal, parallel opposite sides.</small>
        </>}
        {['Point', 'Path'].includes(tool) && <div className="draft-pair">{numberField('X', x, setX)}{numberField('Y', y, setY)}</div>}
        {tool === 'Path' && <>{numberField('Initial heading', turn, setTurn, 'deg')}<small>Paths use local XY. Positive turns go counterclockwise.</small></>}
        {['Line', 'Circle'].includes(tool) && choice(tool === 'Circle' ? 'Center point' : 'From point', firstPoint, setFrom, points.map(p => p.name))}
        {tool === 'Line' && choice('To point', secondPoint, setTo, points.map(p => p.name))}
        {tool === 'Circle' && numberField('Radius', radius, setRadius)}
        {tool === 'Trace' && selectedOwner?.kind === 'Struct' && <>
          {!!rectangles.length && <>
            <label>Trace shape<select aria-label="Trace shape" disabled={busy} value={traceRectangle?.id ?? ''} onChange={e => setTraceShape(e.target.value)}>{rectangles.map(shape => <option key={shape.id} value={shape.id}>{shape.name}</option>)}</select></label>
            <p>Click this shape's highlighted spans on the canvas in boundary order. Named corners provide the endpoints.</p>
            <button type="button" disabled={busy} onClick={() => setTrace([{ reference: traceRectangle!.name, wholeLoop: true }])}>Use whole rectangle outline</button>
            <details><summary>Available boundary spans</summary><div className="span-choices">{selectable.map(span => <button type="button" key={span.id} disabled={busy} onClick={() => pickSpan(span)} aria-label={`Add span ${span.reference} from ${span.from} to ${span.to}`}>{span.reference}<small>{span.from} → {span.to}</small></button>)}</div></details>
          </>}
          <details open={!rectangles.length}><summary>Manual guide trace</summary>
            {choice('Guide', selectedGuide?.name ?? '', setGuide, guides.map(g => g.name))}
            <label className="draft-check"><input type="checkbox" disabled={busy} checked={arc} onChange={e => setArc(e.target.checked)} />Trace a span between named points</label>
            {arc && <>{choice('Span from', firstPoint, setFrom, points.map(p => p.name))}{choice('Span to', secondPoint, setTo, points.map(p => p.name))}</>}
            <label className="draft-check"><input type="checkbox" disabled={busy} checked={reverse} onChange={e => setReverse(e.target.checked)} />Reverse this guide</label>
            <button type="button" disabled={busy || !selectedGuide} onClick={() => { setTrace([...trace, { reference: selectedGuide!.name, ...(arc ? { from: firstPoint, to: secondPoint, alias: `${selectedGuide!.name}Arc` } : {}), reverse }]); setGuide(guides[guides.findIndex(g => g.name === selectedGuide!.name) + 1]?.name ?? selectedGuide!.name); setArc(false); setReverse(false); }}>Add to boundary</button>
          </details>
          <ol aria-label="Trace order">{trace.map((entry, i) => <li key={i}><span>{entry.reference}{entry.wholeLoop ? ' · full outline' : entry.connect ? ' · joins preceding span' : entry.from ? ` · ${entry.from} → ${entry.to}` : ''}{entry.reverse ? ' · reversed' : ''}</span><button type="button" aria-label={`Move ${entry.reference} up`} disabled={busy || !i} onClick={() => { const next = [...trace]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; setTrace(next); }}>↑</button><button type="button" disabled={busy} aria-label={`Remove ${entry.reference} from trace`} onClick={() => setTrace(trace.filter((_, n) => n !== i))}>×</button></li>)}</ol>
          <button type="button" disabled={busy || !trace.length} onClick={() => setTrace([])}>Clear trace selection</button>
          <small>{profile ? 'This replaces the current Profile only when the new trace resolves. ' : ''}Close checks closure; it does not add an edge.</small>
        </>}
        <button className="draft-primary" disabled={busy || ['Rectangle', 'Point', 'Line', 'Circle'].includes(tool) && !layouts.length || tool === 'Trace' && (!selectedOwner || selectedOwner.kind === 'Struct' && !trace.length)}>{editingPoint ? 'Update Point' : tool === 'Trace' ? 'Trace Profile' : `Add ${tool}`}</button>
      </form>}
      {!body && !['Shapes', 'Rectangle', 'Extrude'].includes(tool) && paths.map(path => <form key={path.id} onSubmit={e => { e.preventDefault(); void apply({ action: 'step', parent: path.id, name, kind: tool === 'Arc step' ? 'Arc' : 'Line', length, radius, turn }); }}>
        <h3>Path: {path.name}</h3><p>Each step starts at the previous endpoint.</p>
        <div className="draft-pair"><button type="button" aria-pressed={tool === 'Line step'} onClick={() => { setTool('Line step'); setName('line'); }}>Line step</button><button type="button" aria-pressed={tool === 'Arc step'} onClick={() => { setTool('Arc step'); setName('arc'); }}>Arc step</button></div>
        {['Line step', 'Arc step'].includes(tool) && <><label>Step name<input aria-label="Step name" disabled={busy} value={name} onChange={e => setName(e.target.value)} required /></label>{tool === 'Arc step' ? numberField('Arc radius', radius, setRadius) : numberField('Step length', length, setLength)}{numberField('Turn', turn, setTurn, 'deg')}<button disabled={busy || !!profile || elements.some(e => e.parent === path.id && e.kind === 'Close')}>Append step</button></>}
        <ol>{elements.filter(e => e.parent === path.id).map(e => <li key={e.id}>{e.name} · {e.kind}</li>)}</ol>
        <button type="button" disabled={busy || !!profile || !elements.some(e => e.parent === path.id) || elements.some(e => e.parent === path.id && e.kind === 'Close')} onClick={() => void apply({ action: 'step', parent: path.id, name: fresh('closingEdge'), kind: 'Close' })}>Close Path with line</button>
        <button type="button" disabled={busy || !!profile} onClick={() => { setOwner(path.id); choose('Trace'); }}>Trace this Path</button>
      </form>)}
      {profile && !body && tool === 'Extrude' && <form onSubmit={e => { e.preventDefault(); void apply({ action: 'extrude', parent: profile.id, name: fresh('body'), length: height }); }}><h3>Profile: {profile.name}</h3>{numberField('Extrusion depth', height, setHeight)}<button disabled={busy}>Extrude Profile</button></form>}
      {tool === 'Extrude' && body && <p>The Profile already has a material consumer. Use Shapes to edit its construction, then Build and use part.</p>}
      <details><summary>Advanced construction objects and dimensions</summary>{elements.filter(e => !['Model', 'Struct', 'Profile', 'Static', 'Rect2'].includes(e.kind)).map(e => <div className="draft-object" key={e.id}><b>{e.name} · {e.kind}</b>
        {e.kind === 'Point2' && <button disabled={busy} onClick={() => { const point = points.find(p => p.name === e.name); if (!point) return; setTool('Point'); setEditingPoint(e.id); setName(e.name); setX(point.x); setY(point.y); }}>Edit point {e.name}</button>}
        {e.fields.filter(f => typeof f.number === 'number').map(f => <button key={f.name} disabled={busy || !f.editable || !['Line', 'Arc', 'Circle2', 'Path', 'Extrude'].includes(e.kind)} onClick={() => setDimension({ owner: e.id, field: f.name, value: f.number!, unit: f.unit! })}>{e.name}.{f.name}: {f.value}</button>)}
      </div>)}</details>
      {dimension && <form onSubmit={e => { e.preventDefault(); void apply({ action: 'dimension', parent: dimension.owner, field: dimension.field, value: dimension.value }); }}><h3>Edit {dimension.field}</h3>{numberField('Driving dimension', dimension.value, value => setDimension({ ...dimension, value }), dimension.unit)}<button disabled={busy}>Update dimension</button><button type="button" disabled={busy} onClick={() => setDimension(null)}>Cancel dimension edit</button></form>}
    </aside>
    <div className="draft-canvas"><svg role="group" aria-label="Construction and Profile preview" viewBox={`${minX - margin} ${-maxY - margin} ${maxX - minX + margin * 2} ${maxY - minY + margin * 2}`} onClick={e => {
      if (tool !== 'Point') return;
      const matrix = e.currentTarget.getScreenCTM(); if (!matrix) return;
      const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()); setX(Math.round(point.x * 10) / 10); setY(Math.round(-point.y * 10) / 10);
    }}>
      <line x1={minX - margin} x2={maxX + margin} y1={0} y2={0} stroke="#ddd" strokeWidth={scale * .6} /><line x1={0} x2={0} y1={-maxY - margin} y2={-minY + margin} stroke="#ddd" strokeWidth={scale * .6} />
      {polylines.map(item => <polyline key={(item.construction ? 'guide:' : 'trace:') + item.curve.id} aria-label={item.curve.name} points={item.points.map(p => `${p[0]},${-p[1]}`).join(' ')} fill="none" stroke={item.construction ? '#ad7b22' : '#243e49'} strokeWidth={item.construction ? 1.5 : 2.5} opacity={item.construction && view?.loops.length ? .5 : 1} vectorEffect="non-scaling-stroke"><title>{item.curve.name}</title></polyline>)}
      {tool === 'Trace' && pickedSpans.map(span => <polyline key={'picked:' + span.id} points={sketchCurvePoints(span.curve).map(p => `${p[0]},${-p[1]}`).join(' ')} fill="none" stroke="#243e49" strokeWidth="3" vectorEffect="non-scaling-stroke" />)}
      {tool === 'Trace' && selectable.map(span => <TraceSpanTarget key={span.id} span={span} scale={scale} selected={pickedSpans.some(p => p.id === span.id)} hovered={hoveredSpan === span.id} onHover={setHoveredSpan} onPick={pickSpan} />)}
      {tool === 'Shapes' && shapes.map(shape => <text key={shape.id} role="button" tabIndex={pendingDimensions ? -1 : 0} aria-disabled={pendingDimensions} aria-label={`Select construction ${shape.name}`} x={shape.center[0]} y={-shape.center[1]} fontSize={scale * 2.7} textAnchor="middle" fill="#855b0c" style={{ cursor: 'pointer', paintOrder: 'stroke', stroke: '#fafaf7', strokeWidth: scale * .6 }} onClick={() => { if (!pendingDimensions) setSelectedShape(shape.id); }} onKeyDown={e => { if (!pendingDimensions && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setSelectedShape(shape.id); } }}>{shape.name} · {shape.kind}</text>)}
      {tool !== 'Shapes' && pointLabels.filter(p => tool !== 'Trace' || spans.some(s => s.id === hoveredSpan && p.names.some(name => name === s.from || name === s.to))).map(p => <g key={p.names[0]}><title>{p.names.join(', ')}</title><circle cx={p.x} cy={-p.y} r={scale * .7} fill="#ad7b22" /><text x={p.x + scale} y={-p.y - scale} fontSize={scale * 2.1} fill="#72531b">{p.names[0]}{p.names.length > 1 ? ` (+${p.names.length - 1})` : ''}</text></g>)}
    </svg><span className="draft-axes">+X → +Y ↑ · mm · {tool === 'Point' ? `Click to set coordinates, then ${editingPoint ? 'Update' : 'Add'} Point. 0.1 mm grid.` : tool === 'Trace' && rectangles.length ? 'Select spans on the active shape. Gold construction stays intact.' : 'Gold: construction shapes · dark: traced Profile'}</span></div></div>
    <footer><div role="status">{busy ? 'Checking with compiler…' : pendingDimensions ? 'Apply or discard dimension edits before building.' : profile ? 'Profile resolved · solid admission checked by Build' : 'Construction draft · not a built part'}{error && <p role="alert">{error}</p>}{construction?.diagnostics.map((d, i) => <p key={i}>{d.code}: {d.message}</p>)}</div><button className="draft-primary" disabled={busy || pendingDimensions || !body} onClick={() => void commit()}>Build and use part</button></footer>
  </dialog>;
}
function nextName(name: string) { const match = name.match(/^(.*?)(\d+)$/); return match ? match[1] + (Number(match[2]) + 1) : name.length === 1 && name >= 'a' && name < 'z' ? String.fromCharCode(name.charCodeAt(0) + 1) : name + '2'; }
function message(error: unknown) { const text = error instanceof Error ? error.message : String(error); const code = (error as { code?: unknown })?.code; return typeof code === 'string' && !text.startsWith(code) ? `${code}: ${text}` : text; }

function TraceSpanTarget({ span, scale, selected, hovered, onHover, onPick }: {
  span: DraftSpan; scale: number; selected: boolean; hovered: boolean; onHover(id: string | null): void; onPick(span: DraftSpan): void;
}) {
  const points = sketchCurvePoints(span.curve), first = points[0], last = points.at(-1)!;
  return <g className="draft-span-target" role="button" tabIndex={0} aria-pressed={selected} aria-label={`Trace ${span.reference} from ${span.from} to ${span.to}`}
    style={{ cursor: 'pointer' }} onMouseEnter={() => onHover(span.id)} onMouseLeave={() => onHover(null)}
    onClick={e => { e.stopPropagation(); onPick(span); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(span); } }}>
    <title>{span.reference}: {span.from} → {span.to}</title>
    <polyline points={points.map(p => `${p[0]},${-p[1]}`).join(' ')} fill="none" stroke={hovered ? '#1d655a' : selected ? '#243e49' : '#bf8e27'} strokeWidth="3" vectorEffect="non-scaling-stroke" />
    <polyline points={points.map(p => `${p[0]},${-p[1]}`).join(' ')} fill="none" stroke="transparent" strokeWidth="14" vectorEffect="non-scaling-stroke" />
    {/* A display-only target makes horizontal/vertical spans focusable and clickable even
        for accessibility clients that otherwise see a zero-area SVG bounding box. */}
    <circle cx={(first[0] + last[0]) / 2} cy={-(first[1] + last[1]) / 2} r={scale * 1.2} fill="transparent" />
  </g>;
}
