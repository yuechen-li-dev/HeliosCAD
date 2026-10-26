import { describe, expect, it, vi } from 'vitest';
import type { Aetheris } from '@aetheris/cad';
import { AgentWorkspace, runAgent, type AgentGateway } from './agentWorkspace';
import type { ProjectSnapshot } from '../app/projectSnapshot';
import { webcrypto } from 'node:crypto';
import { projectHashes } from './engineeringEvidence';

const project = (): ProjectSnapshot => ({ root: 'part.firmament', documents: { 'part.firmament': 'Model Part { units: mm Box Body { size: [10mm,20mm,30mm] } }', 'module.firmament': 'Struct Module {}' } });
function compiler(accepted = true) {
  const model = { dispose: vi.fn(), tree: { rootId: 'm', nodes: [{ id: 'm', kind: 'Model', name: 'Part', children: [], visible: true }] }, properties: [], mesh: { definitions: [], occurrences: [] }, measure: vi.fn().mockResolvedValue({ accepted: true }) };
  return { compile: vi.fn().mockResolvedValue({ model: accepted ? model : null, diagnostics: [] }), terminate: vi.fn(), language: { outline: vi.fn(), schema: vi.fn(), analyze: vi.fn().mockResolvedValue({ diagnostics: [] }) }, model };
}
describe('agent compiler workspace', () => {
  it('routes registered engineering tools through the gateway and exports only a fresh successful candidate', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const cad = compiler();
    const artifacts = [{ fileName: 'Part.step', mediaType: 'model/step', bytes: new Uint8Array([1]) }];
    Object.assign(cad.model, { exportArtifacts: vi.fn().mockResolvedValue(artifacts) });
    const workspace = new AgentWorkspace(project(), cad as unknown as Aetheris);
    const invoke = vi.fn().mockResolvedValue({ root: project().root, documentHashes: await projectHashes(project()), status: 'draft-for-human-review' });
    const respond = vi.fn().mockResolvedValueOnce({ output: [], text: '', calls: [{ callId: 'c1', name: 'engineering__prepare_review', arguments: '{}' }], inputTokens: 0, outputTokens: 0 })
      .mockResolvedValueOnce({ output: [], text: 'Prepared', calls: [], inputTokens: 0, outputTokens: 0 });
    await runAgent({ respond, invoke }, workspace, 'gpt-6.1-sol', '', [], new AbortController().signal, vi.fn());
    expect(invoke).toHaveBeenCalledOnce();
    await expect(workspace.execute('export_review', { formats: '["step"]' })).rejects.toThrow('Build');
    await workspace.execute('build', {});
    expect(await workspace.execute('export_review', { formats: '["step"]' })).toMatchObject({ approved: false });
    expect(workspace.reviewPackage?.bytes.length).toBeGreaterThan(0);
    await workspace.execute('edit_file', { path: project().root, before: '10mm', after: '20mm' });
    expect(workspace.reviewPackage).toBeNull();
  });
  it('edits only a candidate and requires a fresh successful build for measurements', async () => {
    const original = project(), cad = compiler(), workspace = new AgentWorkspace(original, cad as unknown as Aetheris);
    await workspace.execute('edit_file', { path: original.root, before: '10mm', after: '40mm' });
    expect(original.documents[original.root]).toContain('10mm');
    expect(workspace.project.documents[original.root]).toContain('40mm');
    await expect(workspace.execute('measure', { request: '{}' })).rejects.toThrow('Build');
    expect(await workspace.execute('build', {})).toMatchObject({ accepted: true });
    await workspace.execute('measure', { request: '{}' }); expect(cad.model.measure).toHaveBeenCalledOnce();
    await workspace.execute('edit_file', { path: 'module.firmament', before: 'Module', after: 'Changed' });
    expect(workspace.built).toBe(false); await expect(workspace.execute('measure', { request: '{}' })).rejects.toThrow('Build');
    workspace.dispose(); expect(cad.terminate).toHaveBeenCalledOnce();
  });
  it('does not report a rejected build as an accepted candidate', async () => {
    const workspace = new AgentWorkspace(project(), compiler(false) as unknown as Aetheris);
    expect(await workspace.execute('build', {})).toMatchObject({ accepted: false, status: 'candidate-rejected' }); expect(workspace.built).toBe(false);
  });
  it('terminates an in-flight candidate compiler when the task is cancelled', async () => {
    const abort = new AbortController(), cad = compiler(); let reject!: (error: Error) => void;
    cad.compile.mockReturnValue(new Promise((_resolve, failed) => { reject = failed; }));
    cad.terminate.mockImplementation(() => reject(new Error('Worker terminated')));
    const workspace = new AgentWorkspace(project(), cad as unknown as Aetheris, abort.signal);
    const pending = workspace.execute('build', {}); abort.abort();
    await expect(pending).rejects.toThrow('Worker terminated');
    workspace.dispose(); expect(cad.terminate).toHaveBeenCalledOnce(); expect(workspace.built).toBe(false);
  });
  it('refuses ambiguous edits, foreign paths and unregistered tools', async () => {
    const workspace = new AgentWorkspace(project(), compiler() as unknown as Aetheris);
    await expect(workspace.execute('edit_file', { path: 'part.firmament', before: 'mm', after: 'cm' })).rejects.toThrow('exactly one');
    await expect(workspace.execute('read_file', { path: '../credentials' })).rejects.toThrow('project-relative');
    await expect(workspace.execute('shell', {})).rejects.toThrow('Unknown engineering tool');
    expect(workspace.project).toEqual(project());
  });
  it.each(['openai', 'anthropic', 'gemini'])('keeps %s items and returns actual tool failures for the next model turn', async provider => {
    const workspace = new AgentWorkspace(project(), compiler() as unknown as Aetheris);
    const reasoning = provider === 'openai' ? { type: 'reasoning', encrypted_content: 'opaque' }
      : { type: 'provider_message', provider, message: { signature: 'opaque' } };
    const respond = vi.fn().mockResolvedValueOnce({ output: [reasoning], text: '', calls: [{ callId: 'c1', name: 'read_file', arguments: '{"path":"missing.firmament"}' }], inputTokens: 10, outputTokens: 5 })
      .mockResolvedValueOnce({ output: [], text: 'The requested file is missing.', calls: [], inputTokens: 12, outputTokens: 3 });
    const result = await runAgent({ respond } as AgentGateway, workspace, 'gpt-6.1-sol', '', [{ role: 'user', content: 'inspect' }], new AbortController().signal, vi.fn());
    expect(result.tokens).toBe(30);
    expect(respond.mock.calls[1][3]).toContainEqual(reasoning);
    expect(respond.mock.calls[1][3]).toContainEqual(expect.objectContaining({ call_id: 'c1', output: expect.stringContaining('Document not found') }));
    expect(workspace.project).toEqual(project());
  });
  it('cancels without issuing another provider call or editing the working project', async () => {
    const abort = new AbortController(); abort.abort(); const respond = vi.fn();
    await expect(runAgent({ respond }, new AgentWorkspace(project(), compiler() as unknown as Aetheris), 'gpt-6-astra', '', [], abort.signal, vi.fn())).rejects.toBeDefined();
    expect(respond).not.toHaveBeenCalled();
  });
});
