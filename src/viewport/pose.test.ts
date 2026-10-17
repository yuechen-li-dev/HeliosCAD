import { describe, expect, it } from 'vitest';
import type { DisplayMesh, MotionPose } from '@aetheris/cad';
import { poseCoverage, posedMesh } from './pose';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const mesh = { schema: 'aetheris/assembly-display-mesh/1', name: 'Arm', units: 'mm', definitions: [],
  occurrences: [{ id: 'occ:base', path: 'Base', semanticEntityId: 'Base', transform: identity }, { id: 'occ:link', path: 'Link', semanticEntityId: 'Link', transform: identity }] } as DisplayMesh;
const moved = [...identity.slice(0, 12), 20, 0, 0, 1];
const pose: MotionPose = { revision: 1, motion: 'Wave', timeSeconds: 0.5, state: { Shoulder: 45 }, transforms: [{ id: 'occ:link', matrix: new Float64Array(moved) }, { id: 'occ:gone', matrix: identity }] };

describe('motion pose', () => {
  it('moves only the occurrences the pose names', () => {
    const posed = posedMesh(mesh, pose);
    expect(posed.occurrences[0]).toBe(mesh.occurrences[0]);
    expect(posed.occurrences[1].transform).toEqual(moved);
    expect(mesh.occurrences[1].transform).toBe(identity);
    expect(poseCoverage(mesh, pose)).toBe(1);
  });
  it('leaves the built mesh as it is without a pose', () => {
    expect(posedMesh(mesh, null)).toBe(mesh);
  });
});
