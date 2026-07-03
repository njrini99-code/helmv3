import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Regression coverage for the '[crm-engagement] getCoachEngagement failed:
// [object Object]' prod incident (fingerprint 448a488b): a Supabase
// PostgrestError is a plain object, not an Error instance, so
// `error instanceof Error ? error.message : String(error)` collapsed the
// diagnostic to the literal string "[object Object]". Fixed via
// describeError() (src/lib/utils/describe-error.ts). These tests assert the
// serialized log message actually carries code/message/details/hint, and
// that a matview read failure — whether a resolved `{error}` or a thrown
// exception (e.g. createAdminClient() failing to construct) — always
// degrades to `{}` instead of throwing through to the page render.
// ---------------------------------------------------------------------------

// Regular (cookie-scoped) client — only used by requireAdmin() for the
// auth.getUser() + users.role check. Always resolves to an authenticated admin.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
    from: vi.fn((table: string) => {
      if (table !== 'users') throw new Error(`unexpected table in requireAdmin: ${table}`);
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn(() => chain);
      chain.eq = vi.fn(() => chain);
      chain.single = vi.fn(async () => ({ data: { role: 'admin' }, error: null }));
      return chain;
    }),
  })),
}));

// Service-role admin client — used to read the crm_coach_engagement matview.
// Configurable per-test via the module-level `adminQueryResult` /
// `adminClientThrows` below so each test can drive a different failure mode.
let adminQueryResult: { data: unknown; error: unknown } = { data: [], error: null };
let adminClientThrows: Error | null = null;

function createAdminChain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  for (const method of ['select', 'eq', 'order', 'limit', 'in']) {
    chain[method] = vi.fn(() => chain);
  }
  // Thenable so both `await ...in(ids)` (getCoachEngagement) and
  // `await query` after `.limit()`/`.eq()` (getEngagementLeaderboard) resolve.
  chain.then = (
    resolve: (v: { data: unknown; error: unknown }) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(adminQueryResult).then(resolve, reject);
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => {
    if (adminClientThrows) throw adminClientThrows;
    return { from: vi.fn(() => createAdminChain()) };
  }),
}));

const logServerError = vi.fn(
  async (_message: string, _context?: Record<string, unknown>) => undefined,
);
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: (message: string, context?: Record<string, unknown>) =>
    logServerError(message, context),
}));

import { getCoachEngagement, getEngagementLeaderboard } from '../crm-engagement';

describe('crm-engagement error serialization + graceful degradation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adminQueryResult = { data: [], error: null };
    adminClientThrows = null;
  });

  describe('getCoachEngagement', () => {
    it('returns {} immediately for an empty coachIds list without touching the admin client', async () => {
      const result = await getCoachEngagement([]);
      expect(result).toEqual({});
      expect(logServerError).not.toHaveBeenCalled();
    });

    it('serializes a PostgrestError (code/message/details/hint survive) instead of "[object Object]"', async () => {
      adminQueryResult = {
        data: null,
        error: {
          code: '42P01',
          message: 'relation "crm_coach_engagement" does not exist',
          details: 'matview missing',
          hint: 'run the refresh job',
        },
      };

      const result = await getCoachEngagement(['coach-1']);

      // Graceful empty map on read failure.
      expect(result).toEqual({});

      expect(logServerError).toHaveBeenCalledTimes(1);
      const [message, context] = logServerError.mock.calls[0]!;

      expect(message).not.toContain('[object Object]');
      expect(message).toContain('42P01');
      expect(message).toContain('relation "crm_coach_engagement" does not exist');
      expect(message).toContain('matview missing');
      expect(message).toContain('run the refresh job');

      expect(context).toMatchObject({
        action: 'crm_engagement.getCoachEngagement',
        errorCode: '42P01',
        errorHint: 'run the refresh job',
        errorDetails: 'matview missing',
      });
    });

    it('degrades to {} (never throws) when the admin client itself fails to construct', async () => {
      adminClientThrows = new Error('SUPABASE_SERVICE_ROLE_KEY is missing for admin client.');

      const result = await getCoachEngagement(['coach-1']);

      expect(result).toEqual({});
      expect(logServerError).toHaveBeenCalledTimes(1);
      const [message] = logServerError.mock.calls[0]!;
      expect(message).toContain('SUPABASE_SERVICE_ROLE_KEY is missing for admin client.');
    });

    it('returns the engagement map keyed by coach_id on a healthy read', async () => {
      adminQueryResult = {
        data: [
          {
            coach_id: 'coach-1',
            score: 82,
            temperature: 'hot',
            opens_90d: 5,
            clicks_90d: 2,
            last_event_at: '2026-07-01T00:00:00Z',
          },
        ],
        error: null,
      };

      const result = await getCoachEngagement(['coach-1']);

      expect(result).toEqual({
        'coach-1': {
          coach_id: 'coach-1',
          score: 82,
          temperature: 'hot',
          opens_90d: 5,
          clicks_90d: 2,
          last_event_at: '2026-07-01T00:00:00Z',
        },
      });
      expect(logServerError).not.toHaveBeenCalled();
    });
  });

  describe('getEngagementLeaderboard', () => {
    it('serializes a PostgrestError the same way and returns [] on failure', async () => {
      adminQueryResult = {
        data: null,
        error: {
          code: '57014',
          message: 'canceling statement due to statement timeout',
          details: null,
          hint: null,
        },
      };

      const result = await getEngagementLeaderboard({ limit: 10 });

      expect(result).toEqual([]);
      expect(logServerError).toHaveBeenCalledTimes(1);
      const [message, context] = logServerError.mock.calls[0]!;
      expect(message).not.toContain('[object Object]');
      expect(message).toContain('57014');
      expect(message).toContain('canceling statement due to statement timeout');
      expect(context).toMatchObject({
        action: 'crm_engagement.getEngagementLeaderboard',
        errorCode: '57014',
      });
    });
  });
});
