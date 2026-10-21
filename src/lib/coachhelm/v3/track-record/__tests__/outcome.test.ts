import { describe, expect, it } from 'vitest';
import type { ReadLifecycleMeta } from '@/lib/coachhelm/v3/lifecycle/types';
import type { RecheckRecord } from '@/lib/coachhelm/v3/engine/recent-recheck';
import { readOutcomeFromLifecycle } from '../outcome';

const recheck = (outcome: RecheckRecord['outcome'], computed_at = '2026-10-10T00:00:00Z'): RecheckRecord => ({
  window: 'newest_15_rounds',
  rounds_n: 6,
  recent_value: 0.7,
  recent_n: 30,
  recent_unit: 'putts',
  recent_lower_90: 0.6,
  recent_upper_90: 0.8,
  old_value: 0.6,
  old_n: 40,
  benchmark: 0.75,
  polarity: 'higher_better',
  outcome,
  min_n: 20,
  computed_at,
});

const conflict = (role: 'winner' | 'retired' | 'paired', kind: 'opposing_direction' | 'opposing_strategy' = 'opposing_direction') => ({
  with_insight_id: 'other',
  kind,
  role,
  net_strokes: null,
  resolution: 'newest_wins' as const,
  subject: 'putt_make_pct',
  computed_at: '2026-10-11T00:00:00Z',
});

describe('readOutcomeFromLifecycle', () => {
  it('is null for a read never rechecked, and for no block', () => {
    expect(readOutcomeFromLifecycle(null)).toBeNull();
    expect(readOutcomeFromLifecycle({ checkpoints_seen: 0 })).toBeNull();
    expect(readOutcomeFromLifecycle({ checkpoints_seen: 1, recheck: recheck('thin') })).toBeNull();
  });

  it('takes the newest recheck’s answer', () => {
    expect(readOutcomeFromLifecycle({ checkpoints_seen: 1, recheck: recheck('holds') })).toEqual({ outcome: 'held', at: '2026-10-10T00:00:00Z' });
    expect(readOutcomeFromLifecycle({ checkpoints_seen: 2, checkpoints_held: 1, recheck: recheck('cleared') })).toEqual({ outcome: 'cleared', at: '2026-10-10T00:00:00Z' });
  });

  it('a retired read on an opposing direction is contradicted, whatever the recheck said; a winner or a strategy pair is not', () => {
    const retired: ReadLifecycleMeta = { checkpoints_seen: 1, recheck: recheck('holds'), conflict: conflict('retired') };
    expect(readOutcomeFromLifecycle(retired)).toEqual({ outcome: 'contradicted', at: '2026-10-11T00:00:00Z' });
    expect(readOutcomeFromLifecycle({ checkpoints_seen: 1, recheck: recheck('holds'), conflict: conflict('winner') })?.outcome).toBe('held');
    expect(readOutcomeFromLifecycle({ checkpoints_seen: 1, conflict: conflict('paired', 'opposing_strategy') })).toBeNull();
  });

  it('with an inconclusive newest recheck, the history decides', () => {
    expect(readOutcomeFromLifecycle({ checkpoints_seen: 3, checkpoints_held: 2, last_checkpoint_at: '2026-10-01T00:00:00Z', recheck: recheck('inconclusive') })).toEqual({
      outcome: 'held',
      at: '2026-10-01T00:00:00Z',
    });
    expect(readOutcomeFromLifecycle({ checkpoints_seen: 3, cleared_at: '2026-10-02T00:00:00Z', recheck: recheck('inconclusive') })).toEqual({
      outcome: 'cleared',
      at: '2026-10-02T00:00:00Z',
    });
  });

  it('a cleared read reopened since is not cleared', () => {
    expect(readOutcomeFromLifecycle({ checkpoints_seen: 3, cleared_at: '2026-10-02T00:00:00Z', reopened_at: '2026-10-05T00:00:00Z' })).toBeNull();
    expect(
      readOutcomeFromLifecycle({ checkpoints_seen: 3, checkpoints_held: 1, cleared_at: '2026-10-02T00:00:00Z', reopened_at: '2026-10-05T00:00:00Z' })?.outcome,
    ).toBe('held');
  });
});
