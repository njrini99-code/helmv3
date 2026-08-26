// Regression coverage for the production/local timeline acknowledgement schema
// reconciliation. Production requires team/player + acked_*; a fresh local
// replay historically exposed only user_id + acknowledged_at. The action must
// write the full compatibility record and use the live conflict key so a click
// cannot fail at PostgREST before an acknowledgement is saved.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { from, revalidatePath } = vi.hoisted(() => ({
  from: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _options: unknown, fn: (ctx: unknown, ...args: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(
        {
          user: { id: 'user-1' },
          activeTeamId: 'team-1',
        },
        ...args,
      ),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from })),
}));

vi.mock('next/cache', () => ({ revalidatePath }));

import {
  acknowledgeTimelineEvent,
  getMyTimelineAcknowledgements,
  withdrawTimelineAcknowledgement,
} from '@/app/baseball/actions/timeline-acks';

const EVENT_ID = 'event-1';
const acknowledgedAt = '2026-08-25T12:00:00.000Z';

function eventQuery() {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => ({
    data: { id: EVENT_ID, team_id: 'team-1', player_id: 'player-1' },
    error: null,
  }));
  return query;
}

describe('timeline acknowledgements — production/local contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date.prototype, 'toISOString').mockReturnValue(acknowledgedAt);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes both compatibility shapes and conflicts on the live production key', async () => {
    const upsert = vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({
          data: { acknowledged_at: acknowledgedAt },
          error: null,
        })),
      })),
    }));

    from.mockImplementation((table: string) => {
      if (table === 'baseball_player_timeline_events') return eventQuery();
      if (table === 'baseball_timeline_event_acks') return { upsert };
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await acknowledgeTimelineEvent(EVENT_ID);

    expect(result).toEqual({ success: true, acknowledgedAt });
    expect(upsert).toHaveBeenCalledWith(
      {
        timeline_event_id: EVENT_ID,
        team_id: 'team-1',
        player_id: 'player-1',
        acked_by: 'user-1',
        acked_at: acknowledgedAt,
        user_id: 'user-1',
        acknowledged_at: acknowledgedAt,
      },
      { onConflict: 'timeline_event_id,acked_by' },
    );
    expect(revalidatePath).toHaveBeenCalledWith('/baseball/dashboard/players');
    expect(revalidatePath).toHaveBeenCalledWith('/baseball/player/timeline');
  });

  it('withdraws only the caller’s acknowledgement through the owner key', async () => {
    const secondEq = vi.fn(async () => ({ error: null }));
    const firstEq = vi.fn(() => ({ eq: secondEq }));
    const remove = vi.fn(() => ({ eq: firstEq }));
    from.mockImplementation((table: string) => {
      if (table === 'baseball_timeline_event_acks') return { delete: remove };
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(withdrawTimelineAcknowledgement(EVENT_ID)).resolves.toEqual({
      success: true,
      acknowledgedAt: null,
    });
    expect(firstEq).toHaveBeenCalledWith('timeline_event_id', EVENT_ID);
    expect(secondEq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('reads acknowledgement state through the compatibility user alias', async () => {
    const inQuery = vi.fn(async () => ({
      data: [{ timeline_event_id: EVENT_ID }],
      error: null,
    }));
    const eq = vi.fn(() => ({ in: inQuery }));
    const select = vi.fn(() => ({ eq }));
    from.mockImplementation((table: string) => {
      if (table === 'baseball_timeline_event_acks') return { select };
      throw new Error(`Unexpected table ${table}`);
    });

    await expect(getMyTimelineAcknowledgements([EVENT_ID])).resolves.toEqual({
      acknowledgedEventIds: [EVENT_ID],
    });
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
