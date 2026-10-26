import { describe, expect, it } from 'vitest';
import { DEFAULT_SHELL, SHELL, resolveShell } from './shellLayout';

describe('workbench layout', () => {
  it('gives the viewport most of a 1440 px workspace and keeps the bottom dock a strip', () => {
    const { rect } = resolveShell({ width: 1440, height: 800 }, DEFAULT_SHELL, 'source');
    expect(rect('viewport').width).toBeGreaterThan(rect('editor').width * 1.8);
    expect(rect('bottom').height).toBe(SHELL.bottomBar);
    expect(rect('stage').height).toBe(rect('viewport').height - SHELL.toolbar - SHELL.caption);
    expect(rect('utility').x + rect('utility').width).toBe(1440);
  });
  it('never squeezes the viewport below its minimum; the editor gives way', () => {
    const { rect, toolbarStacked } = resolveShell({ width: 900, height: 700 }, { ...DEFAULT_SHELL, ratio: { source: .6, graph: .75 } }, 'graph');
    expect(rect('viewport').width).toBeGreaterThanOrEqual(SHELL.minViewport - 1);
    expect(toolbarStacked).toBe(true);
  });
  it('hands the utility column to the workbench when the dock is closed', () => {
    const { rect } = resolveShell({ width: 1440, height: 800 }, { ...DEFAULT_SHELL, utilityOpen: false }, 'source');
    expect(rect('viewport').x + rect('viewport').width).toBe(1440);
  });
});
