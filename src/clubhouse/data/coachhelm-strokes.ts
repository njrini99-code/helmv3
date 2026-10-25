import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { formatFixed } from '../lib/format';

/**
 * What a read is worth in strokes a round, and when to say nothing (Clubhouse P013). Pure, over the evidence alone.
 *
 * `strokes_impact` is 0 on about half the live v3 reads, and for most of them that zero is not a measurement: approach
 * proximity, putt make rates and the other peer-compared families carry no per-round delta, and `rough_estimate` rows are
 * unestimated (`v3/ranking/score.ts` ranks them on a priority floor; production 2026-10-20: 364 of 710, all zero, none null).
 * So a zero is never printed as "0.0 strokes", and a read is never hidden for it. The one zero that is a finding of its own
 * is a measured one: a strokes-gained baseline that came out at nothing (33 exact, 36 at one decimal, of 95 `sg_baseline`
 * rows, all approach proximity), which the Board leaves out of its open reads and the Deep dive still lists.
 */

/** The methods whose value is an estimate of strokes a round. `rough_estimate` is not one, and `historical_correlation` is unused. */
const ESTIMATED: ReadonlySet<InsightEvidence['strokes_impact_method']> = new Set(['sg_baseline', 'peer_delta']);

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The value as it would print: one decimal, unsigned (gain framing), so "0.04" is "0.0" and is no estimate. */
function shown(ev: Pick<InsightEvidence, 'strokes_impact'> | null | undefined): number | null {
  const v = num(ev?.strokes_impact);
  return v == null ? null : Number(Math.abs(v).toFixed(1));
}

/**
 * The strokes a round the read is worth, one decimal ("0.4"), when it is a real estimate: a strokes-gained baseline or a peer
 * delta that is not zero at the precision it prints. Null for a zero, a rough estimate, a missing method or a missing value,
 * so no "0.0 strokes" sentence is ever drawn. No Clubhouse surface printed `strokes_impact` when this was written (the Deep
 * dive's "Closing the gap is worth about" is the cascade's counterfactual, not this field); any line that states it ("Worth
 * about 0.4 a round" in the four-line Read) states it only through this.
 */
export function strokesAtStake(ev: Pick<InsightEvidence, 'strokes_impact' | 'strokes_impact_method'> | null | undefined): string | null {
  if (!ev || !ESTIMATED.has(ev.strokes_impact_method)) return null;
  const v = shown(ev);
  return v != null && v > 0 ? formatFixed(v, 1) : null;
}

/**
 * The v2 course-management miner's own sentence in a row's text (`v2/mining/course-management.ts`): "Projected impact: ~0.80
 * strokes per round played here." or "... per round.". Matched with any sign (a hyphen or a true minus) and any precision.
 */
const PROJECTED_IMPACT = /\s*Projected impact: ~?[−-]?(\d+(?:\.\d+)?) strokes per round(?: played here)?\.?/g;

/**
 * The row's text without a "Projected impact: ~0.00 strokes per round." sentence that says nothing: one whose own figure is zero,
 * or on a row with no estimate (`strokes_impact` missing or 0.0 at one decimal, or a method other than an estimate's). A sentence
 * with a real figure on a row that carries one stays: it is the generator's text, and only the zero is the problem. Drawn text
 * only; the stored row and the generator are untouched.
 */
export function withoutZeroImpact(
  content: string | null | undefined,
  ev: Pick<InsightEvidence, 'strokes_impact' | 'strokes_impact_method'> | null | undefined,
): string {
  const text = content ?? '';
  const v = shown(ev);
  const unestimated = !ev || ev.strokes_impact_method == null || ev.strokes_impact_method === 'rough_estimate' || v == null || v === 0;
  return text.replace(PROJECTED_IMPACT, (whole, figure: string) => (unestimated || Number(figure) === 0 ? '' : whole)).trim();
}

/**
 * A measured zero: a strokes-gained baseline whose value prints as 0.0. The only zero that says the read is worth nothing; every
 * other zero says only that no estimate was made.
 */
export function isMeasuredZero(ev: Pick<InsightEvidence, 'strokes_impact' | 'strokes_impact_method'> | null | undefined): boolean {
  return ev?.strokes_impact_method === 'sg_baseline' && shown(ev) === 0;
}
