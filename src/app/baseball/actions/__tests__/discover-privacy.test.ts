// =============================================================================
// src/app/baseball/actions/__tests__/discover-privacy.test.ts
//
// P0 PRIVACY (Production-Readiness Mission W0a) — getDiscoverPlayers and
// getStateCounts must exclude players whose baseball_player_settings.
// profile_visibility is 'private', mirroring the exact semantics
// assertCoachCanRecruitPlayer() uses in recruitability.ts: only an explicit
// 'private' row denies; a missing settings row (or any other value) defaults
// to visible/public.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const PLAYER_PUBLIC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAYER_PRIVATE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PLAYER_NO_SETTINGS = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const playersRows = [
  {
    id: PLAYER_PUBLIC,
    first_name: 'Pub',
    last_name: 'Lic',
    avatar_url: null,
    city: null,
    state: 'NC',
    primary_position: null,
    secondary_position: null,
    grad_year: 2027,
    pitch_velo: 85,
    exit_velo: null,
    sixty_time: null,
    bats: null,
    throws: null,
    height_feet: null,
    height_inches: null,
    weight_lbs: null,
    gpa: null,
    high_school_name: null,
    has_video: false,
    recruiting_activated: true,
    updated_at: '2026-01-01',
    player_type: 'high_school',
  },
  {
    id: PLAYER_PRIVATE,
    first_name: 'Priv',
    last_name: 'Ate',
    avatar_url: null,
    city: null,
    state: 'NC',
    primary_position: null,
    secondary_position: null,
    grad_year: 2027,
    pitch_velo: 90,
    exit_velo: null,
    sixty_time: null,
    bats: null,
    throws: null,
    height_feet: null,
    height_inches: null,
    weight_lbs: null,
    gpa: null,
    high_school_name: null,
    has_video: false,
    recruiting_activated: true,
    updated_at: '2026-01-01',
    player_type: 'high_school',
  },
  {
    id: PLAYER_NO_SETTINGS,
    first_name: 'Def',
    last_name: 'Ault',
    avatar_url: null,
    city: null,
    state: 'NC',
    primary_position: null,
    secondary_position: null,
    grad_year: 2027,
    pitch_velo: 80,
    exit_velo: null,
    sixty_time: null,
    bats: null,
    throws: null,
    height_feet: null,
    height_inches: null,
    weight_lbs: null,
    gpa: null,
    high_school_name: null,
    has_video: false,
    recruiting_activated: true,
    updated_at: '2026-01-01',
    player_type: 'high_school',
  },
];

/**
 * A chain mock that behaviorally applies `.in('id', ids)` (allow-list) and
 * `.not('id', 'in', '(...)')` (deny-list) so tests verify the ACTUAL filtered
 * output, not just that a method was called with the right args.
 */
function makeAwaitableFilterChain(rows: typeof playersRows) {
  const state: { includeIds: string[] | null; excludeIds: string[] | null } = {
    includeIds: null,
    excludeIds: null,
  };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'or', 'order']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.in = vi.fn((col: string, ids: readonly string[]) => {
    if (col === 'id') state.includeIds = [...ids];
    return chain;
  });
  chain.not = vi.fn((col: string, op: string, val: string) => {
    if (col === 'id' && op === 'in') {
      state.excludeIds = String(val).replace(/^\(|\)$/g, '').split(',').filter(Boolean);
    }
    return chain;
  });
  const applyFilter = () => {
    let result = rows;
    if (state.includeIds) {
      const inc = state.includeIds;
      result = result.filter((r) => inc.includes(r.id));
    }
    if (state.excludeIds) {
      const exc = state.excludeIds;
      result = result.filter((r) => !exc.includes(r.id));
    }
    return result;
  };
  chain.range = vi.fn((from: number, to: number) => {
    const filtered = applyFilter();
    return { data: filtered.slice(from, to + 1), count: filtered.length, error: null };
  });
  Object.defineProperty(chain, 'data', { get: () => applyFilter(), configurable: true });
  Object.defineProperty(chain, 'error', { get: () => null, configurable: true });
  return chain;
}

// Coach has no team of their own in this fixture — short-circuits
// getCoachRosterPlayerIds before it ever queries baseball_team_members, so
// that table's mock is unambiguous (it's otherwise reused below for the
// discoverable-team members lookup). Real behavior wired in beforeEach.
const from = vi.fn((_table: string) => makeAwaitableFilterChain([]));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from,
  })),
}));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));
// #394: discover.ts's 4 exports now run through the real withBaseballAction
// wrapper (previously withAdminObserved, which needed neither of these). Both
// mocks below make the Sentry scope / demo-guard steps of the wrapper inert
// no-ops so this file continues to test ONLY the P0 privacy filtering, not
// the guard mechanics — requireActiveContext:false on all 4 actions means
// '@/lib/baseball/active-context' is never called, so it needs no mock here.
vi.mock('@sentry/nextjs', () => ({
  withScope: (fn: (scope: unknown) => unknown) =>
    fn({ setTag: vi.fn(), setUser: vi.fn(), addBreadcrumb: vi.fn() }),
}));
vi.mock('@/lib/demo/baseball-config.server', () => ({
  isCurrentSessionBaseballDemo: vi.fn(async () => false),
  isBaseballDemoCoachEmail: vi.fn(() => false),
}));

import { getDiscoverPlayers, getStateCounts } from '@/app/baseball/actions/discover';

describe('Discover P0 privacy — profile_visibility filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    from.mockImplementation((table: string) => {
      switch (table) {
        case 'baseball_coaches':
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: { id: 'coach-1', coach_type: 'college' },
                  error: null,
                })),
              })),
            })),
          };
        case 'baseball_team_coach_staff':
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [], error: null })),
            })),
          };
        case 'organizations':
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [{ id: 'org-1' }], error: null })),
            })),
          };
        // The cross-org team browse reads the anon-safe public-profile VIEW,
        // not the base table — the base table's SELECT policy is tenant-scoped
        // by 20260729000200 and would return only the coach's own teams.
        case 'baseball_teams_public_profile':
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [{ id: 'team-1' }], error: null })),
            })),
          };
        case 'baseball_team_members':
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({
                data: [
                  { player_id: PLAYER_PUBLIC },
                  { player_id: PLAYER_PRIVATE },
                  { player_id: PLAYER_NO_SETTINGS },
                ],
                error: null,
              })),
            })),
          };
        case 'baseball_player_settings':
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [{ player_id: PLAYER_PRIVATE }], error: null })),
            })),
          };
        case 'baseball_players':
          return makeAwaitableFilterChain(playersRows);
        default:
          return makeAwaitableFilterChain([]);
      }
    });
  });

  it('getDiscoverPlayers excludes profile_visibility="private" players but keeps public + default (no settings row)', async () => {
    const result = await getDiscoverPlayers({});

    const ids = result.players.map((p) => p.id);
    expect(ids).not.toContain(PLAYER_PRIVATE);
    expect(ids).toContain(PLAYER_PUBLIC);
    expect(ids).toContain(PLAYER_NO_SETTINGS);
    expect(result.count).toBe(2);
  });

  it('getStateCounts("players") excludes private players from the map counts', async () => {
    const counts = await getStateCounts('players');

    // Only the 2 non-private players are in NC — the private player must not
    // contribute to the count.
    expect(counts.NC).toBe(2);
  });
});
