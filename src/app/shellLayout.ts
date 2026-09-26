import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { resolveLayoutRows } from 'machinalayout';
import { M } from 'machinalayout/machina';

// The three visible docks have explicit ownership and stable dimensions.
// MachinaLayout resolves the split; CSS only paints the resulting rectangles.
const shellRows = M.rows(M.grid('shell', {
  frame: { kind: 'root' },
  columns: [M.trackFill(1), M.trackFixed(310)],
  rows: [M.trackFill(1), M.trackFixed(220)],
}, [
  M.cell('workbench', 0, 0, {
    arrange: { kind: 'grid', columns: [M.trackFill(1), M.trackFill(1)], rows: [M.trackFill(1)] },
  }, [M.cell('editor', 0, 0), M.cell('viewport', 1, 0)]),
  M.cell('utility', 1, 0, { rowSpan: 2 }),
  M.cell('bottom', 0, 1),
]));

export function useShellLayout() {
  const ref = useRef<HTMLElement>(null);
  const [style, setStyle] = useState<CSSProperties>({
    '--utility-width': '310px', '--bottom-height': '220px', '--editor-width': '50%',
  } as CSSProperties);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (width < 310 || height < 220) return;
      const nodes = resolveLayoutRows(shellRows, { x: 0, y: 0, width, height }).nodes;
      setStyle({
        '--utility-width': `${nodes.utility.rect.width}px`,
        '--bottom-height': `${nodes.bottom.rect.height}px`,
        '--editor-width': `${nodes.editor.rect.width}px`,
      } as CSSProperties);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, style };
}
