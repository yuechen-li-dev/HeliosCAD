import { expect, it } from 'vitest';
import { stepTextSha256 } from '../app/localProject';
import { importedFinishPrerequisites } from './importedEdgeFinish';

const body = { id: 'Edit/part', fields: [] };
const target = { assetPath: '../assets/stock.step' };

it('pins the relative source asset and records annotation consent in the revision operations', async () => {
  const step = 'ISO-10303-21;\r\nDATA;\r\nENDSEC;\r\n';
  expect(await importedFinishPrerequisites(body, target, 'parts/edit.firmament', { 'assets/stock.step': step })).toEqual([
    { kind: 'setField', node: body.id, field: 'textSha256', value: JSON.stringify(await stepTextSha256(step)) },
    { kind: 'setField', node: body.id, field: 'geometryOnly', value: 'true' },
  ]);
});

it('preserves an existing pin and consent, and explains how to recover a missing asset', async () => {
  const pinned = { ...body, fields: [{ name: 'Sha256', text: '"pin"' }, { name: 'GeometryOnly', text: 'true' }] };
  expect(await importedFinishPrerequisites(pinned, target, 'parts/edit.firmament', {})).toEqual([]);
  await expect(importedFinishPrerequisites(body, target, 'parts/edit.firmament', {})).rejects.toThrow('Reopen the workspace with its original STEP file');
});
