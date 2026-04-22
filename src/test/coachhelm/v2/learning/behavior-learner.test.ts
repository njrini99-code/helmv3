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
    const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
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
    const payload = insertSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.interaction_type).toBe('click');
    expect(payload.target_type).toBe('insight');
    expect((payload.metadata as Record<string, unknown>).target_id).toBe('target-uuid');
    expect((payload.metadata as Record<string, unknown>).rating).toBe('helpful');
  });
});
