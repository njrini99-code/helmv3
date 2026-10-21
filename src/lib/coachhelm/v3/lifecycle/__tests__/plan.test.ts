import { describe, expect, it } from 'vitest';
import { planPlayer, type PlayerPlanInput } from '../plan';
import type { CheckpointDecision, PlayerCheckpointState } from '../checkpoint';
import type { RecheckRecord } from '@/lib/coachhelm/v3/engine/recent-recheck';
import { LIFECYCLE_META_KEY, type ReadLifecycleMeta } from '../types';
import { NOW, read } from './fixtures';

const NEXT: PlayerCheckpointState = {
  last_checkpoint_round_id: 'r0',
  last_checkpoint_at: NOW,
  checkpoint_count: 2,
  rounds_since: 0,
  attempts_since: {},
};
const PLAYER: CheckpointDecision = { kind: 'player', roundsSince: 3, next: NEXT };
const NONE: CheckpointDecision = { kind: 'families', families: [], roundsSince: 1, next: { ...NEXT, rounds_since: 1 } };

function rec(outcome: RecheckRecord['outcome']): RecheckRecord {
  return {
    window: 'newest_15_rounds',
    rounds_n: 15,
    recent_value: 75.9,
    recent_n: 29,
    recent_unit: 'putts',
    recent_lower_90: 64.5,
    recent_upper_90: 84.6,
    old_value: 62,
    old_n: 95,
    benchmark: 72,
    polarity: 'higher_better',
    outcome,
    min_n: 20,
    computed_at: NOW,
  };
}

function input(partial: Partial<PlayerPlanInput>): PlayerPlanInput {
  return {
    reads: [],
    decision: PLAYER,
    rechecks: new Map(),
    newestCountableRoundDate: '2026-10-15',
    corrections: [],
    flaggedRoundIds: new Set(),
    link: null,
    nowIso: NOW,
    ...partial,
  };
}

function metaWith(m: Partial<ReadLifecycleMeta>): Record<string, unknown> {
  return { movement_count: 1, [LIFECYCLE_META_KEY]: { checkpoints_seen: 0, ...m } };
}

function lifecycleOf(patchMeta: Record<string, unknown>): ReadLifecycleMeta {
  return patchMeta[LIFECYCLE_META_KEY] as ReadLifecycleMeta;
}

describe('planPlayer: recheck and Cleared', () => {
  it('a cleared recheck marks the read Cleared and mirrors evidence.recheck; nothing archives yet', () => {
    const plan = planPlayer(input({ reads: [read('a', { metadata: { movement_count: 1 } })], rechecks: new Map([['a', rec('cleared')]]) }));
    expect(plan.patches).toHaveLength(1);
    const p = plan.patches[0]!;
    expect(p.action).toBe('update');
    expect(p.lifecycle_state).toBeUndefined();
    expect(p.evidence?.recheck).toMatchObject({ outcome: 'cleared', recent_n: 29 });
    expect(lifecycleOf(p.metadata)).toMatchObject({ checkpoints_seen: 1, cleared_at_checkpoint: 1, cleared_at: NOW });
    expect(p.metadata.movement_count).toBe(1);
    expect(plan.counts).toMatchObject({ covered: 1, rechecked: 1, cleared: 1 });
  });

  it('archives a Cleared read two checkpoints later with the engine-recheck provenance', () => {
    const a = read('a', { metadata: metaWith({ checkpoints_seen: 2, cleared_at_checkpoint: 1, recheck: rec('cleared') }) }, { recheck: rec('cleared') });
    const plan = planPlayer(input({ reads: [a], rechecks: new Map([['a', rec('inconclusive')]]) }));
    const p = plan.patches[0]!;
    expect(p).toMatchObject({ action: 'archive', lifecycle_state: 'archived', archived_at: NOW, archiveReason: 'recheck_cleared', observedLifecycle: 'detected' });
    expect(p.metadata).toMatchObject({
      archived_by: 'coachhelm-lifecycle',
      archive_reason: 'recheck_cleared',
      resolved_by: 'engine-recheck',
      retired_reason: 'recheck_cleared',
      retired_from_state: 'detected',
    });
    expect(plan.counts.archived).toEqual({ recheck_cleared: 1 });
  });

  it('a read that holds again after clearing is reopened', () => {
    const a = read('a', { metadata: metaWith({ checkpoints_seen: 1, cleared_at_checkpoint: 1, cleared_at: '2026-10-10T00:00:00Z' }) });
    const p = planPlayer(input({ reads: [a], rechecks: new Map([['a', rec('holds')]]) })).patches[0]!;
    expect(p.action).toBe('update');
    const m = lifecycleOf(p.metadata);
    expect(m.cleared_at_checkpoint).toBeUndefined();
    expect(m.reopened_at).toBe(NOW);
    expect(m.checkpoints_held).toBe(1);
  });

  it('a coach-engaged (addressed) read is never archived here', () => {
    const a = read('a', { lifecycle_state: 'addressed', metadata: metaWith({ checkpoints_seen: 2, cleared_at_checkpoint: 1 }) });
    const p = planPlayer(input({ reads: [a] })).patches[0]!;
    expect(p.action).toBe('update');
  });

  it('no checkpoint: nothing is rechecked or archived, and an unchanged read writes nothing', () => {
    const a = read('a', { metadata: metaWith({ checkpoints_seen: 2, cleared_at_checkpoint: 1 }) });
    const plan = planPlayer(input({ reads: [a], decision: NONE, rechecks: new Map([['a', rec('cleared')]]) }));
    expect(plan.patches).toHaveLength(0);
  });
});

