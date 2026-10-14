// BUILD-PERF-M0 browser lane: the Helios showcase projects built through the public SDK in a
// Worker, on the interpreted development runtime and/or the AOT production runtime.
// Companion to `Aetheris.Web.Perf showcase` (native lane); see
// Aetheris/docs/development/milestones/general/build-perf-ladder.md.
//
//   node scripts/measure-build-perf.mjs [--variants dev,aot] [--projects bracket,bolt,...]
//                                       [--timeout-seconds 1200] [--dump-step]
//
// dev = Aetheris.Web.Runtime/bin/Release/net10.0/wwwroot (what `npm run dev` serves)
// aot = artifacts/local/helios-sdk/aot-publish (what production serves; `npm run sdk:install:production`)
// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a bundled Chromium instead of installed Chrome.
import { createServer } from 'node:http';
import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { chromium } from '@playwright/test';

const helios = resolve(import.meta.dirname, '..');
const aetheris = resolve(helios, '..', 'Aetheris');
const option = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
};
const variants = option('--variants', 'dev,aot').split(',');
const timeoutMilliseconds = Number(option('--timeout-seconds', '1200')) * 1000;
const projects = {
  bracket: { inline: 'Model WebBracket {\n    Units: mm\n    Box Plate { Size: [50mm, 40mm, 8mm] }\n    Modify Plate {\n        Hole<Shaft> CenterMount { On: +Z Center: Point2(0mm, 0mm) Diameter: 8mm End: ThroughAll }\n    }\n}\n', root: 'bracket.firmament' },
  bolt: { directory: 'fixtures/Thread', root: 'hexbolt-showcase.firmament', only: ['hexbolt-showcase.firmament'] },
  atlas: { directory: 'fixtures/Canonical/AssemblyInterfaces/IndustrialAtlas', root: 'atlas-industrial.firmament' },
  guitar: { directory: 'fixtures/Canonical/AssemblyInterfaces/GuitarX0', root: 'guitar.firmasm' },
  house: { directory: 'fixtures/Canonical/Scene/WarmModernHouse', root: 'house.firmament' },
};
const selected = option('--projects', Object.keys(projects).join(',')).split(',');
const dumpStep = process.argv.includes('--dump-step');
const roots = {
  dev: join(aetheris, 'Aetheris.Web.Runtime/bin/Release/net10.0/wwwroot/_framework'),
  aot: join(aetheris, 'artifacts/local/helios-sdk/aot-publish/wwwroot/_framework'),
};
for (const variant of variants) {
  if (!roots[variant]) throw new Error(`Unknown variant '${variant}'.`);
  await stat(join(roots[variant], 'dotnet.js')).catch(() => { throw new Error(`Missing ${variant} runtime at ${roots[variant]}.`); });
}

async function documentsOf(name) {
  const project = projects[name];
  if (!project) throw new Error(`Unknown project '${name}'.`);
  if (project.inline) return { root: project.root, documents: { [project.root]: project.inline } };
  const directory = join(aetheris, project.directory);
  const files = (await readdir(directory)).filter(file => /\.firm(ament|asm)$/.test(file) && (!project.only || project.only.includes(file))).sort();
  const documents = {};
  for (const file of files) documents[file] = (await readFile(join(directory, file), 'utf8')).replaceAll('\r\n', '\n');
  return { root: project.root, documents };
}

