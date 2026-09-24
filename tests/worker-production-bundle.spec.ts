import { readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

test('production Vite bundle starts the Aetheris Worker and transfers Box mesh', async ({ page }) => {
  const assets = fileURLToPath(new URL('../dist/assets/', import.meta.url));
  const workerFile = readdirSync(assets).find(name => /^worker-[^.]+\.js$/.test(name));
  expect(workerFile).toBeTruthy();
  const aotAssets = fileURLToPath(new URL('../dist/aetheris-runtime-aot/_framework/', import.meta.url));
  const nativeWasm = readdirSync(aotAssets).find(name => /^dotnet\.native\..*\.wasm$/.test(name));
  expect(nativeWasm).toBeTruthy();
  expect(statSync(`${aotAssets}/${nativeWasm}`).size).toBeGreaterThan(50_000_000);
  const runtimeRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/aetheris-runtime')) runtimeRequests.push(request.url()); });
  await page.route('**/empty-production-probe', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Production Worker probe</title>' }));
  await page.goto('http://127.0.0.1:4174/empty-production-probe');
  const aotResponse = await page.request.get(`http://127.0.0.1:4174/aetheris-runtime-aot/_framework/${nativeWasm}`);
  expect(aotResponse.ok()).toBe(true);
  expect(aotResponse.headers()['cache-control']).toContain('immutable');
  const result = await page.evaluate(async name => {
    const worker = new Worker(`/assets/${name}`, { type: 'module' });
    const runtimeBase = new URL('/aetheris-runtime-aot/', location.href).href;
    const request = (id: number, operation: string, source?: string) => new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${operation} timed out`)), 20_000);
      const onMessage = (event: MessageEvent) => {
        if (event.data.id !== id) return;
        worker.removeEventListener('message', onMessage);
        clearTimeout(timeout);
        event.data.error ? reject(new Error(event.data.error.message)) : resolve(event.data.result);
      };
      worker.addEventListener('message', onMessage);
      worker.postMessage({ version: 1, id, request: { operation, source, sourceName: 'production-box.firmament' }, runtimeBase });
    });
    try {
      const info = await request(1, 'info');
      const built = await request(2, 'compile', 'Model ProductionBox { Units: mm Box Body { Size: [10mm, 10mm, 10mm] } }');
      return { contract: info.contractVersion, definitions: built.model.mesh.definitions.length,
        positionsTransferred: built.model.mesh.definitions[0].positions instanceof Float64Array,
        boxSelector: built.model.mesh.definitions[0].ranges.some((range: { selector?: string }) => range.selector === 'face(+Z)') };
    } finally { worker.terminate(); }
  }, workerFile!);
  expect(result.contract).toBe('aetheris/web-editor-contract/1');
  expect(result.definitions).toBe(1);
  expect(result.positionsTransferred).toBe(true);
  expect(result.boxSelector).toBe(true);
  expect(runtimeRequests.some(url => url.includes('/aetheris-runtime-aot/_framework/dotnet.native.'))).toBe(true);
});
