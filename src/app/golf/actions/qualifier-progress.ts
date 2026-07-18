/**
 * Pure qualifier-progress derivation — extracted from golf.ts so it can live
 * outside the `'use server'` boundary (a server-action module may only export
 * async actions; a synchronous helper exported there both breaks Next's
 * use-server contract and trips the server-action observability coverage
 * gate). Imported by golf.ts's getPlayerQualifiers path and unit-tested
 * directly.
 */

/**
 * Derive a player's per-qualifier progress so THRU (completedRoundNumbers),
 * roundsCompleted, and the scored totals always agree (audit W1 — "qual-
 * contradict"). Before this fix `completedRoundNumbers` was filtered
 * independently: it dropped any completed round whose (nullable)
 * `qualifier_round_number` was null, and stayed `[]` on the entries-only
 * fallback path (no matching `golf_rounds` rows at all) — while
 * `roundsCompleted`/`totalScore`/`totalToPar` still fell back to the
 * `golf_qualifier_entries` aggregate. The result: a card could show
 * "Completed" + a real posted TOTAL/TO PAR + THRU reading "Not started",
 * all for the same entry. `completedRoundNumbers.length` must always equal
 * `roundsCompleted` so the "Thru" cell can never be empty while the score
 * cells are real.
 */
export function derivePlayerQualifierProgress(
  qualifierRounds: Array<{
    qualifier_round_number: number | null;
    total_score: number | null;
    score_to_par: number | null;
  }>,
  entryFallback: {
    roundsCompleted: number | null;
    totalScore: number | null;
    totalToPar: number | null;
  },
): {
  roundsCompleted: number;
  completedRoundNumbers: number[];
  totalScore: number | null;
  totalToPar: number | null;
} {
  const roundsCompleted =
    qualifierRounds.length > 0 ? qualifierRounds.length : entryFallback.roundsCompleted ?? 0;

  // A round without a real `qualifier_round_number` still counts as progress
  // — synthesize a sequential label rather than dropping it (and, on the
  // entries-only fallback path, synthesize the full 1..N run) so this array's
  // length never disagrees with `roundsCompleted` above.
  const completedRoundNumbers =
    qualifierRounds.length > 0
      ? qualifierRounds.map((r, i) => r.qualifier_round_number ?? i + 1).sort((a, b) => a - b)
      : Array.from({ length: roundsCompleted }, (_, i) => i + 1);

  const totalScore =
    qualifierRounds.length > 0
      ? qualifierRounds.reduce((sum, r) => sum + (r.total_score || 0), 0)
      : entryFallback.totalScore ?? null;

  const totalToPar =
    qualifierRounds.length > 0
      ? qualifierRounds.reduce((sum, r) => sum + (r.score_to_par || 0), 0)
      : entryFallback.totalToPar ?? null;

  return { roundsCompleted, completedRoundNumbers, totalScore, totalToPar };
}
