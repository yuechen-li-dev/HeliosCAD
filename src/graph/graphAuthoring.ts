import type { LanguageEditOperation, LanguageOutline, OutlineField, OutlineNode, PaletteItem } from '@aetheris/cad';
import { categoryOf, type PartGraph } from './outlineGraph';

// What graph gestures mean as language edits. Each function decides from the outline alone and
// returns the operations to send, or a reason the gesture does nothing here.

const isModify = (node: OutlineNode) => node.kind === 'Modify' || node.kind === 'modify';
const containerKinds = new Set(['Model', 'model', 'Struct', 'Assembly', 'Subassembly']);

/** `Hole`, `Hole2`, … : the first stem-numbered name no declaration in the document uses. */
export function uniqueName(stem: string, outline: LanguageOutline | null) {
  const taken = new Set((outline?.nodes ?? []).map(node => node.name).filter(Boolean));
  if (!taken.has(stem)) return stem;
  for (let i = 2; ; i++) if (!taken.has(`${stem}${i}`)) return `${stem}${i}`;
}

/** The body a feature goes on: the selected body, the body a selected Modify (or its feature) acts on,
 * or the only body there is. */
export function featureTarget(outline: LanguageOutline | null, selectedId: string | null): { body: OutlineNode } | { reason: string } {
  const nodes = outline?.nodes ?? [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  // A body is a solid a Modify can name: Box, Cylinder, Compose, Extrude…, not a step inside a
  // Compose or a feature inside a Modify.
  const isBody = (node: OutlineNode) => {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    return !!node.name && categoryOf(node) === 'body' && !containerKinds.has(node.kind)
      && !(parent && (isModify(parent) || parent.kind === 'Compose'));
  };
  for (let node = selectedId ? byId.get(selectedId) : undefined; node; node = node.parentId ? byId.get(node.parentId) : undefined) {
    if (isModify(node)) {
      const body = nodes.find(n => n.parentId === node!.parentId && n.name === node!.name && isBody(n));
      if (body) return { body };
    }
    if (isBody(node)) return { body: node };
  }
  const bodies = nodes.filter(isBody);
  if (bodies.length === 1) return { body: bodies[0] };
  return { reason: bodies.length ? 'Select the body to put it on.' : 'Add a body first.' };
}

/** Where a new body goes: the container holding the selection, else the first Model, else the document. */
export function bodyParent(outline: LanguageOutline | null, selectedId: string | null): string | null {
  const nodes = outline?.nodes ?? [];
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (let node = selectedId ? byId.get(selectedId) : undefined; node; node = node.parentId ? byId.get(node.parentId) : undefined)
    if (containerKinds.has(node.kind) && !node.occurrence && !node.modifiers.includes('Concept') && !node.modifiers.includes('Template')) return node.id;
  return nodes.find(node => node.parentId === null && (node.kind === 'Model' || node.kind === 'model'))?.id ?? null;
}

export function paletteOperation(item: PaletteItem, outline: LanguageOutline | null, selectedId: string | null): LanguageEditOperation | { reason: string } {
  const name = uniqueName(item.nameStem, outline);
  if (item.placement === 'feature') {
    const target = featureTarget(outline, selectedId);
    if ('reason' in target) return target;
    return { kind: 'insertFeature', node: target.body.id, source: item.source, name };
  }
  return { kind: 'insertDeclaration', parent: bodyParent(outline, selectedId), source: item.source, name };
}

/** The ways a wire from `provider` can land on `consumer`: one of its reference fields, or, for a
 * Modify, what it acts on. */
export type WireChoice = { kind: 'field'; field: OutlineField } | { kind: 'retarget' };

// The kernel outline's vocabulary fields: their words are choices, never part names.
const vocabulary = new Set(['units', 'role', 'end', 'kind', 'angle', 'handedness', 'orientation', 'hand', 'rule',
  'correspondence', 'easing', 'layout', 'direction', 'variant', 'mode', 'policy', 'alignment']);

export function wireChoices(consumer: OutlineNode, outline: LanguageOutline | null): WireChoice[] {
  // A field that already names a part takes a wire; so does any other reference field that is not vocabulary.
  const wired = new Set((outline?.edges ?? []).filter(edge => edge.from === consumer.id && edge.via.startsWith('field:'))
    .map(edge => edge.via.slice('field:'.length).split('.')[0]));
  const fields = consumer.fields.filter(field => wired.has(field.name)
    || ((field.shape === 'reference' || field.shape === 'member') && !vocabulary.has(field.name.toLowerCase())));
  const choices: WireChoice[] = fields.map(field => ({ kind: 'field', field }));
  if (isModify(consumer)) choices.unshift({ kind: 'retarget' });
  return choices;
}

/** `provider` is the name the consumer writes: a declaration's name, or an included definition's. */
export function wireOperation(provider: string | null, consumer: OutlineNode, choice: WireChoice): LanguageEditOperation | { reason: string } {
  if (!provider) return { reason: 'That part has no name to refer to.' };
  return choice.kind === 'retarget'
    ? { kind: 'renameDeclaration', node: consumer.id, name: provider }
    : { kind: 'setField', node: consumer.id, field: choice.field.name, value: provider };
}

/** Drop `dragged` before or after `target`, both children of the same declaration. */
export function reorderOperation(graph: PartGraph, draggedId: string, targetId: string, place: 'before' | 'after'): LanguageEditOperation | null {
  const dragged = graph.nodes.get(draggedId), target = graph.nodes.get(targetId);
  if (!dragged || !target || dragged.id === target.id || dragged.parentId !== target.parentId) return null;
  const siblings = [...graph.nodes.values()].filter(node => node.parentId === dragged.parentId).sort((a, b) => a.order - b.order);
  const without = siblings.filter(node => node.id !== dragged.id);
  const at = without.findIndex(node => node.id === target.id) + (place === 'after' ? 1 : 0);
  const current = siblings.findIndex(node => node.id === dragged.id);
  if (at === current) return null;
  return at === 0 ? { kind: 'moveDeclaration', node: dragged.id, first: true } : { kind: 'moveDeclaration', node: dragged.id, after: without[at - 1].id };
}
