import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const helios = resolve(import.meta.dirname, '..');
const repo = resolve(helios, '..', 'Aetheris');
const sdk = resolve(repo, 'Aetheris.Web.Runtime', 'sdk');
const output = resolve(repo, 'artifacts', 'local', 'helios-sdk');
const production = process.argv.includes('--production');
await mkdir(output, { recursive: true });

run('npm', ['run', production ? 'build:production' : 'build'], sdk);
run('npm', ['pack', '--pack-destination', output], sdk);
const packages = (await readdir(output)).filter(name => name.endsWith('.tgz')).sort();
if (!packages.length) throw new Error('The local @aetheris/cad pack did not produce a tarball.');
// The tarball keeps its preview version across local builds; a plain install
// can retain an older node_modules copy even when its contents changed.
run('npm', ['install', resolve(output, packages.at(-1)), '--force'], helios);
// npm can retain the previous contents of a file: dependency at the same
// preview version. Sync the exact build output and remove stale fingerprints.
const installedDist = resolve(helios, 'node_modules', '@aetheris', 'cad', 'dist');
await rm(installedDist, { recursive: true, force: true });
await cp(resolve(sdk, 'dist'), installedDist, { recursive: true });

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
