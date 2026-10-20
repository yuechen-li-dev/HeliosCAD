import { webcrypto } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it, vi } from 'vitest';
import { projectHashes, reviewZip } from './engineeringEvidence';

vi.stubGlobal('crypto', webcrypto);
describe('engineering review package', () => {
  it('contains actual source, export bytes, citations and hashes and never asserts approval', async () => {
    const project = { root: 'part.firmament', documents: { 'part.firmament': 'Model Part {}', 'parts/rod.firmament': 'Struct Rod {}' } };
    const manifest = { root: project.root, documentHashes: await projectHashes(project), evidence: [{ locator: 'page:2', sha256: 'reference-hash' }], approved: true };
    const bytes = await reviewZip(project, manifest, [{ fileName: 'Part.step', mediaType: 'model/step', bytes: new Uint8Array([1, 2, 3]) }]);
    const files = unzipSync(bytes);
    expect(strFromU8(files['source/parts/rod.firmament'])).toBe('Struct Rod {}');
    expect(files['exports/Part.step']).toEqual(new Uint8Array([1, 2, 3]));
    const review = JSON.parse(strFromU8(files['review.json']));
    expect(review.approved).toBe(false); expect(review.status).toBe('draft-for-human-review');
    expect(review.evidence[0].locator).toBe('page:2'); expect(review.exports[0].sha256).toHaveLength(64);
    await expect(reviewZip({ ...project, documents: { ...project.documents, 'part.firmament': 'changed' } }, manifest, [])).rejects.toThrow('stale');
    await expect(reviewZip(project, manifest, [{ fileName: '../escape.step', mediaType: '', bytes: new Uint8Array() }])).rejects.toThrow('Unsafe');
  });
});
