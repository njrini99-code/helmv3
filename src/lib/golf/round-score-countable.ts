import { isCountableRound, roundExclusionReason, type CountableRoundInput } from '@/lib/golf/round-countable';

/*
 * Which rounds count in a SCORE (Q-123): every fully scored round (`isCountableRound`, unchanged) plus a round posted as a total
 * only. Hole-level figures keep reading `isCountableRound` alone. Lives in lib so shared readers (CoachHelm's program pulse) and
 * Clubhouse (data/round-scope.ts re-exports it) apply one rule.
 *
 * Pure: no Supabase, no React.
 */

/** A round with no nines recorded at all (a total posted without its holes). A round with one nine but not the other is partial, not this. */
function postedAsTotal(r: Pick<CountableRoundInput, 'front_nine' | 'back_nine'>): boolean {
  return r.front_nine == null && r.back_nine == null;
}

/**
 * Posted as a total only, and otherwise countable: an 18-hole completed real round with a plausible total. Test rounds, rounds in
 * progress, implausible totals (the stroke floor, with putts when there are any) and nine-hole totals stay out: the owner's rule names
 * 18-hole totals, and a nine-hole total has no holes to tell it from half of one. The holes check is the only one waived.
 */
export function isTotalOnlyCountable(r: CountableRoundInput): boolean {
  if (r.total_score == null || !postedAsTotal(r) || (r.holes_played ?? 18) !== 18) return false;
  return roundExclusionReason({ ...r, recorded_holes: 18 }) === null;
}

/** Counts in the score figures: a fully scored round (the shared rule) or a total-only one (above). */
export function isScoreCountable(r: CountableRoundInput): boolean {
  return isCountableRound(r) || isTotalOnlyCountable(r);
}
