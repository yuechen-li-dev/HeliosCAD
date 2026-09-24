import { test, expect } from '@playwright/test';
import { helixModelSource } from '../src/commands/sourceAuthoring';

test('records cold and warm Helix Worker builds against the page-thread baseline', async ({ page }) => {
  test.setTimeout(360_000);
  await page.route('**/empty-worker-benchmark', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Worker benchmark</title>' }));
  await page.goto('/empty-worker-benchmark');
  const result = await page.evaluate(async source => {
    const { Aetheris } = await import('/node_modules/@aetheris/cad/dist/index.js');
    const samples: number[] = [];
    let previous = performance.now();
    const timer = setInterval(() => { const now = performance.now(); samples.push(now - previous); previous = now; }, 50);
    const initStart = performance.now();
    const worker = await Aetheris.create({ worker: true });
    const initMs = performance.now() - initStart;
    const coldStart = performance.now();
    const cold = await worker.compile(source, { sourceName: 'helix.firmament' });
    const coldMs = performance.now() - coldStart;
    const coldPhases = cold.model?.timings;
    const coldTransport = cold.model?.workerTiming;
    const warmStart = performance.now();
    const warm = await worker.compile(source, { sourceName: 'helix.firmament' });
    const warmMs = performance.now() - warmStart;
    const warmPhases = warm.model?.timings;
    const warmTransport = warm.model?.workerTiming;
    const workerMaxGapMs = Math.max(...samples);
    clearInterval(timer);
    await worker.dispose();
    const direct = await Aetheris.create();
    const directSamples: number[] = [];
    previous = performance.now();
    const directTimer = setInterval(() => { const now = performance.now(); directSamples.push(now - previous); previous = now; }, 50);
    const directStart = performance.now();
    const baseline = await direct.compile(source, { sourceName: 'helix.firmament' });
    const directMs = performance.now() - directStart;
    await new Promise(resolve => setTimeout(resolve, 100));
    clearInterval(directTimer);
    await direct.dispose();
    return { initMs, coldMs, warmMs, directMs, workerMaxGapMs, directMaxGapMs: Math.max(...directSamples),
      coldPhases, warmPhases, coldTransport, warmTransport,
      definitions: [cold.model?.mesh.definitions.length, warm.model?.mesh.definitions.length, baseline.model?.mesh.definitions.length],
      diagnostics: [cold.diagnostics.length, warm.diagnostics.length, baseline.diagnostics.length] };
  }, helixModelSource);
  console.log('WORKER_HELIX_PERFORMANCE', JSON.stringify(result));
  expect(result.definitions).toEqual([1, 1, 1]);
  expect(result.diagnostics).toEqual([0, 0, 0]);
  expect(result.workerMaxGapMs).toBeLessThan(2000);
  expect(result.directMaxGapMs).toBeGreaterThan(2000);
});
