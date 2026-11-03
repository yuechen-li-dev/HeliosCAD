import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = 'fixtures/branding/aetheris-knot.firmament';
const appearance = 'fixtures/branding/appearance.json';
const cli = resolve(process.env.AETHERIS_CLI ?? '../Aetheris/Aetheris.CLI/bin/Release/net10.0/aetheris.dll');
const output = 'artifacts/local/branding';
const published = 'public/branding';
await mkdir(output, { recursive: true });
await mkdir(published, { recursive: true });
const run = async (name, args) => {
  const result = execFileSync('dotnet', [cli, ...args, '--json'], { encoding: 'utf8' });
  await writeFile(`${output}/${name}.json`, result);
  return JSON.parse(result);
};
await run('validate', ['validate', source]);
await run('inspect', ['asm', 'inspect', source]);
await run('export', ['asm', 'export-glb', source, `${output}/aetheris-knot.glb`, '--materials', appearance]);
const bytes = await readFile(`${output}/aetheris-knot.glb`);
if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Invalid GLB container');
const document = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
if (document.meshes.length !== 1 || document.animations?.length || document.buffers.some(buffer => buffer.uri)) throw new Error('Expected one static, self-contained knot mesh');
const hash = data => createHash('sha256').update(data).digest('hex');
await copyFile(`${output}/aetheris-knot.glb`, `${published}/aetheris-knot.glb`);
await writeFile(`${published}/provenance.json`, JSON.stringify({
  source, sourceSha256: hash(await readFile(source)), appearance, appearanceSha256: hash(await readFile(appearance)),
  asset: 'aetheris-knot.glb', assetSha256: hash(bytes), bytes: bytes.length,
  generator: document.asset.generator, family: 'TorusKnot', p: 3, q: 5, diameterMm: 6,
  majorRadiusMm: 42, minorRadiusMm: 14, animation: 'None in asset; rigid rotation in UI',
}, null, 2) + '\n');
console.log(`Exported ${published}/aetheris-knot.glb (${bytes.length} bytes)`);
