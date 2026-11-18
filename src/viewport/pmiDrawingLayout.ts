import type { PmiDisplayAnnotation, PmiOffsets } from '@aetheris/cad';

export type Point3 = readonly [number, number, number];
export type ViewRay = (pixel: [number, number]) => { origin: readonly number[]; direction: readonly number[] } | null;

export const zeroOffset: Point3 = [0, 0, 0];
export const translate = (point: readonly number[], delta: readonly number[]): Point3 =>
  [point[0] + delta[0], point[1] + delta[1], point[2] + delta[2]];

const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const subtract = (a: readonly number[], b: readonly number[]): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

export function pointOnDrawing(ray: ReturnType<ViewRay>, origin: readonly number[], normal: readonly number[]): Point3 | null {
  if (!ray) return null;
  const approach = dot(ray.direction, normal);
  if (Math.abs(approach) < .035) return null;
  const distance = dot(subtract(origin, ray.origin), normal) / approach;
  if (distance < 0 || !Number.isFinite(distance)) return null;
  return translate(ray.origin, ray.direction.map(component => component * distance));
}

export function offsetFromDrag(original: Point3, from: Point3, to: Point3, normal: readonly number[]): Point3 | null {
  const offset = translate(original, subtract(to, from));
  const projected = normal.map(value => -dot(offset, normal) * value);
  const delta = translate(offset, projected);
  return delta.every(value => Number.isFinite(value) && Math.abs(value) < 1e8) ? delta : null;
}

/** Same label spans and fixed leader tip as the GLB exporter. Only the Drawing style uses these buffers. */
export function placeDrawingLabels(annotations: readonly PmiDisplayAnnotation[] | undefined, offsets: PmiOffsets) {
  if (!annotations || !Object.keys(offsets).length) return annotations;
  return annotations.map(annotation => {
    const { placement, drawing } = annotation;
    const offset = placement && offsets[placement.key];
    if (!placement || !offset || !drawing) return annotation;
    const delta = translate(offset, placement.normal.map(value => -dot(offset, placement.normal) * value));
    const { lineStart, lineCount, leaderLine } = placement;
    const lines = drawing.lines.map((line, i) => {
      if (i === leaderLine) {
        const [tip, next] = line;
        const direction = subtract(next, tip);
        const length = Math.hypot(...direction);
        const fraction = length > 0 ? Math.min(.5, annotation.textHeight / length) : 0;
        return [tip, translate(tip, direction.map(value => value * fraction)), ...line.slice(1).map(point => translate(point, delta))];
      }
      return i >= lineStart && i < lineStart + lineCount ? line.map(point => translate(point, delta)) : line;
    });
    const moveMesh = (mesh: typeof drawing.fill, count: number) => mesh && {
      ...mesh,
      positions: mesh.positions.map((value, i) => i < count * 3 ? value + delta[i % 3] : value),
    };
    return { ...annotation, labelPosition: translate(annotation.labelPosition, delta),
      drawing: { lines, fill: moveMesh(drawing.fill, placement.fillVertices), panel: moveMesh(drawing.panel, placement.panelVertices) } };
  });
}
