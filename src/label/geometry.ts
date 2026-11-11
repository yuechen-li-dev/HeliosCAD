import type { DisplayMesh, MeasurementPick } from '@aetheris/cad';

/** One face of the built mesh, found by selector, in world coordinates. Display normals of a planar face are its exact
 * plane normal, so angles between planes are classified here; distances still come from the B-rep measurement query. */
export interface LabelFace {
  readonly selector: string;
  readonly occurrenceId: string;
  readonly faceId: string;
  readonly surfaceKind: string | null;
  readonly diameterMm: number | null;
  /** Unit normal for a plane, unit axis for a cylinder (sign arbitrary), in world coordinates. */
  readonly direction: readonly number[] | null;
  /** A point on the face (triangle centroid nearest the face's middle), world coordinates. */
  readonly point: readonly number[];
  /** Outward surface normal at `point`. */
  readonly pointNormal: readonly number[];
}

type V = readonly number[];
const sub = (a: V, b: V) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const cross = (a: V, b: V) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
export const dot = (a: V, b: V) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const unit = (a: V) => { const l = Math.hypot(a[0]!, a[1]!, a[2]!); return l > 1e-12 ? a.map(x => x / l) : null; };

function transformPoint(m: V, p: V) {
  return [m[0]! * p[0]! + m[4]! * p[1]! + m[8]! * p[2]! + m[12]!, m[1]! * p[0]! + m[5]! * p[1]! + m[9]! * p[2]! + m[13]!, m[2]! * p[0]! + m[6]! * p[1]! + m[10]! * p[2]! + m[14]!];
}
function transformVector(m: V, v: V) {
  return [m[0]! * v[0]! + m[4]! * v[1]! + m[8]! * v[2]!, m[1]! * v[0]! + m[5]! * v[1]! + m[9]! * v[2]!, m[2]! * v[0]! + m[6]! * v[1]! + m[10]! * v[2]!];
}

/** The face a selector names in an occurrence (or the first occurrence showing it). */
export function findFace(mesh: DisplayMesh, selector: string, occurrenceId?: string | null): LabelFace | null {
  for (const occurrence of mesh.occurrences) {
    if (occurrenceId && occurrence.id !== occurrenceId) continue;
    const definition = mesh.definitions.find(d => d.id === (occurrence.definitionId ?? occurrence.id));
    const range = definition?.ranges.find(r => r.selector === selector);
    if (!definition || !range) continue;
    const m = occurrence.transform.length === 16 ? occurrence.transform : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const vertex = (i: number) => { const k = definition.indices[i]! * 3; return [definition.positions[k]!, definition.positions[k + 1]!, definition.positions[k + 2]!]; };
    const normal = (i: number) => { const k = definition.indices[i]! * 3; return [definition.normals[k]!, definition.normals[k + 1]!, definition.normals[k + 2]!]; };
    const centroids: number[][] = [], normals: number[][] = [];
    for (let t = range.startTriangle; t < range.startTriangle + range.triangleCount; t++) {
      const a = vertex(t * 3), b = vertex(t * 3 + 1), c = vertex(t * 3 + 2);
      centroids.push([(a[0]! + b[0]! + c[0]!) / 3, (a[1]! + b[1]! + c[1]!) / 3, (a[2]! + b[2]! + c[2]!) / 3]);
      normals.push(normal(t * 3), normal(t * 3 + 1), normal(t * 3 + 2));
    }
    if (!centroids.length) continue;
    const mean = centroids.reduce((s, c) => [s[0]! + c[0]!, s[1]! + c[1]!, s[2]! + c[2]!], [0, 0, 0]).map(x => x / centroids.length);
    let at = 0;
    centroids.forEach((c, i) => { if (Math.hypot(...sub(c, mean)) < Math.hypot(...sub(centroids[at]!, mean))) at = i; });
    const near = centroids[at]!;
    const atNormal = unit(transformVector(m, [0, 1, 2].map(k => normals[at * 3]![k]! + normals[at * 3 + 1]![k]! + normals[at * 3 + 2]![k]!))) ?? [0, 0, 1];
    const kind = range.surfaceKind ?? null;
    let direction: number[] | null = null;
    if (kind === 'Plane') direction = unit(transformVector(m, normals[0]!));
    else if (kind === 'Cylinder' || kind === 'Cone') {
      // The axis is perpendicular to every surface normal: the cross product of the two most different normals.
      let best: number[] | null = null, size = 0;
      for (let i = 1; i < normals.length; i++) { const c = cross(normals[0]!, normals[i]!), l = Math.hypot(c[0]!, c[1]!, c[2]!); if (l > size) { size = l; best = c; } }
      direction = best && size > 1e-3 ? unit(transformVector(m, best)) : null;
    }
    return { selector, occurrenceId: occurrence.id, faceId: range.faceId, surfaceKind: kind, diameterMm: range.diameterMm ?? null,
      direction, point: transformPoint(m, near), pointNormal: atNormal };
  }
  return null;
}

/** Acute angle between two directions, degrees, 0..90. */
export function acuteAngle(a: V, b: V) {
  return Math.acos(Math.min(1, Math.abs(dot(a, b)))) * 180 / Math.PI;
}

/** A measurement pick that hits the face head-on at its representative point. */
export function facePick(face: LabelFace): MeasurementPick {
  const n = face.pointNormal;
  const id = Number(face.faceId.split(':').pop());
  // Start just outside the face along its normal and aim back at it.
  return { occurrenceId: face.occurrenceId, faceId: Number.isInteger(id) ? id : null,
    rayOrigin: face.point.map((x, i) => x + n[i]! * Math.min(1, (face.diameterMm ?? 4) / 4)), rayDirection: n.map(x => -x) };
}
