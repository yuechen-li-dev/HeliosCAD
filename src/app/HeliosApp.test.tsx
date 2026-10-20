import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeModel, ok } from '../test/fakes';
import { helixModelSource } from '../commands/sourceAuthoring';

const { runtimeMock } = vi.hoisted(() => ({ runtimeMock: { info: { packageVersion: '2.0.0-preview.3' }, initialize: vi.fn(), restart: vi.fn(), open: vi.fn(), schema: vi.fn(), describeConstruct: vi.fn(), rewriteField: vi.fn(), setSource: vi.fn(), setProperty: vi.fn(), rebuild: vi.fn(), exportSTEP: vi.fn(), exportArtifacts: vi.fn(), dispose: vi.fn(), session: vi.fn() } }));
vi.mock('../sdk/CadRuntime', () => ({ WebSdkCadRuntime: class { constructor() { return runtimeMock; } } }));
vi.mock('../viewport/Viewport', () => ({ Viewport: ({ onSelect, showConcepts }: { onSelect(id: string, face: string): void; showConcepts?: boolean }) => <button data-testid="viewport" data-concepts-visible={showConcepts} onClick={() => onSelect('box:plate', 'face:top')}>Viewport geometry</button> }));

import { HeliosApp } from './HeliosApp';
const model = fakeModel({ sourceName: 'editable-bracket.firmament' });

