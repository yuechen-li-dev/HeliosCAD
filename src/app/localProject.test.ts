import { describe, expect, it } from 'vitest';
import { importedProject, packProject, sourceFiles, stepTextSha256, unpackProject } from './localProject';

describe('imported part workspace', () => {
  it('roundtrips source and original STEP text independently, including line endings', () => {
    const text = 'ISO-10303-21;\r\nDATA;\r\nENDSEC;\r\n';
    const project = importedProject('mounting-plate.step', text, 'a'.repeat(64));
    project.documents[project.root] += '// annotation layer\n';
    expect(unpackProject(packProject(project))).toEqual(project);
    expect(sourceFiles(project.documents)).toEqual([project.root]);
    expect(project.documents[project.root]).toContain('InlineStep part');
    expect(project.documents['mounting-plate.step']).toBe(text);
  });
  it('pins a foreign STEP by its LF text hash and leaves an Aetheris export unpinned', async () => {
    const foreign = 'ISO-10303-21;\r\nDATA;\r\nENDSEC;\r\n';
    const hash = await stepTextSha256(foreign);
    expect(hash).toBe(await stepTextSha256(foreign.replace(/\r\n/g, '\n')));
    expect(importedProject('boxy.stp', foreign, hash).documents['boxy.firmament']).toContain(`InlineStep part { path: "boxy.stp" textSha256: "${hash}" }`);
    const native = "FILE_DESCRIPTION(('Aetheris AP242 subset export'),'2;1');FILE_NAME('','',(''),(''),'Aetheris.Kernel','','');FILE_SCHEMA(('AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF'));";
    expect(importedProject('part.step', native).documents['part.firmament']).toContain('InlineStep part { path: "part.step" }');
    expect(() => importedProject('boxy.stp', foreign)).toThrow('text hash');
  });
  it('rejects paths that could inject source or escape a workspace', () => {
    for (const name of ['../part.step', 'C:/part.step', 'part".step', '/part.step']) expect(() => importedProject(name, '', 'a'.repeat(64))).toThrow('Invalid workspace path');
  });
});
