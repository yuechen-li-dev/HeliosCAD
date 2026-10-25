import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const revision = cwd => execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
await writeFile(join(root, 'dist/helios-frontend.json'), JSON.stringify({
  helios: revision(root), aetheris: revision(resolve(root, '../Aetheris')),
  sdk: execFileSync('dotnet', ['--version'], { cwd: resolve(root, '../Aetheris'), encoding: 'utf8' }).trim(),
  node: process.version, mode: 'production-aot'
}, null, 2) + '\n');
