import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { resolveLayoutRows, type Rect as LayoutRect } from 'machinalayout';
import { M } from 'machinalayout/machina';
import { matchEnum } from 'machinalayout/match';

export type EditorMode = 'graph' | 'source';
export type ShellRegion = 'editor' | 'viewport' | 'toolbar' | 'stage' | 'caption' | 'utility' | 'bottom';
export type ShellState = { ratio: Record<EditorMode, number>; utilityOpen: boolean; bottomOpen: boolean; bottomHeight: number };

/** Fixed bands, in px. Everything else is resolved from the workspace rectangle. */
export const SHELL = { toolbar: 34, toolbarStacked: 62, caption: 27, bottomBar: 32, minViewport: 360, stackToolbarBelow: 720 } as const;
const STORE = 'helios.shell';

/** The viewport gets the room: the editor takes a modest share, more for the graph, which needs it to stay readable. */
export const DEFAULT_SHELL: ShellState = { ratio: { source: .34, graph: .44 }, utilityOpen: true, bottomOpen: false, bottomHeight: 168 };
const RATIO_LIMITS: Record<EditorMode, readonly [number, number]> = { source: [.2, .6], graph: [.3, .75] };

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function utilityWidth(width: number, open: boolean) { return open ? clamp(width * .19, 248, 296) : 0; }
export function bottomHeight(height: number, state: ShellState) {
  return state.bottomOpen ? clamp(state.bottomHeight, 96, Math.max(96, height - 260)) : SHELL.bottomBar;
}

/**
 * The workbench as Machina rows: editor | viewport (toolbar / stage / caption) beside the utility
 * dock, with the bottom dock under the workbench. Pure: the same bounds and state give the same rects.
 */
export function shellRows(bounds: { width: number; height: number }, state: ShellState, mode: EditorMode) {
  const utility = utilityWidth(bounds.width, state.utilityOpen), bottom = bottomHeight(bounds.height, state);
  const workbench = Math.max(0, bounds.width - utility);
  // Never squeeze the viewport below a usable width; the editor gives way first.
  const ratio = clamp(state.ratio[mode], RATIO_LIMITS[mode][0], Math.min(RATIO_LIMITS[mode][1], 1 - SHELL.minViewport / Math.max(1, workbench)));
  const viewportWidth = workbench * (1 - Math.max(0, ratio));
  const toolbar = viewportWidth < SHELL.stackToolbarBelow ? SHELL.toolbarStacked : SHELL.toolbar;
  return M.rows(M.grid('shell', { frame: { kind: 'root' }, columns: [M.trackFill(1), M.trackFixed(utility)], rows: [M.trackFill(1), M.trackFixed(bottom)] }, [
    M.cell('workbench', 0, 0, { arrange: { kind: 'grid', columns: [M.trackFill(Math.max(0, ratio)), M.trackFill(1 - Math.max(0, ratio))], rows: [M.trackFill(1)] } }, [
      M.cell('editor', 0, 0),
      M.cell('viewport', 1, 0, { arrange: { kind: 'grid', columns: [M.trackFill(1)], rows: [M.trackFixed(toolbar), M.trackFill(1), M.trackFixed(SHELL.caption)] } }, [
        M.cell('toolbar', 0, 0), M.cell('stage', 0, 1), M.cell('caption', 0, 2),
      ]),
    ]),
    M.cell('utility', 1, 0, { rowSpan: 2 }), M.cell('bottom', 0, 1),
  ]));
}

export function resolveShell(bounds: { width: number; height: number }, state: ShellState, mode: EditorMode) {
  const nodes = resolveLayoutRows(shellRows(bounds, state, mode), { x: 0, y: 0, ...bounds }).nodes;
  const rect = (id: ShellRegion): LayoutRect => nodes[id].rect;
  return { rect, toolbarStacked: rect('toolbar').height > SHELL.toolbar };
}

function load(): ShellState {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Partial<ShellState> | null;
    if (stored && typeof stored === 'object') return { ...DEFAULT_SHELL, ...stored, ratio: { ...DEFAULT_SHELL.ratio, ...stored.ratio } };
  } catch { /* per-viewer convenience only */ }
  return DEFAULT_SHELL;
}

/** Absolute placement from resolved rects; regions inside the viewport are placed relative to it. */
const absolute = ({ x, y, width, height }: LayoutRect): CSSProperties => ({ position: 'absolute', left: x, top: y, width, height });

export function useShellLayout(editorMode: EditorMode = 'source') {
  const ref = useRef<HTMLElement>(null);
  const [bounds, setBounds] = useState({ width: 1440, height: 800 });
  const [state, setState] = useState<ShellState>(load);
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
  const update = (change: (value: ShellState) => ShellState) => setState(value => {
    const next = change(value);
    try { localStorage.setItem(STORE, JSON.stringify(next)); } catch { /* per-viewer convenience only */ }
    return next;
  });
  const shell = resolveShell(bounds, state, editorMode);
  const viewport = shell.rect('viewport');
  const place = (region: ShellRegion): CSSProperties => matchEnum<ShellRegion, CSSProperties>(region, {
    editor: () => absolute(shell.rect('editor')), viewport: () => absolute(viewport), utility: () => absolute(shell.rect('utility')), bottom: () => absolute(shell.rect('bottom')),
    toolbar: () => absolute({ ...shell.rect('toolbar'), x: 0, y: 0 }),
    stage: () => absolute({ ...shell.rect('stage'), x: 0, y: shell.rect('stage').y - viewport.y }),
    caption: () => absolute({ ...shell.rect('caption'), x: 0, y: shell.rect('caption').y - viewport.y }),
  });
  const editor = shell.rect('editor');
  const workbench = Math.max(1, bounds.width - utilityWidth(bounds.width, state.utilityOpen));
  const limits = RATIO_LIMITS[editorMode];
  return {
    ref, place, toolbarStacked: shell.toolbarStacked,
    splitter: { position: 'absolute', left: editor.x + editor.width, top: editor.y, height: editor.height } as CSSProperties,
    editorPercent: Math.round(editor.width / workbench * 100), bottomPixels: Math.round(shell.rect('bottom').height),
    utilityOpen: state.utilityOpen, bottomOpen: state.bottomOpen,
    setUtilityOpen: (open: boolean | ((value: boolean) => boolean)) => update(value => ({ ...value, utilityOpen: typeof open === 'function' ? open(value.utilityOpen) : open })),
    setBottomOpen: (open: boolean | ((value: boolean) => boolean)) => update(value => ({ ...value, bottomOpen: typeof open === 'function' ? open(value.bottomOpen) : open })),
    resizeEditor: (delta: number) => update(value => ({ ...value, ratio: { ...value.ratio, [editorMode]: clamp(value.ratio[editorMode] + delta / workbench, limits[0], limits[1]) } })),
    resizeBottom: (delta: number) => update(value => ({ ...value, bottomOpen: true, bottomHeight: clamp(value.bottomHeight - delta, 96, Math.max(96, bounds.height - 260)) })),
  };
}
