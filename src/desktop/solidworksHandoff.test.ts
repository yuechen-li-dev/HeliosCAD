import { describe, expect, it } from 'vitest';
import { handoffAddress } from './solidworksHandoff';

describe('local SolidWorks handoff boundary', () => {
  const path = `/${'a'.repeat(64)}/workspace.helios.zip`;
  it('accepts the exporter capability on an explicit loopback port', () => {
    expect(handoffAddress(`http://127.0.0.1:49123${path}`).port).toBe('49123');
  });
  it('rejects remote URLs, credentials, redirects encoded in queries, and arbitrary local paths', () => {
    for (const url of [null, `https://example.com${path}`, `http://localhost:49123${path}`, `http://127.0.0.1${path}`,
      `http://user@127.0.0.1:49123${path}`, 'http://127.0.0.1:49123/private-file', `http://127.0.0.1:49123${path}?next=https://example.com`]) expect(() => handoffAddress(url)).toThrow();
  });
});
