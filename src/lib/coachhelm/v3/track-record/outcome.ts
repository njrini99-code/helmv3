/**
 * What a read's recheck said, from the lifecycle block Slice 3 keeps on
 * `golf_coach_insights.metadata.coachhelm_lifecycle` (02 §8 defines held,
 * cleared and contradicted; 03 §9 names the states).
 *
 * One outcome per read, the newest that applies:
 *   - contradicted: a later supported read on the same subject said the
 *     opposite and retired this one (`conflict.kind = opposing_direction`,
 *     `role = retired`). A strategy pair (`opposing_strategy`) is not a
 *     contradiction: both reads stay.
 *   - cleared / held: the newest recheck's own answer (`recheck.outcome`
 *     `cleared` / `holds`).
 *   - When the newest recheck is `inconclusive` or `thin` (or absent), the
 *     read's history decides: cleared when it was cleared and not reopened
 *     since, held when it held at one checkpoint or more.
 *   - Otherwise none: the read was never rechecked, and counts as shown only.
 *
 * Pure: data in, value out.
 */
import type { ReadLifecycleMeta } from '@/lib/coachhelm/v3/lifecycle/types';
import type { RecheckOutcome } from '@/lib/coachhelm/v3/corrections/precision-counters';

export interface ReadOutcome {
  outcome: RecheckOutcome;
  /** When the outcome was reached (ISO); '' when the block carries no time. */
  at: string;
}

export function readOutcomeFromLifecycle(meta: ReadLifecycleMeta | null | undefined): ReadOutcome | null {
  if (!meta) return null;
  const conflict = meta.conflict;
  if (conflict && conflict.kind === 'opposing_direction' && conflict.role === 'retired') {
    return { outcome: 'contradicted', at: conflict.computed_at ?? '' };
  }
  const recheck = meta.recheck;
  if (recheck?.outcome === 'cleared') return { outcome: 'cleared', at: recheck.computed_at ?? meta.cleared_at ?? '' };
  if (recheck?.outcome === 'holds') return { outcome: 'held', at: recheck.computed_at ?? meta.last_checkpoint_at ?? '' };
  const clearedAt = meta.cleared_at ?? null;
  const reopenedAt = meta.reopened_at ?? null;
  if (clearedAt && !(reopenedAt && reopenedAt > clearedAt)) return { outcome: 'cleared', at: clearedAt };
  if ((meta.checkpoints_held ?? 0) >= 1) return { outcome: 'held', at: meta.last_checkpoint_at ?? '' };
  return null;
}
