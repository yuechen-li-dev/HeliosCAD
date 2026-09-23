import { describe, expect, it } from 'vitest';
import { appendCenteredHole, appendFaceDatum, appendHoleWallDiameter } from './sourceAuthoring';

describe('bounded source authoring', () => {
  it('appends readable Firmament inside the model', () => {
    const result = appendCenteredHole('Model A {\n Box Body { Size: [1mm,1mm,1mm] }\n}\n');
    expect(result).toContain('Modify Body');
    expect(result.indexOf('Modify Body')).toBeLessThan(result.lastIndexOf('}'));
  });
  it('uses the requested semantic target', () => expect(appendCenteredHole('Model A {}', 'Plate')).toContain('Modify Plate'));
  it('allocates deterministic names', () => expect(appendCenteredHole('Model A { // HeliosHole1\n}')).toContain('HeliosHole2'));
  it('rejects text without a model block', () => expect(() => appendCenteredHole('Units: mm')).toThrow(/model block/i));
  it('references a selected face in a PMI datum and reuses the block', () => {
    const first = appendFaceDatum('Model A { Box Body { Size: [1mm,1mm,1mm] } }', 'face(+Z)');
    expect(first.source).toContain('Pmi { Datum SelectedFace1 { Target: face(+Z) } }');
    const second = appendFaceDatum(first.source, 'face(+X)');
    expect(second.source).toContain('Datum SelectedFace2 { Target: face(+X) }');
    expect(second.source.match(/\bPmi\s*\{/g)).toHaveLength(1);
  });
  it('inserts a Hole wall diameter reference using the compiler selector and diameter', () => {
    const first = appendHoleWallDiameter('Model A { Box Body { Size: [40mm,30mm,8mm] } }', 'face(H.Wall)', 6);
    expect(first.source).toContain('Pmi { HoleDiameter SelectedWall1 { Target: face(H.Wall) Value: 6mm } }');
    const second = appendHoleWallDiameter(first.source, 'face(J.Wall)', 7);
    expect(second.source).toContain('HoleDiameter SelectedWall2 { Target: face(J.Wall) Value: 7mm }');
    expect(second.source.match(/\bPmi\s*\{/g)).toHaveLength(1);
  });
});
