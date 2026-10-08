/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadShowcase, showcaseExamples } from './catalog';

describe('canonical example projects', () => {
  it('loads each intact project root with every shipped source document', async () => {
    for (const example of showcaseExamples) {
      const project = await loadShowcase(example.id);
      expect(project.documents[project.root].length).toBeGreaterThan(50);
      expect(existsSync(resolve('public', example.thumbnail.slice(1)))).toBe(true);
    }
    const guitar = await loadShowcase('guitar');
    expect(guitar.documents['guitar.firmasm']).toContain('include "body-assembly.firmament"');
    expect(guitar.documents['CarvedMaple.firmament']).toContain('include "body-profile.firmament"');
    expect(Object.keys(guitar.documents).length).toBeGreaterThan(20);
    const house = await loadShowcase('house');
    expect(house.documents['living.firmament']).toContain('include "components.firmament"');
    expect(Object.keys(house.documents)).toHaveLength(8);
  });
  it('reports an unavailable example instead of loading unrelated source', async () => {
    await expect(loadShowcase('missing')).rejects.toThrow('unavailable');
  });
});
