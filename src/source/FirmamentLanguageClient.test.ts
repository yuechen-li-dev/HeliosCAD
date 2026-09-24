import { describe, expect, it, vi } from 'vitest';
import type { LanguageCompletion } from '@aetheris/cad';
import type { CadRuntime } from '../sdk/CadRuntime';
import { FirmamentLanguageClient } from './FirmamentLanguageClient';

describe('FirmamentLanguageClient revisions', () => {
  it('discards a late response after the source changes', async () => {
    let resolve!: (value: LanguageCompletion) => void;
    const pending = new Promise<LanguageCompletion>(done => { resolve = done; });
    const runtime = { complete: vi.fn(() => pending) } as unknown as CadRuntime;
    const client = new FirmamentLanguageClient(runtime);
    client.update('Helix H {', 'test.firmament', null, null);
    const request = client.complete('Helix H {', 9);
    client.update('Helix H {\nRadius:', 'test.firmament', null, null);
    resolve({ document: 'test.firmament', revision: '1', context: 'Helix', replaceStart: 9, replaceLength: 0, fields: [], missingRequiredFields: [] });
    expect(await request).toBeNull();
  });
});
