import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { resolveLayoutRows } from 'machinalayout';
import { M } from 'machinalayout/machina';

export function useShellLayout() {
  const ref = useRef<HTMLElement>(null);
  const [bounds, setBounds] = useState({ width: 1440, height: 900 });
  const [editorRatio, setEditorRatio] = useState(.43);
  const [bottomHeight, setBottomHeight] = useState(148);
  const [utilityOpen, setUtilityOpen] = useState(true);
  const [bottomOpen, setBottomOpen] = useState(true);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      setBounds({ width, height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const utilityWidth = utilityOpen ? Math.min(310, Math.max(250, bounds.width * .21)) : 0;
  const bottom = bottomOpen ? Math.min(bottomHeight, Math.max(96, bounds.height - 260)) : 32;
  const rows = M.rows(M.grid('shell', { frame: { kind: 'root' },
    columns: [M.trackFill(1), M.trackFixed(utilityWidth)], rows: [M.trackFill(1), M.trackFixed(bottom)] }, [
    M.cell('workbench', 0, 0, { arrange: { kind: 'grid', columns: [M.trackFill(editorRatio), M.trackFill(1 - editorRatio)], rows: [M.trackFill(1)] } }, [M.cell('editor', 0, 0), M.cell('viewport', 1, 0)]),
    M.cell('utility', 1, 0, { rowSpan: 2 }), M.cell('bottom', 0, 1),
  ]));
  const nodes = resolveLayoutRows(rows, { x: 0, y: 0, ...bounds }).nodes;
  const style = { '--utility-width': `${utilityWidth}px`, '--bottom-height': `${bottom}px`, '--editor-width': `${nodes.editor.rect.width}px` } as CSSProperties;
  const resizeEditor = (delta: number) => setEditorRatio(value => Math.max(.25, Math.min(.65, value + delta / Math.max(1, bounds.width - utilityWidth))));
  const resizeBottom = (delta: number) => { setBottomOpen(true); setBottomHeight(value => Math.max(96, Math.min(bounds.height - 260, value - delta))); };
  return { ref, style, editorPercent: Math.round(editorRatio * 100), bottomPixels: Math.round(bottom), utilityOpen, setUtilityOpen, bottomOpen, setBottomOpen, resizeEditor, resizeBottom };
}
