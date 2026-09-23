import { describe, it, expect, vi } from 'vitest';
import { BehaviorLearner } from '@/lib/coachhelm/v2/learning/behavior-learner';

describe('BehaviorLearner.recordInteraction', () => {
  it('appends an event row matching the live table schema', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseMock = { from: vi.fn().mockReturnValue({ insert: insertSpy }) };
    const learner = new BehaviorLearner('00000000-0000-0000-0000-000000000001', 'coach');
    (learner as unknown as { supabase: typeof supabaseMock }).supabase = supabaseMock;

    await learner.recordInteraction({
      interaction_type: 'insight_acknowledged',
      target_type: 'insight',
      target_id: 'insight-uuid',
      metadata: { delay_seconds: 12 },
    });

    expect(supabaseMock.from).toHaveBeenCalledWith('golf_learned_behavior');
    const payload = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.entity_type).toBe('coach');
    expect(payload.entity_id).toBe('00000000-0000-0000-0000-000000000001');
    expect(payload.interaction_type).toBe('insight_acknowledged');
    expect(payload.target_type).toBe('insight');
    expect(payload.timestamp).toBeDefined();
    // metadata carries the original target_id since live table has no target_id column
    expect((payload.metadata as Record<string, unknown>).target_id).toBe('insight-uuid');
    expect((payload.metadata as Record<string, unknown>).delay_seconds).toBe(12);
    // No object-shape columns
    expect(payload).not.toHaveProperty('interactions');
    expect(payload).not.toHaveProperty('learned_thresholds');
    expect(payload).not.toHaveProperty('engagement_patterns');
  });

  it('two concurrent recordInteraction calls produce two rows (no load-mutate-save race)', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseMock = { from: vi.fn().mockReturnValue({ insert: insertSpy }) };
    const learner = new BehaviorLearner('00000000-0000-0000-0000-000000000001', 'coach');
    (learner as unknown as { supabase: typeof supabaseMock }).supabase = supabaseMock;

    await Promise.all([
      learner.recordInteraction({
        interaction_type: 'insight_acknowledged',
        target_type: 'insight',
        target_id: '1',
        metadata: {},
      }),
      learner.recordInteraction({
        interaction_type: 'insight_dismissed',
        target_type: 'insight',
        target_id: '2',
        metadata: {},
      }),
    ]);

    expect(insertSpy).toHaveBeenCalledTimes(2);
  });
});

