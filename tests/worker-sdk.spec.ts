import { test, expect } from '@playwright/test';

test('Aetheris SDK reuses one Worker for geometry, correspondence, projection and STEP', async ({ page }) => {
  const events: string[] = [];
  page.on('console', message => events.push(`console ${message.type()}: ${message.text()}`));
  page.on('pageerror', error => events.push(`pageerror: ${error.message}`));
  page.on('requestfailed', request => events.push(`requestfailed: ${request.url()} ${request.failure()?.errorText}`));
  page.on('request', request => { if (/worker\.js|dotnet\.js/.test(request.url())) events.push(`request: ${request.url()}`); });
  page.on('worker', worker => events.push(`worker: ${worker.url()}`));
  await page.route('**/empty-worker-probe', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Worker probe</title>' }));
  await page.goto('/empty-worker-probe');
  const result = await page.evaluate(async () => {
    const { Aetheris } = await import('/node_modules/@aetheris/cad/dist/index.js');
    const cad = await Promise.race([Aetheris.create({ worker: true }), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('worker init timed out')), 20_000))]);
    try {
      const built = await cad.compile('Model WorkerBox { Units: mm Box Body { Size: [10mm, 10mm, 10mm] } }', { sourceName: 'worker-box.firmament', sourceRevision: '17' });
      const box = built.model!;
      const boxSelectors = box.selectorCandidates('Face').map(item => item.selector);
      const transferred = box.mesh.definitions[0].positions instanceof Float64Array && box.mesh.definitions[0].indices instanceof Uint32Array;
      const holeBuilt = await cad.compile('Model WorkerHole { Units: mm Box Body { Size: [40mm, 30mm, 8mm] } Modify Body { Hole<Shaft> H { On: +Z Center: Point2(0mm, 0mm) Diameter: 8mm End: ThroughAll } } }', { sourceName: 'worker-hole.firmament', sourceRevision: '18' });
      const hole = holeBuilt.model!;
      const wall = hole.geometrySourceMap().find(item => item.outputRole === 'HoleWallFace');
      const projection = await hole.describeConstruct(hole.tree.nodes.find(item => item.kind === 'Hole')!.id);
      const step = await hole.exportSTEP();
      return { worker: cad.runtimeInfo.capabilities.worker, definitions: box.mesh.definitions.length, triangles: box.mesh.definitions[0].indices.length,
        boxSelectors, transferred, wallSelector: wall?.selector, fieldOrigins: projection.fields.map(item => item.origin), stepHeader: new TextDecoder().decode(step.slice(0, 16)), stepLength: step.length,
        diagnostics: [...built.diagnostics, ...holeBuilt.diagnostics] };
    } finally { await cad.dispose(); }
  }).catch(error => { throw new Error(`${error}\n${events.join('\n')}`); });
  expect(result.definitions).toBe(1);
  expect(result.triangles).toBeGreaterThan(0);
  expect(result.worker).toBe(true);
  expect(result.transferred).toBe(true);
  expect(result.boxSelectors).toContain('face(+Z)');
  expect(result.wallSelector).toBe('face(H.Wall)');
  expect(result.fieldOrigins.length).toBeGreaterThan(0);
  expect(result.stepHeader).toContain('ISO-10303-21;');
  expect(result.stepLength).toBeGreaterThan(1000);
  expect(result.diagnostics).toEqual([]);
});

test('terminated Worker rejects requests and a fresh Worker can rebuild', async ({ page }) => {
  await page.route('**/empty-worker-probe', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Worker probe</title>' }));
  await page.goto('/empty-worker-probe');
  const result = await page.evaluate(async () => {
    const { Aetheris } = await import('/node_modules/@aetheris/cad/dist/index.js');
    const first = await Aetheris.create({ worker: true });
    first.terminate();
    let failure = '';
    try { await first.info(); } catch (error) { failure = String(error); }
    const second = await Aetheris.create({ worker: true });
    try {
      const built = await second.compile('Model Recovery { Units: mm Box Body { Size: [10mm, 10mm, 10mm] } }');
      return { failure, definitions: built.model?.mesh.definitions.length };
    } finally { await second.dispose(); }
  });
  expect(result.failure).toContain('restarted');
  expect(result.definitions).toBe(1);
});

test('bounded rebuild loop reuses one Worker and disposes prior sessions', async ({ page }) => {
  let createdWorkers = 0;
  page.on('worker', () => createdWorkers++);
  await page.route('**/empty-worker-probe', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Worker probe</title>' }));
  await page.goto('/empty-worker-probe');
  const count = await page.evaluate(async () => {
    const { Aetheris } = await import('/node_modules/@aetheris/cad/dist/index.js');
    const cad = await Aetheris.create({ worker: true });
    let completed = 0;
    try {
      for (let index = 0; index < 8; index++) {
        const built = await cad.compile(`Model Loop${index} { Units: mm Box Body { Size: [10mm, 10mm, 10mm] } }`);
        if (built.model?.mesh.definitions.length === 1) completed++;
        await built.model?.dispose();
      }
      return completed;
    } finally { await cad.dispose(); }
  });
  expect(count).toBe(8);
  expect(createdWorkers).toBe(1);
  await expect.poll(() => page.workers().length).toBe(0);
});
