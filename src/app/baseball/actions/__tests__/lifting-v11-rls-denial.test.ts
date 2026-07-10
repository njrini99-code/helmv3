// @vitest-environment node
// =============================================================================
// Regression test for the RLS-denial double-fire defect in logSetResult
// (src/app/baseball/actions/lifting-v11.ts).
//
// THE BUG: logSetResult captured the RLS denial explicitly at the swallow
// site (correct table `helm_lifting_set_results`) and then did `throw error`
// — rethrowing the RAW Postgrest-shaped error. Because logSetResult is itself
// wrapped in withBaseballAction, that raw error also propagated into the
// wrapper's own generic catch block (with-baseball-action.ts), which fires
// its own `maybeCaptureRlsDenial` fallback with `table: featureArea`
// ('baseball-lifting' — a feature-area slug, not a real table) since it still
// looked RLS-shaped (code 42501). A single denial thus produced TWO
// `RLS denial` admin_events: one correct, one bogus, polluting the per-table
// rls_denials feature-health rollup with a fake table name.
//
// THE FIX: rethrow a generic `BaseballActionError` (not the raw error) after
// the precise capture, matching watchlist.ts's addToWatchlist pattern — its
// message doesn't match `isRlsDenial`, so the wrapper's fallback no-ops.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({
    data: { user: { id: 'user-1', email: 'player@example.com' } },
  })),
  logServerEvent: vi.fn(async (..._args: unknown[]) => undefined),
  logServerException: vi.fn(async (..._args: unknown[]) => undefined),
  logServerError: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerEvent: mocks.logServerEvent,
  logServerException: mocks.logServerException,
  logServerError: mocks.logServerError,
}));

vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => ({
    userId: 'user-1',
    activeTeamId: 'team-1',
    activeRole: 'player' as const,
    activeCoachId: null,
    activePlayerId: 'player-1',
    fellBackFromStale: false,
  })),
}));

vi.mock('@/lib/demo/baseball-config.server', () => ({
  isCurrentSessionBaseballDemo: vi.fn(async () => false),
}));

// Bypass the player-access settings/capability resolution entirely (covered
// by player-access-action-gate.integration.test.ts) — this test is scoped to
// the RLS-denial capture wiring, not the access gate itself.
vi.mock('@/lib/baseball/player-access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/baseball/player-access')>();
  return {
    ...actual,
    requirePlayerAccess: vi.fn(async () => undefined),
  };
});

// Mutable per-test upsert error, referenced (not called) by the
// @/lib/supabase/server factory below — same pattern as
// player-access-action-gate.integration.test.ts's `toggleRow`/`staffCaps`.
let upsertError: { code?: string | null; message?: string | null } | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn((table: string) => {
      if (table === 'helm_lifting_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'session-1',
                  organization_id: 'org-1',
                  team_id: 'team-1',
                  athlete_id: 'athlete-1',
                },
              }),
            }),
          }),
        };
      }
      if (table === 'helm_lifting_set_results') {
        return {
          upsert: () => ({
            select: () => ({
              single: async () => ({ data: null, error: upsertError }),
            }),
          }),
        };
      }
      throw new Error(`lifting-v11-rls-denial.test.ts: unexpected table "${table}"`);
    }),
  })),
}));

import { logSetResult } from '@/app/baseball/actions/lifting-v11';
import { BaseballActionError } from '@/lib/baseball/with-baseball-action';

const BASE_INPUT = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  sessionExerciseId: '22222222-2222-4222-8222-222222222222',
  setNumber: 1,
  actualReps: 8,
  actualLoad: 135,
  loadUnit: 'lb',
  rpe: 7,
  velocity: null,
  playerNote: null,
};

describe('logSetResult RLS-denial capture (regression: no double-fire)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upsertError = { code: '42501', message: 'new row violates row-level security policy' };
  });

  it('rejects with a sanitized BaseballActionError, not the raw Postgrest error', async () => {
    await expect(logSetResult(BASE_INPUT)).rejects.toBeInstanceOf(BaseballActionError);
  });

  it('captures exactly ONE RLS denial event, with the precise table — not a second, bogus feature-area one from the wrapper fallback', async () => {
    await expect(logSetResult(BASE_INPUT)).rejects.toBeInstanceOf(BaseballActionError);

    const rlsEvents = mocks.logServerEvent.mock.calls.filter(
      (call): call is [string, ...unknown[]] =>
        typeof call[0] === 'string' && call[0].startsWith('RLS denial:'),
    );

    expect(rlsEvents).toHaveLength(1);
    expect(rlsEvents[0]?.[0]).toBe('RLS denial: insert on helm_lifting_set_results');

    // Pin the exact regression: the wrapper's generic catch-all fallback
    // (with-baseball-action.ts) would fire this bogus event — table set to
    // the feature-area slug, not a real table — if the raw error were
    // rethrown instead of a BaseballActionError.
    expect(
      rlsEvents.some((call) => call[0] === 'RLS denial: rpc on baseball-lifting'),
    ).toBe(false);
  });

  it('a non-RLS error still surfaces as a single unexpected-failure log (no RLS event, no regression to over-suppression)', async () => {
    upsertError = { code: '23505', message: 'duplicate key value violates unique constraint' };

    await expect(logSetResult(BASE_INPUT)).rejects.toBeInstanceOf(BaseballActionError);

    const rlsEvents = mocks.logServerEvent.mock.calls.filter(
      (call): call is [string, ...unknown[]] =>
        typeof call[0] === 'string' && call[0].startsWith('RLS denial:'),
    );
    expect(rlsEvents).toHaveLength(0);
    expect(mocks.logServerException).toHaveBeenCalledTimes(1);
  });
});
