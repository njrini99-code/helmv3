/**
 * How a verdict reads (03-usefulness §4.3, 04 Example 11), in the coach's
 * voice (third person, both numbers and the regression line) and the
 * player's (second person). The count comes before the percentage, the
 * expected-without-coaching number is printed on Worked and Did not move,
 * and nothing names a mechanism.
 *
 * Pure: every number in a line comes from the verdict or the baseline passed
 * in. No renderer reads this yet; the Layout 5 view and the coach "Got
 * worse" notice are its callers.
 */
import type { FocusAreaVerdict } from './verdict';

export interface VerdictCopyInput {
  /** Plain words for the metric ("4–6 ft putts"). */
  label: string;
  /** What one attempt is ("putts"). */
  attemptNoun: string;
  verdict: FocusAreaVerdict;
  /** The read's rate (proportion) and attempts behind it, when known. */
  baseline: { value: number; n: number | null } | null;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;

function before(baseline: VerdictCopyInput['baseline'], withCount: boolean): string {
  if (!baseline) return 'before';
  if (withCount && baseline.n && baseline.n > 0) {
    return `${Math.round(baseline.value * baseline.n)} of ${baseline.n} (${pct(baseline.value)}) before`;
  }
  return `${pct(baseline.value)} before`;
}

/** Coach line: "4–6 ft putts · Worked — 31 of 42 (74%) against 18 of 31 (58%) before. …" */
export function coachVerdictLine(input: VerdictCopyInput): string {
  const { label, verdict: v } = input;
  const post = v.post;
  const now = post.value === null ? '' : `${post.made} of ${post.n} (${pct(post.value)})`;
  const expected = pct(v.expected_without_coaching);
  const target = pct(v.threshold);
  const horizonN = v.horizon.attempts ?? 0;
  switch (v.word) {
    case 'worked':
      return `${label} · Worked — ${now} against ${before(input.baseline, true)}. Expected without coaching: about ${expected} (bounce-back). Lower bound ${pct(v.lower_bound_90 ?? 0)} clears it. Target was ${target}.`;
    case 'moved':
      return `${label} · Moved, not there yet — ${now} against ${before(input.baseline, false)}. Lower bound ${pct(v.lower_bound_90 ?? 0)} clears the expected ${expected}; target was ${target}.`;
    case 'did_not_move':
      return `${label} · Did not move — ${now} against ${before(input.baseline, false)}; within the noise of the expected ${expected}. Target was ${target}.`;
    case 'got_worse':
      return `${label} · Got worse — ${now} against ${before(input.baseline, false)}. Upper bound ${pct(v.upper_bound_90 ?? 0)} is below the expected ${expected}.`;
    case 'too_early':
      return post.value === null
        ? `${label} · Too early — 0 of the ${horizonN} ${input.attemptNoun} in.`
        : `${label} · Too early — ${post.n} of the ${horizonN} ${input.attemptNoun} in; ${pct(post.value)} so far.`;
    case 'cant_tell':
      return `${label} · Can't tell yet — the record is missing a field this depends on.`;
  }
}

/** Player line: "Worked. 31 of 42 (74%), up from 58%. …" */
export function playerVerdictLine(input: VerdictCopyInput): string {
  const { verdict: v } = input;
  const post = v.post;
  const now = post.value === null ? '' : `${post.made} of ${post.n} (${pct(post.value)})`;
  const was = input.baseline ? pct(input.baseline.value) : null;
  const horizonN = v.horizon.attempts ?? 0;
  switch (v.word) {
    case 'worked':
      return `Worked. ${now}${was ? `, up from ${was}` : ''}. Some of that would have come back on its own (we'd have expected about ${pct(v.expected_without_coaching)}); you're clear of that too.`;
    case 'moved':
      return `Moving. ${now}${was ? ` against ${was} before` : ''}; the target was ${pct(v.threshold)}. Keep going.`;
    case 'did_not_move':
      return `Did not move. ${now}, about where you started. Not a failure of effort; it means we haven't found the cause yet.`;
    case 'got_worse':
      return `Worse. ${now}${was ? ` against ${was}` : ''}. Stop and talk to your coach.`;
    case 'too_early':
      return post.value === null
        ? `Too early. 0 of the ${horizonN} ${input.attemptNoun} in.`
        : `Too early. ${post.n} of the ${horizonN} ${input.attemptNoun} in; ${pct(post.value)} so far.`;
    case 'cant_tell':
      return `Can't tell yet: part of the record this depends on is missing.`;
  }
}
