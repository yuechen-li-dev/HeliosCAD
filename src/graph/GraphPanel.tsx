import { memo, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode, type RefObject } from 'react';
import { Background, BackgroundVariant, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, ReactFlowProvider, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Diagnostic, LanguageEditOperation, LanguageOutline, OutlineNode, PaletteItem } from '@aetheris/cad';
import { useGraphBodyLayout } from './graphBodyLayout';
import { reorderOperation, wireChoices, type WireChoice } from './graphAuthoring';
import { PalettePopover } from './PalettePopover';
import { AssemblyCanvas, type AssemblyAuthoring } from './AssemblyCanvas';
import type { AssemblyGraph } from './assemblyGraph';
import { buildPartGraph, layoutPartGraph, unitAtSpan, type GraphDirection, type GraphRow, type PartGraph, type PositionedUnit } from './outlineGraph';

export interface GraphSelection { readonly unitId: string; readonly rowId: string | null }

/** Editing gestures the canvas offers; absent while the source cannot be edited. */
export interface GraphAuthoring {
  palette: readonly PaletteItem[];
  featureTarget: { body: string } | { reason: string };
  unavailable(item: PaletteItem): string | null;
  onInsert(item: PaletteItem): void;
  /** A wire from `provider` landed on `consumer` and the engineer chose how it connects. */
  onWire(provider: string, consumer: OutlineNode, choice: WireChoice): void;
  onReorder(operation: LanguageEditOperation, label: string): void;
}

interface Props {
  outline: LanguageOutline | null;
  error: string | null;
  diagnostics: readonly Diagnostic[];
  selection: GraphSelection | null;
  theme: 'bronze-age' | 'apollonia';
  onSelect(unitId: string, row: GraphRow | null, graph: PartGraph): void;
  onOpenSource(unitId: string, row: GraphRow | null, graph: PartGraph): void;
  inspector?: ReactNode;
  authoring?: GraphAuthoring | null;
  /** Present when the document declares an assembly: the canvas can show it as parts and joints. */
  assembly?: AssemblyView | null;
}

export interface AssemblyView {
  readonly assemblies: readonly OutlineNode[];
  readonly graph: AssemblyGraph | null;
  readonly selectedAssembly: string | null;
  readonly selectedId: string | null;
  readonly authoring: AssemblyAuthoring | null;
  onPickAssembly(id: string): void;
  onSelect(id: string): void;
  onOpenSource(id: string): void;
}

const ROW_MIME = 'application/x-helios-row';

type DropMark = { rowId: string; place: 'before' | 'after' } | null;
type UnitData = {
  unit: PositionedUnit; direction: GraphDirection; problems: number; selectedRow: string | null; editable: boolean;
  movable(rowId: string): boolean; drop: DropMark;
  onRow(row: GraphRow): void; onOpen(row: GraphRow | null): void;
  onDragRow(rowId: string | null): void; onMark(mark: DropMark): void; onDropRow(targetId: string, place: 'before' | 'after'): void;
};

const UnitNode = memo(function UnitNode({ data, selected }: NodeProps<Node<UnitData>>) {
  const { unit, direction, problems, selectedRow, editable, movable, drop, onRow, onOpen, onDragRow, onMark, onDropRow } = data;
  const external = unit.category === 'external';
  const placeOf = (event: DragEvent<HTMLElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2 ? 'before' as const : 'after' as const;
  };
  return <div className={`graph-unit category-${unit.category}${selected ? ' selected' : ''}`} style={{ width: unit.width, minHeight: unit.height }}
    title={external ? `Defined in ${unit.document}` : 'Double-click to open in source'}>
    <Handle type="target" position={direction === 'LR' ? Position.Left : Position.Top} isConnectable={editable && !external} />
    <header>
      <strong>{unit.title}</strong>
      {problems > 0 && <span className="graph-problems" aria-label={`${problems} problems`}>{problems}</span>}
      <small>{external ? `${unit.kind} · ${unit.document}` : unit.kind}</small>
    </header>
    {unit.rows.length > 0 && <ol className="graph-rows">
      {unit.rows.map(row => {
        const draggable = editable && movable(row.id);
        const mark = drop?.rowId === row.id ? ` drop-${drop.place}` : '';
        return <li key={row.id} className={mark.trim() || undefined}
          onDragOver={draggable || mark ? event => {
            if (!event.dataTransfer.types.includes(ROW_MIME)) return;
            event.preventDefault(); event.dataTransfer.dropEffect = 'move';
            onMark({ rowId: row.id, place: placeOf(event) });
          } : undefined}
          onDrop={event => {
            if (!event.dataTransfer.types.includes(ROW_MIME)) return;
            event.preventDefault(); onDropRow(row.id, placeOf(event));
          }}>
          <button className={`nodrag nopan${row.id === selectedRow ? ' selected' : ''}${draggable ? ' movable' : ''}`} draggable={draggable}
            onDragStart={event => { event.dataTransfer.setData(ROW_MIME, row.id); event.dataTransfer.effectAllowed = 'move'; onDragRow(row.id); }}
            onDragEnd={() => { onDragRow(null); onMark(null); }}
            onClick={event => { event.stopPropagation(); onRow(row); }} onDoubleClick={event => { event.stopPropagation(); onOpen(row); }}>
            {draggable && <i className="graph-grip" aria-hidden>⋮⋮</i>}
            <span>{row.label}</span>{row.detail && <small>{row.detail}</small>}</button>
        </li>;
      })}
      {unit.hiddenRows > 0 && <li className="graph-more">{unit.hiddenRows} more in source</li>}
    </ol>}
    <Handle type="source" position={direction === 'LR' ? Position.Right : Position.Bottom} isConnectable={editable} />
  </div>;
});

