import type { MeasurementResult, ModelSession } from '@aetheris/cad';
import { facePick, type LabelFace } from './geometry';

/** The measurement a selection implies, chosen by its kinds instead of a mode: two planes give their distance (when
 * parallel) and angle, two axial faces the distance and angle between axes. Values come from the exact B-rep. */
export function measurementMode(faces: readonly (LabelFace | null)[]): 'planes' | 'axes' | null {
  if (faces.length !== 2 || faces.some(f => !f)) return null;
  const kinds = faces.map(f => f!.surfaceKind);
  if (kinds.every(k => k === 'Plane')) return 'planes';
  if (kinds.every(k => k === 'Cylinder' || k === 'Cone' || k === 'Torus')) return 'axes';
  return null;
}

export async function measureSelection(model: ModelSession, faces: readonly (LabelFace | null)[]): Promise<MeasurementResult | null> {
  const mode = measurementMode(faces);
  if (!mode || model.measurementAvailable === false) return null;
  return model.measure({ mode, first: facePick(faces[0]!), second: facePick(faces[1]!), allowApproximate: false });
}
