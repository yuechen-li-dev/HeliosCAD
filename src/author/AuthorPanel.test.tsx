import 'fake-indexeddb/auto';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthorPanel } from './AuthorPanel';
import { request } from '../cloud/api';
import { authorStatus } from '../test/authorStatus';

vi.mock('../cloud/api', async () => ({ request: vi.fn().mockResolvedValue((await import('../test/authorStatus')).authorStatus()) }));
describe('AI author presentation', () => {
  it('enables only configured providers and retains user intent when switching', async () => {
    const status = authorStatus(); status.providers[1].configured = true;
    vi.mocked(request).mockResolvedValueOnce(status);
    render(<AuthorPanel workspace={{ id: 'mixed', snapshot: vi.fn(), apply: vi.fn() }} requirements="Keep interfaces" onRequirementsChange={vi.fn()} onCheckpoint={vi.fn()} restoredRevision={0} onBusyChange={vi.fn()} />);
    await screen.findByRole('option', { name: 'Claude' });
    fireEvent.change(screen.getByLabelText('Engineering intent'), { target: { value: 'Inspect the part' } });
    expect(screen.getByRole('button', { name: 'Run agent' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('AI provider'), { target: { value: 'anthropic' } });
    expect(screen.getByRole('button', { name: 'Run agent' })).toBeEnabled();
    expect(screen.getByText('Claude · server credentials')).toBeVisible();
    fireEvent.change(screen.getByLabelText('AI provider'), { target: { value: 'gemini' } });
    expect(screen.getByRole('button', { name: 'Run agent' })).toBeDisabled();
    expect(screen.getByLabelText('Engineering requirements')).toHaveValue('Keep interfaces');
  });
  it('offers the three real model ids and reports missing configuration without simulating a response', async () => {
    const workspace = { id: crypto.randomUUID(), snapshot: () => ({ revision: 0, project: { root: 'part.firmament', documents: { 'part.firmament': 'Model Part {}' } } }), apply: vi.fn() };
    render(<AuthorPanel workspace={workspace} requirements="" onRequirementsChange={vi.fn()} onCheckpoint={vi.fn()} restoredRevision={0} onBusyChange={vi.fn()} />);
    await screen.findByText(/Configure OPENAI_API_KEY/);
    expect(screen.getByRole('option', { name: 'GPT-6 Astra' })).toHaveValue('gpt-6-astra');
    expect(screen.getByRole('option', { name: 'GPT-6.1 Sol' })).toHaveValue('gpt-6.1-sol');
    expect(screen.getByRole('option', { name: 'GPT-6 Luna' })).toHaveValue('gpt-6-luna');
    fireEvent.change(screen.getByRole('textbox', { name: 'Engineering intent' }), { target: { value: 'Make a plate' } });
    expect(screen.getByRole('button', { name: 'Run agent' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save checkpoint' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Checkpoints/)).not.toBeInTheDocument();
    expect(workspace.apply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('AI provider'), { target: { value: 'anthropic' } });
    expect(screen.getByRole('option', { name: 'Claude Opus 5.5' })).toHaveValue('claude-opus-5-5');
    expect(screen.getByText(/Configure ANTHROPIC_API_KEY/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Run agent' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('AI provider'), { target: { value: 'gemini' } });
    expect(screen.getByRole('option', { name: 'Gemini 4 Argon' })).toHaveValue('gemini-4-argon');
    expect(screen.getByText(/Configure GEMINI_API_KEY/)).toBeVisible();
    expect(screen.getByLabelText('Engineering intent')).toHaveValue('Make a plate');
    expect(screen.getByRole('button', { name: 'Run agent' })).toBeDisabled();
  });
});
