import { mkdir, readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { bracketSource } from '../src/sdk/samples.ts';

const helios = resolve(import.meta.dirname, '..');
const aetheris = resolve(helios, '../Aetheris');
const hashSource = (source: string) => createHash('sha256').update(source.replaceAll('\r\n', '\n')).digest('hex');
const projects: Record<string, { origin: string; documents?: string[] }> = {
  bolt: { origin: 'fixtures/Thread', documents: ['hexbolt-showcase.firmament'] },
  atlas: { origin: 'fixtures/Canonical/AssemblyInterfaces/IndustrialAtlas' },
  guitar: { origin: 'fixtures/Canonical/AssemblyInterfaces/GuitarX0' },
  house: { origin: 'fixtures/Canonical/Scene/WarmModernHouse' },
  'spur-gear': { origin: 'fixtures/Canonical/Gears', documents: ['spur-basic.firmament'] },
  'turned-shaft': { origin: 'fixtures/Canonical/Revolve', documents: ['stepped-shaft.firmament'] },
  'seated-fastener': {
    origin: 'fixtures/Regression/CodeNativeAssembly',
    documents: ['assembly.firmasm', 'bracket.firmament', 'fastener-library.firmament'],
  },
  'perforated-cup': { origin: 'fixtures/Canonical/Perforation', documents: ['cylindrical-staggered-32.firmament'] },
  'twisted-sleeve': { origin: 'fixtures/Canonical/SectionChain', documents: ['hollow-loft-twist.firmament'] },
};
const local = [
  { project: 'basic-bracket', document: 'bracket.firmament' },
  { project: 'paperclip', document: 'paperclip.firmament', adaptedFrom: 'fixtures/Canonical/WireForm/paperclip.firmament' },
  { project: 'checked-plate', document: '05-checked-plate.firmament', adaptedFrom: 'fixtures/Canonical/Learn/05-checked-plate.firmament' },
  { project: 'rounded-tray', document: 'rounded-tray.firmament', adaptedFrom: 'fixtures/Canonical/Hollow/rounded-tray.firmament' },
  { project: 'machined-block', document: '03-machined-block.firmament', adaptedFrom: 'fixtures/Canonical/Learn/03-machined-block.firmament' },
  { project: 'bearing-mount', document: 'showcase-bearing-mount.firmament', adaptedFrom: 'fixtures/Canonical/PMI/showcase-bearing-mount.firmament' },
];
const manifest: { project: string; origin: string; document: string; sha256: string; adaptedFrom?: string }[] = [];
for (const [project, { origin, documents }] of Object.entries(projects)) {
  const destination = join(helios, 'fixtures/showcase', project);
  await mkdir(destination, { recursive: true });
  const files = documents ?? (await readdir(join(aetheris, origin))).filter(name => /\.(firmament|firmasm)$/.test(name)).sort();
  for (const document of files) {
    const source = join(aetheris, origin, document);
    const content = await readFile(source, 'utf8');
    await copyFile(source, join(destination, document));
    manifest.push({ project, origin: `${origin}/${document}`, document, sha256: hashSource(content) });
  }
}
await writeFile(join(helios, 'fixtures/showcase/bracket/bracket.firmament'), bracketSource);
manifest.push({ project: 'bracket', origin: 'HeliosCAD/src/sdk/samples.ts#bracketSource', document: 'bracket.firmament', sha256: hashSource(bracketSource) });
for (const { project, document, adaptedFrom } of local) {
  const starter = `fixtures/showcase/${project}/${document}`;
  manifest.push({ project, origin: `HeliosCAD/${starter}`, document, sha256: hashSource(await readFile(join(helios, starter), 'utf8')), adaptedFrom });
}
await writeFile(join(helios, 'fixtures/showcase/provenance.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Synced ${manifest.length} canonical source documents. Thumbnails have separate render provenance.`);