describe('BehaviorLearner.loadBehavior aggregation', () => {
  it('aggregates event rows into acknowledgment/dismissal rates', async () => {
    const eventRows = [
      {
        interaction_type: 'insight_acknowledged',
        target_type: 'insight',
        timestamp: '2026-04-10T00:00:00Z',
        metadata: { insight_type: 'decline' },
      },
      {
        interaction_type: 'insight_dismissed',
        target_type: 'insight',
        timestamp: '2026-04-15T00:00:00Z',
        metadata: { insight_type: 'pressure' },
      },
      {
        interaction_type: 'insight_acknowledged',
        target_type: 'insight',
        timestamp: '2026-04-20T00:00:00Z',
        metadata: { insight_type: 'decline' },
      },
    ];
    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({ data: eventRows, error: null }),
            }),
          }),
        }),
      }),
    };

    const learner = new BehaviorLearner('00000000-0000-0000-0000-000000000001', 'coach');
    (learner as unknown as { supabase: typeof supabaseMock }).supabase = supabaseMock;

    const profile = await learner.loadBehavior();
    expect(profile.totalInteractions).toBe(3);
    expect(profile.acknowledgmentRate).toBeCloseTo(2 / 3);
    expect(profile.dismissalRate).toBeCloseTo(1 / 3);
    expect(profile.lastInteractionAt).toBe('2026-04-10T00:00:00Z');
    expect(profile.byInsightType.decline).toEqual({ acks: 2, dismisses: 0 });
    expect(profile.byInsightType.pressure).toEqual({ acks: 0, dismisses: 1 });
  });

  it('buckets a `feedback` interaction row by metadata.rating, not by interaction_type', async () => {
    // rateInsight (insights.ts) records interaction_type: 'feedback', which is
    // in neither ACK_TYPES nor DISMISS_TYPES — before the fix these rows
    // counted toward neither ack nor dismiss.
    const eventRows = [
      {
        interaction_type: 'feedback',
        target_type: 'insight',
        timestamp: '2026-04-10T00:00:00Z',
        metadata: { insight_type: 'decline', rating: 'helpful' },
      },
      {
        interaction_type: 'feedback',
        target_type: 'insight',
        timestamp: '2026-04-11T00:00:00Z',
        metadata: { insight_type: 'decline', rating: 'actionable' },
      },
      {
        interaction_type: 'feedback',
        target_type: 'insight',
        timestamp: '2026-04-12T00:00:00Z',
        metadata: { insight_type: 'decline', rating: 'not_helpful' },
      },
      {
        interaction_type: 'feedback',
        target_type: 'insight',
        timestamp: '2026-04-13T00:00:00Z',
        // No rating on the row — defaults to an ack.
        metadata: { insight_type: 'decline' },
      },
    ];
    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({ data: eventRows, error: null }),
            }),
          }),
        }),
      }),
    };

    const learner = new BehaviorLearner('00000000-0000-0000-0000-000000000001', 'coach');
    (learner as unknown as { supabase: typeof supabaseMock }).supabase = supabaseMock;

    const profile = await learner.loadBehavior();
    expect(profile.totalInteractions).toBe(4);
    expect(profile.acknowledgmentRate).toBeCloseTo(3 / 4);
    expect(profile.dismissalRate).toBeCloseTo(1 / 4);
    expect(profile.byInsightType.decline).toEqual({ acks: 3, dismisses: 1 });
  });

  it('returns zeroed profile when DB returns an error', async () => {
    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({ data: null, error: { message: 'boom' } }),
            }),
          }),
        }),
      }),
    };
    const learner = new BehaviorLearner('00000000-0000-0000-0000-000000000001', 'coach');
    (learner as unknown as { supabase: typeof supabaseMock }).supabase = supabaseMock;
    const profile = await learner.loadBehavior();
    expect(profile.totalInteractions).toBe(0);
    expect(profile.lastInteractionAt).toBeNull();
  });
});

