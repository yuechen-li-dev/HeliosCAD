import dagre from '@dagrejs/dagre';
import type { LanguageEditOperation, LanguageOutline, OutlineEdge, OutlineNode } from '@aetheris/cad';

// The Assembly canvas is a second projection of the same outline: the placed parts of one
// assembly as cards, their named frames as ports, and each joint (an Interface or a Mate whose
// A and B name frames on two parts) as a wire between two ports. Nothing here is geometry; the
// build still decides whether a joint closes.

export interface AssemblyPort {
  /** The path after the part, as written in a joint: `Hinge`, `Pivot.Frame`. */
  readonly key: string;
  /** Joints that land on this port. */
  readonly joints: readonly string[];
}

export interface AssemblyPart {
  readonly id: string;
  /** The occurrence name: `Link1`. The ground card uses the assembly's own name. */
  readonly name: string;
  /** What is placed: `ArmLink`, `Link<H:4mm>`; null for the ground. */
  readonly definition: string | null;
  readonly kind: 'part' | 'subassembly' | 'ground';
  readonly anchored: boolean;
  readonly ports: readonly AssemblyPort[];
}

export interface AssemblyEnd { readonly part: string; readonly port: string }

export interface AssemblyJoint {
  readonly id: string;
  readonly name: string;
  /** Revolute, Prismatic, Fixed…; a Mate takes its Interface definition's kind. */
  readonly kind: string;
  /** The Interface a Mate instantiates (`InstallCell`), or null for an inline Interface. */
  readonly definition: string | null;
  readonly a: AssemblyEnd | null;
  readonly b: AssemblyEnd | null;
}

export interface AssemblyGraph {
  readonly assembly: OutlineNode;
  /** The occurrence that mirrors the assembly (`<Assembly X>`): parts are its children. */
  readonly root: OutlineNode;
  readonly parts: readonly AssemblyPart[];
  readonly joints: readonly AssemblyJoint[];
}

const isAssembly = (node: OutlineNode) => (node.kind === 'Assembly' || node.kind === 'Subassembly') && !node.occurrence;
const isJoint = (node: OutlineNode) => node.kind === 'Interface' || node.kind === 'Mate';

/** The assemblies a document declares at its top level, the last one first: usually the main one. */
export function assembliesOf(outline: LanguageOutline | null): OutlineNode[] {
  return (outline?.nodes ?? []).filter(node => node.parentId === null && isAssembly(node)
    && node.children.some(id => outline!.nodes.find(n => n.id === id)?.occurrence)).reverse();
}

export function buildAssemblyGraph(outline: LanguageOutline, assemblyId?: string | null): AssemblyGraph | null {
  const nodes = new Map(outline.nodes.map(node => [node.id, node]));
  const assembly = (assemblyId ? nodes.get(assemblyId) : undefined) ?? assembliesOf(outline)[0];
  if (!assembly) return null;
  const root = assembly.children.map(id => nodes.get(id)).find(node => node?.occurrence);
  if (!root) return null;
  const partNodes = root.children.map(id => nodes.get(id)).filter((node): node is OutlineNode => !!node?.occurrence);
  const partOf = new Map(partNodes.map(node => [node.id, node]));

  // Where a joint end lands: the part (or the root, as ground) and the port path within it.
  const resolve = (edge: OutlineEdge | undefined, text: string | undefined): AssemblyEnd | null => {
    if (edge && !edge.toDocument) {
      let at = nodes.get(edge.to);
      const path: string[] = edge.member ? edge.member.split('.') : [];
      while (at && at.id !== root.id && !partOf.has(at.id)) { if (at.name) path.unshift(at.name); at = at.parentId ? nodes.get(at.parentId) : undefined; }
      if (at && (partOf.has(at.id) || at.id === root.id) && path.length) return { part: at.id, port: path.join('.') };
    }
    // Unresolved in this document (a frame exposed by an included definition): read the text.
    const parts = text?.split('.').map(part => part.trim()) ?? [];
    if (parts.length >= 2 && parts[0] === root.name) {
      const part = partNodes.find(node => node.name === parts[1]);
      if (part && parts.length >= 3) return { part: part.id, port: parts.slice(2).join('.') };
      if (!part) return { part: root.id, port: parts.slice(1).join('.') };
    }
    return null;
  };

  const joints: AssemblyJoint[] = assembly.children.map(id => nodes.get(id)).filter((node): node is OutlineNode => !!node && isJoint(node)).map(node => {
    const end = (field: 'A' | 'B') => resolve(outline.edges.find(edge => edge.from === node.id && edge.via === `field:${field}`),
      node.fields.find(f => f.name === field)?.text);
    const definition = node.kind === 'Mate' ? outline.edges.find(edge => edge.from === node.id && edge.via === 'annotation')?.to ?? null : null;
    const kind = node.kind === 'Interface' ? node.variant ?? 'Interface' : (definition ? nodes.get(definition)?.variant : null) ?? 'Mate';
    return { id: node.id, name: node.name ?? node.kind, kind, definition: definition ? nodes.get(definition)?.name ?? definition : null, a: end('A'), b: end('B') };
  });

  const anchorField = assembly.fields.find(field => field.name.toLowerCase() === 'anchor');
  const anchor = anchorField ? resolve(outline.edges.find(edge => edge.from === assembly.id && edge.via === `field:${anchorField.name}`), anchorField.text)
    ?? (anchorField.text.trim() === root.name ? { part: root.id, port: '' } : null) : null;

  const portsOf = (part: OutlineNode, local: readonly OutlineNode[]) => {
    const ports = new Map<string, string[]>(local.filter(n => n.kind === 'Semantic' && n.name).map(n => [n.name!, []]));
    for (const joint of joints) for (const end of [joint.a, joint.b]) if (end?.part === part.id) {
      // A joint on `Hinge.Frame` lands on the Hinge port when the part shows one.
      const key = ports.has(end.port) ? end.port : [...ports.keys()].find(k => end.port.startsWith(`${k}.`)) ?? end.port;
      ports.set(key, [...(ports.get(key) ?? []), joint.id]);
    }
    return [...ports].map(([key, on]) => ({ key, joints: on }));
  };
  const children = (node: OutlineNode) => node.children.map(id => nodes.get(id)).filter((n): n is OutlineNode => !!n);

  const parts: AssemblyPart[] = partNodes.map(node => ({ id: node.id, name: node.name ?? node.kind, definition: node.value?.text.trim() ?? null,
    kind: node.kind === 'Part' ? 'part' : 'subassembly', anchored: anchor?.part === node.id, ports: portsOf(node, children(node)) }));
  // The assembly's own frames are ground when a joint or the anchor lands on them.
  const groundPorts = portsOf(root, children(root).filter(n => !n.occurrence));
  if (joints.some(j => j.a?.part === root.id || j.b?.part === root.id) || anchor?.part === root.id)
    parts.unshift({ id: root.id, name: root.name ?? assembly.name ?? 'Assembly', definition: null, kind: 'ground', anchored: anchor?.part === root.id, ports: groundPorts });
  return { assembly, root, parts, joints };
}

