import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import type { SketchProjection } from '@aetheris/cad';
import { IntelliDraftPanel } from './IntelliDraftPanel';

// JSDOM lacks the native top layer. The production browser tests cover real focus isolation.
const dialogMethods = ['showModal', 'close'] as const;
const originalDialogMethods = dialogMethods.map(name => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name));
beforeAll(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open'); } });
});
afterAll(() => { dialogMethods.forEach((name, i) => { const descriptor = originalDialogMethods[i]; if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor); else Reflect.deleteProperty(HTMLDialogElement.prototype, name); }); });

function projection(built = false): SketchProjection {
  return { version: 'firmament-sketch/1', document: 'draft.firmament', revision: '0', node: null,
    profiles: [], emptyModels: [], openingReferences: [], frame: null, loops: [], shapes: [], diagnostics: [], validationLevel: 'Unresolved',
    construction: { elements: [{ id: 'Part', name: 'Part', kind: 'Model', parent: null, span: { start: 0, length: 10 }, fields: [] },
      ...(built ? [{ id: 'Part/section', name: 'section', kind: 'Profile', parent: 'Part', span: { start: 1, length: 1 }, fields: [] },
        { id: 'Part/body', name: 'body', kind: 'Extrude', parent: 'Part', span: { start: 2, length: 1 }, fields: [] }] : [])],
      points: [], guides: [], frames: [], diagnostics: [], validationLevel: 'ConstructionResolvedNotTraced' } };
}
describe('IntelliDraft transaction', () => {
  it('preserves the runtime explanation when a generic failure includes diagnostic details', async () => {
    const failure = Object.assign(new Error('Aetheris could not complete the operation.'), { code: 'internal-error', details: 'Face 3 has unsupported surface kind LinearExtrusion.' });
    const runtime = { sketch: vi.fn().mockResolvedValue(projection()), sketchEdit: vi.fn().mockRejectedValue(failure) };
    render(<IntelliDraftPanel runtime={runtime} onCommit={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(runtime.sketch).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByText('Add by dimensions')); fireEvent.click(await screen.findByRole('button', { name: 'Add Rectangle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Face 3 has unsupported surface kind LinearExtrusion');
  });
  it('keeps the draft and current part untouched when a construction edit is refused', async () => {
    const runtime = { sketch: vi.fn().mockResolvedValue(projection()), sketchEdit: vi.fn().mockRejectedValue(new Error('draft-name-exists: choose a unique name')) };
    const commit = vi.fn(); render(<IntelliDraftPanel runtime={runtime} onCommit={commit} onClose={vi.fn()} />);
    await waitFor(() => expect(runtime.sketch).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByText('Add by dimensions')); fireEvent.click(await screen.findByRole('button', { name: 'Add Rectangle' }));
    // A person reads the plain explanation; the compiler's text stays available as detail.
    expect(await screen.findByRole('alert')).toHaveTextContent('That name is already used. Choose another.');
    expect(screen.getByRole('alert')).toHaveTextContent('choose a unique name');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Build and use part' })).toBeDisabled();
    expect(commit).not.toHaveBeenCalled();
  });
  it('retains the complete candidate when full build admission fails', async () => {
    const runtime = { sketch: vi.fn().mockResolvedValue(projection(true)), sketchEdit: vi.fn() };
    const commit = vi.fn().mockRejectedValue(new Error('capability-rejected: unsupported body'));
    const close = vi.fn(); render(<IntelliDraftPanel runtime={runtime} initialSource="complete candidate" onCommit={commit} onClose={close} />);
    const button = screen.getByRole('button', { name: 'Build and use part' });
    await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('capability-rejected');
    expect(commit).toHaveBeenCalledWith('complete candidate'); expect(close).not.toHaveBeenCalled(); expect(button).toBeEnabled();
  });
  it('starts a fresh draft with the rectangle tool, creates its layout with the first shape, and switches tools by key', async () => {
    const runtime = { sketch: vi.fn().mockResolvedValue(projection()), sketchEdit: vi.fn().mockRejectedValue(new Error('stop')) };
    render(<IntelliDraftPanel runtime={runtime} onCommit={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(runtime.sketch).toHaveBeenCalledOnce());
    expect(screen.queryByRole('button', { name: 'Add Layout' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Draw rectangle' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Construction name')).toHaveValue('rect1');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'c' });
    expect(screen.getByRole('button', { name: 'Draw circle' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Construction name')).toHaveValue('circle1');
    fireEvent.click(screen.getByText('Add by dimensions')); fireEvent.click(await screen.findByRole('button', { name: 'Add shape' }));
    await waitFor(() => expect(runtime.sketchEdit).toHaveBeenCalled());
    expect(runtime.sketchEdit.mock.calls[0][1]).toEqual({ kind: 'construction', construction: { action: 'layout', name: 'layout', plane: 'XY' } });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('button', { name: /^Select/ })).toHaveAttribute('aria-pressed', 'true');
  });
});
