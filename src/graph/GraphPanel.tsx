import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Background, BackgroundVariant, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, ReactFlowProvider, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { Diagnostic, LanguageOutline } from '@aetheris/cad';
import { buildPartGraph, layoutPartGraph, unitAtSpan, type GraphDirection, type GraphRow, type PartGraph, type PositionedUnit } from './outlineGraph';

export interface GraphSelection { readonly unitId: string; readonly rowId: string | null }

interface Props {
  outline: LanguageOutline | null;
  error: string | null;
  diagnostics: readonly Diagnostic[];
  selection: GraphSelection | null;
  theme: 'bronze-age' | 'apollonia';
  onSelect(unitId: string, row: GraphRow | null, graph: PartGraph): void;
  onOpenSource(unitId: string, row: GraphRow | null, graph: PartGraph): void;
}

type UnitData = { unit: PositionedUnit; direction: GraphDirection; problems: number; selectedRow: string | null; onRow(row: GraphRow): void; onOpen(row: GraphRow | null): void };

const UnitNode = memo(function UnitNode({ data, selected }: NodeProps<Node<UnitData>>) {
  const { unit, direction, problems, selectedRow, onRow, onOpen } = data;
  return <div className={`graph-unit category-${unit.category}${selected ? ' selected' : ''}`} style={{ width: unit.width, minHeight: unit.height }}
    title={unit.category === 'external' ? `Defined in ${unit.document}` : 'Double-click to open in source'}>
    <Handle type="target" position={direction === 'LR' ? Position.Left : Position.Top} isConnectable={false} />
    <header>
      <strong>{unit.title}</strong>
      {problems > 0 && <span className="graph-problems" aria-label={`${problems} problems`}>{problems}</span>}
      <small>{unit.category === 'external' ? `${unit.kind} · ${unit.document}` : unit.kind}</small>
    </header>
    {unit.rows.length > 0 && <ol className="graph-rows">
      {unit.rows.map(row => <li key={row.id}><button className={row.id === selectedRow ? 'selected' : ''}
        onClick={event => { event.stopPropagation(); onRow(row); }} onDoubleClick={event => { event.stopPropagation(); onOpen(row); }}>
        <span>{row.label}</span>{row.detail && <small>{row.detail}</small>}</button></li>)}
      {unit.hiddenRows > 0 && <li className="graph-more">{unit.hiddenRows} more in source</li>}
    </ol>}
    <Handle type="source" position={direction === 'LR' ? Position.Right : Position.Bottom} isConnectable={false} />
  </div>;
});

const nodeTypes = { unit: UnitNode };

function Canvas({ outline, error, diagnostics, selection, theme, onSelect, onOpenSource, direction }: Props & { direction: GraphDirection }) {
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

  const nodes: Node<UnitData>[] = useMemo(() => !laid || !graph ? [] : laid.units.map(unit => ({
    id: unit.id, type: 'unit', position: { x: unit.x, y: unit.y }, draggable: false, connectable: false,
    selected: selection?.unitId === unit.id,
    data: { unit, direction, problems: problems.get(unit.id) ?? 0, selectedRow: selection?.unitId === unit.id ? selection.rowId : null,
      onRow: row => onSelect(unit.id, row, graph), onOpen: row => onOpenSource(unit.id, row, graph) },
  })), [laid, graph, direction, selection, problems, onSelect, onOpenSource]);

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
  if (!laid?.units.length) return <div className="graph-empty"><strong>Nothing to show.</strong><p>This document has no declarations yet. Switch to Source to start writing, or open an example.</p></div>;

  return <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode={theme === 'apollonia' ? 'light' : 'dark'}
    nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} minZoom={0.15} maxZoom={2}
    zoomOnDoubleClick={false}
    onNodeClick={(_, node) => graph && onSelect(node.id, null, graph)}
    onNodeDoubleClick={(_, node) => graph && onOpenSource(node.id, null, graph)}>
    <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
    <Controls showInteractive={false} position="bottom-right" />
  </ReactFlow>;
}

export function GraphPanel(props: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState<GraphDirection>('LR');
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
  return <section className="panel graph-panel" aria-label="Model graph">
    <div className="graph-caption">
      {summary ? <><span>{summary.containers.length ? summary.containers.join(', ') : props.outline?.document}</span>
        <small>{summary.units} parts, {summary.links} connections. Click to select; double-click to open the source.</small></> : <span>Model graph</span>}
    </div>
    <div className="graph-canvas" ref={canvas}><ReactFlowProvider><Canvas {...props} direction={direction} /></ReactFlowProvider></div>
  </section>;
}
