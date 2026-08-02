/**
 * Is this shot actually an approach?
 *
 * The shot tracker types a shot by its ORDINAL in the hole, not by distance or
 * intent: anything that is not the tee shot and not already on the green is
 * written as `shot_type = 'approach'`. Three things therefore arrive labelled
 * "approach" that are nothing of the sort:
 *
 *   - a layup on a par 5 (a 270y second shot that finishes in the fairway);
 *   - the replayed tee shot after a penalty (still 375y out, still on the tee,
 *     but it is shot #2 so it reads as the approach);
 *   - malformed rows where the ball barely moved.
 *
 * The tracker also forces a miss direction whenever such a shot does not
 * finish on the green — there is no "laid up" option — so every one of these
 * lands in `approach_miss_details` tagged `short`. A player who lays up
 * routinely then looks like they chronically come up short on approaches.
 *
 * This predicate is the single definition of "a real approach". It used to be
 * re-derived independently in three places (and two of them simply did not
 * have it), which is how the stats calculator ended up recording a 375-yard
 * approach from a "fairway" lie. Consumers:
 *
 *   - src/lib/utils/golf-stats-calculator-shots.ts  (player-facing stats)
 *   - src/lib/coachhelm/v2/mining/approach-analytics.ts  (insight mining)
 *   - src/app/golf/actions/golf.ts  (write path — stops bad rows at the source)
 */

/** Beyond this the shot is a drive or a layup, not a shot at the green. */
export const APPROACH_MAX_YARDS = 250;

/**
 * Lies a genuine approach can be played from. `fringe` counts — a fairway-lie
 * attempt that catches the fringe was still an approach into the green.
 * `tee` is deliberately absent and handled separately: it is only an approach
 * on a par 3, where the tee shot IS the shot at the green.
 */
export const APPROACH_LIES: ReadonlySet<string> = new Set([
  'fairway',
  'rough',
  'sand',
  'bunker',
  'fringe',
]);

export interface ApproachCandidate {
  /** Distance to the hole BEFORE the shot, normalized to yards. */
  distanceToHoleBeforeYards: number | null | undefined;
  /**
   * Distance to the hole AFTER the shot, in yards, when known. Used only to
   * reject shots that made no material progress (topped shots, OOB drops).
   * Omit when unknown — an unknown finish is not evidence against.
   */
  distanceToHoleAfterYards?: number | null;
  /** `lie_before` as stored on golf_shots. */
  lieBefore: string | null | undefined;
  /** Par of the hole — the only thing that makes a tee shot an approach. */
  par: number | null | undefined;
}

export function isPlausibleApproach(shot: ApproachCandidate): boolean {
  const before = shot.distanceToHoleBeforeYards;
  if (typeof before !== 'number' || !Number.isFinite(before) || before <= 0) {
    return false;
  }
  // A 375y "approach" is a tee shot; a 270y one is a layup.
  if (before > APPROACH_MAX_YARDS) return false;

  const lie = (shot.lieBefore ?? '').toLowerCase();
  // Par-3 tee shots are the approach by definition (and are counted as a
  // 'fairway' lie downstream — the long-standing GIR-by-lie methodology).
  const teeOnPar3 = lie === 'tee' && shot.par === 3;
  if (!APPROACH_LIES.has(lie) && !teeOnPar3) return false;

  // The ball has to have moved meaningfully toward the hole.
  const after = shot.distanceToHoleAfterYards;
  if (typeof after === 'number' && Number.isFinite(after) && after >= before * 0.5) {
    return false;
  }

  return true;
}
