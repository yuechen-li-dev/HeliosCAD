import { describe, expect, it } from 'vitest';
import { importedProject, packProject, sourceFiles, unpackProject } from './localProject';

describe('imported part workspace', () => {
  it('roundtrips source and original STEP text independently, including line endings', () => {
    const text = 'ISO-10303-21;\r\nDATA;\r\nENDSEC;\r\n';
    const project = importedProject('mounting-plate.step', text);
    project.documents[project.root] += '// annotation layer\n';
    expect(unpackProject(packProject(project))).toEqual(project);
    expect(sourceFiles(project.documents)).toEqual([project.root]);
    expect(project.documents[project.root]).toContain('InlineStep part');
    expect(project.documents['mounting-plate.step']).toBe(text);
  });
  it('rejects paths that could inject source or escape a workspace', () => {
    for (const name of ['../part.step', 'C:/part.step', 'part".step', '/part.step']) expect(() => importedProject(name, '')).toThrow('Invalid workspace path');
  });
});
