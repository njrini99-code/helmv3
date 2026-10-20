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
}

export function sgBaseline(tour: ChSgTour): ChSgBaseline {
  if (tour === 'pga') return { vs: 'vs Tour', noun: 'the Tour baseline' };
  if (tour === 'lpga') return { vs: "vs the women's Tour baseline", noun: "the women's Tour baseline" };
  return { vs: 'vs the baseline', noun: 'the baseline' };
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

/** A grid cell's tint: gain green, loss amber, as strong as the value's share of the scale; no value is a neutral cell. */
export function sgTint(value: number | null, scale: number): string {
  if (value == null) return 'var(--ch-ivory-100)';
  const alpha = Number((0.06 + sgShare(value, scale) * 0.3).toFixed(3));
  return value >= 0 ? `rgb(21 90 57 / ${alpha})` : `rgb(154 101 18 / ${alpha})`;
}
