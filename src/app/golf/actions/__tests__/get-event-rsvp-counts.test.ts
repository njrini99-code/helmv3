/**
 * getEventRSVP after migration 20261017102000 (a player reads only their own golf_event_attendance row): the totals
 * come from golf_event_attendance_counts, so Fairway's event People header still counts everyone ("People · 6", not
 * "People · 1"). Before the migration the function is missing and the row totals stand; a failed counts read never
 * fails the load.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

type RpcResult = { data: unknown; error: unknown };
let rpc: Mock<(...args: unknown[]) => unknown>;
const fake = {
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
  rpc: (...args: unknown[]) => rpc(...args),
};

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1') }));
vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({ postRoundTrigger: vi.fn(async () => {}) }));
vi.mock('@/lib/cache/golf-stats-calculator', () => ({ invalidateOnRoundComplete: vi.fn(async () => {}) }));
vi.mock('@/lib/admin-logger', () => ({ logRoundSubmitted: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications', () => ({ notifyQualifierCreated: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications/email', () => ({ sendEmailNotification: vi.fn(async () => ({ success: true })) }));
vi.mock('@/lib/notifications/push', () => ({ sendBulkPushNotification: vi.fn(async () => {}) }));

/** What the row read returns for a player after the migration: only their own reply. */
const ownRowOnly = {
  summary: {
    total: 1,
    accepted: 1,
    declined: 0,
    tentative: 0,
    pending: 0,
    attendees: [{ playerId: 'p1', playerName: 'Ava Lin', avatarUrl: null, status: 'accepted' as const, respondedAt: null }],
  },
  acceptanceRate: 100,
  responseRate: 100,
};
vi.mock('@/lib/calendar/rsvp', () => ({ getEventRSVPStats: vi.fn(async () => ownRowOnly) }));

import { getEventRSVP } from '../calendar-events';
import { getEventRSVPStats } from '@/lib/calendar/rsvp';
import { logServerError } from '@/lib/server-error-logger';

beforeEach(() => {
  rpc = vi.fn(async (): Promise<RpcResult> => ({ data: null, error: null }));
});

describe('getEventRSVP totals once a player reads only their own row', () => {
  it('takes the totals from the counts function, keeping the player’s own row', async () => {
    rpc = vi.fn(async () => ({
      data: [{ event_id: 'e1', invited: 6, accepted: 3, declined: 1, pending: 1, coach_invited: 6 }],
      error: null,
    }));
    const res = await getEventRSVP('e1');
    expect(rpc).toHaveBeenCalledWith('golf_event_attendance_counts', { p_event_ids: ['e1'] });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.summary).toMatchObject({ total: 6, accepted: 3, declined: 1, pending: 1, tentative: 1 });
    expect(res.data.summary.attendees).toHaveLength(1);
    expect(res.data.acceptanceRate).toBe(50);
    expect(res.data.responseRate).toBe(83);
  });

  it('keeps the row totals while the function is not deployed', async () => {
    rpc = vi.fn(async () => ({ data: null, error: { code: 'PGRST202', message: 'not found' } }));
    const res = await getEventRSVP('e1');
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.summary.total).toBe(1);
  });

  it('keeps the row totals when the counts read throws', async () => {
    rpc = vi.fn(() => {
      throw new Error('network');
    });
    const res = await getEventRSVP('e1');
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.summary.total).toBe(1);
  });

  it('fails the load, logged, when the attendance read fails, so People shows Retry and not "No one invited yet"', async () => {
    vi.mocked(getEventRSVPStats).mockRejectedValueOnce(new Error("Could not load the event's attendance: denied"));
    const res = await getEventRSVP('e1');
    expect(res.success).toBe(false);
    expect(vi.mocked(logServerError)).toHaveBeenCalledWith(
      expect.stringContaining('getEventRSVP failed for event e1'),
      expect.objectContaining({ action: 'golf.getEventRSVP' }),
      'warning',
    );
  });
});
