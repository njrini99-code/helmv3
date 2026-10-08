// =============================================================================
// POST /api/push-subscriptions/test — push-to-self (D1-6, Settings P008-C3).
// Pins: signed-out callers are refused; only the caller's own subscriptions
// are read and sent to; the text is fixed whatever the body says; a dead
// subscription is removed; the per-user rate limit holds.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getUser = vi.fn();
const sendWebPush = vi.hoisted(() => vi.fn());
const checkRateLimit = vi.hoisted(() => vi.fn(async () => ({ allowed: true, remaining: 2, resetAt: 0 })));
const calls = vi.hoisted(() => ({ eq: [] as Array<[string, unknown]>, deleted: [] as unknown[], rows: [] as unknown[] }));

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser } })) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock('@/lib/auth/rate-limit', () => ({ checkRateLimit }));
vi.mock('@/lib/coachhelm/v3/foundation/push', () => ({ sendWebPush, isWebPushAvailable: () => true }));
vi.mock('@/lib/supabase/untyped', () => ({
  fromUntyped: vi.fn(() => ({
    select: () => ({
      eq: (col: string, v: unknown) => {
        calls.eq.push([col, v]);
        return { limit: async () => ({ data: calls.rows, error: null }) };
      },
    }),
    delete: () => ({
      eq: (col: string, v: unknown) => {
        calls.eq.push([col, v]);
        return { in: async (_c: string, ids: unknown[]) => (calls.deleted.push(...ids), { error: null }) };
      },
    }),
  })),
}));

import { POST } from '@/app/api/push-subscriptions/test/route';

const sub = (id: string, user = 'user-1') => ({ id, user_id: user, endpoint: `https://push.example/${id}`, keys: { p256dh: 'p', auth: 'a' } });

beforeEach(() => {
  getUser.mockReset();
  sendWebPush.mockReset();
  checkRateLimit.mockClear();
  calls.eq = [];
  calls.deleted = [];
  calls.rows = [];
});

describe('POST /api/push-subscriptions/test', () => {
  it('refuses a signed-out caller and sends nothing', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    const res = await POST();
    expect(res.status).toBe(401);
    expect(sendWebPush).not.toHaveBeenCalled();
  });

  it('sends one fixed test only to the caller’s own subscriptions, and removes a dead one', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    // A row for someone else is never sent to, even if a read returned it.
    calls.rows = [sub('s1'), sub('s2'), sub('x', 'user-2')];
    sendWebPush.mockResolvedValueOnce({ delivered: true }).mockResolvedValueOnce({ delivered: false, shouldDeleteSubscription: true });
    const res = await POST();
    expect(calls.eq[0]).toEqual(['user_id', 'user-1']);
    expect(sendWebPush).toHaveBeenCalledTimes(2);
    expect(sendWebPush.mock.calls.map((c) => (c[0] as { id: string }).id)).toEqual(['s1', 's2']);
    expect(sendWebPush.mock.calls[0]![1]).toMatchObject({ title: 'Test from Clubhouse', body: 'Push works on this device.' });
    expect(calls.deleted).toEqual(['s2']);
    expect(await res.json()).toEqual({ sent: 1, failed: 1 });
    expect(checkRateLimit).toHaveBeenCalledWith('push-test:user:user-1', expect.anything());
  });

  it('another user’s subscription is never sent to or deleted, even when a read returns it', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    calls.rows = [sub('mine'), sub('theirs', 'user-2')];
    // Every send reports a dead subscription: only the caller's own can be removed.
    sendWebPush.mockResolvedValue({ delivered: false, shouldDeleteSubscription: true });
    await POST();
    expect(sendWebPush.mock.calls.map((c) => (c[0] as { id: string }).id)).toEqual(['mine']);
    expect(calls.deleted).toEqual(['mine']);
    expect(calls.deleted).not.toContain('theirs');
    // The delete itself is scoped to the caller as well as to the ids.
    expect(calls.eq).toContainEqual(['user_id', 'user-1']);
    expect(calls.eq.some(([, v]) => v === 'user-2')).toBe(false);
  });

  it('says so when no device has push on, and when the limit is reached', async () => {
    getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    expect((await POST()).status).toBe(404);
    checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: 0 });
    expect((await POST()).status).toBe(429);
    expect(sendWebPush).not.toHaveBeenCalled();
  });
});
