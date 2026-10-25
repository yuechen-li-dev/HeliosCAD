import { cp, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { collectNotices } from './collect-standalone-notices.mjs';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'artifacts/local/qualified-frontend');
await mkdir(output, { recursive: true });
await cp(join(root, 'dist'), join(output, 'dist'), { recursive: true });
await cp(resolve(root, '../Aetheris/artifacts/local/helios-sdk/aetheris-cad-2.0.0.tgz'), join(output, 'aetheris-cad-2.0.0.tgz'));
await collectNotices(root, join(output, 'notices'), resolve(root, '../Leviathan'));
