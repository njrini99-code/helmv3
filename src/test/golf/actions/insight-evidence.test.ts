/**
 * Server action tests — RP-1 (insight-evidence ownership gating).
 *
 * The four exported fetchers in `insight-evidence.ts` previously leaned
 * entirely on RLS, which is team-scoped on `golf_rounds` — so a same-team
 * peer could read another player's round summaries. Each entrypoint now calls
 * `verifyPlayerAccess` after the auth check and returns `Forbidden` on denial.
 *
 * The supabase client + verifyPlayerAccess are mocked at the module boundary
 * so tests never touch the live DB.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

// Default: grant access. Specific tests override to test denial.
type VerifyReason = 'self' | 'coach' | 'denied';
const verifyPlayerAccessMock = vi.fn(
  async (): Promise<{ allowed: boolean; reason?: VerifyReason }> => ({
    allowed: true,
    reason: 'self',
  }),
);
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) =>
    verifyPlayerAccessMock(...(args as Parameters<typeof verifyPlayerAccessMock>)),
}));

// ---------------------------------------------------------------------------
// Minimal fake supabase client.
//   - auth.getUser() returns a signed-in user by default.
//   - from('golf_rounds') returns a chainable, awaitable builder that resolves
//     to a configurable terminal response. We track whether any data query ran
//     so we can assert that a denied access never reaches the DB.
// ---------------------------------------------------------------------------
let dataQueryCount = 0;

function createFakeSupabase(opts: {
  user?: { id: string } | null;
  authError?: { message: string } | null;
  roundsResult?: { data?: unknown; error?: { message: string } | null };
} = {}) {
  const terminal = opts.roundsResult ?? { data: [], error: null };

  const makeBuilder = () => {
    dataQueryCount++;
    const builder: Record<string, unknown> = {};
    const passthrough = () => builder;
    for (const m of ['select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is', 'not', 'or', 'order']) {
      builder[m] = vi.fn(passthrough);
    }
    builder.limit = vi.fn(() => Promise.resolve(terminal));
    // Some chains await without .limit() (e.g. ordered range queries).
    (builder as { then?: unknown }).then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(terminal).then(resolve);
    builder.single = vi.fn(() => Promise.resolve(terminal));
    builder.maybeSingle = vi.fn(() => Promise.resolve(terminal));
    return builder;
  };

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: opts.user === undefined ? { id: 'user-1' } : opts.user },
        error: opts.authError ?? null,
      })),
    },
    from: vi.fn(() => makeBuilder()),
  };
  return client;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import {
  getInsightEvidenceSources,
  getTrendEvidenceRounds,
  getComparisonRounds,
  getPatternMatchingRounds,
} from '@/app/golf/actions/insight-evidence';

const createClientMock = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
  dataQueryCount = 0;
  verifyPlayerAccessMock.mockResolvedValue({ allowed: true, reason: 'self' });
});

describe('insight-evidence ownership gating (RP-1)', () => {
  describe('getInsightEvidenceSources', () => {
    it('returns Unauthorized when not signed in', async () => {
      createClientMock.mockResolvedValue(
        createFakeSupabase({ user: null }) as never,
      );
      const res = await getInsightEvidenceSources('player-2', {});
      expect(res).toEqual({ success: false, error: 'Unauthorized' });
      expect(verifyPlayerAccessMock).not.toHaveBeenCalled();
    });

    it('returns Forbidden and runs no data query when access is denied', async () => {
      createClientMock.mockResolvedValue(createFakeSupabase({}) as never);
      verifyPlayerAccessMock.mockResolvedValueOnce({ allowed: false, reason: 'denied' });

      const res = await getInsightEvidenceSources('peer-player', {});

      expect(res).toEqual({ success: false, error: 'Forbidden' });
      expect(verifyPlayerAccessMock).toHaveBeenCalledWith('peer-player', 'user-1', expect.anything());
      expect(dataQueryCount).toBe(0);
    });

    it('reads rounds when access is granted', async () => {
      createClientMock.mockResolvedValue(
        createFakeSupabase({ roundsResult: { data: [{ id: 'r-1' }], error: null } }) as never,
      );
      const res = await getInsightEvidenceSources('player-1', {});
      expect(res.success).toBe(true);
      expect(res.rounds).toEqual([{ id: 'r-1' }]);
      expect(dataQueryCount).toBe(1);
    });
  });

  describe('getTrendEvidenceRounds', () => {
    it('returns Forbidden and runs no data query when access is denied', async () => {
      createClientMock.mockResolvedValue(createFakeSupabase({}) as never);
      verifyPlayerAccessMock.mockResolvedValueOnce({ allowed: false, reason: 'denied' });

      const res = await getTrendEvidenceRounds('peer-player', '2026-01-01', '2026-02-01');

      expect(res).toEqual({ success: false, error: 'Forbidden' });
      expect(dataQueryCount).toBe(0);
    });

    it('reads rounds when access is granted', async () => {
      createClientMock.mockResolvedValue(
        createFakeSupabase({ roundsResult: { data: [{ id: 'r-1' }], error: null } }) as never,
      );
      const res = await getTrendEvidenceRounds('player-1', '2026-01-01', '2026-02-01');
      expect(res.success).toBe(true);
      expect(dataQueryCount).toBe(1);
    });
  });

  describe('getComparisonRounds', () => {
    it('returns Forbidden and runs no data query when access is denied', async () => {
      createClientMock.mockResolvedValue(createFakeSupabase({}) as never);
      verifyPlayerAccessMock.mockResolvedValueOnce({ allowed: false, reason: 'denied' });

      const res = await getComparisonRounds('peer-player');

      expect(res).toEqual({ success: false, error: 'Forbidden' });
      expect(dataQueryCount).toBe(0);
    });

    it('reads tournament + practice rounds when access is granted', async () => {
      createClientMock.mockResolvedValue(
        createFakeSupabase({ roundsResult: { data: [], error: null } }) as never,
      );
      const res = await getComparisonRounds('player-1');
      expect(res.success).toBe(true);
      // two separate fetches: tournament + practice
      expect(dataQueryCount).toBe(2);
    });
  });

  describe('getPatternMatchingRounds', () => {
    it('returns Forbidden and runs no data query when access is denied', async () => {
      createClientMock.mockResolvedValue(createFakeSupabase({}) as never);
      verifyPlayerAccessMock.mockResolvedValueOnce({ allowed: false, reason: 'denied' });

      const res = await getPatternMatchingRounds('peer-player', 'pattern-1');

      expect(res).toEqual({ success: false, error: 'Forbidden' });
      expect(dataQueryCount).toBe(0);
    });
  });
});
