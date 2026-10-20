import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { ProjectSnapshot } from './projectSnapshot';

export const isStep = (name: string) => /\.(step|stp)$/i.test(name);
export const sourceFiles = (documents: Record<string, string>) => Object.keys(documents).filter(name => !isStep(name));
const path = (name: string) => {
  if (!name || /[\\:#?"\x00-\x1f]/.test(name) || name.startsWith('/') || name.split('/').some(p => p === '..' || p === '')) throw new Error(`Invalid workspace path: ${name}`);
  return name;
};
export function importedProject(name: string, text: string): ProjectSnapshot {
  const asset = path(name);
  const model = name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z_]/, '_');
  const root = `${model || 'Imported'}.firmament`;
  return { root, documents: { [asset]: text, [root]: `Model ${model || 'Imported'} {\n    units: mm\n    InlineStep part { path: "${asset}" }\n}\n` } };
}
/** A portable local workspace retains STEP text verbatim alongside its source layer. */
export function packProject(project: ProjectSnapshot): Uint8Array {
  // Normalize TextEncoder output into this realm (also needed in embedded hosts).
  const encode = (text: string) => Uint8Array.from(strToU8(text));
  return zipSync(Object.fromEntries([
    ['helios-workspace.json', encode(JSON.stringify({ schema: 'helios/workspace/1', root: project.root }))],
    ...Object.entries(project.documents).map(([name, text]) => [path(name), encode(text)] as const),
  ]));
}
export function unpackProject(bytes: Uint8Array): ProjectSnapshot {
  // Bound decompression before allocating any individual file, including a hostile ZIP entry.
  let total = 0;
  const entries = unzipSync(bytes, { filter: entry => {
    if (entry.originalSize > 32 * 1024 * 1024 || (total += entry.originalSize) > 64 * 1024 * 1024) throw new Error('Workspace exceeds the 64 MB local import limit.');
    path(entry.name); return true;
  } });
  const manifest = JSON.parse(strFromU8(entries['helios-workspace.json'] ?? new Uint8Array()));
  if (manifest.schema !== 'helios/workspace/1') throw new Error('Unsupported Helios workspace.');
  const documents = Object.fromEntries(Object.entries(entries).filter(([name]) => name !== 'helios-workspace.json').map(([name, data]) => {
    if (!/\.(firmament|firmasm|step|stp)$/i.test(name)) throw new Error(`Unsupported workspace file: ${name}`);
    return [path(name), strFromU8(data)];
  }));
  if (!/\.(firmament|firmasm)$/i.test(manifest.root) || !(manifest.root in documents)) throw new Error('Workspace root is missing.');
  return { root: manifest.root, documents };
}