describe('planPlayer: evidence mirroring', () => {
  it('re-stamps evidence fields a generator re-emit dropped, on a night with no checkpoint', () => {
    const a = read('a', { metadata: metaWith({ checkpoints_seen: 1, recheck: rec('holds') }) }, {});
    const plan = planPlayer(input({ reads: [a], decision: NONE }));
    expect(plan.patches).toHaveLength(1);
    expect(plan.patches[0]!.evidence?.recheck).toMatchObject({ outcome: 'holds' });
    expect(plan.patches[0]!.evidence?.metric).toBe('putts_made_3_5ft_pct');
  });
});

describe('planPlayer: Contradicted', () => {
  it('retires the older opposite read and marks the winner; the winner line clears at its next checkpoint', () => {
    const older = read('old', {}, { your_value: 62, window_end: '2026-08-01' });
    const newer = read('new', {}, { your_value: 78, window_end: '2026-10-15' });
    const plan = planPlayer(input({ reads: [older, newer] }));
    const byId = new Map(plan.patches.map((p) => [p.id, p]));
    expect(byId.get('old')).toMatchObject({ action: 'archive', archiveReason: 'contradicted' });
    expect(byId.get('old')!.metadata).toMatchObject({ resolved_by: 'engine-contradiction', retired_reason: 'contradicted' });
    expect(byId.get('old')!.evidence?.conflict).toMatchObject({ role: 'retired', with_insight_id: 'new' });
    expect(byId.get('new')).toMatchObject({ action: 'update' });
    expect(byId.get('new')!.evidence?.conflict).toMatchObject({ role: 'winner', with_insight_id: 'old' });
    const winnerMeta = lifecycleOf(byId.get('new')!.metadata);
    expect(winnerMeta.conflict_at_checkpoint).toBe(1);

    // Next checkpoint: the loser is archived (not live), the winner's line clears.
    const winner = read('new', { metadata: byId.get('new')!.metadata }, { your_value: 78, window_end: '2026-10-15', conflict: winnerMeta.conflict! });
    const next = planPlayer(input({ reads: [winner] })).patches[0]!;
    expect(lifecycleOf(next.metadata).conflict).toBeUndefined();
    expect(next.evidence).not.toHaveProperty('conflict');
  });

  it('restores a contradicted read when its winner is gone', () => {
    const retired = read('old', {
      lifecycle_state: 'archived',
      metadata: {
        ...metaWith({ checkpoints_seen: 1, conflict: { with_insight_id: 'new', kind: 'opposing_direction', role: 'retired', net_strokes: null, resolution: 'newest_wins', subject: 's', computed_at: NOW } }),
        archived_by: 'coachhelm-lifecycle',
        resolved_by: 'engine-contradiction',
        retired_reason: 'contradicted',
      },
    });
    const p = planPlayer(input({ reads: [retired] })).patches[0]!;
    expect(p).toMatchObject({ action: 'restore', lifecycle_state: 'detected', archived_at: null });
    expect(p.metadata).not.toHaveProperty('resolved_by');
    expect(p.metadata).not.toHaveProperty('archived_by');
    expect(p.metadata.restored_by).toBe('engine-contradiction');
  });
});

