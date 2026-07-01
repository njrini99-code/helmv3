// =============================================================================
// career-slash-line.ts
//
// Pure derivation of a player's career OBP / SLG / OPS from summed counting
// stats. Extracted from `recalculatePlayerAggregates` (src/app/baseball/
// actions/stats.ts) so it can be unit-tested without a database.
//
// Honesty contract: every rate is null on a zero denominator — never a
// fabricated .000. See BaseballHelm #436.
// =============================================================================

import type { BaseballPlayerStats } from '@/lib/types';

/** The counting-stat fields the slash line is derived from. */
export type SlashLineStatRow = Pick<
  BaseballPlayerStats,
  'at_bats' | 'hits' | 'doubles' | 'triples' | 'home_runs' | 'walks' | 'hit_by_pitch' | 'sacrifice_flies'
>;

export interface CareerSlashLine {
  /** On-base percentage: (H + BB + HBP) / (AB + BB + HBP + SF); null on zero PA. */
  obp: number | null;
  /** Slugging: total bases / AB; null on zero AB. */
  slg: number | null;
  /** OPS = OBP + SLG; null when either component is null. */
  ops: number | null;
}

/**
 * Derive career OBP/SLG/OPS from a set of per-session counting stats.
 * Sums across every row, then applies the standard formulas. Missing
 * counting values are treated as 0; denominators of 0 yield null.
 */
export function computeCareerSlashLine(
  stats: ReadonlyArray<SlashLineStatRow>,
): CareerSlashLine {
  const sum = (pick: (s: SlashLineStatRow) => number | null | undefined): number =>
    stats.reduce((acc, s) => acc + (pick(s) || 0), 0);

  const atBats = sum((s) => s.at_bats);
  const hits = sum((s) => s.hits);
  const doubles = sum((s) => s.doubles);
  const triples = sum((s) => s.triples);
  const homeRuns = sum((s) => s.home_runs);
  const walks = sum((s) => s.walks);
  const hitByPitch = sum((s) => s.hit_by_pitch);
  const sacFlies = sum((s) => s.sacrifice_flies);

  // OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
  const obpDenominator = atBats + walks + hitByPitch + sacFlies;
  const obp = obpDenominator === 0 ? null : (hits + walks + hitByPitch) / obpDenominator;

  // SLG = total bases / AB, where total bases = singles + 2·2B + 3·3B + 4·HR
  //     = H + 2B + 2·3B + 3·HR
  const totalBases = hits + doubles + 2 * triples + 3 * homeRuns;
  const slg = atBats === 0 ? null : totalBases / atBats;

  const ops = obp != null && slg != null ? obp + slg : null;

  return { obp, slg, ops };
}
