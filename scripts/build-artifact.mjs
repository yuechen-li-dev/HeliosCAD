// Builds Helios to run as a claude.ai artifact and writes the publish manifest.
//
//   npm run build:artifact
//
// Output (artifacts/local/helios-artifact/):
//   page.html     the artifact page (the host adds <!doctype>, <head> and <body> itself)
//   site/         every file the page loads, at the paths it loads them from
//   publish.json  the Artifact publish arguments: file_path, root, files, capabilities, icon
//
// Needs ../Aetheris next to this checkout, the .NET 10 SDK with the wasm-tools workload, and
// `npm run sdk:link` done once (for the JS SDK and telos packages).
import { cp, mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { extname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'artifacts/local/helios-artifact');
const build = join(out, 'build'), site = join(out, 'site'), runtimePublish = join(out, 'runtime-publish');
// The real path: a symlinked checkout would build its project references twice under two names.
const project = await realpath(resolve(root, '../Aetheris/Aetheris.Web.Runtime/Aetheris.Web.Runtime.csproj'));

// Limits of a claude.ai artifact publish.
const maxFilesPerPublish = 255, maxBinaryBytes = 15 * 1024 * 1024, maxTextBytes = 16 * 1024 * 1024;
// Served by extension; the host infers these types. Others need an explicit served type.
const served = new Set(['.html', '.css', '.js', '.mjs', '.wasm', '.json', '.map', '.txt', '.md', '.csv', '.xml', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.mp3', '.wav', '.ogg', '.mp4', '.webm', '.pdf', '.geojson', '.webmanifest']);
const explicit = { '.wgsl': 'text/plain', '.step': 'text/plain', '.stp': 'text/plain', '.firmament': 'text/plain', '.glb': 'application/wasm' };

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}
async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path)); else files.push(path);
  }
  return files;
}

await rm(out, { recursive: true, force: true });

// 1. The runtime, trimmed (not AOT): one WASM interpreter plus the assemblies actually used.
//    Production's AOT build trims the same way; the trimmed IL starts faster and is a third the size.
run('dotnet', ['publish', project, '-c', 'Release', '-o', runtimePublish, '--nologo', '-m:1', '-nr:false', '-p:UseSharedCompilation=false']);

// 2. The page and its assets, in production mode.
run(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'vite.artifact.config.ts', '--mode', 'artifact']);

// 3. The site: the build without its page, maps or the development runtime, plus the trimmed runtime.
await cp(build, site, { recursive: true, filter: source => !source.endsWith('.map') && relative(build, source) !== 'index.html' && !relative(build, source).startsWith('aetheris-runtime') });
const framework = join(runtimePublish, 'wwwroot/_framework');
await mkdir(join(site, 'aetheris-runtime/_framework'), { recursive: true });
for (const entry of await readdir(framework, { withFileTypes: true }))
  if (entry.isFile() && !/\.(gz|br|pdb|map)$/.test(entry.name)) await cp(join(framework, entry.name), join(site, 'aetheris-runtime/_framework', entry.name));

// 4. The host rejects text containing U+FFFD. Bundled libraries (Monaco) write it literally inside
//    string and template literals, where the � escape means the same character.
for (const file of await walk(site)) {
  if (!/\.(js|mjs|css|json|svg|md|txt|wgsl)$/.test(file)) continue;
  const text = await readFile(file, 'utf8');
  if (!text.includes('�')) continue;
  if (!/\.m?js$/.test(file)) throw new Error(`${relative(site, file)} contains U+FFFD outside JavaScript; escape it by hand.`);
  await writeFile(file, text.replaceAll('�', '\\uFFFD'));
}

// 5. The page: what index.html's <head> and <body> hold, without the document skeleton.
const index = await readFile(join(build, 'index.html'), 'utf8');
const script = index.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
const styles = [...index.matchAll(/<link rel="stylesheet"[^>]*href="([^"]+)"/g)].map(m => m[1]);
if (!script) throw new Error('index.html has no module entry script.');
await writeFile(join(out, 'page.html'), [
  '<title>Aetheris Helios</title>',
  '<link rel="icon" type="image/svg+xml" href="./helios.svg">',
  `<script type="module" crossorigin src="${script}"></script>`,
  ...styles.map(href => `<link rel="stylesheet" crossorigin href="${href}">`),
  '<div id="root"></div>', ''].join('\n'));

// 6. The publish manifest, checked against the host's limits.
const files = [];
let total = 0;
for (const file of (await walk(site)).sort()) {
  const path = relative(site, file).replaceAll('\\', '/'), extension = extname(file).toLowerCase(), size = (await stat(file)).size;
  const contentType = explicit[extension];
  if (!contentType && !served.has(extension)) throw new Error(`${path}: artifacts do not serve ${extension} files. Add a served type for it in scripts/build-artifact.mjs.`);
  if (size > (/\.(js|css|json|svg|md|txt)$/.test(path) ? maxTextBytes : maxBinaryBytes)) throw new Error(`${path} is ${size} bytes, over the artifact file limit.`);
  files.push(contentType ? { path, contentType } : { path });
  total += size;
}
if (files.length > maxFilesPerPublish) throw new Error(`${files.length} files is over the ${maxFilesPerPublish} one publish accepts; split the files list across publishes to the same artifact.`);
await writeFile(join(out, 'publish.json'), JSON.stringify({
  file_path: join(out, 'page.html'),
  root: site,
  files,
  capabilities: { downloads: true },
  icon: 'cube',
  description: 'Aetheris Helios in the browser: the showcase, the local editor, the Firmament manual and STEP import.',
}, null, 2) + '\n');
await rm(build, { recursive: true, force: true });
await rm(runtimePublish, { recursive: true, force: true });
console.log(`Helios artifact: ${files.length} files, ${(total / 1048576).toFixed(1)} MB in ${relative(root, site)}. Publish with ${relative(root, join(out, 'publish.json'))}.`);