describe('planPlayer: recheck-retired reads', () => {
  const retired = () =>
    read('a', {
      lifecycle_state: 'archived',
      metadata: { ...metaWith({ checkpoints_seen: 3 }), archived_by: 'coachhelm-lifecycle', resolved_by: 'engine-recheck', retired_reason: 'recheck_cleared' },
    });

  it('restores when the recheck holds again', () => {
    const p = planPlayer(input({ reads: [retired()], rechecks: new Map([['a', rec('holds')]]) })).patches[0]!;
    expect(p).toMatchObject({ action: 'restore', lifecycle_state: 'detected' });
    expect(p.metadata.restored_by).toBe('engine-recheck');
  });

  it('stays archived otherwise (the count still moves)', () => {
    const p = planPlayer(input({ reads: [retired()], rechecks: new Map([['a', rec('inconclusive')]]) })).patches[0]!;
    expect(p.action).toBe('update');
    expect(p.lifecycle_state).toBeUndefined();
    expect(p.metadata.resolved_by).toBe('engine-recheck');
  });
});

describe('planPlayer: Out of date', () => {
  it('archives a read out of date at 3 checkpoints in a row; a refresh resets it', () => {
    const stale = (seen: number, since: number | undefined) =>
      read('a', { metadata: metaWith({ checkpoints_seen: seen, out_of_date_since_checkpoint: since }) }, { window_end: '2026-09-01' });
    const first = planPlayer(input({ reads: [stale(0, undefined)] })).patches[0]!;
    expect(lifecycleOf(first.metadata).out_of_date_since_checkpoint).toBe(1);
    expect(first.action).toBe('update');
    expect(planPlayer(input({ reads: [stale(1, 1)] })).patches[0]!.action).toBe('update');
    const third = planPlayer(input({ reads: [stale(2, 1)] })).patches[0]!;
    expect(third).toMatchObject({ action: 'archive', archiveReason: 'out_of_date_3_checkpoints' });
    expect(third.metadata).not.toHaveProperty('resolved_by');
    // Refreshed (window_end now current): the marker goes.
    const fresh = read('a', { metadata: metaWith({ checkpoints_seen: 2, out_of_date_since_checkpoint: 1 }) }, { window_end: '2026-10-15' });
    expect(lifecycleOf(planPlayer(input({ reads: [fresh] })).patches[0]!.metadata).out_of_date_since_checkpoint).toBeUndefined();
  });
});

describe('planPlayer: Under review', () => {
  it('a wrong-cause correction marks the read without a checkpoint; an integrity flag needs a round in its window', () => {
    const corrections = [{ id: 'c1', insight_id: 'a', kind: 'wrong_cause', reason: null, alternative_cause_label: null, created_at: '2026-10-14T00:00:00Z' }];
    const p = planPlayer(input({ reads: [read('a')], decision: NONE, corrections })).patches[0]!;
    expect(p.evidence?.under_review).toMatchObject({ reason: 'wrong_cause', correction_id: 'c1' });
    expect(planPlayer(input({ reads: [read('a')], decision: NONE, flaggedRoundIds: new Set(['r9']) })).patches).toHaveLength(0);
    const flagged = planPlayer(input({ reads: [read('a')], decision: NONE, flaggedRoundIds: new Set(['r1']) })).patches[0]!;
    expect(flagged.evidence?.under_review).toMatchObject({ reason: 'integrity', round_ids: ['r1'] });
  });
});
