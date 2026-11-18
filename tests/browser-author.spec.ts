import { expect, test } from '@playwright/test';

const providers = [
  { id: 'openai', host: 'api.openai.com', model: 'gpt-6.2-sol', header: 'authorization', key: 'sk-fixture-openai' },
  { id: 'anthropic', host: 'api.anthropic.com', model: 'claude-sonnet-5-5', header: 'x-api-key', key: 'sk-ant-fixture' },
  { id: 'gemini', host: 'generativelanguage.googleapis.com', model: 'gemini-4-argon', header: 'x-goog-api-key', key: 'AIzaFixtureGoogle' },
] as const;

test.skip(process.env.HELIOS_BROWSER_AUTHOR !== '1', 'Run against the Sites-targeted build.');

for (const provider of providers) test(provider.id + ' key form and tool replay build a reviewable candidate', async ({ page }) => {
  const args = { path: 'part.firmament', before: '20mm', after: '30mm' };
  const summary = 'The candidate now has a 30 mm width.';
  let turns = 0;
  await page.route('https://' + provider.host + '/**', async route => {
    const request = route.request();
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    const respond = (json: unknown, status = 200) => route.fulfill({ headers, status, json });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'access-control-allow-methods': 'GET, POST' } });
    const sentKey = request.headers()[provider.header];
    if (sentKey?.endsWith('bad-key')) return respond({ error: { message: 'Echo sk-bad-key' } }, 401);
    expect(sentKey).toBe(provider.id === 'openai' ? 'Bearer ' + provider.key : provider.key);
    if (request.method() === 'GET') return respond(provider.id === 'gemini'
      ? { models: [{ name: 'models/' + provider.model, supportedGenerationMethods: ['generateContent'] }] }
      : { data: [{ id: provider.model }] });
    expect(request.postData()).not.toContain(provider.key);
    const requestBody = request.postDataJSON();
    const call = turns++ === 0;
    if (provider.id === 'openai') {
      expect(requestBody.store).toBe(false);
      if (!call) expect(requestBody.input).toContainEqual(expect.objectContaining({ type: 'function_call_output', call_id: 'edit', output: expect.stringContaining('candidate-edited') }));
      return respond({ status: 'completed', output: call ? [
        { type: 'function_call', name: 'edit_file', arguments: JSON.stringify(args), call_id: 'edit' },
      ] : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: summary }] }] });
    }
    if (provider.id === 'anthropic') {
      if (!call) expect(requestBody.messages.at(-1).content).toContainEqual(expect.objectContaining({ type: 'tool_result', tool_use_id: 'edit', content: expect.stringContaining('candidate-edited') }));
      return respond({ stop_reason: call ? 'tool_use' : 'end_turn', content: call
        ? [{ type: 'tool_use', name: 'edit_file', input: args, id: 'edit' }] : [{ type: 'text', text: summary }] });
    }
    if (!call) {
      expect(requestBody.contents.at(-2).parts[0].thoughtSignature).toBe('fixture-signature');
      expect(requestBody.contents.at(-1).parts).toContainEqual({ functionResponse: {
        name: 'edit_file', id: 'edit', response: expect.objectContaining({ ok: true, result: expect.objectContaining({ status: 'candidate-edited' }) }),
      } });
    }
    return respond({ candidates: [{ finishReason: 'STOP', content: { role: 'model', parts: call
      ? [{ functionCall: { id: 'edit', name: 'edit_file', args }, thoughtSignature: 'fixture-signature' }] : [{ text: summary }] } }] });
  });
  await page.goto('/local');
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  await page.getByRole('banner').locator('input[type=file]').setInputFiles('fixtures/author-local/part.firmament');
  await expect(page.getByRole('banner')).toContainText('part.firmament');
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await page.getByRole('tab', { name: 'AI Author', exact: true }).click();
  const panel = page.getByRole('region', { name: 'AI Author', exact: true });
  await panel.getByLabel('AI provider').selectOption(provider.id);
  const password = panel.getByLabel('API key', { exact: true });
  await expect(password).toHaveAttribute('type', 'password');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  if (provider.id === 'openai') {
    await password.fill('sk-bad-key');
    await panel.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(panel.getByRole('alert')).toContainText('did not accept this key');
    await expect(panel).not.toContainText('sk-bad-key');
  }
  await password.fill(provider.key);
  await panel.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(panel.getByText(provider.model, { exact: false }).first()).toBeVisible();
  await expect(password).toHaveCount(0);
  await panel.getByLabel('Engineering intent').fill('Increase the width to 30 mm.');
  await panel.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(panel.getByRole('log')).toContainText(summary, { timeout: 90_000 });
  await expect(panel.getByRole('button', { name: 'Apply candidate', exact: true })).toBeEnabled();
  await panel.getByText('part.firmament', { exact: true }).click();
  await expect(panel.getByText(/size: \[20mm, 15mm, 8mm\]/)).toBeVisible();
  await expect(panel.getByText(/size: \[30mm, 15mm, 8mm\]/)).toBeVisible();
  if (provider.id === 'openai') await panel.screenshot({ path: test.info().outputPath('conversation.png') });
  await panel.getByRole('button', { name: 'Apply candidate', exact: true }).click();
  await expect(panel.getByText('Working project updated and built.')).toBeVisible();
  await page.getByRole('tab', { name: 'Version Control', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore Before AI task' })).toBeVisible();
  await page.getByRole('tab', { name: 'AI Author', exact: true }).click();
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain(provider.key);
  await panel.getByText('Connection', { exact: true }).click();
  await panel.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(password).toHaveValue('');
  await expect(panel.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
  expect(turns).toBe(2);
});
