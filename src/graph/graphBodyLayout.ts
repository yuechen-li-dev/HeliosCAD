import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { resolveLayoutRows } from 'machinalayout';
import { M } from 'machinalayout/machina';

export const INSPECTOR_WIDTH = 284;
const STACK_BELOW = 640;

/** Canvas and node inspector: side by side in a wide pane, inspector below in a narrow one. */
export function graphBodyRows(width: number, height: number) {
  const stacked = width < STACK_BELOW;
  const inspector = stacked ? Math.min(Math.max(150, height * .42), height - 120) : INSPECTOR_WIDTH;
  return { stacked, rows: M.rows(M.grid('graph-body', {
    frame: { kind: 'root' },
    columns: stacked ? [M.trackFill(1)] : [M.trackFill(1), M.trackFixed(inspector)],
    rows: stacked ? [M.trackFill(1), M.trackFixed(inspector)] : [M.trackFill(1)],
  }, [M.cell('canvas', 0, 0), stacked ? M.cell('inspector', 0, 1) : M.cell('inspector', 1, 0)])) };
}

export function useGraphBodyLayout() {
  const ref = useRef<HTMLDivElement>(null);
  const [bounds, setBounds] = useState({ width: 960, height: 640 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (width && height) setBounds({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const { stacked, rows } = graphBodyRows(bounds.width, bounds.height);
  const nodes = resolveLayoutRows(rows, { x: 0, y: 0, ...bounds }).nodes;
  const place = (id: 'canvas' | 'inspector'): CSSProperties => {
    const { x, y, width, height } = nodes[id].rect;
    return { position: 'absolute', left: x, top: y, width, height };
  };
  return { ref, stacked, canvas: place('canvas'), inspector: place('inspector') };
}
