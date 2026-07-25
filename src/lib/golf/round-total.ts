/**
 * Canonical, single-source-of-truth derivation of "what a round's total score
 * actually is". See AUDIT-0724 stats-visual-accuracy.md findings #1/#4/#5.
 *
 * ROOT CAUSE: `golf_rounds.total_score` (and `front_nine`/`back_nine`) are
 * written exactly once, at round-submission time, as Σ(hole.score) over the
 * SAME hole payload that becomes `golf_holes`
 * (src/app/golf/actions/golf.ts:submitGolfRoundComprehensiveImpl — totalScore
 * / frontNine / backNine are all `.reduce()`d from `data.holes` in the same
 * function call, so they're guaranteed equal at write time). But the only DB
 * trigger that reacts to a LATER `golf_holes` change
 * (`golf_holes_recompute_round_totals` -> `recompute_golf_round_totals()`,
 * supabase/migrations/20260527000000_prod_public_baseline.sql:4554-4584)
 * refreshes putts/GIR/fairways from golf_holes — it does NOT touch
 * total_score, front_nine, or back_nine. So `total_score` can go stale
 * relative to the hole-by-hole ground truth without anything else noticing.
 * 15 of 284 rounds (5.3%) currently carry a ±1 total_score drift this way
 * (see round-total-repair.sql for the exact rows).
 *
 * `golf_holes` — or its safe proxy `front_nine + back_nine`, which the audit
 * confirmed ties to Σgolf_holes.score with 0 mismatches across all 284
 * rounds — is the ground truth: it's what the player actually entered
 * hole-by-hole. The app's own admin "recalculate round totals" fix tool
 * (src/app/golf/actions/admin-tracer-data.ts fixRoundDataImpl,
 * 'recalculate_round_totals' case) already treats holes as authoritative,
 * overwriting `total_score` FROM `Σgolf_holes.score` — never the reverse.
 *
 * Every surface that displays a SPECIFIC round's total must go through one
 * of the functions below instead of reading `total_score` raw, so the app
 * can never show two different totals for the same round again.
 */

export interface RoundTotalColumns {
  total_score: number | null;
  front_nine: number | null;
  back_nine: number | null;
}

export interface DerivedRoundTotal {
  /** The canonical total. Null only when the round has no usable data at all. */
  total: number | null;
  /** Where `total` came from — 'holes' whenever possible. */
  source: 'holes' | 'total_score' | 'none';
}

/**
 * Row-level derivation for surfaces that only have the `golf_rounds` columns
 * in hand (no per-hole fetch) — dashboard summaries, the rounds library list.
 * Prefers `front_nine + back_nine` (== Σgolf_holes.score) over the
 * denormalized, sometimes-stale `total_score` column.
 */
export function deriveRoundTotal(round: RoundTotalColumns): DerivedRoundTotal {
  if (round.front_nine != null && round.back_nine != null) {
    return { total: round.front_nine + round.back_nine, source: 'holes' };
  }
  if (round.total_score != null) {
    return { total: round.total_score, source: 'total_score' };
  }
  return { total: null, source: 'none' };
}

/**
 * Shifts a persisted `score_to_par` by the same delta the total was
 * corrected by. Course par is unaffected by total_score staleness, so
 * `derivedTotal - coursePar === (derivedTotal - total_score) + score_to_par`
 * — this recovers the correct score-to-par without needing a per-hole par
 * fetch. Falls back to the raw persisted value when either input can't
 * support the shift.
 */
export function deriveScoreToPar(
  round: RoundTotalColumns & { score_to_par: number | null }
): number | null {
  const { total } = deriveRoundTotal(round);
  if (total == null || round.total_score == null || round.score_to_par == null) {
    return round.score_to_par ?? null;
  }
  return round.score_to_par + (total - round.total_score);
}

/**
 * Applies {@link deriveRoundTotal}/{@link deriveScoreToPar} to a row in
 * place, returning a shallow copy with `total_score`/`score_to_par`
 * corrected. Lets callers fetch-then-normalize once at the data boundary so
 * every downstream consumer that reads `total_score`/`score_to_par` off the
 * row automatically gets the canonical value without having to know this
 * helper exists.
 */
export function withCanonicalRoundTotal<
  T extends RoundTotalColumns & { score_to_par: number | null },
>(round: T): T {
  const { total } = deriveRoundTotal(round);
  const scoreToPar = deriveScoreToPar(round);
  if (total === round.total_score && scoreToPar === round.score_to_par) {
    return round;
  }
  return { ...round, total_score: total, score_to_par: scoreToPar };
}

/** One hole row shape both callers below can satisfy structurally. */
export interface RoundTotalHoleRow {
  hole_number: number;
  par: number | null;
  score: number | null;
}

export interface DerivedRoundTotalsFromHoles {
  total: number | null;
  scoreToPar: number | null;
  frontNine: number | null;
  backNine: number | null;
  source: 'holes' | 'total_score' | 'none';
}

/**
 * Hole-level derivation for surfaces that already have the round's per-hole
 * rows in hand (the round detail/recap page) — the strongest form: sums the
 * SAME `golf_holes` rows the scorecard and per-hole cells render, so the
 * hero, the Front9/Back9 readouts, and the scorecard total can never show
 * three different numbers for one round (finding #1).
 *
 * Only trusts a holes-derived total when every hole in the set actually has
 * a recorded score (null-honest — a partial sum must never masquerade as
 * the full total, mirroring the `hasCompleteScores` guard in
 * golf-stats-calculator-shots.ts). Falls back to the row-level columns
 * otherwise.
 */
export function deriveRoundTotalsFromHoles(
  holes: RoundTotalHoleRow[],
  fallback: RoundTotalColumns & { score_to_par: number | null }
): DerivedRoundTotalsFromHoles {
  const hasCompleteScores = holes.length > 0 && holes.every((h) => h.score != null);

  if (!hasCompleteScores) {
    const { total, source } = deriveRoundTotal(fallback);
    return {
      total,
      scoreToPar: fallback.score_to_par ?? null,
      frontNine: fallback.front_nine,
      backNine: fallback.back_nine,
      source,
    };
  }

  const front = holes.filter((h) => h.hole_number <= 9);
  const back = holes.filter((h) => h.hole_number > 9);
  const frontNine = front.length > 0 ? front.reduce((s, h) => s + (h.score as number), 0) : null;
  const backNine = back.length > 0 ? back.reduce((s, h) => s + (h.score as number), 0) : null;
  const total = holes.reduce((s, h) => s + (h.score as number), 0);

  const hasCompletePar = holes.every((h) => h.par != null);
  const scoreToPar = hasCompletePar
    ? total - holes.reduce((s, h) => s + (h.par as number), 0)
    : deriveScoreToPar({ ...fallback, front_nine: frontNine, back_nine: backNine });

  return { total, scoreToPar, frontNine, backNine, source: 'holes' };
}
