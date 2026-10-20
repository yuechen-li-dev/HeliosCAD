import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SketchCallbacks, SketchProjection } from '@aetheris/three-telos';
import { SketchPanel } from './SketchPanel';

const projection = (): SketchProjection => ({ version: 'firmament-sketch/1', document: 'part.firmament', revision: '1', node: 'Part/Section',
  profiles: [{ id: 'Part/Section', name: 'Section' }], emptyModels: [], openingReferences: [],
  frame: { name: 'Side', origin: [10, 2, 3], x: [0, 1, 0], y: [0, 0, 1], normal: [1, 0, 0] },
  loops: [{ name: 'Outer', isOuter: true, curves: [{ id: 'edge:a', name: 'Bottom', kind: 'Line', points: [[-40, -25], [40, -25]], center: null, radius: 0, startAngle: 0, sweep: 0, minorRadius: 0, rotation: 0 }] }],
  shapes: [{ id: 'Part/Outline', name: 'Outline', kind: 'Rect2', center: [0, 0], controls: [
    { id: 'width', label: 'Width', authored: 'Width', value: 80, unit: 'mm', editable: true, parameter: 'Width', readOnlyReason: null, span: { start: 1, length: 5 } },
    { id: 'x', label: 'Center X', authored: 'Width / 2 - 8mm', value: 32, unit: 'mm', editable: false, parameter: null, readOnlyReason: 'Driven by an expression', span: { start: 10, length: 16 } },
  ] }], diagnostics: [], validationLevel: 'ProfileResolvedNotBuilt' });
const callbacks = (): SketchCallbacks => ({ project: vi.fn().mockResolvedValue(projection()), preview: vi.fn().mockResolvedValue(projection()), apply: vi.fn().mockResolvedValue(null), source: vi.fn(), close: vi.fn() });

describe('compiler-owned sketch workspace', () => {
  it('shows the real frame, follows a parameter and commits Enter followed by blur only once', async () => {
    const api = callbacks(); render(<SketchPanel revision={1} node={null} callbacks={api} />);
    const width = await screen.findByRole('spinbutton', { name: 'Width' });
    expect(screen.getByText(/normal \(1, 0, 0\)/)).toBeVisible();
    expect(screen.getByText('↗ Width · shared parameter')).toBeVisible();
    expect(screen.getByRole('spinbutton', { name: 'Center X' })).toBeDisabled();
    fireEvent.change(width, { target: { value: '100' } }); fireEvent.keyDown(width, { key: 'Enter' }); fireEvent.blur(width);
    await waitFor(() => expect(api.apply).toHaveBeenCalledExactlyOnceWith({ kind: 'dimensions', node: 'Part/Section', changes: [{ control: 'width', value: 100 }] }));
  });
  it('shows refusal without removing the last resolved outline or replacing an expression', async () => {
    const api = callbacks(); vi.mocked(api.apply).mockResolvedValue('Radius exceeds the admitted size');
    render(<SketchPanel revision={1} node={null} callbacks={api} />);
    const width = await screen.findByRole('spinbutton', { name: 'Width' }); fireEvent.change(width, { target: { value: '-100' } }); fireEvent.blur(width);
    await screen.findByRole('alert'); expect(screen.getByRole('alert')).toHaveTextContent('Radius exceeds');
    expect(document.querySelector('[data-member="edge:a"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit source' })); expect(api.source).toHaveBeenCalledWith({ start: 10, length: 16 });
  });
  it('ignores an old projection after a newer source revision arrives', async () => {
    const api = callbacks(); let finish!: (view: SketchProjection) => void;
    vi.mocked(api.project).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const rendered = render(<SketchPanel revision={1} node={null} callbacks={api} />);
    const next = projection(); next.shapes = [{ ...next.shapes[0], name: 'Current' }]; vi.mocked(api.project).mockResolvedValueOnce(next);
    rendered.rerender(<SketchPanel revision={2} node={null} callbacks={api} />);
    await screen.findByRole('option', { name: 'Current · Rect2' }); finish(projection());
    await waitFor(() => expect(screen.getByRole('option', { name: 'Current · Rect2' })).toBeVisible());
    expect(screen.queryByRole('option', { name: 'Outline · Rect2' })).not.toBeInTheDocument();
  });
});
