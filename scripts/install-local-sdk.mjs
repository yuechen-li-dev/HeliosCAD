import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const helios = resolve(import.meta.dirname, '..');
const sdk = resolve(helios, '..', 'Aetheris', 'Aetheris.Web.Runtime', 'sdk');
const telos = resolve(helios, '..', 'Aetheris', 'Aetheris.Web.Runtime', 'telos');
const production = process.argv.includes('--production');
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('Run npm run sdk:link (or sdk:install) from HeliosCAD.');

// A directory dependency is a link to this checkout. Rebuild in place: no local
// tarball checksum, stale same-version package cache, or copied runtime tree.
run(['run', production ? 'build:production' : 'build'], sdk);
run(['ci'], telos);
run(['run', 'build'], telos);
run(['install'], helios);

function run(args, cwd) {
  const result = spawnSync(process.execPath, [npmCli, ...args], { cwd, stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
