import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

const source = await readFile('fixtures/production-usage/door-draft.firmament', 'utf8');
const trace = [
  { reference: 'line3', from: 'arc1End', to: 'line1Start', connect: true },
  { reference: 'arc1', from: 'line2End', to: 'arc1End', connect: true },
  { reference: 'line2', from: 'line1End', to: 'line2End', connect: true },
  { reference: 'line1', from: 'line1Start', to: 'line1End', connect: true },
];

test('AOT worker repeatedly traces fresh curved drafts without terminating the runtime', async ({ page }) => {
  // Discover the Worker from the served app, including when the archive was
  // built elsewhere. Never select a fingerprint from this checkout's dist/.
  const started = page.waitForEvent('worker', {
    predicate: async worker => await worker.evaluate(() => self.name).catch(() => '') === 'Aetheris CAD',
  });
  await page.goto('/local');
  const workerUrl = (await started).url();
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/aetheris-runtime-aot/')) requests.push(request.url()); });
  await page.route('**/aot-cache-probe', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>AOT syntax-cache regression</title>' }));
  await page.goto('/aot-cache-probe');
  const iterations = await page.evaluate(async ({ workerUrl, source, trace }) => {
    const worker = new Worker(workerUrl, { type: 'module' });
    let sequence = 0;
    const request = (value: { operation: string; sourceRevision?: string; [key: string]: unknown }) => new Promise<any>((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => reject(new Error('AOT curved trace timed out')), 20_000);
      const response = (event: MessageEvent) => {
        if (event.data.id !== id) return;
        clearTimeout(timer); worker.removeEventListener('message', response);
        event.data.error ? reject(new Error(`${value.operation} revision ${value.sourceRevision ?? "-"}: ${event.data.error.message}`)) : resolve(event.data.result);
      };
      worker.addEventListener('message', response);
      worker.postMessage({ version: 1, id, request: value, runtimeBase: new URL('/aetheris-runtime-aot/', location.href).href });
    });
    try {
      await request({ operation: 'info' });
      for (let i = 0; i < 128; i++) {
        const current = { source: source + `\n// fresh draft ${i}\n`, sourceName: 'intellidraft.firmament', sourceRevision: String(i) };
        await request({ ...current, operation: 'languageSketch' });
        const result = await request({ ...current, operation: 'languageSketchEdit', sketchEdit: {
          kind: 'construction', construction: { action: 'trace', parent: 'DraftPart/layout', name: 'section', trace: i % 2 === 0 ? trace : trace.toReversed() },
        } });
        if (!result.changed || !result.text.includes('Profile section')) throw new Error(`Trace ${i} did not produce its profile`);
      }
      return 128;
    } finally { worker.terminate(); }
  }, { workerUrl, source, trace });
  expect(iterations).toBe(128);
  expect(requests.some(url => /dotnet\.native\..*\.wasm$/.test(url))).toBe(true);
});
