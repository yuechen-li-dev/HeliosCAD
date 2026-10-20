import { zipSync, strToU8 } from 'fflate';
import type { ModelSession } from '@aetheris/cad';
import type { ProjectSnapshot } from '../app/projectSnapshot';

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
export async function projectHashes(project: ProjectSnapshot) {
  return Object.fromEntries(await Promise.all(Object.entries(project.documents).map(async ([path, source]) => [path, await sha256(strToU8(source))])));
}
export interface ReviewManifest { root: string; documentHashes: Record<string, string>; [key: string]: unknown }
export async function reviewZip(project: ProjectSnapshot, manifest: ReviewManifest, artifacts: Awaited<ReturnType<ModelSession['exportArtifacts']>>) {
  const hashes = await projectHashes(project);
  if (manifest.root !== project.root || Object.keys(hashes).length !== Object.keys(manifest.documentHashes).length
      || Object.entries(hashes).some(([path, hash]) => manifest.documentHashes[path] !== hash))
    throw new Error('The review manifest is stale. Prepare it again for the current source.');
  const files: Record<string, Uint8Array> = Object.create(null);
  const add = (path: string, bytes: Uint8Array) => {
    if (path.includes('\\') || path.startsWith('/') || path.includes(':') || path.split('/').some(s => s === '..' || s === '.' || !s)
        || Object.keys(files).some(key => key.toLowerCase() === path.toLowerCase())) throw new Error('Unsafe or duplicate review package filename.');
    // Normalize SDK/worker/TextEncoder views into this realm before fflate's type checks.
    files[path] = Uint8Array.from(bytes);
  };
  for (const [path, source] of Object.entries(project.documents)) add('source/' + path, strToU8(source));
  for (const artifact of artifacts) add('exports/' + artifact.fileName, artifact.bytes);
  add('review.json', strToU8(JSON.stringify({ ...manifest, status: 'draft-for-human-review', approved: false,
    exports: await Promise.all(artifacts.map(async a => ({ name: a.fileName, sha256: await sha256(a.bytes) }))) }, null, 2)));
  return zipSync(files);
}
