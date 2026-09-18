/**
 * The Bridge must be able to say WHO an error happened to.
 *
 * Measured against production on 2026-09-08: 5,516 error rows in 30 days,
 * only 2,114 (38%) carried a `user_id`; `source='server_action'` was 4,924 of
 * those rows at 39%. `/admin/errors/[fingerprint]` renders the user as a link
 * whenever the column is set, so this was never a display gap — nothing was
 * putting a value in, because doing so depended on 583 `auth.getUser()` call
 * sites each remembering to pass one.
 *
 * These tests pin the structural fix: the id is ambient, and BOTH Bridge
 * tables read the same enriched value.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  scope: {
    setLevel: vi.fn(), setTag: vi.fn(), setUser: vi.fn(),
    setContext: vi.fn(), setFingerprint: vi.fn(),
  },
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: async () => ({ data: [], error: null }),
        upsert: (row: Record<string, unknown>) => {
          mocks.inserts.push({ table, row });
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  }),
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => void) => fn(mocks.scope),
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));

import { logServerError } from '@/lib/server-error-logger';
import {
  __runWithRequestContextForTests,
  setRequestUserId,
  getRequestUserId,
  isRequestUserIdUnverified,
} from '@/lib/admin/request-context';

const rowsFor = (table: string) => mocks.inserts.filter((i) => i.table === table);

describe('Bridge user attribution', () => {
  beforeEach(() => {
    mocks.inserts.length = 0;
    mocks.captureException.mockClear();
    for (const fn of Object.values(mocks.scope)) fn.mockClear();
    vi.stubEnv('ADMIN_EVENTS_FORCE_CAPTURE', '1');
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  it('attributes a server-action error to the ambient user with no call-site change', async () => {
    await __runWithRequestContextForTests({ requestId: 'r1', action: 'savePartialRound' }, async () => {
      setRequestUserId('user-abc');
      // Deliberately passes NO userId — this is the shape of ~583 call sites.
      await logServerError('Auto-save failed: user session expired mid-round', {
        action: 'savePartialRound',
        featureArea: 'shot_tracking',
        roundId: 'round-1',
      });
    });

    expect(rowsFor('admin_events')[0]!.row.user_id).toBe('user-abc');
    expect(rowsFor('error_logs')[0]!.row.user_id).toBe('user-abc');
  });

  it('writes the SAME user to both Bridge tables', async () => {
    await __runWithRequestContextForTests({ requestId: 'r2', action: 'a' }, async () => {
      setRequestUserId('user-both');
      await logServerError('boom', { action: 'a' });
    });

    // NOT a caught regression today, and the comment should say so: the two
    // writers read `context` and `enriched`, but the only caller already
    // passes an enriched context and enrichment is idempotent, so the values
    // agree. Both were pointed at `enriched` to remove that dependency on the
    // caller — this asserts the tables cannot drift apart if it is reintroduced.
    expect(rowsFor('error_logs')[0]!.row.user_id)
      .toBe(rowsFor('admin_events')[0]!.row.user_id);
    expect(rowsFor('error_logs')[0]!.row.user_id).toBe('user-both');
  });

  it('lets an explicit call-site userId win over the ambient one', async () => {
    await __runWithRequestContextForTests({ requestId: 'r3', action: 'a' }, async () => {
      setRequestUserId('ambient-user');
      await logServerError('boom', { action: 'a', userId: 'explicit-user' });
    });

    expect(rowsFor('admin_events')[0]!.row.user_id).toBe('explicit-user');
    expect(rowsFor('error_logs')[0]!.row.user_id).toBe('explicit-user');
  });

  it('flags an unverified subject rather than presenting it as confirmed', async () => {
    await __runWithRequestContextForTests({ requestId: 'r4', action: 'savePartialRound' }, async () => {
      // The "session expired mid-round" shape: GoTrue rejected the session, so
      // the only subject available is the unverified one from the cookie.
      setRequestUserId('expired-user', { unverified: true });
      await logServerError('Auto-save failed: user session expired mid-round', {
        action: 'savePartialRound',
      });
    });

    const row = rowsFor('admin_events')[0]!.row as { user_id: string; metadata: Record<string, unknown> };
    expect(row.user_id).toBe('expired-user');
    expect((row.metadata.tags as Record<string, unknown>).user_id_unverified).toBe('true');
  });

  it('is a no-op outside a request scope, so unwrapped runtimes behave as before', async () => {
    setRequestUserId('should-not-stick');
    expect(getRequestUserId()).toBeNull();

    await logServerError('cron boom', { action: 'cron.job', source: 'cron' });
    expect(rowsFor('admin_events')[0]!.row.user_id).toBeNull();
    expect(rowsFor('error_logs')[0]!.row.user_id).toBeNull();
  });

  it('never lets an unverified read downgrade a verified id', () => {
    __runWithRequestContextForTests({ requestId: 'r5', action: 'a' }, () => {
      setRequestUserId('verified-user');
      setRequestUserId('someone-else', { unverified: true });
      expect(getRequestUserId()).toBe('verified-user');
      expect(isRequestUserIdUnverified()).toBe(false);
    });
  });

  it('upgrades an unverified id once a verified one arrives', () => {
    __runWithRequestContextForTests({ requestId: 'r6', action: 'a' }, () => {
      setRequestUserId('guess', { unverified: true });
      setRequestUserId('real-user');
      expect(getRequestUserId()).toBe('real-user');
      expect(isRequestUserIdUnverified()).toBe(false);
    });
  });
});
