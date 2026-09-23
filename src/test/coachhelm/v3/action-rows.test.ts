/**
 * Pkg 9 slice 1a — `recordInsightAction` dedup, mirroring
 * `exposure-rows.test.ts`'s coverage of `recordInsightExposure`'s dedup.
 */
import { describe, it, expect } from 'vitest';
import { actionDedupeKey, isActionAlreadyRecorded } from '@/lib/coachhelm/v3/effectiveness/action-rows';

describe('actionDedupeKey', () => {
  it('is the same key regardless of whether actor_id is undefined vs null', () => {
    expect(actionDedupeKey({ insight_id: 'i1', actor_id: null, action_type: 'create_focus' })).toBe(
      actionDedupeKey({ insight_id: 'i1', action_type: 'create_focus' }),
    );
  });

  it('distinguishes different actors on the same insight/action', () => {
    const a = actionDedupeKey({ insight_id: 'i1', actor_id: 'u1', action_type: 'create_focus' });
    const b = actionDedupeKey({ insight_id: 'i1', actor_id: 'u2', action_type: 'create_focus' });
    expect(a).not.toBe(b);
  });

  it('distinguishes different action types for the same insight/actor', () => {
    const a = actionDedupeKey({ insight_id: 'i1', actor_id: 'u1', action_type: 'create_focus' });
    const b = actionDedupeKey({ insight_id: 'i1', actor_id: 'u1', action_type: 'dismissed' });
    expect(a).not.toBe(b);
  });
});

describe('isActionAlreadyRecorded', () => {
  it('is true when the (insight, actor, action_type) key was already recorded today', () => {
    const already = new Set([actionDedupeKey({ insight_id: 'i1', actor_id: 'u1', action_type: 'create_focus' })]);
    expect(isActionAlreadyRecorded({ insight_id: 'i1', actor_id: 'u1', action_type: 'create_focus' }, already)).toBe(true);
  });

  it('is false for a different actor on the same insight/action', () => {
    const already = new Set([actionDedupeKey({ insight_id: 'i1', actor_id: 'u1', action_type: 'create_focus' })]);
    expect(isActionAlreadyRecorded({ insight_id: 'i1', actor_id: 'u2', action_type: 'create_focus' }, already)).toBe(false);
  });

  it('is false when nothing has been recorded yet', () => {
    expect(isActionAlreadyRecorded({ insight_id: 'i1', actor_id: 'u1', action_type: 'create_focus' }, new Set())).toBe(false);
  });
});
