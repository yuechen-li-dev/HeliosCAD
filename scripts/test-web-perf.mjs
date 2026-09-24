import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { chromium } from '@playwright/test';

const helios = resolve(import.meta.dirname, '..');
const smoke = process.argv.includes('--smoke') || process.argv.includes('--smoke-aot');
const helixSmoke = process.argv.includes('--helix-aot');
const controlsAot = process.argv.includes('--controls-aot');
const smokeVariant = process.argv.includes('--smoke-aot') ? 'aot' : 'current';
const buildMode = process.argv.includes('--build');
const targetFive = process.argv.includes('--target-5');
const lxMode = process.argv.includes('--lx');
const aetheris = resolve(helios, '..', 'Aetheris');
const fixture = await readFile(join(aetheris, 'fixtures/firmament/web-perf-helix-1.firmament'), 'utf8');
const sdk = join(aetheris, 'Aetheris.Web.Runtime/sdk/src');
const roots = {
  build: join(aetheris, 'Aetheris.Web.Runtime/bin/Release/net10.0/wwwroot/_framework'),
  current: join(aetheris, 'artifacts/local/web-perf/current-publish/wwwroot/_framework'),
  aot: join(aetheris, 'artifacts/local/helios-sdk/aot-publish/wwwroot/_framework')
};
const variants = lxMode || helixSmoke || controlsAot ? ['aot'] : buildMode ? ['build'] : smoke ? [smokeVariant] : ['current', 'aot'];
for (const variant of variants) await stat(join(roots[variant], 'dotnet.js'));
const mime = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.dll': 'application/octet-stream', '.dat': 'application/octet-stream' };
const server = createServer(async (request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  if (path === '/') { response.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); response.end('<!doctype html><title>Aetheris Web Perf</title>'); return; }
  if (path === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  const parts = path.split('/').filter(Boolean);
  let base, relative;
  if (parts[0] === 'sdk') { base = sdk; relative = parts.slice(1); }
  else if (roots[parts[0]] && parts[1] === 'runtime' && parts[2] === '_framework') { base = roots[parts[0]]; relative = parts.slice(3); }
  if (!base || relative.some(part => part === '..')) { response.writeHead(404); response.end(); return; }
  try {
    const file = join(base, ...relative);
    const bytes = await readFile(file);
    response.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(bytes);
  } catch { console.error('Missing runtime asset', path); response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const rows = [];
try {
  const version = browser.version();
  for (const variant of variants) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const frameworkRequests = [];
    context.on('requestfinished', request => {
      if (!request.url().includes('/_framework/')) return;
      const timing = request.timing();
      frameworkRequests.push({ start: timing.startTime, end: timing.startTime + timing.responseEnd });
    });
    const page = await context.newPage();
    page.on('console', message => console.log('BROWSER', message.type(), message.text()));
    page.on('pageerror', error => console.error('PAGE ERROR', error));
    await page.goto(`http://127.0.0.1:${port}/`);
    const result = await page.evaluate(async ({ variant, fixture, smoke, helixSmoke, controlsAot, targetFive, buildMode, lxMode }) => {
      const { Aetheris } = await import('/sdk/index.js');
      const source = { 'helix-1': fixture, 'helix-2': fixture.replace('Turns: 1', 'Turns: 2'),
        'helix-5': fixture.replace('Turns: 1', 'Turns: 5'), 'helix-10': fixture.replace('Turns: 1', 'Turns: 10'),
        box: 'Model PerfBox { Units: mm Box Body { Size: [30mm, 20mm, 10mm] } }',
        hole: 'Model PerfHole { Units: mm Box Body { Size: [30mm, 20mm, 10mm] } Modify Body { Hole<Shaft> H { On: +Z Center: Point2(0mm, 0mm) Diameter: 6mm End: ThroughAll } } }' };
      const gaps = []; let previous = performance.now();
      const heartbeat = setInterval(() => { const now = performance.now(); gaps.push(now - previous); previous = now; }, 50);
      const initStart = performance.now();
      const cad = await Aetheris.create({ worker: true, wasmUrl: `/${variant}/runtime/` })
        .catch(error => { throw new Error(`${variant} startup ${error.code}: ${error.details ?? error.message}`); });
      const initMilliseconds = performance.now() - initStart;
      const initialization = cad.workerTiming?.initialization ?? null;
      if (lxMode) {
        const language = await Aetheris.create({ wasmUrl: `/${variant}/runtime/` });
        const started = performance.now();
        const pending = cad.compile(fixture, { sourceName: 'helix-1.firmament', performance: true });
        await new Promise(resolve => setTimeout(resolve, 50));
        const completionStart = performance.now();
        const completion = await language.language.complete(fixture, fixture.indexOf('Helix Winding {') + 'Helix Winding {'.length,
          { sourceName: 'helix-1.firmament', sourceRevision: 'perf-lx' });
        const completionMilliseconds = performance.now() - completionStart;
        const model = (await pending).model;
        const elapsed = performance.now() - started;
        await model?.dispose(); await language.dispose(); await cad.dispose(); clearInterval(heartbeat);
        return { initMilliseconds, initialization, maxHeartbeatGapMilliseconds: Math.max(...gaps),
          rows: [{ variant, name: 'lx-concurrent', run: 0, elapsed, completionMilliseconds,
            completionRevision: completion.revision, completionContext: completion.context,
            completionFields: completion.fields?.length ?? 0 }] };
      }
      const rows = [];
      for (const name of smoke ? ['box'] : helixSmoke ? ['helix-1'] : controlsAot ? ['box', 'hole'] : targetFive ? ['helix-5'] : buildMode ? ['helix-1', 'box', 'hole'] : Object.keys(source)) {
        const repetitions = name === 'helix-1' ? 6 : controlsAot ? 2 : 1;
        for (let run = 0; run < repetitions; run++) {
          const started = performance.now();
          const compiled = await cad.compile(source[name], { sourceName: `${name}.firmament`, performance: true })
            .catch(error => { throw new Error(`${variant} ${name} ${error.code}: ${error.details ?? error.message}`); });
          const elapsed = performance.now() - started;
          if (!compiled.model) throw new Error(`${variant} ${name}: ${JSON.stringify(compiled.diagnostics)}`);
          const model = compiled.model;
          const definition = model.mesh.definitions[0];
          const result = { variant, name, run, elapsed, timings: model.timings, workerTiming: model.workerTiming,
            counts: { vertices: definition.positions.length / 3, triangles: definition.indices.length / 3,
              ranges: definition.ranges.length, edges: definition.edges.length },
            selectors: model.selectorCandidates().length, sourceMap: model.geometrySourceMap().length,
            diagnostics: compiled.diagnostics.length };
          if (run === 0) {
            result.selectorValues = model.selectorCandidates().map(item => item.selector);
            const stepStart = performance.now();
            const step = await model.exportSTEP();
            result.step = { bytes: step.length, milliseconds: performance.now() - stepStart,
              valid: new TextDecoder().decode(step.subarray(0, 64)).includes('ISO-10303-21'),
              sha256: Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', step))).map(byte => byte.toString(16).padStart(2, '0')).join('') };
            if (targetFive) result.stepText = new TextDecoder().decode(step);
            const node = model.tree.nodes.find(item => item.kind === 'Helix');
            if (name === 'helix-1' && node) {
              const projection = await model.describeConstruct(node.id);
              result.projection = { fields: projection.fields.length, constructId: projection.constructId };
            }
          }
          rows.push(result);
          console.log('WEB_PERF_ROW', JSON.stringify({ variant, name, run, elapsed: Math.round(elapsed) }));
          await model.dispose();
        }
      }
      clearInterval(heartbeat);
      await cad.dispose();
      return { initMilliseconds, initialization, maxHeartbeatGapMilliseconds: Math.max(...gaps), rows };
    }, { variant, fixture, smoke, helixSmoke, controlsAot, targetFive, buildMode, lxMode });
    const fetchSpanMilliseconds = frameworkRequests.length
      ? Math.max(...frameworkRequests.map(request => request.end)) - Math.min(...frameworkRequests.map(request => request.start)) : null;
    for (const row of result.rows) rows.push({ ...row, chrome: version, initMilliseconds: result.initMilliseconds,
      initialization: result.initialization,
      frameworkRequests: frameworkRequests.length, fetchSpanMilliseconds,
      maxHeartbeatGapMilliseconds: result.maxHeartbeatGapMilliseconds });
    await context.close();
  }
} finally { await browser.close(); server.close(); }
const output = join(aetheris, lxMode ? 'artifacts/local/web-perf-lx.jsonl' : helixSmoke ? 'artifacts/local/web-perf-helix-aot.jsonl' : controlsAot ? 'artifacts/local/web-perf-controls-aot.jsonl' : buildMode ? 'artifacts/local/web-perf-build.jsonl' : targetFive ? 'artifacts/local/web-perf-target-5.jsonl' : smoke ? 'artifacts/local/web-perf-smoke.jsonl' : 'artifacts/local/web-perf-browser.jsonl');
await mkdir(resolve(output, '..'), { recursive: true });
if (targetFive) for (const row of rows) {
  await writeFile(join(aetheris, 'artifacts/local/web-perf', `helix-5-${row.variant}.step`), row.stepText);
  delete row.stepText;
}
await writeFile(output, rows.map(row => JSON.stringify(row)).join('\n') + '\n');
for (const row of rows.filter(row => row.name === 'helix-1')) {
  const faceTessellations = row.timings.profile.phases.filter(phase => phase.name === 'tessellation.faces').length;
  if (faceTessellations !== 2 || row.timings.profile.phases.some(phase => phase.name === 'web.display-step-reimport'))
    throw new Error(`Helix repeated STEP import returned: ${faceTessellations} face tessellations, variant ${row.variant}.`);
}
if (helixSmoke) {
  const first = rows[0];
  if (first.counts.triangles !== 9276 || first.counts.ranges !== 130 || first.counts.edges !== 260 ||
      first.sourceMap !== 390 || first.projection?.fields !== 6 ||
      first.step?.sha256 !== 'c2776d40f4e3e47aae404f4189a2d526cc57b19ccad6d3b85f282a8fb02db988')
    throw new Error(`AOT Helix geometry or semantic regression: ${JSON.stringify(first)}`);
}
if (controlsAot) {
  const box = rows.find(row => row.name === 'box');
  const hole = rows.find(row => row.name === 'hole');
  if (box?.counts.triangles !== 12 || box.counts.edges !== 12 || !box.selectorValues.includes('face(+Z)') ||
      hole?.counts.triangles !== 144 || hole.counts.edges !== 15 || !hole.selectorValues.includes('face(H.Wall)') ||
      !box.step.valid || !hole.step.valid ||
      box.step.sha256 !== '406301f20b4d053ca582d99ade5c3e667a580d326276392ffe2c4862427a3601' ||
      hole.step.sha256 !== '1ed013b0189b226680ef1c966271d66d35482bb58e4900b2489912cce2459b44')
    throw new Error('AOT Box/Hole geometry, selector, or STEP regression.');
}
if (!smoke && !helixSmoke && !controlsAot && !buildMode && !targetFive && !lxMode) {
  const native = (await readFile(join(aetheris, 'artifacts/local/web-perf-native.jsonl'), 'utf8')).trim().split(/\r?\n/).map(line => JSON.parse(line));
  for (const name of ['helix-1', 'helix-2', 'helix-5', 'helix-10', 'box', 'hole']) {
    const control = native.find(row => row.name === name && row.run === 0);
    const current = rows.find(row => row.variant === 'current' && row.name === name && row.run === 0);
    const aot = rows.find(row => row.variant === 'aot' && row.name === name && row.run === 0);
    for (const row of [current, aot]) {
      if (!row?.step?.valid || row.diagnostics || row.counts.vertices !== control.mesh.vertices ||
          row.counts.triangles !== control.mesh.triangles || row.counts.ranges !== control.mesh.ranges ||
          row.counts.edges !== control.mesh.edges)
        throw new Error(`Cross-runtime geometry mismatch for ${name}: ${JSON.stringify({ control: control.mesh, row: row?.counts })}`);
    }
    if (current.step.sha256 !== aot.step.sha256) throw new Error(`AOT STEP bytes differ from current WASM for ${name}.`);
    if (name === 'box' && !aot.selectorValues.includes('face(+Z)')) throw new Error('AOT Box selector face(+Z) is missing.');
    if (name === 'hole' && !aot.selectorValues.includes('face(H.Wall)')) throw new Error('AOT Hole selector face(H.Wall) is missing.');
    if (name === 'helix-1' && (aot.projection?.constructId !== 'Helix' || aot.sourceMap !== current.sourceMap)) throw new Error('AOT Helix projection or source-map parity failed.');
    if ((name === 'box' || name === 'hole') && (!aot.sourceMap || aot.sourceMap !== current.sourceMap)) throw new Error(`AOT ${name} source-map parity failed.`);
  }
}
console.log(output);
