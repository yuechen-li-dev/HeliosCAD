import dagre from '@dagrejs/dagre';
import type { LanguageOutline, OutlineNode, OutlineSpan } from '@aetheris/cad';

// The Part canvas is a projection of the compiler's declaration outline. Containers
// (a Model, a plain Struct, an Assembly with occurrences) are opened so their
// members become units; everything else is one unit whose own members are rows,
// like a feature tree inside a body. Wires carry data only: a use found anywhere
// inside a unit is lifted to the unit, and uses inside one unit are not drawn.

export type UnitCategory = 'data' | 'sketch' | 'body' | 'modify' | 'feature' | 'assembly' | 'external' | 'other';

export interface GraphRow {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly span: OutlineSpan | null;
}

export interface GraphUnit {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly category: UnitCategory;
  readonly container: string | null;
  readonly document: string;
  readonly span: OutlineSpan | null;
  readonly rows: readonly GraphRow[];
  readonly hiddenRows: number;
}

export interface GraphLink {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly label: string;
}

export interface PartGraph {
  readonly document: string;
  readonly units: readonly GraphUnit[];
  readonly links: readonly GraphLink[];
  /** Outline node id → id of the unit that shows it. Containers have no unit. */
  readonly unitOf: ReadonlyMap<string, string>;
  readonly nodes: ReadonlyMap<string, OutlineNode>;
}

