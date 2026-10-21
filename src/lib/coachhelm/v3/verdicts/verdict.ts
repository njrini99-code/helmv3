/**
 * The verdict rule (03-usefulness §4.3, 04 §1.3 and Example 11).
 *
 * At the horizon the post-assignment rate is tested against
 * `baseline_shrunk` (what regression to the mean alone would have
 * delivered, 02 §4) with a one-sided 90% bound, the same statistic the read
 * uses. For a higher-is-better metric, in order:
 *
 * | word           | rule                                                   |
 * | -------------- | ------------------------------------------------------ |
 * | `cant_tell`    | the metric depends on an optional field below coverage |
 * | `too_early`    | post n < horizon                                       |
 * | `got_worse`    | upper bound (90%) < baseline_shrunk                    |
 * | `worked`       | lower bound > baseline_shrunk and post ≥ threshold     |
 * | `moved`        | lower bound > baseline_shrunk but post < threshold     |
 * | `did_not_move` | the bounds include baseline_shrunk                     |
 *
 * A lower-is-better metric mirrors the bounds. Pure.
 */
import { oneSided90Bounds } from './bounds';
import type { Criterion, Horizon } from './criterion';

export type VerdictWord = 'worked' | 'moved' | 'did_not_move' | 'got_worse' | 'too_early' | 'cant_tell';

/** Words written to the row: the horizon was reached and the test ran. */
export const FINAL_VERDICT_WORDS: ReadonlySet<VerdictWord> = new Set(['worked', 'moved', 'did_not_move', 'got_worse']);

export interface PostWindow {
  made: number;
  n: number;
  /** ISO date of the first round in the window (the assignment's start). */
  window_start: string;
  /** ISO date of the round that reached the horizon (or the newest so far). */
  window_end: string | null;
}

/** The `golf_player_focus_areas.verdict` value (04 §1.3). */
export type FocusAreaVerdict = {
  word: VerdictWord;
  post: { value: number | null; made: number; n: number; window_start: string; window_end: string | null };
  lower_bound_90: number | null;
  upper_bound_90: number | null;
  bound_method: 'normal' | 'wilson' | null;
  expected_without_coaching: number;
  threshold: number;
  horizon: Horizon;
  computed_at: string;
};

export interface VerdictInput {
  criterion: Pick<Criterion, 'direction' | 'threshold' | 'unit'>;
  horizon: Horizon;
  baselineShrunk: number;
  post: PostWindow;
  /** The metric depends on an optional field whose coverage is below the 60% gate (03 §2.3). */
  dataGap?: boolean;
  computedAt: string;
}

const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;

export function computeVerdict(input: VerdictInput): FocusAreaVerdict {
  const { criterion, horizon, baselineShrunk, post } = input;
  const horizonN = horizon.attempts ?? 0;
  const bounds = post.n > 0 ? oneSided90Bounds(post.made, post.n) : null;
  const value = post.n > 0 ? post.made / post.n : null;

  const base = {
    post: {
      value: value === null ? null : round4(value),
      made: post.made,
      n: post.n,
      window_start: post.window_start,
      window_end: post.window_end,
    },
    lower_bound_90: bounds ? round4(bounds.lower) : null,
    upper_bound_90: bounds ? round4(bounds.upper) : null,
    bound_method: bounds?.method ?? null,
    expected_without_coaching: round4(baselineShrunk),
    threshold: criterion.threshold,
    horizon,
    computed_at: input.computedAt,
  };

  const word = ((): VerdictWord => {
    if (input.dataGap) return 'cant_tell';
    if (!(horizonN > 0) || post.n < horizonN || !bounds || value === null) return 'too_early';
    const higher = criterion.direction === 'higher';
    // "better than the shrunk baseline" bound, and "worse than" bound.
    const clearsBaseline = higher ? bounds.lower > baselineShrunk : bounds.upper < baselineShrunk;
    const belowBaseline = higher ? bounds.upper < baselineShrunk : bounds.lower > baselineShrunk;
    if (belowBaseline) return 'got_worse';
    if (clearsBaseline) {
      const metTarget = higher ? value >= criterion.threshold : value <= criterion.threshold;
      return metTarget ? 'worked' : 'moved';
    }
    return 'did_not_move';
  })();

  return { word, ...base };
}

/**
 * The post window at the horizon: whole rounds in play order, from the
 * assignment's start, up to and including the round whose attempts reach
 * the horizon. Rounds after it are not counted, so the verdict does not
 * depend on the night the job ran. `reached` is false while the attempts
 * fall short.
 */
export interface PostRound {
  round_id: string;
  round_date: string;
  made: number;
  attempts: number;
}

export function accumulatePostWindow(
  rounds: readonly PostRound[],
  horizonAttempts: number,
  windowStart: string,
): PostWindow & { reached: boolean; rounds: number } {
  const ordered = [...rounds]
    .filter((r) => r.round_date >= windowStart && r.attempts > 0)
    .sort((a, b) => (a.round_date === b.round_date ? a.round_id.localeCompare(b.round_id) : a.round_date.localeCompare(b.round_date)));
  let made = 0;
  let n = 0;
  let end: string | null = null;
  let used = 0;
  for (const r of ordered) {
    made += Math.min(r.made, r.attempts);
    n += r.attempts;
    end = r.round_date;
    used += 1;
    if (n >= horizonAttempts) break;
  }
  return { made, n, window_start: windowStart, window_end: end, reached: horizonAttempts > 0 && n >= horizonAttempts, rounds: used };
}