const nodeTypes = { unit: UnitNode };

type PendingWire = { provider: string; consumer: string; x: number; y: number };

function Canvas({ outline, error, diagnostics, selection, theme, onSelect, onOpenSource, direction, authoring, paletteAt, setPaletteAt, host }:
  Props & { direction: GraphDirection; paletteAt: { x: number; y: number } | null; setPaletteAt(at: { x: number; y: number } | null): void; host: RefObject<HTMLDivElement | null> }) {
  const flow = useReactFlow();
  const graph = useMemo(() => outline ? buildPartGraph(outline) : null, [outline]);
  const laid = useMemo(() => graph ? layoutPartGraph(graph, direction) : null, [graph, direction]);
  const structure = useMemo(() => laid ? direction + laid.units.map(u => u.id).join('|') : '', [laid, direction]);
  const problems = useMemo(() => {
    const counts = new Map<string, number>();
    if (!graph) return counts;
    for (const d of diagnostics) {
      if (!d.source || d.source.source !== graph.document) continue;
      const unit = unitAtSpan(graph, d.source.start, d.source.length);
      if (unit) counts.set(unit, (counts.get(unit) ?? 0) + 1);
    }
    return counts;
  }, [graph, diagnostics]);
  const [fitted, setFitted] = useState('');
  const [dragging, setDragging] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropMark>(null);
  const [wire, setWire] = useState<PendingWire | null>(null);
  // Nodes are rebuilt from the outline on every edit, selection and drag. React Flow forgets the
  // measured size of a node object it has not seen and hides it until it measures again, which a
  // quick succession of rebuilds can starve: carry the last measured size into each rebuild.
  const measured = useRef(new Map<string, { width: number; height: number }>());
  const editable = !!authoring;

  const dropRow = (targetId: string, place: 'before' | 'after') => {
    const dragged = dragging;
    setDragging(null); setDrop(null);
    if (!graph || !authoring || !dragged) return;
    const operation = reorderOperation(graph, dragged, targetId, place);
    const node = graph.nodes.get(dragged), target = graph.nodes.get(targetId);
    if (operation && node && target) authoring.onReorder(operation, `Moved ${node.name ?? node.kind} ${place} ${target.name ?? target.kind}`);
  };

  const nodes: Node<UnitData>[] = useMemo(() => !laid || !graph ? [] : laid.units.map(unit => ({
    id: unit.id, type: 'unit', position: { x: unit.x, y: unit.y }, draggable: false, connectable: editable, measured: measured.current.get(unit.id),
    selected: selection?.unitId === unit.id,
    data: { unit, direction, problems: problems.get(unit.id) ?? 0, selectedRow: selection?.unitId === unit.id ? selection.rowId : null,
      editable, drop: drop && unit.rows.some(r => r.id === drop.rowId) ? drop : null,
      // Only declarations move, and only among the siblings of the one being dragged.
      movable: rowId => graph.nodes.has(rowId) && (!dragging || graph.nodes.get(dragging)?.parentId === graph.nodes.get(rowId)?.parentId),
      onRow: row => onSelect(unit.id, row, graph), onOpen: row => onOpenSource(unit.id, row, graph),
      onDragRow: setDragging, onMark: setDrop, onDropRow: dropRow },
  })), [laid, graph, direction, selection, problems, onSelect, onOpenSource, editable, drop, dragging]);

  const edges: Edge[] = useMemo(() => !laid ? [] : laid.links.map(link => {
    const active = !!selection && (link.from === selection.unitId || link.to === selection.unitId);
    return { id: link.id, source: link.from, target: link.to, label: link.label, type: 'smoothstep',
      className: active ? 'graph-link active' : 'graph-link', markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14 },
      labelBgPadding: [4, 2] as [number, number], labelBgBorderRadius: 3 };
  }), [laid, selection]);

  // Fit when the set of units changes, not on every field edit.
  useEffect(() => {
    if (!structure || structure === fitted) return;
    const frame = requestAnimationFrame(() => { void flow.fitView({ padding: 0.08, minZoom: 0.7, maxZoom: 1.1, duration: 0 }); setFitted(structure); });
    return () => cancelAnimationFrame(frame);
  }, [structure, fitted, flow]);

  if (!outline) return <div className="graph-empty">{error ? <><strong>The graph can't be shown yet.</strong><p>{error}</p></> : <p>Reading the model structure…</p>}</div>;

  const local = (clientX: number, clientY: number) => {
    const box = host.current?.getBoundingClientRect();
    return box ? { x: Math.max(8, Math.min(clientX - box.left, box.width - 300)), y: Math.max(8, Math.min(clientY - box.top, box.height - 120)) } : { x: 16, y: 16 };
  };
  const consumerNode = wire && graph ? graph.nodes.get(wire.consumer) : undefined;
  const providerUnit = wire && graph ? graph.units.find(u => u.id === wire.provider) : undefined;
  const providerName = providerUnit ? (graph?.nodes.get(providerUnit.id)?.name ?? (providerUnit.category === 'external' ? providerUnit.title : null)) : null;
  // A wire may land on the card or on any declaration it shows: their reference fields are the endings.
  const endings = consumerNode && graph ? [consumerNode, ...[...graph.nodes.values()].filter(n => graph.unitOf.get(n.id) === consumerNode.id && n.id !== consumerNode.id)]
    .flatMap(node => wireChoices(node, outline).map(choice => ({ node, choice }))) : [];

  return <>
    {laid?.units.length ? <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode={theme === 'apollonia' ? 'light' : 'dark'}
      nodesDraggable={false} nodesConnectable={editable} elementsSelectable={false} minZoom={0.15} maxZoom={2}
      zoomOnDoubleClick={false} connectionRadius={36}
      onNodesChange={changes => { for (const change of changes) if (change.type === 'dimensions' && change.dimensions) measured.current.set(change.id, change.dimensions); }}
      onNodeClick={(_, node) => graph && onSelect(node.id, null, graph)}
      onNodeDoubleClick={(_, node) => graph && onOpenSource(node.id, null, graph)}
      // A wire lands on the card under the pointer, not only on its small input handle.
      onConnectEnd={(event, state) => {
        const p = 'changedTouches' in event ? event.changedTouches[0] : event;
        const from = state.fromNode?.id;
        // While connecting, cards do not take pointer hits: find the one under the pointer by its box.
        const card = [...(host.current?.querySelectorAll<HTMLElement>('.react-flow__node') ?? [])].find(element => {
          const box = element.getBoundingClientRect();
          return p.clientX >= box.left && p.clientX <= box.right && p.clientY >= box.top && p.clientY <= box.bottom;
        })?.dataset.id;
        const to = state.toNode?.id ?? card ?? undefined;
        if (!from || !to || from === to) return;
        setWire({ provider: from, consumer: to, ...local(p.clientX, p.clientY) });
      }}
      onDoubleClick={event => {
        if (!authoring || !(event.target as HTMLElement).classList.contains('react-flow__pane')) return;
        setPaletteAt(local(event.clientX, event.clientY));
      }}>
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow> : <div className="graph-empty"><strong>Nothing to show.</strong><p>This document has no declarations yet. {authoring ? 'Add a body to start.' : 'Switch to Source to start writing, or open an example.'}</p></div>}
    {authoring && paletteAt && <PalettePopover items={authoring.palette} at={paletteAt} featureTarget={authoring.featureTarget} unavailable={authoring.unavailable}
      onClose={() => setPaletteAt(null)} onPick={item => { setPaletteAt(null); authoring.onInsert(item); }} />}
    {authoring && wire && consumerNode && <div className="graph-wire-menu" role="menu" aria-label="Connect" style={{ left: wire.x, top: wire.y }}
      onKeyDown={event => { if (event.key === 'Escape') setWire(null); }}>
      <p>Use <b>{providerName ?? providerUnit?.title}</b> in <b>{consumerNode.kind}{consumerNode.name ? ` ${consumerNode.name}` : ''}</b> as…</p>
      {endings.length ? endings.map(({ node, choice }, index) => <button key={index} role="menuitem" autoFocus={index === 0}
        onClick={() => { setWire(null); if (providerName) authoring.onWire(providerName, node, choice); }}>
        {choice.kind === 'retarget' ? <>the body it modifies<small> now {consumerNode.name}</small></> : <>{node.id !== consumerNode.id && <small>{node.name ?? node.kind} · </small>}{choice.field.name}<small> now {choice.field.text}</small></>}
      </button>) : <p className="graph-wire-none">{consumerNode.name ?? consumerNode.kind} has no field that takes a part. Add one in the inspector.</p>}
      <button className="cancel" role="menuitem" onClick={() => setWire(null)}>Cancel</button>
    </div>}
  </>;
}

