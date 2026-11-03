import { unpackProject } from '../app/localProject';
import type { ProjectSnapshot } from '../app/projectSnapshot';

/** The exporter transfers locally; a web/cloud URL is never an import authority. */
export function handoffAddress(value: string | null): URL {
  if (!value) throw new Error('The SolidWorks handoff address is missing. Open the saved .helios.zip workspace instead.');
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash
    || !/^\/[a-f0-9]{64}\/workspace\.helios\.zip$/.test(url.pathname)) throw new Error('SolidWorks handoffs must come from the one-use local exporter.');
  return url;
}

export async function receiveSolidWorks(value: string | null, signal?: AbortSignal): Promise<ProjectSnapshot> {
  const url = handoffAddress(value);
  const response = await fetch(url.href, { signal, credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer' });
  if (!response.ok || !response.body) throw new Error('The local handoff expired or was refused. Open the saved .helios.zip workspace, or export again from SolidWorks.');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value: chunk } = await reader.read(); if (done) break;
      if ((size += chunk.length) > 64 * 1024 * 1024) throw new Error('SolidWorks handoff exceeds the 64 MB workspace limit.');
      chunks.push(chunk);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return unpackProject(bytes);
}
