import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Explicit opt-in desktop qualification: creates a separate unsaved test part.
const directory = resolve('artifacts/local/solidworks'); await mkdir(directory, { recursive: true });
const executable = resolve(process.argv[2] ?? `${directory}/addin/Helios.SolidWorks.Cli.exe`);
const child = spawn(executable, ['--stdio'], { windowsHide: true, stdio: ['pipe', 'pipe', 'inherit'] });
const pending = new Map(); const transcript = []; let nextId = 0;
createInterface({ input: child.stdout }).on('line', line => {
  const response = JSON.parse(line); transcript.push(response); pending.get(response.id)?.(response); pending.delete(response.id);
});
const request = (method, params) => new Promise((resolve, reject) => {
  const id = ++nextId; const timer = setTimeout(() => reject(Error(`Timed out: ${method}`)), 130_000);
  pending.set(id, value => { clearTimeout(timer); resolve(value); });
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }) + '\n');
});
async function call(operation, args = {}) {
  const result = (await request('tools/call', { name: `solidworks_${operation}`, arguments: args })).result;
  assert.ok(result, 'MCP must return a tool result');
  return JSON.parse(result.content[0].text);
}
try {
  assert.equal((await request('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'qualification', version: '1' } })).result.serverInfo.name, 'aetheris-helios-solidworks-local');
  assert.equal((await request('tools/list')).result.tools.length, 5);
  const original = await call('inspect'); assert.equal(original.ok, true);
  const made = await call('create_part', { profile: 'annulus', outerDiameterMm: 40, innerDiameterMm: 10, depthMm: 8 });
  assert.equal(made.ok, true); assert.equal(made.result.solidBodyCount, 1);
  const { documentToken, dimensions } = made.result;
  const depth = dimensions.find(dimension => dimension.name.startsWith('D1@HeliosExtrude@'));
  assert.equal(depth.valueMm, 8);
  const staleDocument = await call('set_dimension', { documentToken: original.result.documentToken, name: depth.name, expectedValueMm: 8, valueMm: 9 });
  assert.equal(staleDocument.ok, false); assert.match(staleDocument.error, /document\/configuration changed/);
  const staleValue = await call('set_dimension', { documentToken, name: depth.name, expectedValueMm: 7, valueMm: 9 });
  assert.equal(staleValue.ok, false); assert.match(staleValue.error, /dimension changed/);
  const edited = await call('set_dimension', { documentToken, name: depth.name, expectedValueMm: 8, valueMm: 9 });
  assert.equal(edited.ok, true); assert.equal(edited.result.dimensions.find(d => d.name === depth.name).valueMm, 9);
  assert.ok(Math.abs(edited.result.volumeMm3 - Math.PI * (20 ** 2 - 5 ** 2) * 9) < .00001, 'SolidWorks independently measures the edited annulus');
  assert.equal((await call('rebuild', { documentToken })).ok, true);
  const exported = await call('export', { documentToken, openHelios: false });
  assert.equal(exported.ok, true); assert.equal(exported.result.uploads, false);
  assert.deepEqual((await call('inspect')).result.stepExport, made.result.stepExport, 'STEP export preferences are restored');
  await writeFile(`${directory}/export-result.json`, JSON.stringify(exported, null, 2));
  await writeFile(`${directory}/mcp-transcript.json`, JSON.stringify(transcript, null, 2));
  console.log('Real SolidWorks MCP: inspected, created annulus, refused stale document/value, edited 8→9 mm, rebuilt, exported AP214 and Helios workspace.');
  console.log(exported.result.archive);
} finally { child.stdin.end(); }
