import { useCallback, useLayoutEffect, useState } from 'react';
import { applyNodeChanges, type Node, type NodeChange, type XYPosition } from '@xyflow/react';

/** Workspace presentation only: moving a card never edits Firmament or builds geometry. */
export type GraphLayouts = Map<string, Map<string, XYPosition>>;

export function useGraphNodes<N extends Node>(input: N[], positions: Map<string, XYPosition>, revision: number) {
  const restore = useCallback((previous: N[]) => {
    const byId = new Map(previous.map(node => [node.id, node]));
    return input.map(node => ({ ...node, position: positions.get(node.id) ?? node.position,
      measured: byId.get(node.id)?.measured, dragging: byId.get(node.id)?.dragging }));
  }, [input, positions]);
  const [nodes, setNodes] = useState<N[]>(() => restore([]));
  useLayoutEffect(() => { setNodes(restore); }, [restore, revision]);
  const onNodesChange = useCallback((changes: NodeChange<N>[]) => {
    // React Flow owns pointer tracking; retain only the changed nodes, not freshly rebuilt cards.
    const layout = changes.filter(change => change.type === 'position' || change.type === 'dimensions');
    if (!layout.length) return;
    for (const change of layout) if (change.type === 'position' && change.position) positions.set(change.id, change.position);
    setNodes(previous => applyNodeChanges(layout, previous));
  }, [positions]);
  return { nodes, onNodesChange };
}
