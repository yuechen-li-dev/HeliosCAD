import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Background, BackgroundVariant, Controls, Handle, MarkerType, Position, ReactFlow, useReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import type { LanguageOutline } from '@aetheris/cad';
import { layoutAssembly, portOf, type AssemblyEnd, type AssemblyGraph, type PositionedPart } from './assemblyGraph';

export interface AssemblyAuthoring {
  /** Joint kinds the language offers (`Fixed`, `Revolute`, …). */
  kinds: readonly string[];
  onJoin(kind: string, a: AssemblyEnd, b: AssemblyEnd): void;
  onCreateMate?(): void;
}

interface Props {
  outline: LanguageOutline;
  graph: AssemblyGraph;
  theme: 'bronze-age' | 'apollonia';
  /** The outline node the inspector shows: a part or a joint. */
  selectedId: string | null;
  onSelect(id: string): void;
  onOpenSource(id: string): void;
  authoring: AssemblyAuthoring | null;
  host: RefObject<HTMLDivElement | null>;
  direction: 'LR' | 'TB';
}

type PartData = { part: PositionedPart; selected: boolean; editable: boolean; activePorts: ReadonlySet<string> };

const glyph = { part: '▣', subassembly: '⧉', ground: '⏚' } as const;

const PartNode = memo(function PartNode({ data }: NodeProps<Node<PartData>>) {
  const { part, selected, editable, activePorts } = data;
  return <div className={`assembly-part kind-${part.kind}${selected ? ' selected' : ''}`} style={{ width: part.width, minHeight: part.height }}
    title="Double-click to open in source">
    <header>
      <i aria-hidden>{glyph[part.kind]}</i>
      <strong>{part.name}</strong>
      {part.anchored && <span className="assembly-anchor" title="Anchored: this part stays put and the others move relative to it">Anchored</span>}
      <small>{part.kind === 'ground' ? 'Assembly frame' : `${part.kind === 'subassembly' ? 'Subassembly' : 'Part'} · ${part.definition ?? '—'}`}</small>
    </header>
    <ol className="assembly-ports">
      {part.ports.length === 0 && <li className="assembly-port empty">No named frames</li>}
      {part.ports.map(port => <li key={port.key} className={`assembly-port${activePorts.has(port.key) ? ' active' : ''}`}>
        <Handle id={`in:${port.key}`} type="target" position={Position.Left} isConnectable={editable} />
        <span>{port.key}</span>
        {port.joints.length > 0 && <small>{port.joints.length}</small>}
        <Handle id={`out:${port.key}`} type="source" position={Position.Right} isConnectable={editable} />
      </li>)}
    </ol>
  </div>;
});

const nodeTypes = { part: PartNode };

type PendingJoint = { a: AssemblyEnd; b: AssemblyEnd | { part: string }; x: number; y: number };

