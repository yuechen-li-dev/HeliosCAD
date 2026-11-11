/** Nominal rounding and ISO 286 hole fits. Every preset expands to explicit allowances in source. */

export const GRIDS_MM = [0.001, 0.01, 0.1, 0.5, 1] as const;

const decimals = (grid: number) => Math.max(0, -Math.floor(Math.log10(grid) + 1e-9));
export function roundTo(value: number, grid: number) {
  return Number((Math.round(value / grid) * grid).toFixed(decimals(grid)));
}
/** The coarsest grid on which the value is already nominal up to export noise (within 2 % of the grid), so
 * 24.9973 proposes 25, 6.6 proposes 6.6 and 100.3 proposes 100.3, never 100. */
export function defaultGrid(value: number) {
  for (const grid of [...GRIDS_MM].reverse())
    if (Math.abs(roundTo(value, grid) - value) <= grid * 0.02 + 1e-9) return grid;
  return GRIDS_MM[0];
}
export function formatMm(value: number, grid = 0.001) {
  return value.toFixed(decimals(grid));
}

// ISO 286-1 standard tolerance grades, µm, for nominal sizes up to 500 mm. Upper bounds of each size range, mm.
const RANGES = [3, 6, 10, 18, 30, 50, 80, 120, 180, 250, 315, 400, 500];
const IT: Record<7 | 8, readonly number[]> = {
  7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
  8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
};
/** Hole fits: H (EI = 0), so the band is +IT / −0. Shaft fits (g6, f7 …) have both limits below nominal, which
 * `PlusMinus` cannot express, so they are not offered. */
export const HOLE_FITS = ['H7', 'H8'] as const;
export type HoleFit = (typeof HOLE_FITS)[number];

export function fitAllowances(fit: HoleFit, nominal: number): { plus: number; minus: number } | null {
  if (!(nominal > 0) || nominal > 500) return null;
  const range = RANGES.findIndex(top => nominal <= top);
  const grade = Number(fit.slice(1)) as 7 | 8;
  return { plus: IT[grade][range]! / 1000, minus: 0 };
}
