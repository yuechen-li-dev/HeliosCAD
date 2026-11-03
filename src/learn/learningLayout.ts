import { resolveLayoutRows, type Rect } from 'machinalayout';
import { M } from 'machinalayout/machina';

/** Reading rail, prose and contents share a deterministic layout at every width. */
export function learningLayout(width: number, height: number, navigation: boolean) {
  const compact = width < 760, toc = width >= 1200 ? 200 : 0;
  const nav = compact ? navigation ? width : 0 : 260;
  const nodes = resolveLayoutRows(M.rows(M.grid('learning', { frame: { kind: 'root' }, columns: [M.trackFixed(nav), M.trackFill(1), M.trackFixed(toc)], rows: [M.trackFill(1)] }, [M.cell('navigation', 0, 0), M.cell('article', 1, 0), M.cell('contents', 2, 0)])), { x: 0, y: 0, width, height }).nodes;
  const rect = (id: string): Rect => nodes[id].rect;
  return { compact, rect };
}
