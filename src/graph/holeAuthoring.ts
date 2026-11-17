import type { Diagnostic, PlanarFaceSupport } from '@aetheris/cad';
import { constrainCenter } from '../viewport/featurePlacement';

export function isHoleTool(id: string): boolean {
  return ['hole', 'hole-blind', 'counterbore', 'countersink'].includes(id);
}

export const holeFieldLabel = (name: string): string | undefined => ({
  on: 'Face',
  counterborediameter: 'Counterbore diameter',
  counterboredepth: 'Counterbore depth',
  countersinkdiameter: 'Countersink diameter',
  countersinkangle: 'Countersink angle',
} as Readonly<Record<string, string>>)[name.toLowerCase()];

export function holePlacementProblem(frame: PlanarFaceSupport, center: readonly string[], diameter: number): string {
  const point = center.map(Number);
  if (center.some(value => !value.trim()) || !point.every(Number.isFinite)) return 'Enter a number for Center X and Center Y.';
  if (!Number.isFinite(diameter) || diameter <= 0) return 'Enter a positive diameter.';
  const nearest = constrainCenter(frame, point, diameter);
  if (!nearest) return 'There is no room for this opening on the face. Reduce the diameter or choose a larger face.';
  if (nearest.every((value, i) => Math.abs(value - point[i]) <= 1e-6)) return '';
  const edge = constrainCenter({ ...frame, excludedDisks: [] }, point, diameter);
  if (edge?.every((value, i) => Math.abs(value - point[i]) <= 1e-6))
    return 'Move Center X or Y away from existing holes, or reduce the diameter. Leave at least 0.01 mm between openings.';
  return 'Move Center X or Y farther inside the face, or reduce the diameter to keep positive edge clearance.';
}

const bracketBlind = 'This face supports through holes only. Choose Through all to keep this location, or use the top of a block for a blind hole.';
export function holeEndProblem(selector: string, end: string): string {
  return selector.includes('.Side(') && /^Blind\s*\(/i.test(end) ? bracketBlind : '';
}

const perforationAdvice = [
  ['perforation-composition-unsupported', 'Start with a block without holes or edge finishes. One Perforation creates the whole field of openings.'],
  ['perforation-support-unsupported', 'Set Face to +Z to perforate the top of a block.'],
  ['perforation-layout-invalid', 'Choose Grid or Hex for the top of a block.'],
  ['perforation-field-invalid', 'Use positive Diameter and Pitch values and a Margin of at least 0 mm. Choose Grid or Hex and keep Face at +Z for a block.'],
  ['perforation-hole-overlap', 'Increase Pitch or reduce Diameter so material remains between the openings.'],
  ['perforation-support-too-small', 'The top face has no room for a complete opening. Reduce Margin or Diameter, or start with a larger block.'],
  ['perforation-no-admissible-holes', 'No complete opening fits. Reduce Margin or Diameter, or use a larger face.'],
  ['perforation-count-exceeded', 'Increase Pitch or Margin to bring the pattern to 1,000 openings or fewer.'],
] as const;

export function holePreviewAdvice(issues: readonly Diagnostic[], error: string, kind: string): string | null {
  const messages = [error, ...issues.flatMap(item => [`${item.code}: ${item.message}`, item.details ?? ''])];
  const has = (pattern: string) => messages.some(message => message.includes(pattern));
  if (kind === 'perforation') return perforationAdvice.find(([code]) => has(code))?.[1] ?? null;
  if (has('firmament-v2-hole-drill-point-composition')) {
    const feature = messages.map(message => /Hole '([^']+)' has a drill point/.exec(message)?.[1].split('.').at(-1)).find(Boolean);
    return `${feature || 'The blind hole'} has a drill point. Keep it as the only hole on this block, or set its End to Through all before combining holes.`;
  }
  const recessDepth = messages.map(message => /recess-depth-must-leave-at-least-0\.01mm-of-shaft:\s*(.+)/.exec(message)?.[1]).find(Boolean);
  if (recessDepth) return recessDepth.replace('CounterboreDepth', 'Counterbore depth')
    .replace('CountersinkDiameter', 'Countersink diameter').replace('CountersinkAngle', 'Countersink angle');
  const breakthrough = messages.map(message => /BlindHoleBreakthrough:.*?totalDepth=([\d.e+-]+);\s*hostInterval=\[([\d.e+-]+),\s*([\d.e+-]+)\]/i.exec(message)).find(Boolean);
  if (breakthrough) {
    const depth = Number(breakthrough[1]);
    const stock = Number(breakthrough[3]) - Number(breakthrough[2]);
    if (Number.isFinite(depth) && Number.isFinite(stock)) {
      const mm = (value: number) => Number(value.toFixed(3));
      return `The blind hole reaches ${mm(depth)} mm including its drill tip, but this face has ${mm(stock)} mm of material. Reduce Blind depth or choose Through all.`;
    }
  }
  if (has('BlindHoleBreakthrough')) return 'The blind hole reaches the far side. Reduce Blind depth to leave room for the drill tip, or choose Through all.';
  if (has('composite materialization is limited to circular shaft holes'))
    return 'This block supports several plain holes or one recessed hole. Choose a plain hole here, or use a bracket face for multiple separated recesses.';
  if (has('firmament-v2-hole-diameter-invalid')) return 'Enter a positive Diameter in millimeters.';
  if (has('firmament-v2-hole-depth-invalid')) return 'Enter a positive Blind depth in millimeters.';
  if (has('firmament-v2-hole-counterbore-invalid')) return 'Set Counterbore diameter larger than Diameter and use a positive Counterbore depth.';
  if (has('firmament-v2-hole-countersink-invalid')) return 'Set Countersink diameter larger than Diameter and set Countersink angle between 0° and 180°.';
  if (messages.some(message => /Inner loops \d+ and \d+ overlap or are nested\./.test(message))) {
    if (kind === 'counterbore') return 'The recess leaves overlapping boundaries. Reduce Counterbore depth to leave room for the through shaft, or reduce Counterbore diameter.';
    if (kind === 'countersink') return 'The recess leaves overlapping boundaries. Reduce Countersink diameter or increase Countersink angle to keep a through shaft.';
  }
  if (has('invalid-shaft-or-recess-diameter')) return 'Set Diameter to at least 0.02 mm. For a recess, set its diameter at least 0.02 mm larger than Diameter.';
  if (has('countersink-angle-must-be-between-0-and-180deg')) return 'Set Countersink angle between 0° and 180°.';
  if (has('compose-face-hole-contract'))
    return 'Use a positive Diameter and choose Through all for this face. For a blind hole, click the top of a block.';
  if (has('compose-hole-unsupported-variant-or-end'))
    return 'For a recessed through hole, click a flat bracket face to place it. Use the top of a block for a blind hole.';
  if (has('existing-hole-envelope-clearance')) return 'The cut runs into an existing hole. Move the center away or reduce the diameter.';
  if (has('entry-or-existing-hole-clearance') || has('no-contained-parallel-exit-support'))
    return 'The opening needs room on both sides. Move the center farther from edges or other holes, or reduce the diameter.';
  if (has('tool-corridor-interaction-not-admitted'))
    return 'The cut is too close to another surface or feature. Move the center, reduce the diameter, or choose a clear face.';
  return null;
}
