// =============================================================================
// src/app/baseball/(dashboard)/dashboard/compare/__tests__/search-recruitability.test.ts
//
// P0 privacy/recruitability fix — Compare's "Add Players to Compare" search
// (and Watchlist's identical quick-add search, which now calls the same
// `searchRecruitablePlayers` action) previously ran a bare
// `.eq('recruiting_activated', true)` query with NO other exclusions.
// This locks in that the gated action excludes:
//   1. profile_visibility = 'private' players
//   2. player_type = 'college' players
//   3. players not on a discoverable HS/showcase/JUCO team
//   4. players on the coach's own roster
// while still surfacing an eligible player, mirroring the exact rule set
// `getDiscoverPlayers`/`assertCoachCanRecruitPlayer` already enforce
// elsewhere (discover-privacy.test.ts covers those call sites).
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const ELIGIBLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PRIVATE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROSTER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const COLLEGE_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function playerRow(id: string, playerType: string) {
  return {
    id,
    first_name: 'Test',
    last_name: 'Player',
    avatar_url: null,
    primary_position: null,
    grad_year: 2027,
    high_school_name: 'Test High',
    recruiting_activated: true,
    player_type: playerType,
  };
}

const playersRows = [
  playerRow(ELIGIBLE_ID, 'high_school'),
  playerRow(PRIVATE_ID, 'high_school'),
  playerRow(ROSTER_ID, 'high_school'),
  playerRow(COLLEGE_ID, 'college'),
];

/**
 * Behaviorally applies the filters `searchRecruitablePlayersImpl` chains
 * onto `baseball_players` — `.eq('recruiting_activated', true)`,
 * `.neq('player_type', 'college')`, and `.not('id', 'in', ...)` — so the
 * test verifies the actual filtered output, not just call args. `.select`,
 * `.or`, and `.in` (the JUCO player_type carve-out, unused by this
 * fixture's 'college' coach type) are no-op passthroughs.
 */
function makePlayersChain(rows: typeof playersRows) {
  const state: { neqPlayerType?: string; excludeIds?: string[]; limit?: number } = {};
  const chain: Record<string, unknown> = {};
  chain.select = vi.fn(() => chain);
  chain.or = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain); // recruiting_activated=true — every fixture row already satisfies this
  chain.in = vi.fn(() => chain);
  chain.neq = vi.fn((col: string, val: string) => {
    if (col === 'player_type') state.neqPlayerType = val;
    return chain;
  });
  chain.limit = vi.fn((n: number) => {
    state.limit = n;
    return chain;
  });
  chain.not = vi.fn((col: string, op: string, val: string) => {
    if (col === 'id' && op === 'in') {
      state.excludeIds = String(val).replace(/^\(|\)$/g, '').split(',').filter(Boolean);
    }
    return chain;
  });
  const resolve = () => {
    let result = rows;
    if (state.neqPlayerType !== undefined) {
      result = result.filter((r) => r.player_type !== state.neqPlayerType);
    }
    if (state.excludeIds) {
      const exc = state.excludeIds;
      result = result.filter((r) => !exc.includes(r.id));
    }
    if (state.limit !== undefined) result = result.slice(0, state.limit);
    return result;
  };
  // `queryBuilder` is awaited directly (no terminal `.range()`/`.single()`
  // call) — awaiting a plain non-thenable object resolves to itself, so
  // destructuring `{ data, error }` off it reads these getters.
  Object.defineProperty(chain, 'data', { get: () => resolve(), configurable: true });
  Object.defineProperty(chain, 'error', { get: () => null, configurable: true });
  return chain;
}

const from = vi.fn((_table: string) => ({}));

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

import { searchRecruitablePlayers } from '@/app/baseball/(dashboard)/dashboard/compare/actions';

describe('searchRecruitablePlayers — recruitability gating', () => {
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
          // Coach's own team.
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [{ team_id: 'team-own' }], error: null })),
            })),
          };
        case 'organizations':
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [{ id: 'org-disco' }], error: null })),
            })),
          };
        // See discover-privacy.test.ts: the cross-org browse reads the
        // anon-safe public-profile VIEW, not the tenant-scoped base table.
        case 'baseball_teams_public_profile':
          return {
            select: vi.fn(() => ({
              in: vi.fn(async () => ({ data: [{ id: 'team-disco' }], error: null })),
            })),
          };
        case 'baseball_team_members':
          return {
            select: vi.fn(() => ({
              // team_id is 'team-own' (coach roster) vs 'team-disco'
              // (discoverable team) — ROSTER_ID is deliberately on BOTH, so
              // the test proves the own-roster exclusion actually removes a
              // player that would otherwise be discoverable.
              in: vi.fn(async (_col: string, teamIds: readonly string[]) => {
                if (teamIds.includes('team-own')) {
                  return { data: [{ player_id: ROSTER_ID }], error: null };
                }
                if (teamIds.includes('team-disco')) {
                  return {
                    data: [
                      { player_id: ELIGIBLE_ID },
                      { player_id: PRIVATE_ID },
                      { player_id: ROSTER_ID },
                      { player_id: COLLEGE_ID },
                    ],
                    error: null,
                  };
                }
                return { data: [], error: null };
              }),
            })),
          };
        case 'baseball_player_settings':
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({ data: [{ player_id: PRIVATE_ID }], error: null })),
            })),
          };
        case 'baseball_players':
          return makePlayersChain(playersRows);
        default:
          return {};
      }
    });
  });

  it('excludes private, college, and own-roster players; keeps the eligible one', async () => {
    const results = await searchRecruitablePlayers('Test', []);
    const ids = results.map((p) => p.id);

    expect(ids).toContain(ELIGIBLE_ID);
    expect(ids).not.toContain(PRIVATE_ID);
    expect(ids).not.toContain(COLLEGE_ID);
    expect(ids).not.toContain(ROSTER_ID);
    expect(ids).toHaveLength(1);
  });

  it('also excludes ids passed in excludeIds (already-added players)', async () => {
    const results = await searchRecruitablePlayers('Test', [ELIGIBLE_ID]);
    expect(results.map((p) => p.id)).not.toContain(ELIGIBLE_ID);
  });
});
