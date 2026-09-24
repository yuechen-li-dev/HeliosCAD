import { describe, expect, it, vi } from 'vitest';
import type { ModelSession } from '@aetheris/cad';
import { AetherisWorkerClient } from './AetherisWorkerClient';
import type { CadRuntime, OpenResult } from './CadRuntime';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}

describe('AetherisWorkerClient', () => {
  it('runs one build and retains only the newest pending source revision', async () => {
    const first = deferred<OpenResult>();
    const runtime = { session: () => null, open: vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockResolvedValue({ model: { source: 'N+2' } as ModelSession, diagnostics: [] }) } as unknown as CadRuntime;
    const client = new AetherisWorkerClient(runtime);
    const n = client.submit('N', 'model.firmament', 10);
    const n1 = client.submit('N+1', 'model.firmament', 11);
    const n2 = client.submit('N+2', 'model.firmament', 12);
    expect((await n1).status).toBe('superseded');
    first.resolve({ model: { source: 'N' } as ModelSession, diagnostics: [] });
    expect((await n).request.sourceRevision).toBe(10);
    expect((await n2).status).toBe('completed');
    expect(runtime.open).toHaveBeenCalledTimes(2);
    expect(runtime.open).toHaveBeenLastCalledWith('N+2', 'model.firmament', 12);
  });
});