/** A joint's end resolved back to the port it lands on in the card (`Hinge` for `Hinge.Frame`). */
export function portOf(graph: AssemblyGraph, end: AssemblyEnd) {
  const part = graph.parts.find(p => p.id === end.part);
  return part?.ports.find(p => p.key === end.port) ?? part?.ports.find(p => end.port.startsWith(`${p.key}.`)) ?? null;
}

export interface PositionedPart extends AssemblyPart { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

export const PART_WIDTH = 220;
const PART_HEADER = 48;
const PORT_ROW = 22;

export function partHeight(part: AssemblyPart) { return PART_HEADER + Math.max(1, part.ports.length) * PORT_ROW + 8; }

/** Ground and anchored parts first; each joint pulls its B part after its A part (right of it, or below in a tall pane). */
export function layoutAssembly(graph: AssemblyGraph, direction: 'LR' | 'TB' = 'LR'): PositionedPart[] {
  const g = new dagre.graphlib.Graph();
  g.setGraph(direction === 'LR' ? { rankdir: 'LR', nodesep: 26, ranksep: 90, marginx: 24, marginy: 24 } : { rankdir: 'TB', nodesep: 30, ranksep: 56, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const part of graph.parts) g.setNode(part.id, { width: PART_WIDTH, height: partHeight(part) });
  for (const joint of graph.joints) if (joint.a && joint.b && joint.a.part !== joint.b.part) g.setEdge(joint.a.part, joint.b.part);
  dagre.layout(g);
  return graph.parts.map(part => { const p = g.node(part.id); return { ...part, width: p.width, height: p.height, x: p.x - p.width / 2, y: p.y - p.height / 2 }; });
}

/** The source path a joint writes for a port: `TwoLinkArm.Link1.Input`, or `Articulated.Root.Frame` on the ground. */
export function portPath(graph: AssemblyGraph, end: AssemblyEnd) {
  const part = graph.parts.find(p => p.id === end.part);
  if (!part) return null;
  return part.kind === 'ground' ? `${graph.root.name}.${end.port}` : `${graph.root.name}.${part.name}.${end.port}`;
}

/** A new joint between two ports, written after the assembly's last joint. */
export function jointOperation(graph: AssemblyGraph, kind: string, a: AssemblyEnd, b: AssemblyEnd, outline: LanguageOutline): LanguageEditOperation | { reason: string } {
  if (a.part === b.part) return { reason: 'A joint connects two different parts.' };
  const from = portPath(graph, a), to = portPath(graph, b);
  if (!from || !to) return { reason: 'Those ports are not on parts of this assembly.' };
  const names = new Set(outline.nodes.map(node => node.name));
  const stem = `${graph.parts.find(p => p.id === a.part)!.name}${graph.parts.find(p => p.id === b.part)!.name}`;
  let name = stem;
  for (let i = 2; names.has(name); i++) name = `${stem}${i}`;
  const last = [...graph.joints].reverse()[0];
  return { kind: 'insertDeclaration', parent: graph.assembly.id, ...(last ? { after: last.id } : {}), source: `Interface<${kind}> ${name} { A: ${from}; B: ${to}; }` };
}
