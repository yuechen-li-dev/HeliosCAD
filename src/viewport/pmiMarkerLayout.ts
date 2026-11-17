import type { PmiDisplayAnnotation } from '@aetheris/cad';

/** Okabe–Ito, as `pmiMarkerColor` in telos: one colour per record, distinguishable with colour-vision deficiencies. */
export const MARKER_COLORS = ['#E69F00', '#56B4E9', '#009E73', '#CC79A7', '#0072B2', '#D55E00', '#F0E442'] as const;
export const markerColor = (index: number) => MARKER_COLORS[index % MARKER_COLORS.length]!;

export interface MarkerTag { readonly id: string; readonly number: number; readonly label: string; readonly color: string; readonly anchor: readonly number[] }

/** One tag per record: its number (the record's order in the Pmi block), value and name, at its target's centre. */
export function markerTags(annotations: readonly PmiDisplayAnnotation[]): MarkerTag[] {
  return annotations.map((a, i) => {
    const p = a.target?.positions;
    let anchor: readonly number[] = a.anchor;
    if (p && p.length >= 3) {
      const n = p.length / 3, sum = [0, 0, 0];
      for (let k = 0; k < p.length; k++) sum[k % 3]! += p[k]!;
      anchor = sum.map(x => x / n);
    }
    // The record's name, unless its text already says it (a datum's letter).
    const named = new RegExp(`(^|\\W)${a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\W)`).test(a.text);
    return { id: a.id, number: i + 1, label: named ? a.text : `${a.text} · ${a.name}`, color: markerColor(i), anchor };
  });
}

export interface Placement { readonly id: string; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly ax: number; readonly ay: number }

/**
 * Places tags beside their anchors without overlapping each other, the viewport edge or another record's anchor.
 * Candidates ring each anchor at growing distances, upper right first; a tag that fits nowhere takes its last
 * candidate, so every record is always shown. Deterministic for a given view, so screenshots are reproducible.
 */
export function layoutTags(tags: readonly { id: string; ax: number; ay: number; width: number; height: number }[], width: number, height: number): Placement[] {
  const placed: Placement[] = [];
  const overlaps = (x: number, y: number, w: number, h: number) =>
    placed.some(p => x < p.x + p.width + 4 && x + w + 4 > p.x && y < p.y + p.height + 4 && y + h + 4 > p.y)
    || tags.some(t => t.ax > x - 6 && t.ax < x + w + 6 && t.ay > y - 6 && t.ay < y + h + 6);
  const directions = [[1, -1], [1, 1], [-1, -1], [-1, 1], [1, 0], [-1, 0], [0, -1], [0, 1]] as const;
  // Nearer the top of the screen first, so tags stack predictably.
  for (const tag of [...tags].sort((a, b) => a.ay - b.ay || a.ax - b.ax)) {
    let best: Placement | null = null;
    search: for (const r of [28, 48, 76, 112, 160]) for (const [dx, dy] of directions) {
      const x = dx > 0 ? tag.ax + r * .7 : dx < 0 ? tag.ax - r * .7 - tag.width : tag.ax - tag.width / 2;
      const y = dy > 0 ? tag.ay + r * .5 : dy < 0 ? tag.ay - r * .5 - tag.height : tag.ay - tag.height / 2;
      const inside = x >= 4 && y >= 4 && x + tag.width <= width - 4 && y + tag.height <= height - 4;
      const candidate = { id: tag.id, x, y, width: tag.width, height: tag.height, ax: tag.ax, ay: tag.ay };
      if (inside && !overlaps(x, y, tag.width, tag.height)) { best = candidate; break search; }
      if (inside) best ??= candidate;
    }
    placed.push(best ?? { id: tag.id, x: double(tag.ax + 12, 4, width - tag.width - 4), y: double(tag.ay - tag.height - 12, 4, height - tag.height - 4), width: tag.width, height: tag.height, ax: tag.ax, ay: tag.ay });
  }
  return placed;
}
const double = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));

/** Where a tag's leader leaves it: the point of its rectangle nearest the anchor. */
export function leaderStart(p: Placement): [number, number] {
  return [double(p.ax, p.x, p.x + p.width), double(p.ay, p.y, p.y + p.height)];
}
