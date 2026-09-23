import { mkdir, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const helios = resolve(import.meta.dirname, '..');
const repo = resolve(helios, '..', 'Aetheris');
const sdk = resolve(repo, 'Aetheris.Web.Runtime', 'sdk');
const output = resolve(repo, 'artifacts', 'local', 'helios-sdk');
await mkdir(output, { recursive: true });

run('npm', ['run', 'build'], sdk);
run('npm', ['pack', '--pack-destination', output], sdk);
const packages = (await readdir(output)).filter(name => name.endsWith('.tgz')).sort();
if (!packages.length) throw new Error('The local @aetheris/cad pack did not produce a tarball.');
// The tarball keeps its preview version across local builds; a plain install
// can retain an older node_modules copy even when its contents changed.
run('npm', ['install', resolve(output, packages.at(-1)), '--force'], helios);

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
