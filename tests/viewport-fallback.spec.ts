import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--disable-features=WebGPU'] } });

for (const failure of ['unavailable', 'no-adapter', 'initialization'] as const) {
  test(`automatically renders a real part with WebGL when WebGPU is ${failure}`, async ({ page }, testInfo) => {
    await page.addInitScript(reason => {
      localStorage.removeItem('helios.viewport.renderer');
      Object.defineProperty(navigator, 'gpu', { configurable: true, value: reason === 'unavailable' ? undefined : {
        requestAdapter: async () => reason === 'no-adapter' ? null : {
          features: new Set(), limits: {}, requestDevice: async () => { throw new Error('Fixture: WebGPU initialization refused'); },
        },
      } });
    }, failure);
    await page.goto('/local');
    await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
    const viewport = page.locator('.viewport-fallback');
    await expect(viewport.getByText('WebGL', { exact: true })).toBeVisible();
    await expect(viewport.getByRole('alert')).toHaveCount(0);
    const canvas = viewport.locator('canvas');
    await expect(canvas).toBeVisible();
    // Decode the actual compositor capture in the browser. A grid alone has far
    // fewer filled pixels than the shaded part in the central region.
    const capture = await canvas.screenshot({ path: testInfo.outputPath('webgl-part.png') });
    await testInfo.attach('webgl-part', { body: capture, contentType: 'image/png' });
    const coverage = await page.evaluate(async encoded => {
      const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
      const sample = new OffscreenCanvas(image.width, image.height);
      const context = sample.getContext('2d')!; context.drawImage(image, 0, 0);
      const { data } = context.getImageData(0, 0, image.width, image.height);
      const background = [data[0], data[1], data[2]];
      let filled = 0, total = 0;
      for (let y = Math.floor(image.height * .3); y < image.height * .7; y += 2)
        for (let x = Math.floor(image.width * .3); x < image.width * .7; x += 2) {
          const i = 4 * (y * image.width + x); total++;
          if (Math.abs(data[i] - background[0]) + Math.abs(data[i + 1] - background[1]) + Math.abs(data[i + 2] - background[2]) > 70) filled++;
        }
      return filled / total;
    }, capture.toString('base64'));
    expect(coverage).toBeGreaterThan(.1);
    await expect(viewport.getByRole('alert')).toHaveCount(0);
  });
}