const sdk = join(aetheris, 'Aetheris.Web.Runtime/sdk/src');
const mime = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.dll': 'application/octet-stream', '.dat': 'application/octet-stream' };
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (path === '/') { response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); response.end('<!doctype html><title>Aetheris build perf</title>'); return; }
  const parts = path.split('/').filter(Boolean);
  let base, relative;
  if (parts[0] === 'sdk') { base = sdk; relative = parts.slice(1); }
  else if (roots[parts[0]] && parts[1] === 'runtime' && parts[2] === '_framework') { base = roots[parts[0]]; relative = parts.slice(3); }
  if (!base || relative.some(part => part === '..')) { response.writeHead(404); response.end(); return; }
  try {
    const file = join(base, ...relative);
    response.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(await readFile(file));
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const port = server.address().port;
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch(executablePath ? { executablePath, headless: true } : { channel: 'chrome', headless: true });
const rows = [];
try {
  for (const variant of variants) for (const name of selected) {
    const { root, documents } = await documentsOf(name);
    // A fresh page and worker per project: the first build is a cold runtime build.
    const page = await browser.newPage();
    page.setDefaultTimeout(timeoutMilliseconds);
    await page.goto(`http://127.0.0.1:${port}/`);
    const row = await page.evaluate(async ({ variant, root, documents, dumpStep }) => {
      const { Aetheris } = await import('/sdk/index.js');
      const sha = async text => {
        const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
        return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
      };
      const projectDocuments = Object.keys(documents).length > 1 ? documents : undefined;
      const initStart = performance.now();
      const cad = await Aetheris.create({ worker: true, wasmUrl: `/${variant}/runtime/` });
      const initMilliseconds = performance.now() - initStart;
      const phases = timings => Object.entries((timings?.profile?.phases ?? []).reduce((acc, phase) => {
        acc[phase.name] = (acc[phase.name] ?? 0) + phase.exclusiveMilliseconds; return acc; }, {}))
        .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([phaseName, ms]) => [phaseName, Math.round(ms)]);
      let started = performance.now();
      const compiled = await cad.compile(documents[root], { sourceName: root, projectDocuments, performance: true });
      const coldMilliseconds = performance.now() - started;
      if (!compiled.model) throw new Error(JSON.stringify(compiled.diagnostics).slice(0, 600));
      const model = compiled.model;
      const cold = { milliseconds: coldMilliseconds, worker: model.workerTiming, bridge: model.timings?.bridge, timings: { compile: model.timings?.compileMilliseconds, mesh: model.timings?.meshMilliseconds, rebuild: model.timings?.totalBeforeSnapshotMilliseconds }, gc: [model.timings?.profile?.gc0, model.timings?.profile?.gc1, model.timings?.profile?.gc2], phases: phases(model.timings) };
      let stepDataSha256 = null, stepText = null;
      try {
        const step = new TextDecoder().decode(await model.exportSTEP());
        const data = step.indexOf('DATA;');
        stepDataSha256 = await sha(data >= 0 ? step.slice(data) : step);
        if (dumpStep) stepText = step;
      } catch { /* Scene: no STEP product artifact */ }
      started = performance.now();
      const rebuilt = await model.rebuild({ performance: true });
      const noChange = { milliseconds: performance.now() - started, bridge: rebuilt.model?.timings?.bridge, timings: { rebuild: rebuilt.model?.timings?.totalBeforeSnapshotMilliseconds }, phases: phases(rebuilt.model?.timings) };
      // The floor every edit pays: the root changes, no geometry does.
      const edited = { ...documents, [root]: documents[root] + '\n// build-perf: root comment\n' };
      started = performance.now();
      const commented = await model.setSource(edited[root], { sourceName: root, projectDocuments: Object.keys(edited).length > 1 ? edited : undefined, performance: true });
      const rootCommentEdit = { milliseconds: performance.now() - started, bridge: commented.model?.timings?.bridge, timings: { rebuild: commented.model?.timings?.totalBeforeSnapshotMilliseconds }, phases: phases(commented.model?.timings) };
      await model.dispose(); await cad.dispose();
      return { initMilliseconds, cold, noChange, rootCommentEdit, stepDataSha256, stepText };
    }, { variant, root, documents, dumpStep });
    await page.close();
    if (row.stepText) {
      const stepPath = join(aetheris, 'artifacts/local/build-perf', `${variant}-${name}.step`);
      await mkdir(resolve(stepPath, '..'), { recursive: true });
      await writeFile(stepPath, row.stepText);
    }
    delete row.stepText;
    const result = { variant, project: name, chrome: browser.version(), ...row };
    rows.push(result);
    console.log(`${variant.padEnd(4)} ${name.padEnd(8)} init ${Math.round(row.initMilliseconds)} ms · cold ${(row.cold.milliseconds / 1000).toFixed(2)} s · no-change ${(row.noChange.milliseconds / 1000).toFixed(2)} s · root comment ${(row.rootCommentEdit.milliseconds / 1000).toFixed(2)} s · gc ${row.cold.gc.join('/')}`);
  }
} finally { await browser.close(); server.close(); }
const output = join(aetheris, 'artifacts/local/build-perf/browser.jsonl');
await mkdir(resolve(output, '..'), { recursive: true });
await writeFile(output, rows.map(row => JSON.stringify(row)).join('\n') + '\n', { flag: 'a' });
console.log(`Appended ${rows.length} rows to ${output}`);
