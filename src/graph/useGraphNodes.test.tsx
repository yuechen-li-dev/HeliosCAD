import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { useGraphNodes } from './useGraphNodes';

const cards: Node[] = [
  { id: 'body', position: { x: 0, y: 0 }, data: { title: 'Body' } },
  { id: 'edit', position: { x: 300, y: 0 }, data: { title: 'Modify' } },
];
it('keeps dragged positions and measurements across compiler updates without rebuilding untouched cards during motion', () => {
  const positions = new Map();
  const { result, rerender, unmount } = renderHook(({ input, revision }) => useGraphNodes(input, positions, revision), { initialProps: { input: cards, revision: 0 } });
  const untouched = result.current.nodes[1];
  act(() => result.current.onNodesChange([
    { id: 'body', type: 'dimensions', dimensions: { width: 240, height: 100 } },
    { id: 'body', type: 'position', position: { x: 72, y: 41 }, dragging: true },
  ]));
  expect(result.current.nodes[1]).toBe(untouched);
  const changed = cards.map(node => ({ ...node, data: { title: node.id, newField: '8mm' } }));
  rerender({ input: changed, revision: 0 });
  expect(result.current.nodes[0]).toMatchObject({ position: { x: 72, y: 41 }, measured: { width: 240, height: 100 }, data: { newField: '8mm' } });
  act(() => result.current.onNodesChange([{ id: 'body', type: 'position', dragging: false }]));
  expect(result.current.nodes[0].dragging).toBe(false);
  unmount();
  const reopened = renderHook(() => useGraphNodes(changed, positions, 0));
  expect(reopened.result.current.nodes[0].position).toEqual({ x: 72, y: 41 });
  reopened.unmount();
  positions.clear();
  const arranged = renderHook(() => useGraphNodes(changed, positions, 1));
  expect(arranged.result.current.nodes[0].position).toEqual({ x: 0, y: 0 });
  expect(cards[0].position).toEqual({ x: 0, y: 0 });
});