export function AssemblyCanvas({ graph, theme, selectedId, onSelect, onOpenSource, authoring, host, direction }: Props) {
  const flow = useReactFlow();
  const laid = useMemo(() => layoutAssembly(graph, direction), [graph, direction]);
  const measured = useRef(new Map<string, { width: number; height: number }>());
  const [pending, setPending] = useState<PendingJoint | null>(null);
  const [fitted, setFitted] = useState('');
  const structure = direction + laid.map(p => `${p.id}:${p.ports.length}`).join('|');
  const selectedJoint = graph.joints.find(j => j.id === selectedId);

  const nodes: Node<PartData>[] = useMemo(() => laid.map(part => {
    const active = new Set<string>();
    if (selectedJoint) for (const end of [selectedJoint.a, selectedJoint.b]) if (end?.part === part.id) { const port = portOf(graph, end); if (port) active.add(port.key); }
    return { id: part.id, type: 'part', position: { x: part.x, y: part.y }, draggable: false, connectable: !!authoring, measured: measured.current.get(part.id),
      data: { part, selected: selectedId === part.id, editable: !!authoring, activePorts: active } };
  }), [laid, selectedId, selectedJoint, authoring, graph]);

  const edges: Edge[] = useMemo(() => graph.joints.flatMap(joint => {
    if (!joint.a || !joint.b) return [];
    const from = portOf(graph, joint.a), to = portOf(graph, joint.b);
    if (!from || !to) return [];
    const selected = joint.id === selectedId;
    return [{ id: joint.id, source: joint.a.part, sourceHandle: `out:${from.key}`, target: joint.b.part, targetHandle: `in:${to.key}`, type: 'smoothstep',
      label: `${joint.name} · ${joint.kind}`, className: `assembly-joint joint-${joint.kind.toLowerCase()}${selected ? ' selected' : ''}`,
      markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12 }, labelBgPadding: [5, 3] as [number, number], labelBgBorderRadius: 3, interactionWidth: 18 }];
  }), [graph, selectedId]);

  useEffect(() => {
    if (structure === fitted) return;
    const frame = requestAnimationFrame(() => { void flow.fitView({ padding: 0.08, minZoom: 0.45, maxZoom: 1.1, duration: 0 }); setFitted(structure); });
    return () => cancelAnimationFrame(frame);
  }, [structure, fitted, flow]);

  const local = (clientX: number, clientY: number) => {
    const box = host.current?.getBoundingClientRect();
    return box ? { x: Math.max(8, Math.min(clientX - box.left, box.width - 280)), y: Math.max(8, Math.min(clientY - box.top, box.height - 160)) } : { x: 16, y: 16 };
  };
  const nameOf = (id: string) => graph.parts.find(p => p.id === id)?.name ?? id;
  const pendingTarget = pending && 'port' in pending.b ? pending.b : null;
  const targetPart = pending ? graph.parts.find(p => p.id === pending.b.part) : undefined;
  const [targetPort, setTargetPort] = useState('');
  useEffect(() => { setTargetPort(pendingTarget?.port ?? targetPart?.ports[0]?.key ?? ''); }, [pending]);

  return <>
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} colorMode={theme === 'apollonia' ? 'light' : 'dark'}
      nodesDraggable={false} nodesConnectable={!!authoring} elementsSelectable={false} minZoom={0.15} maxZoom={2} zoomOnDoubleClick={false} connectionRadius={28}
      onNodesChange={changes => { for (const change of changes) if (change.type === 'dimensions' && change.dimensions) measured.current.set(change.id, change.dimensions); }}
      onNodeClick={(_, node) => onSelect(node.id)} onNodeDoubleClick={(_, node) => onOpenSource(node.id)}
      onEdgeClick={(_, edge) => onSelect(edge.id)} onEdgeDoubleClick={(_, edge) => onOpenSource(edge.id)}
      onConnectEnd={(event, state) => {
        if (!authoring || !state.fromNode || !state.fromHandle?.id) return;
        const p = 'changedTouches' in event ? event.changedTouches[0] : event;
        // Dropped on a port: that port. Dropped anywhere on a card: choose the port in the menu.
        const card = state.toNode?.id ?? [...(host.current?.querySelectorAll<HTMLElement>('.react-flow__node') ?? [])].find(element => {
          const box = element.getBoundingClientRect();
          return p.clientX >= box.left && p.clientX <= box.right && p.clientY >= box.top && p.clientY <= box.bottom;
        })?.dataset.id;
        if (!card || card === state.fromNode.id) return;
        const fromPort = state.fromHandle.id.replace(/^(in|out):/, '');
        const toPort = state.toHandle?.id?.replace(/^(in|out):/, '');
        setPending({ a: { part: state.fromNode.id, port: fromPort }, b: toPort ? { part: card, port: toPort } : { part: card }, ...local(p.clientX, p.clientY) });
      }}>
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
    {authoring && pending && targetPart && <div className="graph-wire-menu assembly-join" role="menu" aria-label="Join" style={{ left: pending.x, top: pending.y }}
      onKeyDown={event => { if (event.key === 'Escape') setPending(null); }}>
      <p>Join <b>{nameOf(pending.a.part)}.{pending.a.port}</b> to <b>{targetPart.name}</b>
        {pendingTarget ? <b>.{pendingTarget.port}</b> : targetPart.ports.length > 0
          ? <select aria-label="Port" value={targetPort} onChange={event => setTargetPort(event.target.value)}>{targetPart.ports.map(port => <option key={port.key} value={port.key}>{port.key}</option>)}</select>
          : null} as…</p>
      {targetPart.ports.length === 0 && !pendingTarget
        ? <p className="graph-wire-none">{targetPart.name} has no named frame to join. Add a Semantic frame to its definition first.</p>
        : authoring.kinds.map((kind, index) => <button key={kind} role="menuitem" autoFocus={index === 0} onClick={() => {
          setPending(null);
          authoring.onJoin(kind, pending.a, { part: targetPart.id, port: pendingTarget?.port ?? targetPort });
        }}>{kind}<small> {jointHint[kind] ?? ''}</small></button>)}
      <button className="cancel" role="menuitem" onClick={() => setPending(null)}>Cancel</button>
    </div>}
  </>;
}

const jointHint: Record<string, string> = {
  Fixed: 'rigid, no motion', Revolute: 'turns about an axis', Prismatic: 'slides along an axis', Cylindrical: 'turns and slides',
  Axial: 'shares an axis', Planar: 'slides on a plane', Spherical: 'ball joint',
};
