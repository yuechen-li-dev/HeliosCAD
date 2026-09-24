import { readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const aetheris = resolve(import.meta.dirname, '..', '..', 'Aetheris');
const production = process.argv.includes('--production');
const packaged = join(import.meta.dirname, '..', 'node_modules', '@aetheris', 'cad', 'dist');
const rows = [];
for (const variant of ['current', 'aot']) {
  const root = production
    ? join(packaged, variant === 'current' ? 'runtime/_framework' : 'runtime-aot/_framework')
    : join(aetheris, 'artifacts/local/web-perf', `${variant}-publish/wwwroot/_framework`);
  const script = await readFile(join(root, 'dotnet.js'), 'utf8');
  const start = script.indexOf('/*json-start*/');
  const end = script.indexOf('/*json-end*/');
  if (start < 0 || end < start) throw new Error(`${variant} publish has no embedded runtime manifest.`);
  const manifest = JSON.parse(script.slice(start + '/*json-start*/'.length, end));
  const names = new Set(['dotnet.js']);
  for (const resources of Object.values(manifest.resources))
    if (Array.isArray(resources)) for (const resource of resources) if (resource.name) names.add(resource.name);
  const size = { raw: 0, brotli: 0, gzip: 0 };
  for (const name of names) {
    size.raw += (await stat(join(root, name))).size;
    for (const [suffix, key] of [['.br', 'brotli'], ['.gz', 'gzip']]) {
      try { size[key] += (await stat(join(root, name + suffix))).size; }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }
  const nativeWasm = manifest.resources.wasmNative[0].name;
  rows.push({ variant, referencedAssets: names.size, bytes: size,
    nativeWasmBytes: (await stat(join(root, nativeWasm))).size, nativeWasm });
}
const output = join(aetheris, production ? 'artifacts/local/web-perf-assets-x1.json' : 'artifacts/local/web-perf-assets.json');
await writeFile(output, JSON.stringify(rows, null, 2) + '\n');
console.log(output);
