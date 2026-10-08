import { mkdir, readdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { bracketSource } from '../src/sdk/samples.ts';

const helios = resolve(import.meta.dirname, '..');
const aetheris = resolve(helios, '../Aetheris');
const projects = {
  bolt: 'fixtures/Thread', atlas: 'fixtures/Canonical/AssemblyInterfaces/IndustrialAtlas',
  guitar: 'fixtures/Canonical/AssemblyInterfaces/GuitarX0', house: 'fixtures/Canonical/Scene/WarmModernHouse',
};
const manifest: { project: string; origin: string; document: string; sha256: string }[] = [];
for (const [project, origin] of Object.entries(projects)) {
  const destination = join(helios, 'fixtures/showcase', project);
  await mkdir(destination, { recursive: true });
  const files = (await readdir(join(aetheris, origin))).filter(name => project === 'bolt' ? name === 'hexbolt-showcase.firmament' : /\.(firmament|firmasm)$/.test(name)).sort();
  for (const document of files) {
    const source = join(aetheris, origin, document);
    await copyFile(source, join(destination, document));
    manifest.push({ project, origin: `${origin}/${document}`, document, sha256: createHash('sha256').update(await readFile(source)).digest('hex') });
  }
}
await mkdir(join(helios, 'fixtures/showcase/bracket'), { recursive: true });
await writeFile(join(helios, 'fixtures/showcase/bracket/bracket.firmament'), bracketSource);
manifest.push({ project: 'bracket', origin: 'HeliosCAD/src/sdk/samples.ts#bracketSource', document: 'bracket.firmament', sha256: createHash('sha256').update(bracketSource).digest('hex') });
await writeFile(join(helios, 'fixtures/showcase/provenance.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Synced ${manifest.length} canonical source documents. Thumbnails have separate render provenance.`);
