/**
 * Genome dimension: scrambling_rate.
 *
 * Category: recovery_patterns.
 * The canonical golf definition: of the greens you MISSED in regulation, the
 * fraction you still finished at par or better. Returns a value in [0, 1].
 *
 * WHY THIS IS NOT A PROXIMITY MEASURE. Until 2026-08-17 this dimension counted
 * short-game shots from rough/sand that finished within 10 ft, and its own
 * docstring called that "a rough proxy for 'saved par from trouble'". It is not
 * a proxy for it: you can stiff a chip to three feet, three-putt, and the
 * proximity measure still scores it a save. Meanwhile
 * `golf-stats-calculator-shots.ts` has always used the real definition
 * (`scrambleAttempt: !gir && score !== null`, `scrambleMade: … && score <=
 * par`), so one product showed two numbers under one word.
 *
 * Measured across production before the change — the same players, same day:
 *
 *   Lily Rowe      Stats 30.9%   Genome 61.0%   +30.1 pts
 *   Ethan Park     Stats 30.3%   Genome 56.3%   +26.0
 *   Cole Bennett   Stats 33.7%   Genome 57.6%   +23.9
 *   Luke Wise      Stats 31.5%   Genome 53.7%   +22.2
 *
 * The labels inverted the verdict rather than merely shifting it. Of 26 players
 * with a genome value, the old cutoffs called 14 "Wizard" — 8 of them
 * scrambling below 40% — and put 13 at "Reliable" or better while their real
 * rate was under 35%. By the canonical stat 14 of those players are Leaky; the
 * genome flagged one. Coaches were being told a weakness was a strength.
 */

import type { DimensionResult, GenomeContext, GenomeDimension } from '../types';

/**
 * Attempts, not rounds. Production's 90-day cohort carries 19–87 missed greens
 * per player, so this floor costs nothing real and still refuses a player with
 * two rounds logged.
 */
const MIN_ATTEMPTS = 15;

/**
 * Cutoffs taken from the squad this actually describes, not from intuition.
 * Measured over the genome's own 90-day window (20 players with >=15 attempts):
 * p25 27.6%, median 34.1%, p75 40.6%. So Wizard is top-quartile and Leaky is
 * bottom-quartile among college golfers.
 *
 * The old 0.55 / 0.35 cutoffs were calibrated against the inflated proximity
 * number. Applied to real rates they would invert the error rather than fix it:
 * nobody in production clears 0.55, and most of the squad would read Leaky.
 */
const WIZARD_AT = 0.406;
const RELIABLE_AT = 0.276;

const dim: GenomeDimension = {
  id: 'scrambling_rate',
  category: 'recovery_patterns',
  label: 'Scrambling rate',

  compute(ctx: GenomeContext): DimensionResult {
    // A hole with no `gir` recorded cannot be classified either way, and a null
    // read as "missed" would invent attempts. A missed green with no score is
    // skipped for the same reason the stats calculator skips it: we cannot know
    // whether it converted.
    const attempts = ctx.hole_scores.filter(
      (h) => h.gir === false && typeof h.score === 'number' && typeof h.par === 'number',
    );
    if (attempts.length < MIN_ATTEMPTS) {
      return { value: null, confidence: null };
    }

    const saves = attempts.filter((h) => h.score <= h.par);
    const rate = saves.length / attempts.length;
    const confidence = Math.min(1, attempts.length / 30);
    const label =
      rate >= WIZARD_AT ? 'Wizard' : rate >= RELIABLE_AT ? 'Reliable' : 'Leaky';
    return { value: Number(rate.toFixed(3)), confidence, label };
  },
};

export default dim;
