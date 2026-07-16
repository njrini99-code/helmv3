// =============================================================================
// src/app/baseball/actions/__tests__/player-peek-privacy.test.ts
//
// P0 PRIVACY — getPlayerPeekData selected full player PII (name, high school,
// city/state, height/weight, gpa, velocities) for ANY playerId with only an
// auth check: no capability gate, no recruiting_activated filter, no
// profile_visibility filter, and it never called assertCoachCanRecruitPlayer.
// The Discover privacy enforcement (discover.ts / player-visibility.ts) was
// never extended to this surface. This locks in the restored policy:
//
//   allowed  <=>  (a) player is on a roster the viewing coach staffs
//                     (own-roster peek — regardless of recruiting_activated /
//                     profile_visibility), OR
//                 (b) player.recruiting_activated === true AND
//                     baseball_player_settings.profile_visibility !== 'private'
//
// A viewer with no baseball_coaches row at all (player-role session) is
// denied outright, mirroring discover.ts's own "no coachProfile -> nothing"
// behavior.
//
// Style: leaves the real withBaseballAction wrapper in place (no passthrough
// mock) and mocks only the capability/session seam — same pattern as
// imports-capability-shape-gate.test.ts / discover-privacy.test.ts. Since
// getPlayerPeekData is wrapped with requireActiveContext: false (like
// discover.ts's own reads), '@/lib/baseball/active-context' is never called
// and needs no mock here.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/notifications', () => ({
  notifyProfileView: vi.fn(async () => {}),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
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

const COACH_ID = 'coach-1';
const TEAM_ID = 'team-1';

const PLAYER_ACTIVATED_PUBLIC = 'player-activated-public';
const PLAYER_NOT_ACTIVATED = 'player-not-activated';
const PLAYER_PRIVATE = 'player-private';
// Not recruiting_activated at all — only reachable via the own-roster bypass.
const PLAYER_OWN_ROSTER = 'player-own-roster';

const RECRUITING_ACTIVATED: Record<string, boolean> = {
  [PLAYER_ACTIVATED_PUBLIC]: true,
  [PLAYER_NOT_ACTIVATED]: false,
  [PLAYER_PRIVATE]: true,
  [PLAYER_OWN_ROSTER]: false,
};

const PRIVATE_PLAYER_IDS = new Set([PLAYER_PRIVATE]);
const ROSTER_PLAYER_IDS = new Set([PLAYER_OWN_ROSTER]);

let hasCoachProfile = true;
const insertCalls: unknown[] = [];

function fullPlayerRow(id: string) {
  if (!(id in RECRUITING_ACTIVATED)) return null;
  return {
    id,
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
    recruiting_activated: RECRUITING_ACTIVATED[id],
    updated_at: null,
  };
}

function chainTable(table: string) {
  switch (table) {
    case 'baseball_coaches':
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () =>
              hasCoachProfile
                ? { data: { id: COACH_ID, full_name: 'Coach A', organization_id: null }, error: null }
                : { data: null, error: { message: 'no rows' } },
            ),
          })),
        })),
      };
    case 'baseball_players':
      // Two call shapes hit this table: the main multi-column peek select,
      // and the notification block's `.select('user_id')`. Disambiguate on
      // the columns argument.
      return {
        select: vi.fn((cols: string) => ({
          eq: vi.fn((_col: string, id: string) => ({
            single: vi.fn(async () => {
              if (cols === 'user_id') {
                return id in RECRUITING_ACTIVATED
                  ? { data: { user_id: null }, error: null }
                  : { data: null, error: null };
              }
              const row = fullPlayerRow(id);
              return row ? { data: row, error: null } : { data: null, error: { message: 'not found' } };
            }),
          })),
        })),
      };
    case 'baseball_player_settings':
      return {
        select: vi.fn(() => ({
          eq: vi.fn((_col: string, id: string) => ({
            maybeSingle: vi.fn(async () => ({
              data: PRIVATE_PLAYER_IDS.has(id) ? { profile_visibility: 'private' } : null,
              error: null,
            })),
          })),
        })),
      };
    case 'baseball_team_coach_staff':
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async (_col: string, coachId: string) => ({
            data: coachId === COACH_ID ? [{ team_id: TEAM_ID }] : [],
            error: null,
          })),
        })),
      };
    case 'baseball_team_members':
      return {
        select: vi.fn(() => ({
          in: vi.fn(async (_col: string, teamIds: string[]) => ({
            data: teamIds.includes(TEAM_ID)
              ? [...ROSTER_PLAYER_IDS].map((player_id) => ({ player_id }))
              : [],
            error: null,
          })),
        })),
      };
    case 'baseball_watchlists':
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: null, error: null })),
            })),
          })),
        })),
      };
    case 'baseball_player_engagement_events':
      return {
        insert: vi.fn((payload: unknown) => {
          insertCalls.push(payload);
          return Promise.resolve({ error: null });
        }),
      };
    default:
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({ data: null, error: null })),
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      };
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: vi.fn((table: string) => chainTable(table)),
  })),
}));

import { getPlayerPeekData } from '@/app/baseball/actions/player-peek';

describe('player-peek.ts — P0 privacy authorization matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    insertCalls.length = 0;
    hasCoachProfile = true;
  });

  it('denies a non-activated player to an unrelated coach', async () => {
    const res = await getPlayerPeekData(PLAYER_NOT_ACTIVATED);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Player not found');
    expect(insertCalls).toHaveLength(0);
  });

  it('denies a private-visibility player to an unrelated coach, even though recruiting_activated=true', async () => {
    const res = await getPlayerPeekData(PLAYER_PRIVATE);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Player not found');
    expect(insertCalls).toHaveLength(0);
  });

  it('allows an activated + public player to any coach', async () => {
    const res = await getPlayerPeekData(PLAYER_ACTIVATED_PUBLIC);

    expect(res.success).toBe(true);
    expect(res.data?.id).toBe(PLAYER_ACTIVATED_PUBLIC);
    expect(insertCalls).toHaveLength(1);
  });

  it('allows an own-roster player to their own coach regardless of recruiting_activated', async () => {
    const res = await getPlayerPeekData(PLAYER_OWN_ROSTER);

    expect(res.success).toBe(true);
    expect(res.data?.id).toBe(PLAYER_OWN_ROSTER);
    expect(insertCalls).toHaveLength(1);
  });

  it('denies a player-role viewer (no baseball_coaches row) regardless of the target player', async () => {
    hasCoachProfile = false;

    const res = await getPlayerPeekData(PLAYER_ACTIVATED_PUBLIC);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Player not found');
    expect(insertCalls).toHaveLength(0);
  });
});