export interface PositionedUnit extends GraphUnit { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
export interface PositionedGraph { readonly units: readonly PositionedUnit[]; readonly links: readonly GraphLink[] }

export const UNIT_WIDTH = 236;
export const MAX_ROWS = 8;
const HEADER = 46;
const ROW = 40;

const containers = new Set(['Model', 'model', 'Struct', 'Assembly', 'Subassembly']);
const categories: Readonly<Record<string, UnitCategory>> = {
  Static: 'data', Record: 'data', Table: 'data', Enum: 'data',
  Profile: 'sketch', Rect2: 'sketch', Square2: 'sketch', Circle2: 'sketch', Ellipse2: 'sketch', Slot2: 'sketch',
  RoundedRect2: 'sketch', SmoothRoundedRect2: 'sketch', Polygon2: 'sketch', RegularPolygon2: 'sketch', Triangle2: 'sketch',
  Point2: 'sketch', Line2: 'sketch', Path: 'sketch', Plane: 'sketch', Axis: 'sketch', Construction: 'sketch', Points: 'sketch',
  Compose: 'body', Box: 'body', Cylinder: 'body', Ellipsoid: 'body', Polyhedron: 'body', Cone: 'body', Sphere: 'body', Torus: 'body', RoundedBox: 'body', Frustum: 'body',
  Extrude: 'body', Revolve: 'body', WireForm: 'body', Sweep: 'body', Loft: 'body', SectionChain: 'body', Panel: 'body', Garment: 'body',
  InlineStep: 'body', Part: 'body',
  Modify: 'modify', EdgeFinish: 'modify', Hole: 'modify', Pattern: 'modify', Mirrored: 'modify', Radial: 'modify', Thread: 'modify',
  Feature: 'feature', Function: 'feature', Template: 'feature',
  Interface: 'assembly', Placement: 'assembly', Assembly: 'assembly', Subassembly: 'assembly',
};
// Fields worth showing on a row, in the order an engineer reads them.
const summaryFields = ['Diameter', 'Radius', 'Size', 'Length', 'Width', 'Height', 'Depth', 'Distance', 'Thickness', 'Turns', 'Pitch', 'Angle', 'From', 'To', 'Profile', 'Target', 'On', 'Center', 'Count', 'Kind'];

function isTemplate(node: OutlineNode) { return node.modifiers.includes('Template'); }

function opens(node: OutlineNode, nodes: ReadonlyMap<string, OutlineNode>) {
  if (!containers.has(node.kind) || isTemplate(node) || node.modifiers.includes('Concept') || node.children.length === 0) return false;
  // An occurrence is a placed component: open it only when it holds further occurrences.
  return !node.occurrence || node.children.some(id => nodes.get(id)?.occurrence);
}

export function categoryOf(node: OutlineNode): UnitCategory {
  // A placed Feature is a feature step wherever it sits.
  if (node.call) return 'feature';
  if (isTemplate(node)) return 'feature';
  if (node.modifiers.includes('Concept')) return 'sketch';
  if (node.occurrence) return 'assembly';
  if (node.kind === 'Struct') return 'body';
  return categories[node.kind] ?? 'other';
}

function kindLabel(node: OutlineNode) {
  if (node.call) return `${node.kind}(…)`;
  const prefix = node.modifiers.filter(m => m !== 'Template').join(' ');
  const kind = node.variant ? `${node.kind}<${node.variant}>` : node.kind;
  return (isTemplate(node) ? 'Template ' : '') + (prefix ? `${prefix} ${kind}` : kind);
}

function summary(node: OutlineNode) {
  const picked = summaryFields.flatMap(name => node.fields.filter(f => f.name.toLowerCase() === name.toLowerCase())).slice(0, 2);
  return picked.map(f => `${f.name} ${compact(f.text)}`).join(' · ');
}

function compact(text: string) {
  const flat = text.replace(/\s+/g, ' ');
  return flat.length > 28 ? `${flat.slice(0, 27)}…` : flat;
}

function rowsOf(node: OutlineNode, nodes: ReadonlyMap<string, OutlineNode>): GraphRow[] {
  const children = node.children.map(id => nodes.get(id)).filter((n): n is OutlineNode => !!n);
  if (children.length) return children.map(child => ({
    id: child.id, label: child.name ? `${kindLabel(child)} ${child.name}` : kindLabel(child), detail: summary(child), span: child.span,
  }));
  return node.fields.map(field => ({ id: `${node.id}#${field.name}`, label: field.name, detail: compact(field.text), span: field.span }));
}

/**
 * Statics that only exist to drive one declaration's field, named after it (`rect1Width` for
 * `rect1`, as IntelliDraft writes them). They stay in Parameters but do not get their own card.
 */
const GENERATED_SUFFIX = /^(CenterX|CenterY|Width|Height|Radius|Diameter|Length|Rotation|CornerExtent)\d*$/;
export function generatedStatics(outline: LanguageOutline) {
  const nodes = new Map(outline.nodes.map(n => [n.id, n] as const));
  const consumers = new Map<string, Set<string>>();
  for (const edge of outline.edges) if (!edge.toDocument) consumers.set(edge.to, (consumers.get(edge.to) ?? new Set()).add(edge.from));
  const folded = new Map<string, string>();
  for (const node of outline.nodes) {
    if (node.kind !== 'Static' || !node.name) continue;
    const users = [...consumers.get(node.id) ?? []].map(id => nodes.get(id)).filter((n): n is OutlineNode => !!n);
    if (users.length === 1 && users[0].name && node.name.length > users[0].name.length && node.name.startsWith(users[0].name)
      && GENERATED_SUFFIX.test(node.name.slice(users[0].name.length))) folded.set(node.id, users[0].id);
  }
  return folded;
}

export function buildPartGraph(outline: LanguageOutline): PartGraph {
  const nodes = new Map(outline.nodes.map(n => [n.id, n] as const));
  const unitOf = new Map<string, string>();
  const units: GraphUnit[] = [];
  const folded = generatedStatics(outline);

  const claim = (node: OutlineNode, unit: string) => {
    unitOf.set(node.id, unit);
    for (const id of node.children) { const child = nodes.get(id); if (child) claim(child, unit); }
  };
  const visit = (node: OutlineNode, container: string | null) => {
    if (folded.has(node.id)) return;
    if (opens(node, nodes)) {
      const path = container ? `${container} / ${node.name ?? node.kind}` : (node.name ?? node.kind);
      for (const id of node.children) { const child = nodes.get(id); if (child) visit(child, path); }
      return;
    }
    const rows = rowsOf(node, nodes);
    units.push({ id: node.id, title: node.name ?? node.kind, kind: kindLabel(node), category: categoryOf(node), container,
      document: outline.document, span: node.span, rows: rows.slice(0, MAX_ROWS), hiddenRows: Math.max(0, rows.length - MAX_ROWS) });
    claim(node, node.id);
  };
  for (const node of outline.nodes) if (node.parentId === null) visit(node, null);
  // A folded Static belongs to the card of the declaration it drives, so no wire is drawn to it.
  for (const [id, user] of folded) { const unit = unitOf.get(user); if (unit) unitOf.set(id, unit); }

  const links = new Map<string, GraphLink>();
  for (const edge of outline.edges) {
    const consumer = unitOf.get(edge.from);
    let provider: string | undefined;
    if (edge.toDocument) {
      provider = `external:${edge.toDocument}::${edge.to}`;
      if (!units.some(u => u.id === provider)) units.push({ id: provider, title: edge.to.split('/').at(-1) ?? edge.to,
        kind: 'Included definition', category: 'external', container: null, document: edge.toDocument, span: null, rows: [], hiddenRows: 0 });
    } else provider = unitOf.get(edge.to);
    if (!consumer || !provider || consumer === provider) continue;
    const id = `${provider}->${consumer}`;
    const label = edge.kind === 'modifies' || edge.kind === 'asserts' || edge.kind === 'recognizes' ? edge.kind
      : edge.kind === 'call' ? 'applies' : edge.via === 'body' ? 'uses' : edge.via.replace(/^(field|clause|argument):/, '');
    const existing = links.get(id);
    // `uses` (a bare expression such as `Outline |> TraceLoop`) only labels a wire nothing names better.
    const labels = existing ? existing.label.split(', ') : [];
    const merged = labels.includes(label) || (label === 'uses' && labels.length) ? labels
      : [...labels.filter(l => l !== 'uses'), label];
    links.set(id, { id, from: provider, to: consumer, label: merged.join(', ') });
  }
  return { document: outline.document, units, links: [...links.values()], unitOf, nodes };
}

export function unitHeight(unit: GraphUnit) {
  return HEADER + (unit.rows.length + (unit.hiddenRows ? 1 : 0)) * ROW + (unit.rows.length ? 8 : 0);
}

export type GraphDirection = 'LR' | 'TB';

/** Data flows left to right in a wide pane and top to bottom in a tall one. */
export function layoutPartGraph(graph: PartGraph, direction: GraphDirection = 'LR'): PositionedGraph {
  const g = new dagre.graphlib.Graph();
  g.setGraph(direction === 'LR' ? { rankdir: 'LR', nodesep: 22, ranksep: 64, marginx: 24, marginy: 24 }
    : { rankdir: 'TB', nodesep: 26, ranksep: 46, marginx: 24, marginy: 24 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const unit of graph.units) g.setNode(unit.id, { width: UNIT_WIDTH, height: unitHeight(unit) });
  for (const link of graph.links) g.setEdge(link.from, link.to);
  dagre.layout(g);
  return {
    links: graph.links,
    units: graph.units.map(unit => {
      const p = g.node(unit.id);
      return { ...unit, width: p.width, height: p.height, x: p.x - p.width / 2, y: p.y - p.height / 2 };
    }),
  };
}

/** The innermost outline node whose span contains [start, start + length). */
export function nodeAtSpan(graph: PartGraph, start: number, length = 0): OutlineNode | null {
  let best: OutlineNode | null = null;
  for (const node of graph.nodes.values()) {
    if (node.span.start <= start && start + length <= node.span.start + node.span.length
      && (!best || node.span.length < best.span.length)) best = node;
  }
  return best;
}

/** The unit that shows the source at a span, or null when only a container holds it. */
export function unitAtSpan(graph: PartGraph, start: number, length = 0): string | null {
  const node = nodeAtSpan(graph, start, length);
  return node ? graph.unitOf.get(node.id) ?? null : null;
}
