import { describe, it, expect, vi } from 'vitest';
import { recordAction, queryActions } from '@/lib/coachhelm/v2/feedback/coach-behavior';

describe('recordAction', () => {
  it('inserts only valid columns (no bogus `timestamp`) and propagates DB errors', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: { message: 'simulated' } });
    const supabaseMock = { from: vi.fn().mockReturnValue({ insert: insertSpy }) };

    await expect(
      recordAction(
        {
          coachId: 'c-1',
          actionType: 'view_insight',
          targetId: 'i-1',
          metadata: { source: 'dashboard' },
          timestamp: new Date().toISOString(),
        },
        supabaseMock as never,
      ),
    ).rejects.toThrow(/simulated/);

    expect(supabaseMock.from).toHaveBeenCalledWith('golf_coach_behavior_log');
    const payload = insertSpy.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('timestamp');
    expect(Object.keys(payload).sort()).toEqual([
      'action_type',
      'coach_id',
      'metadata',
      'target_id',
    ]);
  });

  it('does not throw on successful insert', async () => {
    const insertSpy = vi.fn().mockResolvedValue({ error: null });
    const supabaseMock = { from: vi.fn().mockReturnValue({ insert: insertSpy }) };

    await expect(
      recordAction(
        {
          coachId: 'c-1',
          actionType: 'view_player',
          targetId: 'p-1',
          timestamp: new Date().toISOString(),
        },
        supabaseMock as never,
      ),
    ).resolves.toBeUndefined();
  });
});

describe('queryActions', () => {
  it('maps rows back into the CoachAction shape and uses created_at for timestamp', async () => {
    const limitSpy = vi.fn().mockResolvedValue({
      data: [
        {
          coach_id: 'c-1',
          action_type: 'view_insight',
          target_id: 'i-1',
          metadata: { source: 'dashboard' },
          created_at: '2026-04-20T10:00:00Z',
        },
      ],
      error: null,
    });
    const orderSpy = vi.fn().mockReturnValue({ limit: limitSpy });
    const eqSpy = vi.fn().mockReturnValue({ order: orderSpy });
    const selectSpy = vi.fn().mockReturnValue({ eq: eqSpy });
    const supabaseMock = { from: vi.fn().mockReturnValue({ select: selectSpy }) };

    const actions = await queryActions('c-1', 10, supabaseMock as never);
    expect(actions).toHaveLength(1);
    expect(actions[0]?.timestamp).toBe('2026-04-20T10:00:00Z');
    expect(actions[0]?.actionType).toBe('view_insight');
    // The query must order by created_at (live column), not the prior (bogus) `timestamp`
    expect(orderSpy).toHaveBeenCalledWith('created_at', { ascending: false });
  });
});
