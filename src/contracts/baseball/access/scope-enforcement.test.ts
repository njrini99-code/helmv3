// =============================================================================
// src/contracts/baseball/access/scope-enforcement.test.ts
//
// PRODUCT TRUTH THIS FILE PINS:
//   1. `getStatsCenter` is STAFF-ONLY: a caller who is not on
//      `baseball_team_coach_staff` for the requested team gets
//      `authorized: false` with NO rows — never a partial/leaked read.
//   2. Rows returned for an authorized caller are limited to
//      `baseball_team_members` of the REQUESTED team — a player rostered on a
//      different team never leaks into the result.
//   3. Player-self mutations (`src/app/baseball/actions/player-access.ts`)
//      write ONLY against the server-resolved `ctx.activePlayerId` — a
//      caller-supplied player id in the patch payload is never honored — and
//      the profile patch whitelist drops any field outside the editable set
//      (admin-only columns like `team_id`, `recruiting_activated`, `id`).
//
// Source of truth: `getStatsCenter` (`isTeamStaff` gate) in
// `src/lib/baseball/read-models/stats-center.ts`; `updateMyPlayerProfile` in
// `src/app/baseball/actions/player-access.ts`.
// =============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (ctx: unknown, ...a: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn({ activePlayerId: 'player-self', user: { id: 'user-1' } }, ...args),
  BaseballActionError: class BaseballActionError extends Error {},
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { getStatsCenter } from '@/lib/baseball/read-models/stats-center';
import { updateMyPlayerProfile } from '@/app/baseball/actions/player-access';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';
const SEASON = 2026;

beforeEach(() => {
  fake = createFakeSupabase({ user: { id: 'user-1' } });
});

describe('getStatsCenter — staff-only authorization envelope (#377)', () => {
  it('a coach with NO staff row on the requested team gets authorized:false and zero rows', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_coaches: [{ id: 'coach-1', user_id: 'user-1' }],
        // Staff on a DIFFERENT team, not the requested team_a.
        baseball_team_coach_staff: [{ id: 'staff-1', team_id: TEAM_B, coach_id: 'coach-1' }],
        baseball_team_members: [
          {
            team_id: TEAM_A,
            player_id: 'p1',
            jersey_number: 1,
            baseball_players: { id: 'p1', first_name: 'A', last_name: 'B', primary_position: 'SS' },
          },
        ],
      },
    });

    const result = await getStatsCenter(TEAM_A, { seasonYear: SEASON });
    expect(result.authorized).toBe(false);
    expect(result.rows).toEqual([]);
    expect(result.error).toBeNull();
  });

  it('an unauthenticated caller gets authorized:false and zero rows', async () => {
    fake = createFakeSupabase({ user: null, tables: {} });
    const result = await getStatsCenter(TEAM_A, { seasonYear: SEASON });
    expect(result.authorized).toBe(false);
    expect(result.rows).toEqual([]);
  });

  it("an authorized staff member sees ONLY the requested team's roster, never another team's players", async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_coaches: [{ id: 'coach-1', user_id: 'user-1' }],
        baseball_team_coach_staff: [{ id: 'staff-1', team_id: TEAM_A, coach_id: 'coach-1' }],
        baseball_team_members: [
          {
            team_id: TEAM_A,
            player_id: 'p-team-a',
            jersey_number: 1,
            baseball_players: { id: 'p-team-a', first_name: 'On', last_name: 'TeamA', primary_position: 'SS' },
          },
          {
            team_id: TEAM_B,
            player_id: 'p-team-b',
            jersey_number: 2,
            baseball_players: { id: 'p-team-b', first_name: 'On', last_name: 'TeamB', primary_position: 'CF' },
          },
        ],
        baseball_games: [],
        baseball_box_score_batting: [],
        baseball_box_score_pitching: [],
        baseball_player_season_stats: [],
      },
    });

    const result = await getStatsCenter(TEAM_A, { seasonYear: SEASON });
    expect(result.authorized).toBe(true);
    const playerIds = result.rows.map((r) => r.playerId);
    expect(playerIds).toEqual(['p-team-a']);
    expect(playerIds).not.toContain('p-team-b');
  });
});

describe('updateMyPlayerProfile — server-resolved identity + field whitelist (#377)', () => {
  it('writes ONLY against ctx.activePlayerId, ignoring any caller-supplied id in the payload', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: { baseball_players: [{ id: 'player-self', bio: 'old bio' }] },
    });

    // A plain Record (not an object literal) avoids TS's excess-property check
    // so this exercises the RUNTIME whitelist (zod strip + EDITABLE_PROFILE_FIELDS)
    // rather than only the compile-time type — a forged extra field is exactly
    // what a tampered client request would send.
    const forgedPatch: Record<string, unknown> = {
      bio: 'new bio',
      id: 'someone-elses-player-id',
    };
    await updateMyPlayerProfile(forgedPatch as Parameters<typeof updateMyPlayerProfile>[0]);

    const rows = (await fake.from('baseball_players').select('*')).data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('player-self');
    expect(rows[0]?.bio).toBe('new bio');
  });

  it('the editable-field whitelist drops admin-only columns from the patch', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_players: [
          { id: 'player-self', bio: 'old bio', team_id: 'team-a', recruiting_activated: false },
        ],
      },
    });

    const forgedPatch: Record<string, unknown> = {
      bio: 'updated',
      team_id: 'stolen-team-id',
      recruiting_activated: true,
    };
    await updateMyPlayerProfile(forgedPatch as Parameters<typeof updateMyPlayerProfile>[0]);

    const rows = (await fake.from('baseball_players').select('*')).data as Array<Record<string, unknown>>;
    // bio updates; the admin-only fields are untouched by the whitelist.
    expect(rows[0]?.bio).toBe('updated');
    expect(rows[0]?.team_id).toBe('team-a');
    expect(rows[0]?.recruiting_activated).toBe(false);
  });
});
