import type { DisplayMesh, MotionPose } from '@aetheris/cad';

/** The built display mesh with a sampled motion pose applied: every occurrence the pose moves takes
 * the pose's transform; geometry, identity and selection are untouched. */
export function posedMesh(mesh: DisplayMesh, pose: MotionPose | null | undefined): DisplayMesh {
  if (!pose || pose.transforms.length === 0) return mesh;
  const moved = new Map(pose.transforms.map(t => [t.id, Array.from(t.matrix)]));
  let changed = false;
  const occurrences = mesh.occurrences.map(occurrence => {
    const transform = moved.get(occurrence.id);
    if (!transform) return occurrence;
    changed = true;
    return { ...occurrence, transform };
  });
  return changed ? { ...mesh, occurrences } : mesh;
}

/** How many of the pose's transforms name an occurrence of the mesh: a pose for another build moves nothing. */
export function poseCoverage(mesh: DisplayMesh, pose: MotionPose) {
  const ids = new Set(mesh.occurrences.map(o => o.id));
  return pose.transforms.filter(t => ids.has(t.id)).length;
}
