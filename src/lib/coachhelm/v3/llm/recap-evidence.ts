/**
 * Evidence registration for the two-sentence post-round recap
 * (`generateLLMRecap` in `src/app/golf/actions/round-recap.ts`).
 *
 * WHY THIS EXISTS
 *
 * The recap prompt hands the model a `facts` block — score, putts, fairway %,
 * GIR %, front/back nine, season scoring average — and instructs it, verbatim:
 *
 *     "- Reference at least one specific stat by number."
 *
 * It then called `compose()` with `evidence: []`. Those two things cannot both
 * be satisfied: `verifyCitations` rejects every numeric token absent from the
 * evidence set (bar the universally-safe 0/1/2/3/100), so a recap that OBEYS
 * the instruction is guaranteed to fail verification and be thrown away for the
 * deterministic fallback. The model was punished for using what it was handed.
 *
 * Measured in production 2026-08-17 (`golf_coachhelm_llm_calls`): every
 * discarded call that recorded its evidence set recorded it EMPTY — 4 of 4 —
 * and the unmatched tokens are the facts themselves (`71` a score, `26,78,73.5`,
 * `27,78.6`, `14,50`). Over the whole `round_review` task, 75 calls fell back to
 * template against 28 verified.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not loosen the verifier. Only figures the prompt literally showed the
 * model are registered; a number that was never handed over is still rejected.
 * That is the same principle `round-review.ts` applies to composite-insight
 * titles, and for the same reason: a number we supplied is not a fabrication.
 *
 * It uses the verifier's OWN scanner (`extractNumericTokens`), so the set we
 * register and the set it later judges cannot drift apart — two regexes
 * diverging is exactly how a figure becomes registerable-but-unverifiable.
 *
 * `buildRecapEvidencePacket` (Package 8 slice 2, repair plan 14.10) builds
 * the typed `EvidencePacket` for the SAME recap, engaged behind the
 * `coachhelm_recap_claim_packet` flag — an additive, opt-in second gate on
 * top of the flat scan above, not a replacement for it.
 */

import type { EvidenceClaim } from './types';
import { extractNumericTokens } from './citations';
import type { EvidencePacket, EvidencePacketEntry } from './claim-validator';

/** Matches a token the scanner returned that carries a percent sign. */
const PERCENT_TOKEN_RE = /^(-?\d+(?:\.\d+)?)%$/;

/**
 * Register every numeric figure appearing in the recap prompt's `facts` block.
 *
 * Percentages are registered in both renderings the model actually produces:
 * shown "78.6%", a model will as readily write "79%", and those are the same
 * true fact. Discarding an entire recap over which one it picked is not a
 * judgement worth making — the same reasoning `pushDerivedPct` documents in
 * `round-review.ts`.
 */
export function buildRecapEvidence(facts: string[]): EvidenceClaim[] {
  const claims: EvidenceClaim[] = [];
  const seen = new Set<string>();

  const add = (field: string, value: string): void => {
    if (seen.has(value)) return;
    seen.add(value);
    claims.push({ field, value });
  };

  for (const fact of facts) {
    for (const token of extractNumericTokens(fact)) {
      add('recap_fact_figure', token);

      const percent = PERCENT_TOKEN_RE.exec(token);
      if (percent?.[1]) {
        const rounded = Math.round(Number(percent[1]));
        if (Number.isFinite(rounded)) add('recap_fact_figure_rounded', String(rounded));
      }
    }
  }

  return claims;
}

/**
 * Round facts this packet builder needs. Deliberately narrower than
 * `RoundContext` (`round-recap.ts`) so this module doesn't import from its
 * own caller.
 */
export interface RecapPacketRound {
  player_id: string;
  round_date: string;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  front_nine: number | null;
  back_nine: number | null;
  holes_played: number | null;
}

export interface RecapPacketStats {
  scoring_average: number | null;
  best_round: number | null;
  rounds_played: number | null;
}

/**
 * Build the typed `EvidencePacket` (Package 8 slice 2) for one round's
 * recap, engaged behind the `coachhelm_recap_claim_packet` flag.
 *
 * `fir`/`gir` are passed in rather than recomputed here — they must be
 * the EXACT SAME `pct()`-rounded values `generateLLMRecap` already put in
 * the prompt's `facts` block, or a truthful fairway/GIR claim would fail
 * `wrong_field`/`value_mismatch` over a rounding difference between two
 * independent computations of the same percentage.
 *
 * Every round-level fact is `kind: 'measurement'` — a single round has no
 * "n" to sample, the count IS the fact. Only the player's season
 * aggregates (scoring average, best round — themselves computed over
 * `stats.rounds_played` rounds) are `kind: 'aggregate'`, floored at
 * `MIN_SAMPLE_N` like any other multi-observation statistic.
 *
 * 18-hole-only aggregates: `generateLLMRecap`'s own prompt withholds the
 * season scoring average / best round for a non-18-hole round (a 9-hole
 * score against an 18-hole average reads as nonsense) — this packet
 * follows the identical rule so it never registers a claim the prompt
 * never offered the model in the first place.
 */
export function buildRecapEvidencePacket(
  round: RecapPacketRound,
  stats: RecapPacketStats | null,
  fir: number | null,
  gir: number | null,
): EvidencePacket {
  const window = `${round.round_date}T00:00:00.000Z`;
  const entries: EvidencePacketEntry[] = [];

  const measure = (metric_id: string, value: number | null): void => {
    if (value === null) return;
    entries.push({ metric_id, value, sample_n: 1, kind: 'measurement' });
  };

  measure('total_score', round.total_score);
  measure('score_to_par', round.score_to_par);
  measure('total_putts', round.total_putts);
  measure('fairways_hit_pct', fir);
  measure('gir_pct', gir);
  measure('front_nine', round.front_nine);
  measure('back_nine', round.back_nine);

  const is18HoleRound = (round.holes_played ?? 18) === 18;
  if (is18HoleRound && stats) {
    const n = stats.rounds_played ?? 0;
    if (stats.scoring_average !== null) {
      entries.push({
        metric_id: 'season_scoring_average',
        value: Number(stats.scoring_average.toFixed(1)),
        sample_n: n,
        kind: 'aggregate',
      });
    }
    if (stats.best_round !== null) {
      entries.push({
        metric_id: 'season_best_round',
        value: stats.best_round,
        sample_n: n,
        kind: 'aggregate',
      });
    }
  }

  return {
    player_id: round.player_id,
    window_start: window,
    window_end: window,
    entries,
  };
}
