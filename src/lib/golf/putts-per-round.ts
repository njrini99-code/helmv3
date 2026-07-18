/**
 * Shared putts-per-round formula (#917).
 *
 * Team Stats (src/app/golf/(dashboard)/dashboard/stats/team/page.tsx) and the
 * player-facing Stats cockpit (src/lib/utils/golf-stats-calculator-shots.ts,
 * behind src/app/golf/actions/stats-data.ts) computed putts/round two
 * different ways for the same player:
 *
 *   - Team Stats summed `golf_holes.putts` and divided by the count of holes
 *     that actually carry a recorded putts value (null-honest).
 *   - The player stats cockpit summed the same putts but divided by EVERY
 *     hole played (`holes_played`/`stats.holesPlayed`), including holes with
 *     no putts logged at all.
 *
 * A hole with no recorded putts contributes 0 to the numerator either way,
 * but counting it in the player-cockpit's denominator dilutes the average
 * downward — which is exactly the reported drift (Team Stats 33.3 vs. player
 * profile 32.6 for the same player). Team Stats' formula is the honest one
 * (matches the codebase's "null-skip, don't fabricate" convention elsewhere
 * in these files), so BOTH surfaces now compute through this one function.
 *
 * Normalizes to the 18-hole equivalent so 9-hole and 18-hole rounds combine
 * correctly (9 putts over 9 holes and 18 over 18 both read as "18 putts /
 * round", not double-counted or under-counted).
 */

export interface PuttsPerRoundHole {
  /** A hole with no recorded putts is `null` — never fabricated as 0. */
  putts: number | null;
}

export interface PuttsPerRoundAggregate {
  totalPutts: number;
  /** Count of holes that actually carry a putts value — the denominator. */
  holesWithPutts: number;
}

/**
 * Reduce a flat list of holes (any shape carrying `putts`) into the two raw
 * numbers `calculatePuttsPerRound` needs. Null and non-positive putts values
 * are skipped entirely (not counted in either the numerator or denominator),
 * matching the existing per-hole putts conventions elsewhere in the codebase.
 */
export function aggregatePuttsFromHoles(holes: readonly PuttsPerRoundHole[]): PuttsPerRoundAggregate {
  let totalPutts = 0;
  let holesWithPutts = 0;
  for (const hole of holes) {
    if (hole.putts !== null && hole.putts > 0) {
      totalPutts += hole.putts;
      holesWithPutts++;
    }
  }
  return { totalPutts, holesWithPutts };
}

/**
 * The one putts-per-round formula: total putts across every hole that
 * actually has a recorded value, normalized to an 18-hole equivalent.
 * Returns `null` (never a fabricated 0) when nothing is loggable yet.
 */
export function calculatePuttsPerRound(totalPutts: number, holesWithPutts: number): number | null {
  if (holesWithPutts <= 0 || totalPutts <= 0) return null;
  return (totalPutts / holesWithPutts) * 18;
}

/** Convenience: aggregate + compute in one call for a flat hole list. */
export function calculatePuttsPerRoundFromHoles(holes: readonly PuttsPerRoundHole[]): number | null {
  const { totalPutts, holesWithPutts } = aggregatePuttsFromHoles(holes);
  return calculatePuttsPerRound(totalPutts, holesWithPutts);
}
