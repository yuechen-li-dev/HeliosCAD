import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LanguageOutline, ModelSession, PaletteItem } from '@aetheris/cad';
import type { CadRuntime } from '../sdk/CadRuntime';
import { fakeModel } from '../test/fakes';
import { AuthoringPanel } from './AuthoringPanel';

const outline: LanguageOutline = { version: 'firmament-outline/1', document: 'part.firmament', revision: '1', edges: [], externals: [], diagnostics: [], nodes: [
  { id: 'Part', name: 'Part', kind: 'Model', variant: null, modifiers: [], occurrence: false, parentId: null, order: 0, span: { start: 0, length: 100 }, nameSpan: null, schemaId: null, parameters: [], fields: [], children: ['Part/Stock'] },
  { id: 'Part/Stock', name: 'Stock', kind: 'Box', variant: null, modifiers: [], occurrence: false, parentId: 'Part', order: 0, span: { start: 10, length: 80 }, nameSpan: null, schemaId: null, parameters: [], fields: [], children: [] },
] };
const palette: PaletteItem[] = [{ id: 'box', label: 'Box', category: 'Bodies', description: '', placement: 'model', nameStem: 'Block', source: 'Box Block {}', requiresEmptyModel: true },
  { id: 'cylinder', label: 'Cylinder', category: 'Bodies', description: '', placement: 'model', nameStem: 'Bar', source: 'Cylinder Bar {}', requiresEmptyModel: true }];
const mount = () => {
  const candidate = fakeModel({ dispose: vi.fn(async () => {}) });
  const edit = { document: 'part.firmament', revision: '1', text: 'candidate source', changed: true, edit: { start: 0, length: 8, replacement: 'candidate source' }, nodes: ['Part/Stock'], warnings: [] };
  const runtime = { edit: vi.fn().mockResolvedValue(edit), preview: vi.fn().mockResolvedValue({ model: candidate, diagnostics: [] }), outline: vi.fn() } as unknown as CadRuntime;
  const props = { pending: { action: { kind: 'base' as const }, node: 'Part/Stock', revision: 1 }, source: 'accepted', sourceName: 'part.firmament', outline, palette,
    runtime, assembly: null, jointKinds: ['Fixed'], selection: null, documents: {}, root: 'part.firmament', onCancel: vi.fn(), onSketch: vi.fn(), onPreview: vi.fn(), onApply: vi.fn() };
  const view = render(<AuthoringPanel {...props} />); return { props, view, candidate, edit, runtime };
};

describe('pending source transactions', () => {
  it('requires an admitted preview before Apply and commits exactly its compiler edit', async () => {
    const { props, edit, runtime } = mount();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Preview admitted. Working source has not changed.');
    expect(runtime.preview).toHaveBeenCalledWith('candidate source', 'part.firmament', 1, { 'part.firmament': 'candidate source' });
    expect(props.onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(props.onApply).toHaveBeenCalledExactlyOnceWith(edit, 'Choose base shape');
  });
  it('keeps the working source untouched when geometry admission rejects a replacement', async () => {
    const { runtime, props } = mount();
    vi.mocked(runtime.preview).mockResolvedValue({ model: null, diagnostics: [{ severity: 'error', code: 'unsupported-host', message: 'Existing holes need a Box host' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Existing holes need a Box host');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled(); expect(props.onApply).not.toHaveBeenCalled();
  });
  it('invalidates and disposes a preview as soon as its controls change', async () => {
    const { candidate } = mount(); fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Preview admitted. Working source has not changed.');
    fireEvent.change(screen.getByLabelText('Base shape'), { target: { value: 'cylinder' } });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled(); expect(candidate.dispose).toHaveBeenCalledOnce();
  });
  it('disposes a late preview after cancellation and never displays it', async () => {
    const { runtime, view, props, candidate } = mount();
    let finish!: (value: { model: ModelSession; diagnostics: [] }) => void;
    vi.mocked(runtime.preview).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(runtime.preview).toHaveBeenCalled()); view.unmount(); finish({ model: candidate, diagnostics: [] });
    await waitFor(() => expect(candidate.dispose).toHaveBeenCalledOnce());
    expect(props.onPreview).not.toHaveBeenCalledWith(candidate); expect(props.onApply).not.toHaveBeenCalled();
  });
});
