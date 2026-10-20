import 'fake-indexeddb/auto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkspacePanels } from './WorkspacePanels';
import { Checkpoints } from '../version-control/checkpoints';
import { AgentWorkspace, runAgent } from '../author/agentWorkspace';
import type { ProjectSnapshot } from './projectSnapshot';

vi.mock('../cloud/api', async () => ({ request: vi.fn().mockResolvedValue((await import('../test/authorStatus')).authorStatus(true)) }));
vi.mock('../author/agentWorkspace', async importOriginal => ({
  ...await importOriginal<typeof import('../author/agentWorkspace')>(),
  AgentWorkspace: { create: vi.fn() }, runAgent: vi.fn(),
}));

describe('separate workspace panels', () => {
  it('clears candidates and provider history on model changes, retaining requirements and checkpoints', async () => {
    vi.mocked(runAgent).mockClear();
    const id = crypto.randomUUID();
    const project = { root: 'part.firmament', documents: { 'part.firmament': 'Model Before {}' } };
    const candidate = { ...project, documents: { 'part.firmament': 'Model Candidate {}' } };
    const workspace = { id, snapshot: () => ({ project, revision: 0 }), apply: vi.fn() };
    vi.mocked(AgentWorkspace.create).mockResolvedValueOnce({ project: candidate, built: true, dispose: vi.fn() } as unknown as AgentWorkspace)
      .mockResolvedValueOnce({ project, built: true, dispose: vi.fn() } as unknown as AgentWorkspace);
    vi.mocked(runAgent).mockResolvedValueOnce({ text: 'First model answer', tokens: 1, transcript: [{ type: 'reasoning', encrypted_content: 'old-provider-history' }] })
      .mockResolvedValueOnce({ text: 'Claude answer', tokens: 2, transcript: [] });
    const view = render(<WorkspacePanels workspace={workspace} active="llm" />);
    await screen.findByRole('option', { name: 'Claude' });
    fireEvent.change(screen.getByLabelText('Engineering requirements'), { target: { value: 'Keep holes' } });
    fireEvent.click(screen.getByLabelText('Apply changes after a successful build'));
    fireEvent.change(screen.getByLabelText('Engineering intent'), { target: { value: 'Make candidate' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run agent' }));
    await screen.findByRole('button', { name: 'Apply candidate' });
    fireEvent.change(screen.getByLabelText('AI provider'), { target: { value: 'anthropic' } });
    expect(screen.queryByRole('button', { name: 'Apply candidate' })).not.toBeInTheDocument();
    expect(screen.queryByText(/First model answer/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Engineering requirements')).toHaveValue('Keep holes');
    fireEvent.change(screen.getByLabelText('Engineering intent'), { target: { value: 'Inspect instead' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run agent' }));
    await screen.findByText(/Claude answer/);
    expect(vi.mocked(runAgent).mock.calls[1][2]).toBe('claude-opus-5-5');
    expect(vi.mocked(runAgent).mock.calls[1][4]).toEqual([{ role: 'user', content: 'Inspect instead' }]);
    expect(workspace.apply).not.toHaveBeenCalled();
    view.rerender(<WorkspacePanels workspace={workspace} active="version-control" />);
    expect(screen.getAllByRole('button', { name: 'Restore Before AI task' })).toHaveLength(2);
    vi.mocked(runAgent).mockClear();
  });
  it('saves full projects and requirements, restores invalid drafts, and keeps later states available', async () => {
    const id = crypto.randomUUID(), history = new Checkpoints();
    const early = { root: 'root.firmasm', documents: { 'root.firmasm': 'invalid draft', 'rod.firmament': 'Model Early {}' } };
    let project = { root: 'root.firmasm', documents: { 'root.firmasm': 'Assembly Later {}', 'rod.firmament': 'Model Later {}' } };
    let revision = 3;
    await history.save(id, 'Early', early, undefined, 'Original requirements');
    await history.save(id, 'Later', project, undefined, 'Later requirements');
    const apply = vi.fn(async (next: ProjectSnapshot, expectedRevision: number) => {
      expect(expectedRevision).toBe(revision);
      project = structuredClone(next) as typeof project; revision++;
      return next.documents[next.root] !== 'invalid draft';
    });
    const workspace = { id, snapshot: () => ({ project, revision }), apply };
    const view = render(<WorkspacePanels workspace={workspace} active="llm" />);
    fireEvent.change(screen.getByLabelText('Engineering requirements'), { target: { value: 'Keep all modules' } });
    fireEvent.change(screen.getByLabelText('Engineering intent'), { target: { value: 'My next request' } });
    view.rerender(<WorkspacePanels workspace={workspace} active="version-control" />);
    expect(screen.getByRole('region', { name: 'Version Control' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'AI Author' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save checkpoint' }));
    await screen.findByRole('button', { name: 'Restore Manual checkpoint' });
    const manual = (await history.list(id)).find(c => c.title === 'Manual checkpoint')!;
    expect(manual.project).toEqual(project);
    expect(manual.requirements).toBe('Keep all modules');
    fireEvent.click(screen.getByRole('button', { name: 'Restore Early' }));
    await screen.findByText(/This draft does not build/);
    expect(project).toEqual(early);
    expect(screen.getByLabelText('Engineering requirements')).toHaveValue('Original requirements');
    expect((await history.list(id)).some(c => c.title === 'Before restore' && c.project.documents['rod.firmament'] === 'Model Later {}')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Restore Later' }));
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(2));
    await screen.findByRole('button', { name: 'Restore Restored Later' });
    expect(project.documents['rod.firmament']).toBe('Model Later {}');
    view.rerender(<WorkspacePanels workspace={workspace} active="llm" />);
    expect(screen.getByLabelText('Engineering intent')).toHaveValue('My next request');
    expect(screen.getByLabelText('Engineering requirements')).toHaveValue('Later requirements');
  });

  it('shows automatic agent checkpoints in Version Control and locks restore until the task finishes', async () => {
    const id = crypto.randomUUID();
    let project = { root: 'part.firmament', documents: { 'part.firmament': 'Model Before {}' } }, revision = 0;
    const next = { root: project.root, documents: { 'part.firmament': 'Model After {}' } };
    const sandbox = { project: next, built: true, dispose: vi.fn() };
    vi.mocked(AgentWorkspace.create).mockResolvedValueOnce(sandbox as unknown as AgentWorkspace);
    let complete!: (result: Awaited<ReturnType<typeof runAgent>>) => void;
    vi.mocked(runAgent).mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
    const apply = vi.fn(async (next: ProjectSnapshot) => { project = next as typeof project; revision++; return true; });
    const workspace = { id, snapshot: () => ({ project, revision }), apply };
    const view = render(<WorkspacePanels workspace={workspace} active="llm" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run agent' })).toBeDisabled());
    fireEvent.change(screen.getByLabelText('Engineering intent'), { target: { value: 'Update part' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Run agent' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Run agent' }));
    await waitFor(() => expect(runAgent).toHaveBeenCalledOnce());
    view.rerender(<WorkspacePanels workspace={workspace} active="version-control" />);
    expect(screen.getByRole('button', { name: 'Restore Before AI task' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save checkpoint' })).toBeDisabled();
    await act(async () => complete({ text: 'Updated the part.', tokens: 15, transcript: [] }));
    await screen.findByRole('button', { name: 'Restore AI changes applied' });
    expect(apply).toHaveBeenCalledOnce();
    expect(sandbox.dispose).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Restore Before AI task' })).toBeEnabled();
    view.rerender(<WorkspacePanels workspace={workspace} active="llm" />);
    expect(screen.getByText(/Updated the part/)).toBeVisible();
    view.rerender(<WorkspacePanels workspace={workspace} active="version-control" />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore Before AI task' }));
    await screen.findByRole('button', { name: 'Restore Restored Before AI task' });
    expect(project.documents['part.firmament']).toBe('Model Before {}');
    expect(screen.queryByText(/Updated the part/)).not.toBeInTheDocument();
  });
});
