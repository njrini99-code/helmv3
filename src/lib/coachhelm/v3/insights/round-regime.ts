/**
 * Which lens explains THIS round — decided by how many greens were hit.
 *
 * ── THE MECHANISM ───────────────────────────────────────────────────────────
 *
 * `docs/v3-research-golf-domain.md` §4, "GIR → Scrambling Load (Inverse
 * Coupling)": *"If player hits 12+ GIR, putting drives score. If 8 or fewer,
 * scrambling % is more predictive than putting."*
 *
 * It is not only cited, it is measurable here. All 328 completed rounds
 * carrying a GIR figure, measured against production 2026-08-18:
 *
 *     regime (18-hole basis)   rounds     %      avg score_to_par   avg putts
 *     putting_driven  >= 12      170     51.8%        +1.78            33.2
 *     transitional    9-11       122     37.2%        +5.15            31.7
 *     scrambling_driven <= 8      36     11.0%        +9.44            29.8
 *
 * Putts per round FALL as greens fall while the score climbs seven and a half
 * strokes. That is the confound: a player who misses greens chips close and
 * 1-putts for bogey, so his putt total looks BEST on the rounds he played
 * WORST. It is the same mechanism as the `total_gir -> total_putts` causal
 * hypothesis added in ff87d8126, applied to a single round instead of a season.
 *
 * ── WHY THE ROUND IS THE UNIT ───────────────────────────────────────────────
 *
 * A player-level regime was the obvious design and would have been a no-op.
 * Of the 22 players with 8+ completed rounds: ZERO are scrambling-dominant, 15
 * are putting-dominant, and the largest scrambling share anywhere on the
 * platform is 25%. Classifying players emits one constant for everybody.
 * Classifying rounds fires on 36 real rounds today.
 *
 * Pure and synchronous — no fetches, per the scoring-function rule.
 */

/** Research thresholds, on an 18-hole basis. Both cited above; do not tune. */
export const PUTTING_DRIVEN_MIN_GIR = 12;
export const SCRAMBLING_DRIVEN_MAX_GIR = 8;

export type RoundRegime =
  | 'putting_driven'
  | 'transitional'
  | 'scrambling_driven'
  /** Greens were not recorded. Never guess a lens from a missing number. */
  | 'unknown';

export interface RoundGreens {
  /** Greens hit. */
  gir: number | null;
  /** Greens available — 18 for a full round, 9 for a nine. */
  gir_total: number | null;
}

/**
 * Greens hit on an 18-hole basis, or null when they were not recorded.
 * A 9-hole round is scaled so 6 of 9 reads as the 12-green pace it is, rather
 * than being misfiled as a scrambling round on the raw count.
 */
function girPer18(round: RoundGreens): number | null {
  const { gir, gir_total } = round;
  if (gir === null || gir_total === null) return null;
  if (!Number.isFinite(gir) || !Number.isFinite(gir_total) || gir_total <= 0) return null;
  return (gir * 18) / gir_total;
}

export function classifyRoundRegime(round: RoundGreens): RoundRegime {
  const per18 = girPer18(round);
  if (per18 === null) return 'unknown';
  if (per18 >= PUTTING_DRIVEN_MIN_GIR) return 'putting_driven';
  if (per18 <= SCRAMBLING_DRIVEN_MAX_GIR) return 'scrambling_driven';
  return 'transitional';
}

export interface RoundRegimeFacts extends RoundGreens {
  total_putts: number | null;
}

/**
 * One line for the round-review prompt, or null when there is nothing honest
 * to say.
 *
 * The scrambling case is the one that earns this module. `buildPrompt` hands
 * the model a bare putt count, and on a 6-green round the natural sentence to
 * write is "your putting held up well" — false, and INVISIBLE to the citation
 * verifier, because the number itself is real. Only the inference is wrong, so
 * the guard has to live in the prompt rather than in verification.
 *
 * Transitional rounds get nothing. The research makes no claim in the 9-11
 * band, that band is 37% of all rounds, and inventing a lens for it would be
 * exactly the fabrication this is meant to prevent.
 */
export function regimeGuidanceLine(round: RoundRegimeFacts): string | null {
  const regime = classifyRoundRegime(round);
  if (regime === 'unknown' || regime === 'transitional') return null;

  const greens = `${round.gir}/${round.gir_total}`;

  if (regime === 'scrambling_driven') {
    const puttClause =
      round.total_putts !== null
        ? ` The ${round.total_putts} putts are NOT evidence of good putting — with that many greens missed, a low putt count usually means chipping close and 1-putting for bogey.`
        : '';
    return (
      `- Lens for this round: greens hit were low (${greens}).` +
      ` Research (domain doc §4) says scrambling, not putting, is the more predictive lens here.` +
      puttClause +
      ` Lead with the short game and approach play; do not praise the putt total.`
    );
  }

  return (
    `- Lens for this round: greens were hit at a high rate (${greens}),` +
    ` so putting is the lever that moved this score (domain doc §4). Weight the putting story accordingly.`
  );
}