describe('Helios IDE shell', () => {
  it('separates version history from chat and restores source through the normal build', async () => {
    render(<HeliosApp />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Build' })).toBeEnabled());
    const original = (screen.getByLabelText('Firmament source') as HTMLTextAreaElement).value;
    fireEvent.click(screen.getByRole('tab', { name: 'AI Author' }));
    fireEvent.change(screen.getByLabelText('Engineering requirements'), { target: { value: 'Keep the mounting holes' } });
    fireEvent.change(screen.getByLabelText('Engineering intent'), { target: { value: 'My unsent request' } });
    expect(screen.queryByRole('button', { name: 'Save checkpoint' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Version Control' }));
    expect(screen.getByRole('region', { name: 'Version Control' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save checkpoint' }));
    await screen.findByRole('button', { name: 'Restore Manual checkpoint' });
    fireEvent.change(screen.getByLabelText('Firmament source'), { target: { value: 'Model Changed {}' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restore Manual checkpoint' }));
    await waitFor(() => expect(runtimeMock.setSource).toHaveBeenCalledWith(original, 'editable-bracket.firmament', expect.any(Number), { 'editable-bracket.firmament': original }));
    await screen.findByRole('button', { name: 'Restore Restored Manual checkpoint' });
    expect(screen.getByLabelText('Firmament source')).toHaveValue(original);
    fireEvent.click(screen.getByRole('tab', { name: 'AI Author' }));
    expect(screen.getByLabelText('Engineering intent')).toHaveValue('My unsent request');
    expect(screen.getByLabelText('Engineering requirements')).toHaveValue('Keep the mounting holes');
    expect(screen.queryByRole('region', { name: 'Version Control' })).not.toBeInTheDocument();
  });
  it('refuses a cloud save that would omit module files', async () => {
    const onSave = vi.fn();
    render(<HeliosApp onSave={onSave} initialWorkspace={{ title: 'Modules', root: 'root.firmasm', documents: {
      'root.firmasm': 'Assembly Shared {}', 'part.firmament': 'Model Part {}',
    } }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Build' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Save source' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/Cloud save refused:/)).toBeVisible();
  });
  it('preserves the exporter diagnostic code and returns no failed download', async () => {
    runtimeMock.exportArtifacts.mockRejectedValue(Object.assign(new Error('Drawing family is unsupported'), { code: 'drawing-definition-incomplete' }));
    render(<HeliosApp />);
    const button = await screen.findByRole('button', { name: 'Export ▾' });
    await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Download selected format' }));
    await waitFor(() => expect(screen.getAllByText('drawing-definition-incomplete').length).toBeGreaterThan(0));
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });
  it('downloads the selected formats together with the returned file name', async () => {
    runtimeMock.exportArtifacts.mockResolvedValue([{ fileName: 'WebBracket-exports.zip', mediaType: 'application/zip', bytes: new Uint8Array([80, 75]) }]);
    render(<HeliosApp />);
    const button = await screen.findByRole('button', { name: 'Export ▾' });
    await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    fireEvent.click(screen.getByRole('checkbox', { name: /glTF/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Download ZIP · 2 formats' }));
    await waitFor(() => expect(runtimeMock.exportArtifacts).toHaveBeenCalledWith(['step', 'glb']));
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce());
    expect((vi.mocked(HTMLAnchorElement.prototype.click).mock.instances[0] as HTMLAnchorElement).download).toBe('WebBracket-exports.zip');
  });
  it('rejects export of an invalid changed source instead of downloading the previous model', async () => {
    runtimeMock.setSource.mockResolvedValue({ success: false, diagnostics: [{ severity: 'error', code: 'field-unknown', message: 'Unknown field' }] });
    render(<HeliosApp />);
    const button = await screen.findByRole('button', { name: 'Export ▾' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Firmament source'), { target: { value: 'Model Invalid { bad }' } });
    fireEvent.click(button); fireEvent.click(screen.getByRole('button', { name: 'Download selected format' }));
    await waitFor(() => expect(runtimeMock.setSource).toHaveBeenCalled());
    await waitFor(() => expect(screen.getAllByText(/Unknown field/).length).toBeGreaterThan(0));
    expect(runtimeMock.exportArtifacts).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });
  it('discards an export when the source changes while it is being prepared', async () => {
    let finish!: (files: { fileName: string; mediaType: string; bytes: Uint8Array }[]) => void;
    runtimeMock.exportArtifacts.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    render(<HeliosApp />);
    const button = await screen.findByRole('button', { name: 'Export ▾' });
    await waitFor(() => expect(button).toBeEnabled()); fireEvent.click(button);
    fireEvent.click(screen.getByRole('button', { name: 'Download selected format' }));
    await waitFor(() => expect(runtimeMock.exportArtifacts).toHaveBeenCalledOnce());
    fireEvent.change(screen.getByLabelText('Firmament source'), { target: { value: 'Model Changed {}' } });
    finish([{ fileName: 'old.step', mediaType: 'model/step', bytes: new Uint8Array([1]) }]);
    await waitFor(() => expect(button).toBeEnabled());
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });
  it('toggles retained Concept Struct guides without recompiling or changing the model', async () => {
    const conceptModel = fakeModel({ mesh: { ...model.mesh, definitions: model.mesh.definitions.map(d => ({ ...d, concepts: [
      { id: 'Design.Axis', owner: 'Design', kind: 'Axis', points: [0, 0, 0, 0, 0, 20], provenance: 'compiler' },
    ] })) } });
    runtimeMock.open.mockResolvedValue({ model: conceptModel, diagnostics: [] });
    runtimeMock.session.mockReturnValue(conceptModel);
    render(<HeliosApp />);
    const toggle = screen.getByRole('button', { name: 'Concepts' });
    await waitFor(() => expect(toggle).toBeEnabled());
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('viewport')).toHaveAttribute('data-concepts-visible', 'true');
    fireEvent.click(toggle);
    expect(screen.getByTestId('viewport')).toHaveAttribute('data-concepts-visible', 'false');
    expect(runtimeMock.rebuild).not.toHaveBeenCalled();
  });
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:helios-test'), revokeObjectURL: vi.fn() }); vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined); runtimeMock.open.mockResolvedValue({ model, diagnostics: [] }); runtimeMock.restart.mockResolvedValue(runtimeMock.info); runtimeMock.schema.mockResolvedValue({ version: 'firmament-semantic-schema/1', constructs: [{ id: 'Helix', entry: helixModelSource }] }); runtimeMock.describeConstruct.mockRejectedValue(new Error('No projection in fake model')); runtimeMock.setSource.mockResolvedValue(ok()); runtimeMock.setProperty.mockResolvedValue(ok()); runtimeMock.rebuild.mockResolvedValue(ok()); runtimeMock.exportSTEP.mockResolvedValue(new Uint8Array([1])); runtimeMock.exportArtifacts.mockResolvedValue([{ fileName: 'WebBracket.step', mediaType: 'model/step', bytes: new Uint8Array([1]) }]); runtimeMock.session.mockImplementation(() => runtimeMock.open.mock.calls.length ? model : null); });
  it('shows the active file in the Files dock', async () => { render(<HeliosApp />); await waitFor(() => expect(runtimeMock.open).toHaveBeenCalled()); fireEvent.click(screen.getByRole('tab', { name: 'Files' })); expect(screen.getByRole('region', { name: 'Project explorer' })).toHaveTextContent('editable-bracket.firmament'); expect(screen.getByRole('region', { name: 'Model browser' })).toBeVisible(); });
  it('persists Apollonia', async () => { render(<HeliosApp />); fireEvent.change(screen.getByLabelText('Theme'), { target: { value: 'apollonia' } }); await waitFor(() => expect(localStorage.getItem('helios-theme')).toBe('apollonia')); });
  it('reveals semantic face identity from viewport selection', async () => { render(<HeliosApp />); await waitFor(() => expect(runtimeMock.open).toHaveBeenCalled()); fireEvent.click(screen.getByTestId('viewport')); expect(screen.getByText('Plate', { selector: '.entity-hero strong' })).toBeVisible(); expect(screen.getByText('face:top', { selector: 'dd' })).toBeVisible(); });
  it('inserts a valid box from the palette', async () => { render(<HeliosApp />); await waitFor(() => expect(runtimeMock.open).toHaveBeenCalled()); fireEvent.click(screen.getByRole('button', { name: /Command palette/ })); fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'insert box' } }); fireEvent.click(screen.getByRole('button', { name: /Insert Box/ })); expect((screen.getByLabelText('Firmament source') as HTMLTextAreaElement).value).toContain('Box HeliosBox1 { Size: [30mm, 20mm, 10mm] }'); });
  it('opens a compilable Helix source from the palette', async () => { render(<HeliosApp />); await waitFor(() => expect(runtimeMock.open).toHaveBeenCalled()); fireEvent.click(screen.getByRole('button', { name: /Command palette/ })); fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'helix' } }); fireEvent.click(screen.getByRole('button', { name: /New Helix model/ })); await waitFor(() => expect(runtimeMock.open).toHaveBeenLastCalledWith(expect.stringContaining('Helix Winding'), 'helix.firmament', expect.any(Number), {})); expect((screen.getByLabelText('Firmament source') as HTMLTextAreaElement).value).toContain('WireForm Spring'); });
  it('rebuilds changed source through the SDK session', async () => { render(<HeliosApp />); const source = await screen.findByLabelText('Firmament source'); fireEvent.change(source, { target: { value: 'Model Changed {}' } }); fireEvent.click(screen.getByText('↻ Rebuild')); await waitFor(() => expect(runtimeMock.setSource).toHaveBeenCalledWith('Model Changed {}', 'editable-bracket.firmament', expect.any(Number), {})); });
  it('opens the format picker through the palette', async () => { render(<HeliosApp />); await waitFor(() => expect(runtimeMock.open).toHaveBeenCalled()); fireEvent.click(screen.getByRole('button', { name: /Command palette/ })); fireEvent.click(within(screen.getByRole('dialog', { name: 'Command palette' })).getByRole('button', { name: 'Export model…' })); expect(screen.getByRole('dialog', { name: 'Export formats' })).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: 'Download selected format' })); await waitFor(() => expect(runtimeMock.exportArtifacts).toHaveBeenCalledWith(['step'])); });
  it('exposes Worker restart after a transport failure', async () => { runtimeMock.open.mockRejectedValueOnce(new Error('worker died')); render(<HeliosApp />); fireEvent.click(await screen.findByRole('button', { name: 'Restart worker' })); await waitFor(() => expect(runtimeMock.restart).toHaveBeenCalledOnce()); await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Ready')); });
  it('builds the project root with an edited module and marks only that file unsaved', async () => {
    render(<HeliosApp initialWorkspace={{ title: 'Shared project', root: 'root.firmasm', documents: { 'root.firmasm': 'Assembly Shared {}', 'block.firmament': 'Model Block {}' } }} />);
    await waitFor(() => expect(runtimeMock.open).toHaveBeenCalledWith('Assembly Shared {}', 'root.firmasm', 0, expect.any(Object)));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Build' })).toBeEnabled());
    fireEvent.click(screen.getByRole('tab', { name: 'Files' }));
    const explorer = screen.getByRole('region', { name: 'Project explorer' });
    fireEvent.click(within(explorer).getByRole('button', { name: 'block.firmament' }));
    fireEvent.change(screen.getByLabelText('Firmament source'), { target: { value: 'Model EditedBlock {}' } });
    fireEvent.click(within(explorer).getByRole('button', { name: 'root.firmasm' }));
    expect(within(explorer).getByRole('button', { name: 'root.firmasm' })).not.toHaveTextContent('●');
    expect(within(explorer).getByRole('button', { name: /block.firmament/ })).toHaveTextContent('●');
    fireEvent.click(screen.getByRole('button', { name: 'Build' }));
    await waitFor(() => expect(runtimeMock.open).toHaveBeenLastCalledWith('Assembly Shared {}', 'root.firmasm', 1, { 'root.firmasm': 'Assembly Shared {}', 'block.firmament': 'Model EditedBlock {}' }));
  });
  it('new document commands clear the previous project snapshot', async () => {
    render(<HeliosApp initialWorkspace={{ title: 'Shared project', root: 'root.firmasm', documents: { 'root.firmasm': 'Assembly Shared {}', 'block.firmament': 'Model Block {}' } }} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Build' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /Command palette/ }));
    fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'helix' } });
    fireEvent.click(screen.getByRole('button', { name: /New Helix model/ }));
    await waitFor(() => expect(runtimeMock.open).toHaveBeenLastCalledWith(expect.stringContaining('Helix Winding'), 'helix.firmament', expect.any(Number), {}));
  });
});
