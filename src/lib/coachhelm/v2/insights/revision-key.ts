/**
 * Evidence revision key for maturation confirmations (`lifecycle-policy.ts`).
 *
 * Legacy key: `${sample_n}|${window_end}`. With `window_end` empty on a third
 * of v3 reads it collapsed to `sample_n`, so a read could "mature" on three
 * looks at the same rounds whose count happened to move, or never.
 *
 * Slice 0b key (behind `coachhelm_reads_v1_copy`, off): a new revision is a
 * new newest round in the window, or a window that moved —
 * `r:${newest_round_id}|${window_start}`. The `r:` prefix keeps the two key
 * spaces apart, so turning the flag on counts at most one fresh confirmation
 * per read, never a collision with a legacy key. Rows without a stamped
 * `newest_round_id` (v2 miners, unstamped v3 rows) keep the legacy key.
 */
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import type { InsightEvidence } from './types';

/** Pure: the key for one evidence object under the given mode. */
export function revisionKeyFor(
  evidence: Pick<InsightEvidence, 'sample_n' | 'window_start' | 'window_end' | 'newest_round_id'>,
  freshnessKey: boolean,
): string {
  if (freshnessKey && typeof evidence.newest_round_id === 'string' && evidence.newest_round_id) {
    return `r:${evidence.newest_round_id}|${evidence.window_start ?? ''}`;
  }
  return `${evidence.sample_n}|${evidence.window_end}`;
}

/** The key upsert persists, with the mode read from the Slice 0 flag. */
export function evidenceRevisionKey(
  evidence: Pick<InsightEvidence, 'sample_n' | 'window_start' | 'window_end' | 'newest_round_id'>,
): string {
  return revisionKeyFor(evidence, isFlagEnabled('coachhelm_reads_v1_copy'));
}
