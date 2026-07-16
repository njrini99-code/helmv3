// =============================================================================
// src/app/baseball/actions/__tests__/player-peek-engagement-events.test.ts
//
// P1 (Production-Readiness Mission W0a) — `is_anonymous` dead column.
//
// baseball_player_engagement_events has no `is_anonymous` column — the
// profile_view engagement-event insert here sent it and silently
// 42703-failed forever (unchecked). This locks in:
//   1. The insert no longer sends `is_anonymous`.
//   2. A failed insert is now logged via logServerError instead of swallowed.
//
// The fixture player has recruiting_activated: true (P0 privacy gate —
// player-peek.ts now runs through withBaseballAction and denies a peek
// unless the player is on the viewer's own roster OR recruiting_activated +
// not private; see player-peek-privacy.test.ts for the authorization matrix
// itself). Sentry/demo-config are mocked inert so this file continues to
// test ONLY the engagement-event insert, not the wrapper's guard mechanics.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/notifications', () => ({
  notifyProfileView: vi.fn(async () => {}),
}));

const logServerError = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
}));
vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));
vi.mock('@/lib/demo/baseball-config.server', () => ({
  isCurrentSessionBaseballDemo: vi.fn(async () => false),
  isBaseballDemoCoachEmail: vi.fn(() => false),
}));

const PLAYER_ID = 'player-1';
const insertCalls: unknown[] = [];
let engagementInsertError: { message: string } | null = null;

function chainTable(table: string) {
  if (table === 'baseball_players') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: {
              id: PLAYER_ID,
              first_name: 'Pat',
              last_name: 'Player',
              avatar_url: null,
              primary_position: null,
              secondary_position: null,
              grad_year: 2027,
              high_school_name: null,
              city: null,
              state: null,
              height_feet: null,
              height_inches: null,
              weight_lbs: null,
              bats: null,
              throws: null,
              gpa: null,
              player_type: 'high_school',
              has_video: false,
              pitch_velo: null,
              exit_velo: null,
              sixty_time: null,
              pop_time: null,
              recruiting_activated: true,
              updated_at: null,
              user_id: null,
            },
            error: null,
          })),
        })),
      })),
    };
  }
  if (table === 'baseball_coaches') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: 'coach-1', full_name: 'Coach A', organization_id: null },
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
    };
  }
  if (table === 'baseball_player_engagement_events') {
    return {
      insert: vi.fn((payload: unknown) => {
        insertCalls.push(payload);
        return Promise.resolve({ error: engagementInsertError });
      }),
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
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => chainTable(table)),
  })),
}));

import { getPlayerPeekData } from '@/app/baseball/actions/player-peek';

describe('player-peek.ts engagement-event insert', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertCalls.length = 0;
    engagementInsertError = null;
  });

  it('records a profile_view engagement event WITHOUT is_anonymous', async () => {
    const res = await getPlayerPeekData(PLAYER_ID);

    expect(res.success).toBe(true);
    expect(insertCalls).toHaveLength(1);
    const payload = insertCalls[0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('is_anonymous');
    expect(payload).toMatchObject({
      player_id: PLAYER_ID,
      coach_id: 'coach-1',
      engagement_type: 'profile_view',
    });
  });

  it('logs (does not silently swallow) a failed engagement-event insert', async () => {
    engagementInsertError = { message: 'column "is_anonymous" of relation "baseball_player_engagement_events" does not exist' };

    const res = await getPlayerPeekData(PLAYER_ID);

    expect(res.success).toBe(true);
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('Failed to record profile_view engagement event'),
      expect.objectContaining({ action: 'player_peek.getPlayerPeekData.engagementEvent' }),
    );
  });
});
