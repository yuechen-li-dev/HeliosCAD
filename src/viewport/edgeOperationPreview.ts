import type { DisplayEdgePolyline, DisplayMesh, SelectionDescription } from '@aetheris/cad';

function sameTrace(edge: DisplayEdgePolyline, previous: DisplayEdgePolyline): boolean {
  if (edge.closed !== previous.closed || edge.points.length !== previous.points.length) return false;
  const same = (reverse: boolean) => edge.points.every((point, i) => {
    const old = previous.points[reverse ? edge.points.length - i - 1 : i];
    return point.length === old.length && point.every((coordinate, axis) => coordinate === old[axis]);
  });
  return same(false) || same(true);
}

/** Suppress a guide only when the compiler retains its identity and its entire displayed trace. */
export function edgeOperationPreview(candidate: DisplayMesh, accepted: DisplayMesh, pick: SelectionDescription): DisplayMesh {
  if (candidate.occurrences.length !== 1 || accepted.occurrences.length !== 1) return candidate;
  const beforeOccurrence = accepted.occurrences[0];
  const afterOccurrence = candidate.occurrences[0];
  if (beforeOccurrence.id !== pick.occurrenceId || afterOccurrence.id !== pick.occurrenceId) return candidate;
  if (beforeOccurrence.definitionId !== pick.definitionId || beforeOccurrence.transform.length !== afterOccurrence.transform.length
    || beforeOccurrence.transform.some((value, i) => value !== afterOccurrence.transform[i])) return candidate;
  const before = accepted.definitions.find(definition => definition.id === pick.definitionId);
  const after = candidate.definitions.find(definition => definition.id === afterOccurrence.definitionId);
  if (!before?.edges || !after?.edges || before.identity !== after.identity) return candidate;

  const previous = new Map(before.edges.filter(edge => edge.semanticTopologyId).map(edge => [edge.semanticTopologyId, edge]));
  const edges = after.edges.filter(edge => {
    const original = previous.get(edge.semanticTopologyId);
    return !original || !sameTrace(edge, original);
  });
  if (edges.length === 0 || edges.length === after.edges.length) return candidate;
  return { ...candidate, definitions: candidate.definitions.map(definition => definition === after ? { ...after, edges } : definition) };
}
