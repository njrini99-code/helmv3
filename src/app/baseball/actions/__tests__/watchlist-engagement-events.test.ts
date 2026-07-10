// =============================================================================
// src/app/baseball/actions/__tests__/watchlist-engagement-events.test.ts
//
// P1 (Production-Readiness Mission W0a) — `is_anonymous` dead column.
//
// baseball_player_engagement_events has no `is_anonymous` column (see
// database.ts) — every insert here that sent it was silently 42703-failing
// forever, and the failure was never checked, so engagement events (watchlist
// add/remove) were never actually recorded. This locks in:
//   1. The inserts no longer send `is_anonymous`.
//   2. A failed engagement-event insert is now logged via logServerError
//      instead of silently swallowed.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (ctx: unknown, ...a: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn({ activeCoachId: 'coach-1' }, ...args),
  BaseballUnauthorizedError: class BaseballUnauthorizedError extends Error {},
  BaseballNoActiveTeamError: class BaseballNoActiveTeamError extends Error {},
  BaseballActionError: class BaseballActionError extends Error {},
}));

vi.mock('@/lib/baseball/recruitability', () => ({
  assertCoachCanRecruitPlayer: vi.fn(async () => ({ allowed: true })),
}));

vi.mock('@/lib/notifications', () => ({
  notifyWatchlistAdd: vi.fn(async () => {}),
  notifyPipelineStageChange: vi.fn(async () => {}),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const logServerError = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
}));

vi.mock('@/lib/auth/ownership', () => ({
  verifyWatchlistOwnership: vi.fn(async () => true),
}));

const PLAYER_ID = 'player-1';
const insertCalls: Record<string, unknown[]> = {
  baseball_watchlists: [],
  baseball_player_engagement_events: [],
};
let engagementInsertError: { message: string } | null = null;

function chainTable(table: string) {
  if (table === 'baseball_coaches') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: 'coach-1', coach_type: 'college', organization_id: null, full_name: 'Coach A' },
            error: null,
          })),
        })),
      })),
    };
  }
  if (table === 'baseball_watchlists') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(async () => ({ error: null })),
        })),
      })),
      insert: vi.fn((payload: unknown) => {
        insertCalls.baseball_watchlists!.push(payload);
        return Promise.resolve({ error: null });
      }),
    };
  }
  if (table === 'baseball_player_engagement_events') {
    return {
      insert: vi.fn((payload: unknown) => {
        insertCalls.baseball_player_engagement_events!.push(payload);
        return Promise.resolve({ error: engagementInsertError });
      }),
    };
  }
  if (table === 'baseball_players' || table === 'users' || table === 'organizations') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    };
  }
  return {
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        single: vi.fn(async () => ({ data: null, error: null })),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      })),
    })),
  };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn((table: string) => chainTable(table)),
  })),
}));

import { addToWatchlist, toggleWatchlistPlayer } from '@/app/baseball/actions/watchlist';

describe('watchlist.ts engagement-event inserts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertCalls.baseball_watchlists = [];
    insertCalls.baseball_player_engagement_events = [];
    engagementInsertError = null;
  });

  it('addToWatchlist records a watchlist_add engagement event WITHOUT is_anonymous', async () => {
    const res = await addToWatchlist('coach-1', PLAYER_ID);

    expect(res.success).toBe(true);
    expect(insertCalls.baseball_player_engagement_events).toHaveLength(1);
    const payload = insertCalls.baseball_player_engagement_events![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('is_anonymous');
    expect(payload).toMatchObject({
      player_id: PLAYER_ID,
      coach_id: 'coach-1',
      engagement_type: 'watchlist_add',
    });
  });

  it('addToWatchlist logs (does not silently swallow) a failed engagement-event insert', async () => {
    engagementInsertError = { message: 'column "is_anonymous" of relation "baseball_player_engagement_events" does not exist' };

    const res = await addToWatchlist('coach-1', PLAYER_ID);

    // The watchlist add itself still succeeds — engagement telemetry is
    // fire-and-forget — but the failure must be observable now.
    expect(res.success).toBe(true);
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to record watchlist_add engagement event'),
      expect.objectContaining({ action: 'watchlist.addToWatchlist.engagementEvent' }),
    );
  });

  it('toggleWatchlistPlayer (add path) records engagement event WITHOUT is_anonymous', async () => {
    const res = await toggleWatchlistPlayer(PLAYER_ID);

    expect(res.success).toBe(true);
    expect(res.action).toBe('added');
    const payload = insertCalls.baseball_player_engagement_events![0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('is_anonymous');
    expect(payload).toMatchObject({ engagement_type: 'watchlist_add' });
  });
});