describe('BehaviorLearner.getPersonalizedThreshold', () => {
  function supabaseMockForRows(eventRows: unknown[]) {
    return {
      from: vi.fn().mockReturnValue({
        select: () => ({
          eq: () => ({
            eq: () => ({
              order: async () => ({ data: eventRows, error: null }),
            }),
          }),
        }),
      }),
    };
  }

  function feedbackRow(insightType: string, rating: 'helpful' | 'not_helpful') {
    return {
      interaction_type: 'feedback',
      target_type: 'insight',
      timestamp: '2026-05-01T00:00:00Z',
      metadata: { insight_type: insightType, rating },
    };
  }

  it('returns the default threshold unchanged when there is not enough sample', async () => {
    // Only 3 total interactions — below PERSONALIZATION_MIN_SAMPLE (8).
    const rows = [
      feedbackRow('scoring_decline', 'not_helpful'),
      feedbackRow('scoring_decline', 'not_helpful'),
      feedbackRow('scoring_decline', 'helpful'),
    ];
    const learner = new BehaviorLearner('00000000-0000-0000-0000-000000000001', 'coach');
    const supabaseMock = supabaseMockForRows(rows);
    (learner as unknown as { supabase: typeof supabaseMock }).supabase = supabaseMock;

    const threshold = await learner.getPersonalizedThreshold('scoring_decline', 3);
    expect(threshold).toBe(3);
  });

  it('raises the threshold when the coach dismisses this alert type often', async () => {
    // 8 dismisses, 2 acks -> dismissRate = 0.8 -> +0.15 adjustment.
    const rows = [
      ...Array.from({ length: 8 }, () => feedbackRow('scoring_decline', 'not_helpful')),
      ...Array.from({ length: 2 }, () => feedbackRow('scoring_decline', 'helpful')),
    ];
    const learner = new BehaviorLearner('00000000-0000-0000-0000-000000000001', 'coach');
    const supabaseMock = supabaseMockForRows(rows);
    (learner as unknown as { supabase: typeof supabaseMock }).supabase = supabaseMock;

    const threshold = await learner.getPersonalizedThreshold('scoring_decline', 3);
    expect(threshold).toBeCloseTo(3 * 1.15);
  });

  it('lowers the threshold when the coach acknowledges this alert type often', async () => {
    // 8 acks, 2 dismisses -> dismissRate = 0.2 -> -0.15 adjustment.
    const rows = [
      ...Array.from({ length: 8 }, () => feedbackRow('pressure_gap', 'helpful')),
      ...Array.from({ length: 2 }, () => feedbackRow('pressure_gap', 'not_helpful')),
    ];
    const learner = new BehaviorLearner('00000000-0000-0000-0000-000000000001', 'coach');
    const supabaseMock = supabaseMockForRows(rows);
    (learner as unknown as { supabase: typeof supabaseMock }).supabase = supabaseMock;

    const threshold = await learner.getPersonalizedThreshold('pressure_gap', 2);
    expect(threshold).toBeCloseTo(2 * 0.85);
  });

  it('clamps the adjustment at +/-25% even at a 100% dismiss rate', async () => {
    const rows = Array.from({ length: 10 }, () => feedbackRow('scoring_decline', 'not_helpful'));
    const learner = new BehaviorLearner('00000000-0000-0000-0000-000000000001', 'coach');
    const supabaseMock = supabaseMockForRows(rows);
    (learner as unknown as { supabase: typeof supabaseMock }).supabase = supabaseMock;

    const threshold = await learner.getPersonalizedThreshold('scoring_decline', 4);
    expect(threshold).toBeCloseTo(4 * 1.25);
  });

  it('falls back to the overall profile when the per-type bucket is too small', async () => {
    // 'scoring_decline' bucket only has 1 row, but overall (10 rows) meets
    // the sample floor — the overall 9-dismiss/1-ack rate should apply.
    const rows = [
      feedbackRow('scoring_decline', 'not_helpful'),
      ...Array.from({ length: 8 }, () => feedbackRow('other_type', 'not_helpful')),
      feedbackRow('other_type', 'helpful'),
    ];
    const learner = new BehaviorLearner('00000000-0000-0000-0000-000000000001', 'coach');
    const supabaseMock = supabaseMockForRows(rows);
    (learner as unknown as { supabase: typeof supabaseMock }).supabase = supabaseMock;

    const threshold = await learner.getPersonalizedThreshold('scoring_decline', 3);
    // Overall: 9 dismisses / 1 ack out of 10 -> dismissRate 0.9 -> +0.2 (below the +/-0.25 clamp).
    expect(threshold).toBeCloseTo(3 * 1.2);
  });
});

describe('BehaviorLearner legacy API preserved', () => {
  it('learnFromInteraction forwards to the event-log insert', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseMock = { from: vi.fn().mockReturnValue({ insert: insertSpy }) };
    const learner = new BehaviorLearner('00000000-0000-0000-0000-000000000001', 'player');
    (learner as unknown as { supabase: typeof supabaseMock }).supabase = supabaseMock;

    await learner.learnFromInteraction({
      entityId: '00000000-0000-0000-0000-000000000001',
      entityType: 'player',
      interactionType: 'click',
      targetType: 'insight',
      targetId: 'target-uuid',
      metadata: { rating: 'helpful' },
      timestamp: new Date().toISOString(),
    });

    expect(insertSpy).toHaveBeenCalledTimes(1);
    const payload = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.interaction_type).toBe('click');
    expect(payload.target_type).toBe('insight');
    expect((payload.metadata as Record<string, unknown>).target_id).toBe('target-uuid');
    expect((payload.metadata as Record<string, unknown>).rating).toBe('helpful');
  });
});
