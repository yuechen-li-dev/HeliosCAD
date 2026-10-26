import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runLocalAgent } from './localAgent';
import type { AgentWorkspace } from './agentWorkspace';

vi.mock('../cloud/api', () => ({ request: vi.fn().mockResolvedValue({ ticket: 'one-time' }) }));
vi.mock('./engineeringEvidence', () => ({ projectHashes: vi.fn().mockResolvedValue({ 'part.firmament': 'hash' }) }));

class Socket {
  static OPEN = 1; static latest: Socket;
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: Record<string, unknown>[] = [];
  close = vi.fn();
  constructor() { Socket.latest = this; queueMicrotask(() => this.onopen?.()); }
  send(value: string) { this.sent.push(JSON.parse(value)); }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
const workspace = () => ({ project: { root: 'part.firmament', documents: { 'part.firmament': 'original source' } }, execute: vi.fn().mockResolvedValue({ accepted: true }) }) as unknown as AgentWorkspace;
const gateway = { respond: vi.fn() };
const flush = async () => { await vi.waitFor(() => expect(Socket.latest.sent).toHaveLength(1)); };
describe('installed agent task channel', () => {
  beforeEach(() => { vi.stubGlobal('WebSocket', Socket); });
  it('executes candidate tools and requires explicit completed status', async () => {
    const candidate = workspace(); const answer = vi.fn();
    const result = runLocalAgent(gateway, candidate, 'fixture-model', 'Keep interfaces', [{ role: 'user', content: 'Inspect' }], new AbortController().signal, vi.fn(), answer);
    await flush();
    expect(Socket.latest.sent[0]).toMatchObject({ root: 'part.firmament', requirements: 'Keep interfaces', documentHashes: { 'part.firmament': 'hash' } });
    Socket.latest.receive({ type: 'tool', id: 'c1', name: 'build', arguments: {} });
    await vi.waitFor(() => expect(Socket.latest.sent).toHaveLength(2));
    expect(candidate.execute).toHaveBeenCalledWith('build', {});
    expect(Socket.latest.sent[1]).toMatchObject({ type: 'tool_result', output: { ok: true, result: { accepted: true } } });
    Socket.latest.receive({ type: 'text', text: 'Built.' });
    Socket.latest.receive({ type: 'complete', text: 'Built.' });
    expect(await result).toMatchObject({ text: 'Built.', tokens: null }); expect(answer).toHaveBeenCalledWith('Built.'); expect(Socket.latest.close).toHaveBeenCalled();
  });
  it('cancellation and disconnected or failed tasks cannot resolve as success', async () => {
    const abort = new AbortController();
    const result = runLocalAgent(gateway, workspace(), '', '', [], abort.signal, vi.fn(), vi.fn());
    const rejected = expect(result).rejects.toThrow('stop'); await flush(); abort.abort(new Error('stop')); await rejected;
    expect(Socket.latest.sent.at(-1)).toEqual({ type: 'cancel', reason: 'stop' }); expect(Socket.latest.close).toHaveBeenCalled();
    const failed = runLocalAgent(gateway, workspace(), '', '', [], new AbortController().signal, vi.fn(), vi.fn());
    const failure = expect(failed).rejects.toThrow('quota'); await flush(); Socket.latest.receive({ type: 'error', message: 'quota' }); await failure;
    const disconnected = runLocalAgent(gateway, workspace(), '', '', [], new AbortController().signal, vi.fn(), vi.fn());
    const disconnect = expect(disconnected).rejects.toThrow('disconnected'); await flush(); Socket.latest.onclose?.(); await disconnect;
  });
});
