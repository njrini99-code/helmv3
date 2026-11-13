/**
 * Strokes gained, said one way everywhere. The stored figures
 * (golf_rounds.strokes_gained_*, golf_round_stats_cache) are measured against
 * the Tour (Broadie expected strokes; the women's curve is the men's scaled by
 * 1.083), never against D1: golf_pga_standards has no D1 strokes gained. So
 * every screen that shows one names the Tour, and a women's team says so.
 * An unknown tour (the team's own row didn't load, CH-4210) claims neither.
 */
export type ChSgTour = 'pga' | 'lpga' | null;

export interface ChSgBaseline {
  /** The caption under a figure: "vs Tour". */
  vs: string;
  /** For a sentence: "dashed line is the Tour baseline". */
  noun: string;
  /** The zero mark on a gauge: "Tour", "Women's Tour" (A8.3). */
  mark: string;
  /** For a sentence, the benchmark itself: "the Tour", "the women's Tour" (row 110). */
  name: string;
  /** The zero line on a trend: "Zero is the Tour", "Zero is the women's Tour" (A8.3). */
  zero: string;
  /**
   * Why a college team's strokes gained reads below zero, said once on each page whose headline is a strokes gained figure, in
   * the caption that page already has (owner, 12 Nov 2026, Q1: keep the PGA Tour baseline, and say so, so a coach does not read
   * every negative as broken numbers). "Measured against PGA Tour pros, so below zero is normal for nearly everyone else." It names
   * no college, division or level: the Tour is the only benchmark on these pages (Q-88), so the sentence says what zero is, not
   * whom the team is held against.
   */
  why: string;
  /** The same sentence where no strokes gained figure stands beside it (Roster's head): "Strokes gained is measured against …". */
  whyNamed: string;
}

/** The one place the sentence is written; `against` is who zero is. */
const belowZero = (against: string) => ({
  why: `Measured against ${against}, so below zero is normal for nearly everyone else.`,
  whyNamed: `Strokes gained is measured against ${against}, so below zero is normal for nearly everyone else.`,
});

export function sgBaseline(tour: ChSgTour): ChSgBaseline {
  if (tour === 'pga') return { vs: 'vs Tour', noun: 'the Tour baseline', mark: 'Tour', name: 'the Tour', zero: 'Zero is the Tour', ...belowZero('PGA Tour pros') };
  if (tour === 'lpga') return { vs: "vs the women's Tour baseline", noun: "the women's Tour baseline", mark: "Women's Tour", name: "the women's Tour", zero: "Zero is the women's Tour", ...belowZero('LPGA Tour pros') };
  // A tour the app could not read claims neither the men's nor the women's (CH-4210).
  return { vs: 'vs the baseline', noun: 'the baseline', mark: 'Baseline', name: 'the baseline', zero: 'Zero is the baseline', ...belowZero('Tour pros') };
}

/**
 * The half-width of a strokes gained bar chart: the largest value shown,
 * rounded up to a whole stroke, never under 1. Bars are symmetric around
 * zero, so a bar's length is its value on a scale the data itself sets
 * (nothing is clamped at a fixed 1.4).
 */
export function sgScale(values: Array<number | null | undefined>): number {
  const top = Math.max(0, ...values.map((v) => (v == null || Number.isNaN(v) ? 0 : Math.abs(v))));
  return Math.max(1, Math.ceil(top));
}

/** A bar's share of the half-width, 0 to 1. */
export function sgShare(value: number, scale: number): number {
  return Math.min(1, Math.abs(value) / scale);
}

/**
 * A grid cell's tint: gain green, loss amber, as strong as the value's share of the scale; no value is a neutral cell. The colours
 * are the chart tokens (`--ch-chart-gain`, `--ch-chart-loss`) mixed toward transparent, so the tint follows the night palette too.
 */
export function sgTint(value: number | null, scale: number, digits = 1): string {
  if (value == null) return 'var(--ch-ivory-100)';
  // A value that shows as zero at the cell's digits is neither a gain nor a loss: a clear cell, unlike no data (F-54).
  if (Math.abs(value) < 0.5 * 10 ** -digits) return 'transparent';
  const pct = Number(((0.06 + sgShare(value, scale) * 0.3) * 100).toFixed(1));
  return `color-mix(in srgb, var(${value >= 0 ? '--ch-chart-gain' : '--ch-chart-loss'}) ${pct}%, transparent)`;
}
