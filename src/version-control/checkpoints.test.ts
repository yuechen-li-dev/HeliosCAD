import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { Checkpoints } from './checkpoints';

describe('whole project checkpoints', () => {
  it('survives a new store instance, keeps modules and invalid drafts, and restores without removing future states', async () => {
    const workspace = crypto.randomUUID(), history = new Checkpoints();
    const project = { root: 'root.firmament', documents: { 'root.firmament': 'invalid draft', 'parts/rod.firmament': 'first part' } };
    const a = await history.save(workspace, 'A', project, undefined, 'Preserve shaft diameter');
    project.documents['parts/rod.firmament'] = 'second part';
    const b = await history.save(workspace, 'B', project);
    const reopened = new Checkpoints(); const list = await reopened.list(workspace);
    expect(list.find(c => c.id === a.id)?.project.documents['parts/rod.firmament']).toBe('first part');
    expect(list.find(c => c.id === a.id)?.requirements).toBe('Preserve shaft diameter');
    const restored = await reopened.save(workspace, 'Restore A', a.project, a.id, a.requirements);
    const final = await history.list(workspace); expect(final).toHaveLength(3);
    expect(final.find(c => c.id === b.id)?.project.documents['parts/rod.firmament']).toBe('second part');
    expect(final.find(c => c.id === restored.id)?.restoredFrom).toBe(a.id);
    expect(await history.list('another-workspace')).toEqual([]);
  });
});
