import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LanguageOutline, ModelSession, PaletteItem, SelectionDescription } from '@aetheris/cad';
import type { PlacementActions } from '../viewport/featurePlacement';
import type { CadRuntime } from '../sdk/CadRuntime';
import { fakeModel } from '../test/fakes';
import { AuthoringPanel } from './AuthoringPanel';

const outline: LanguageOutline = { version: 'firmament-outline/1', document: 'part.firmament', revision: '1', edges: [], externals: [], diagnostics: [], nodes: [
  { id: 'Part', name: 'Part', kind: 'Model', variant: null, modifiers: [], occurrence: false, parentId: null, order: 0, span: { start: 0, length: 100 }, nameSpan: null, schemaId: null, parameters: [], fields: [], children: ['Part/Stock'] },
  { id: 'Part/Stock', name: 'Stock', kind: 'Box', variant: null, modifiers: [], occurrence: false, parentId: 'Part', order: 0, span: { start: 10, length: 80 }, nameSpan: null, schemaId: null, parameters: [], fields: [], children: [] },
] };
const palette: PaletteItem[] = [{ id: 'box', label: 'Box', category: 'Bodies', description: '', placement: 'model', nameStem: 'Block', source: 'Box Block {}', requiresEmptyModel: true },
  { id: 'cylinder', label: 'Cylinder', category: 'Bodies', description: '', placement: 'model', nameStem: 'Bar', source: 'Cylinder Bar {}', requiresEmptyModel: true }];
const mount = async () => {
  const candidate = fakeModel({ dispose: vi.fn(async () => {}) });
  const edit = { document: 'part.firmament', revision: '1', text: 'candidate source', changed: true, edit: { start: 0, length: 8, replacement: 'candidate source' }, nodes: ['Part/Stock'], warnings: [] };
  const runtime = { edit: vi.fn().mockResolvedValue(edit), preview: vi.fn().mockResolvedValue({ model: candidate, diagnostics: [] }),
    outline: vi.fn().mockResolvedValue({ ...outline, nodes: [{ ...outline.nodes[1], fields: [] }] }) } as unknown as CadRuntime;
  const props = { pending: { action: { kind: 'base' as const }, node: 'Part/Stock', revision: 1 }, source: 'Model Part { Box Stock {} }', sourceName: 'part.firmament', outline, palette,
    runtime, assembly: null, jointKinds: ['Fixed'], selection: null, documents: {}, root: 'part.firmament', onCancel: vi.fn(), onSketch: vi.fn(), onPreview: vi.fn(), onApply: vi.fn() };
  const view = render(<AuthoringPanel {...props} />);
  await waitFor(() => expect(screen.queryByText('Preparing field controls…')).not.toBeInTheDocument());
  return { props, view, candidate, edit, runtime };
};

describe('pending source transactions', () => {
  it('retains a viewport click made before the compiler supplies hole dimensions', async () => {
    let finish!: (value: LanguageOutline) => void;
    const runtime = { outline: vi.fn().mockReturnValue(new Promise<LanguageOutline>(resolve => { finish = resolve; })), edit: vi.fn(), preview: vi.fn() } as unknown as CadRuntime;
    const placementRef: { current: PlacementActions | null } = { current: null };
    const onPlacementGuide = vi.fn();
    const item: PaletteItem = { id: 'countersink', label: 'Countersunk hole', category: 'Holes', description: '', placement: 'feature', nameStem: 'Sink',
      source: 'Hole<Countersink> Sink { Diameter: 6mm CountersinkDiameter: 8mm }' };
    const selection: SelectionDescription = { occurrenceId: 'Stock', semanticEntityId: 'Stock', faceId: 'face:1', definitionId: 'Stock', semanticTopologyId: null,
      topologyKind: 'Face', outputRole: null, originFeature: null, selector: 'face(Stock.Side("support"))', sourceAddressability: 'DerivedStable', selectorReason: null,
      source: null, buildRevision: 0, sourceAddressable: true,
      support: { origin: [0,0,0], x: [1,0,0], y: [0,1,0], normal: [0,0,1], boundary: [[0,0],[30,0],[30,30],[0,30]] } };
    const view = render(<AuthoringPanel pending={{ action: { kind: 'feature', item }, node: 'Part/Stock', revision: 1 }} source="Model Part { Box Stock {} }"
      sourceName="part.firmament" outline={outline} palette={[...palette, item]} runtime={runtime} assembly={null} jointKinds={['Fixed']} selection={null}
      documents={{}} root="part.firmament" onCancel={vi.fn()} onSketch={vi.fn()} onPreview={vi.fn()} onApply={vi.fn()}
      placementRef={placementRef} onPlacementGuide={onPlacementGuide} />);
    act(() => placementRef.current!.place(selection, [10,12,0]));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const fields = ['Diameter', 'CountersinkDiameter'].map((name, i) => ({ name, text: i ? '8mm' : '6mm', shape: 'quantity' as const, span: { start: i * 10, length: 3 }, valueSpan: { start: i * 10, length: 3 } }));
    await act(async () => finish({ ...outline, nodes: [{ ...outline.nodes[1], kind: 'Hole', variant: 'Countersink', fields }] }));
    await waitFor(() => expect(onPlacementGuide).toHaveBeenCalledWith(expect.objectContaining({ selection, center: [10,12], diameter: 8 })));
    expect(screen.getByRole('spinbutton', { name: 'Center X' })).toHaveValue(10);
    view.unmount();
  });
  it('requires an admitted preview before Apply and commits exactly its compiler edit', async () => {
    const { props, edit, runtime } = await mount();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Preview admitted. Working source has not changed.');
    expect(runtime.preview).toHaveBeenCalledWith('candidate source', 'part.firmament', 1, { 'part.firmament': 'candidate source' });
    expect(props.onApply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(props.onApply).toHaveBeenCalledExactlyOnceWith(edit, 'Choose base shape');
  });
  it('keeps the working source untouched when geometry admission rejects a replacement', async () => {
    const { runtime, props } = await mount();
    vi.mocked(runtime.preview).mockResolvedValue({ model: null, diagnostics: [{ severity: 'error', code: 'unsupported-host', message: 'Existing holes need a Box host' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Existing holes need a Box host');
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled(); expect(props.onApply).not.toHaveBeenCalled();
  });
  it('invalidates and disposes a preview as soon as its controls change', async () => {
    const { candidate } = await mount(); fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await screen.findByText('Preview admitted. Working source has not changed.');
    fireEvent.change(screen.getByLabelText('Base shape'), { target: { value: 'cylinder' } });
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled(); expect(candidate.dispose).toHaveBeenCalledOnce();
  });
  it('disposes a late preview after cancellation and never displays it', async () => {
    const { runtime, view, props, candidate } = await mount();
    let finish!: (value: { model: ModelSession; diagnostics: [] }) => void;
    vi.mocked(runtime.preview).mockReturnValue(new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(runtime.preview).toHaveBeenCalled()); view.unmount(); finish({ model: candidate, diagnostics: [] });
    await waitFor(() => expect(candidate.dispose).toHaveBeenCalledOnce());
    expect(props.onPreview).not.toHaveBeenCalledWith(candidate); expect(props.onApply).not.toHaveBeenCalled();
  });
});