export function GraphPanel(props: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const body = useGraphBodyLayout();
  const [direction, setDirection] = useState<GraphDirection>('LR');
  const [paletteAt, setPaletteAt] = useState<{ x: number; y: number } | null>(null);
  // An assembly document opens on its Assembly view; a part model has only Parts.
  const [view, setView] = useState<'parts' | 'assembly'>(() => { try { return localStorage.getItem('helios-graph-view') === 'parts' ? 'parts' : 'assembly'; } catch { return 'assembly'; } });
  const showAssembly = view === 'assembly' && !!props.assembly?.graph;
  const chooseView = (next: 'parts' | 'assembly') => { setView(next); try { localStorage.setItem('helios-graph-view', next); } catch { /* per-viewer convenience */ } };
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (width && height) setDirection(width / height < 1.15 ? 'TB' : 'LR');
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const summary = useMemo(() => {
    if (!props.outline) return null;
    const graph = buildPartGraph(props.outline);
    // The caption names the model roots; an Assembly's occurrence tree repeats its name, so keep each once.
    const containers = [...new Set(graph.units.map(u => u.container?.split(' / ')[0]).filter((c): c is string => !!c))];
    return { units: graph.units.length, links: graph.links.length, containers };
  }, [props.outline]);
  const asm = props.assembly;
  return <section className="panel graph-panel" aria-label="Model graph">
    <div className="graph-caption">
      {asm?.graph && <div className="segmented graph-view-switch" role="tablist" aria-label="Graph view">
        <button role="tab" aria-selected={showAssembly} className={showAssembly ? 'active' : ''} onClick={() => chooseView('assembly')}>Assembly</button>
        <button role="tab" aria-selected={!showAssembly} className={!showAssembly ? 'active' : ''} onClick={() => chooseView('parts')}>Parts</button>
      </div>}
      {showAssembly && asm?.graph ? <div>
        <span>{asm.assemblies.length > 1
          ? <select aria-label="Assembly" value={asm.graph.assembly.id} onChange={event => asm.onPickAssembly(event.target.value)}>
              {asm.assemblies.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          : asm.graph.assembly.name}</span>
        <small>{count(asm.graph.parts.filter(p => p.kind !== 'ground').length, 'part')}, {count(asm.graph.joints.length, 'joint')}. {asm.authoring
          ? 'Drag from one frame to another to join them; click a joint to edit it.' : 'Click a part or a joint to see it.'}</small>
      </div> : <div>
        {summary ? <><span>{summary.containers.length ? summary.containers.join(', ') : props.outline?.document}</span>
          <small>{count(summary.units, 'authoring step')}, {count(summary.links, 'connection')}. {props.authoring
            ? 'Double-click the canvas to add; drag from a card’s right edge to connect.' : 'Select a part to see its values; double-click to open its source.'}</small></> : <span>Model graph</span>}
      </div>}
      {props.authoring && !showAssembly && <button className="graph-add" aria-label="Add a body or feature" onClick={() => setPaletteAt(at => at ? null : { x: 12, y: 8 })}>+ Add</button>}
    </div>
    <div className={`graph-body${body.stacked ? ' stacked' : ''}`} ref={body.ref}>
      <div className="graph-canvas" ref={canvas} style={body.canvas}>
        <ReactFlowProvider>{showAssembly && asm?.graph && props.outline
          ? <AssemblyCanvas key={asm.graph.assembly.id} outline={props.outline} graph={asm.graph} theme={props.theme} selectedId={asm.selectedId}
              onSelect={asm.onSelect} onOpenSource={asm.onOpenSource} authoring={asm.authoring} host={canvas} direction={direction} />
          : <Canvas {...props} direction={direction} paletteAt={paletteAt} setPaletteAt={setPaletteAt} host={canvas} />}</ReactFlowProvider>
      </div>
      {props.inspector && <div className="graph-inspector-slot" style={body.inspector}>{props.inspector}</div>}
    </div>
  </section>;
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;
