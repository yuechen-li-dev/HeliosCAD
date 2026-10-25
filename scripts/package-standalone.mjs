import { cp, mkdir, readdir, readFile, writeFile, rename, chmod } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync } from 'fflate';
import { collectNotices } from './collect-standalone-notices.mjs';

const root = resolve(import.meta.dirname, '..');
const rid = process.argv[2] ?? ({ win32: 'win-x64', linux: 'linux-x64', darwin: 'osx-arm64' }[process.platform]);
if (!['win-x64', 'linux-x64', 'osx-arm64'].includes(rid)) throw Error('Supported runtimes: win-x64, linux-x64, osx-arm64');
const version = JSON.parse(await readFile(join(root, 'package.json'))).version;
const output = resolve(root, 'artifacts/local/standalone', `${version}-${rid}-${Date.now()}`);
const bundle = join(output, `Helios-${rid}`);
const leviathan = resolve(root, '../Leviathan');
const sources = {};
const pins = JSON.parse(await readFile(join(root, 'standalone-sources.json')));
for (const [name, directory] of Object.entries({ helios: root, leviathan, aetheris: resolve(root, '../Aetheris'), dominatus: resolve(root, '../Dominatus') })) {
  const revision = run('git', ['rev-parse', 'HEAD'], directory, true).trim();
  const dirty = run('git', ['status', '--porcelain'], directory, true).trim();
  if (name !== 'helios' && revision !== pins[name]) throw Error(`${name} differs from standalone-sources.json. Use the pinned source revision or update and requalify the pin.`);
  if (dirty && process.env.HELIOS_ALLOW_DIRTY_PACKAGE !== 'true') throw Error(`${name} has uncommitted changes; commit the qualified sources before making a release bundle.`);
  sources[name] = { revision, dirty: !!dirty };
}
// Refuse a development SDK. Both page-thread LX and AOT Worker assets are required.
await readFile(join(root, 'dist/index.html'));
const frontend = JSON.parse(await readFile(join(root, 'dist/helios-frontend.json')));
if (frontend.helios !== sources.helios.revision || frontend.aetheris !== sources.aetheris.revision || frontend.mode !== 'production-aot')
  throw Error('The frontend was built from different source revisions. Run npm run build after committing the package sources.');
const aot = await readdir(join(root, 'dist/aetheris-runtime-aot/_framework'));
if (!aot.some(file => file.startsWith('dotnet.native.') && file.endsWith('.wasm'))) throw Error('Build the production frontend before packaging.');
await mkdir(bundle, { recursive: true });
run('dotnet', ['publish', 'src/Leviathan.Server', '-c', 'Release', '-r', rid, '--self-contained', 'true', '-p:PublishSingleFile=false', '-p:DebugType=None', '-p:DebugSymbols=false', '-m:1', '-nr:false', '-p:UseSharedCompilation=false', '-o', bundle], leviathan);
const executable = rid.startsWith('win-') ? 'Helios.exe' : 'Helios';
await rename(join(bundle, rid.startsWith('win-') ? 'Leviathan.Server.exe' : 'Leviathan.Server'), join(bundle, executable));
await chmod(join(bundle, executable), 0o755);
await cp(join(root, 'dist'), join(bundle, 'wwwroot'), { recursive: true });
await cp(join(root, 'LICENSE'), join(bundle, 'LICENSE'));
await cp(join(root, 'docs/release/standalone-readme.md'), join(bundle, 'README.md'));
await collectNotices(root, bundle, leviathan);
await writeFile(join(bundle, 'helios-bundle.json'), JSON.stringify({ product: 'Helios', version, runtime: rid, sources, frontend }, null, 2) + '\n');
// Emit inventory, not extra copies of framework/runtime DLLs. No SDK, Node or browser is included.
const inventory = [];
async function files(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name), name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await files(path, name);
    else if (entry.isFile()) {
      if (/^(helios\.toml|running\.json|.*\.db(?:-.*)?)$/i.test(entry.name)
        || (entry.name.endsWith('.pdb') && !name.startsWith('wwwroot/aetheris-runtime/'))) throw Error(`Private/development file in bundle: ${name}`);
      const bytes = await readFile(path); inventory.push({ name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } else throw Error(`Unexpected non-file in bundle: ${name}`);
  }
}
await files(bundle);
await writeFile(join(bundle, 'FILES.json'), JSON.stringify(inventory, null, 2) + '\n');
let archive;
if (rid.startsWith('win-')) {
  const entries = {};
  for (const file of [...inventory.map(file => file.name), 'FILES.json']) entries[`${basename(bundle)}/${file}`] = await readFile(join(bundle, file));
  archive = join(output, `Helios-${version}-${rid}.zip`);
  await writeFile(archive, zipSync(entries, { level: 6 }));
} else {
  if (process.platform === 'win32') throw Error('Package Unix archives on their native runner to preserve executable permissions.');
  archive = join(output, `Helios-${version}-${rid}.tar.gz`);
  run('tar', ['-czf', archive, '-C', output, basename(bundle)], root);
}
const digest = createHash('sha256').update(await readFile(archive)).digest('hex');
await writeFile(join(output, 'SHA256SUMS'), `${digest}  ${basename(archive)}\n`);
await writeFile(resolve(root, 'artifacts/local/standalone/latest.json'), JSON.stringify({ output, bundle, archive, digest }, null, 2));
console.log(JSON.stringify({ output, bundle, archive, digest }, null, 2));

function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit', shell: false });
  if (result.status !== 0) throw Error(`${command} failed (${result.status}): ${capture ? result.stderr : ''}`);
  return result.stdout;
}
