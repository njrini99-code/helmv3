/**
 * Regression for #1571: `verifyPlayerAccess`'s coach branch never assigned
 * `coachId`, so F061 ("honor the coach's saved Insight Detail Level") never
 * fired for a real coach — `analyzePlayer` always passed `verbosity:
 * undefined` into the engine regardless of the coach's saved setting.
 *
 * This test exercises the actual wiring from `access.coachId` (now resolved
 * by the shared `verifyPlayerAccess`) through this file's private
 * `getCoachPhilosophy` to the `verbosity` option `coachHelmIntelligence
 * .analyzePlayer` receives. Only the boundary dependencies are mocked; the
 * local coachId -> philosophy -> verbosity plumbing inside insights.ts is
 * real code.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: (_name: string, _opts: unknown, impl: unknown) => impl,
}));

vi.mock('@/lib/auth/action-rate-limit', () => ({
  gateCoachHelmEngineCall: vi.fn(async () => ({ allowed: true })),
  gateUserAction: vi.fn(async () => ({ allowed: true })),
}));

const analyzePlayerMock = vi.fn(
  async (_playerId?: string, _options?: unknown) => ({ playerId: 'player-1' }) as never,
);
vi.mock('@/lib/coachhelm/v2', () => ({
  coachHelmIntelligence: { analyzePlayer: analyzePlayerMock },
  isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: true })),
  isCoachHelmEnabledForPlayer: vi.fn(async () => ({ effectivelyEnabled: true })),
}));

interface MockAccessResult {
  allowed: boolean;
  reason: 'coach';
  coachId?: string;
}

// Mock the SHARED helper only -- this is the exact function #1571 fixed.
// Returning a coachId here simulates the FIXED behavior; the helper's own
// coachId-resolution logic is covered separately in
// src/test/lib/auth/verify-player-access.test.ts.
const sharedVerifyPlayerAccessMock = vi.fn(
  async (..._args: unknown[]): Promise<MockAccessResult> => ({
    allowed: true,
    reason: 'coach',
    coachId: 'coach-1',
  }),
);
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyPlayerAccess: (...args: unknown[]) => sharedVerifyPlayerAccessMock(...args),
  verifyRoundBelongsToPlayer: vi.fn(async () => ({ allowed: true })),
  verifyInsightAccess: vi.fn(async () => ({ allowed: true })),
  insightAccessDenialMessage: () => 'Not authorized',
}));

// `getCoachPhilosophy` (private to insights.ts) reads golf_coach_philosophy
// via createClient(); this is the coach's SAVED, non-default Insight Detail
// Level ('brief' -- the engine default is 'detailed', see PHILOSOPHY_DEFAULTS
// in insights.ts's getCoachPhilosophy).
function makeSupabase() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: 'user-1' } } }),
    },
    from: vi.fn((table: string) => {
      if (table === 'golf_coach_philosophy') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: 'phil-1', coach_id: 'coach-1', insight_verbosity: 'brief' },
                error: null,
              }),
            }),
          }),
        };
      }
      // insights.ts's local verifyPlayerAccess wrapper resolves a `teamId`
      // for the return shape; irrelevant to this test's assertion but must
      // not throw.
      if (table === 'golf_team_members') {
        return {
          select: () => ({
            eq: () => ({
              eq: async () => ({ data: [], error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table in test: ${table}`);
    }),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => makeSupabase()),
}));

describe('analyzePlayer verbosity wiring (F061, regression #1571)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    analyzePlayerMock.mockClear();
    sharedVerifyPlayerAccessMock.mockClear();
    sharedVerifyPlayerAccessMock.mockResolvedValue({
      allowed: true,
      reason: 'coach',
      coachId: 'coach-1',
    });
  });

  it('passes the coach\'s saved (non-default) insight verbosity into the engine', async () => {
    const { analyzePlayer } = await import('@/app/golf/actions/insights');

    const result = await analyzePlayer('player-1');

    expect(result.success).toBe(true);
    expect(analyzePlayerMock).toHaveBeenCalledTimes(1);
    const options = analyzePlayerMock.mock.calls[0]?.[1] as { verbosity?: string } | undefined;
    expect(options?.verbosity).toBe('brief');
  });

  it('revert-check: falls back to undefined verbosity when coachId is missing (the pre-fix bug)', async () => {
    sharedVerifyPlayerAccessMock.mockResolvedValue({
      allowed: true,
      reason: 'coach',
      coachId: undefined,
    });

    const { analyzePlayer } = await import('@/app/golf/actions/insights');
    await analyzePlayer('player-1');

    const options = analyzePlayerMock.mock.calls[0]?.[1] as { verbosity?: string } | undefined;
    expect(options?.verbosity).toBeUndefined();
  });
});
