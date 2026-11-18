import { plural } from '../../lib/plural';
import { wholePercents } from '../../lib/shares';
/**
 * The scoring mix as rows (stats-visuals spec 4.4, decision Q11): every scored hole by its result, in the bar's order from
 * left to right. Par sits in the middle; going out from it, birdie then eagle or better to the left (under par), bogey then
 * double or worse to the right (over par). Pure, no React, so the tests can pin the numbers.
 */

export type MixKey = 'eagle' | 'birdie' | 'par' | 'bogey' | 'double';

/** Holes by result. `eagle` is eagle or better (two or more under par), `double` is double bogey or worse, as the calculator counts them. */
export type MixCounts = Record<MixKey, number>;

export const MIX_ORDER: readonly MixKey[] = ['eagle', 'birdie', 'par', 'bogey', 'double'];

export const MIX_LABEL: Record<MixKey, string> = {
  eagle: 'Eagle or better',
  birdie: 'Birdie',
  par: 'Par',
  bogey: 'Bogey',
  double: 'Double or worse',
};

export interface MixRow {
  key: MixKey;
  label: string;
  count: number;
  /** Whole percent of the holes, from `mixPercents`: the five add up to 100. */
  pct: number;
  /** What the bar and the key print: "0%" for no holes, "<1%" for a result that has holes but rounds to none. */
  pctText: string;
  /** Holes of this result a round (per 18), when the caller has it. */
  perRound: number | null;
}

/** Whole percents that add up to 100: the one largest-remainder rule (lib/shares), so a 100% bar's labels always sum to 100. */
export const mixPercents = wholePercents;

export function pctText(count: number, pct: number): string {
  if (count <= 0) return '0%';
  return pct < 1 ? '<1%' : `${pct}%`;
}

/** Holes a round as Game detail has always printed them: one decimal, two for a small non-zero rate (0.06 eagles, not 0.1). */
export function perRoundText(v: number): string {
  return v < 0.1 && v > 0 ? v.toFixed(2) : v.toFixed(1);
}

/** Holes of each result a round; a rate the calculator could not give is null and prints nothing. */
export type MixPerRound = Partial<Record<MixKey, number | null>>;

export function mixRows(counts: MixCounts, perRound?: MixPerRound | null): MixRow[] {
  const pcts = mixPercents(MIX_ORDER.map((k) => counts[k]));
  return MIX_ORDER.map((key, i) => {
    const count = Math.max(0, counts[key]);
    const pr = perRound?.[key];
    return { key, label: MIX_LABEL[key], count, pct: pcts[i]!, pctText: pctText(count, pcts[i]!), perRound: pr == null || Number.isNaN(pr) ? null : pr };
  });
}

/**
 * One result as a sentence for the readout: "Birdie · 19 of 180 holes · 11% · 1.9 a round". Double or worse adds the triples
 * inside it when they are known and fit ("· 3 triple or worse"); a count that cannot be inside it is left out, never shown.
 */
export function mixReadout(row: MixRow, holes: number, triple?: number | null): string {
  const parts = [row.label, `${row.count} of ${plural(holes, 'hole')}`, row.pctText];
  if (row.perRound != null) parts.push(`${perRoundText(row.perRound)} a round`);
  if (row.key === 'double' && triple != null && triple >= 0 && triple <= row.count) parts.push(`${triple} triple or worse`);
  return parts.join(' · ');
}
