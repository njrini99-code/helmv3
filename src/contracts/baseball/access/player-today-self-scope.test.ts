// =============================================================================
// src/contracts/baseball/access/player-today-self-scope.test.ts
//
// PRODUCT TRUTH THIS FILE PINS (#377 — Player Today is SELF-ONLY):
//   1. `getPlayerToday` never accepts a caller-supplied player id — it takes a
//      teamId only and resolves the CURRENT session's player. A user with no
//      `baseball_players` row, or a player row that is not a
//      `baseball_team_members` row on the REQUESTED team, gets
//      `authorized:false` and the fully-empty envelope — never a caller-forced
//      player id, never partial data.
//   2. `coachNotes` returns ONLY `scope:'player_visible'`, non-archived rows
//      for THIS player — a staff_only-scoped note, an archived note, and a
//      player_visible note belonging to a DIFFERENT player must never leak in.
//
// Source of truth: `resolvePlayer` (isMember gate) + the coachNotes query in
// src/lib/baseball/read-models/player-today.ts.
// =============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/lifting/resolve-baseball-context', () => ({
  resolveBaseballLiftingOrg: vi.fn(async () => null),
  resolveMyBaseballAthleteId: vi.fn(async () => null),
}));

import { getPlayerToday } from '@/lib/baseball/read-models/player-today';

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';
const USER_ID = 'user-1';
const PLAYER_ID = 'player-1';
const DAY = '2026-04-01';

type Row = Record<string, unknown>;

function tablesWith(extra: Record<string, Row[]> = {}): Record<string, Row[]> {
  return {
    baseball_teams: [
      { id: TEAM_A, timezone: 'UTC' },
      { id: TEAM_B, timezone: 'UTC' },
    ],
    baseball_events: [],
    baseball_player_stats: [],
    baseball_actions: [],
    baseball_task_assignments: [],
    baseball_coach_notes: [],
    baseball_practices: [],
    ...extra,
  };
}

beforeEach(() => {
  fake = createFakeSupabase({ user: { id: USER_ID }, tables: tablesWith() });
});

describe('getPlayerToday — self-only authorization envelope (#377)', () => {
  it('a user with NO baseball_players row gets authorized:false and the fully-empty envelope', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: tablesWith({ baseball_players: [], baseball_team_members: [] }),
    });

    const result = await getPlayerToday(TEAM_A, { forDate: DAY });
    expect(result.authorized).toBe(false);
    expect(result.playerId).toBeNull();
    expect(result.schedule).toEqual([]);
    expect(result.recentStats).toEqual([]);
    expect(result.assignments.items).toEqual([]);
    expect(result.coachActions.items).toEqual([]);
    expect(result.tasks.items).toEqual([]);
    expect(result.coachNotes.items).toEqual([]);
  });

  it('a real player row that is rostered on a DIFFERENT team gets authorized:false for the requested team', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: tablesWith({
        baseball_players: [{ id: PLAYER_ID, user_id: USER_ID }],
        // Membership on TEAM_B only — the request below asks for TEAM_A.
        baseball_team_members: [{ id: 'mem-1', team_id: TEAM_B, player_id: PLAYER_ID }],
      }),
    });

    const result = await getPlayerToday(TEAM_A, { forDate: DAY });
    expect(result.authorized).toBe(false);
    // resolvePlayer still resolves the real player id (for UI messaging), but
    // no data is attached to it — never a caller-suppliable player id used to
    // fetch someone else's data.
    expect(result.playerId).toBe(PLAYER_ID);
    expect(result.coachNotes.items).toEqual([]);
  });

  it('an authorized member of the requested team gets authorized:true', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: tablesWith({
        baseball_players: [{ id: PLAYER_ID, user_id: USER_ID }],
        baseball_team_members: [{ id: 'mem-1', team_id: TEAM_A, player_id: PLAYER_ID }],
      }),
    });

    const result = await getPlayerToday(TEAM_A, { forDate: DAY });
    expect(result.authorized).toBe(true);
    expect(result.playerId).toBe(PLAYER_ID);
  });
});

describe('getPlayerToday — coachNotes scope isolation (#377)', () => {
  function membershipTables(extraNotes: Row[]): Record<string, Row[]> {
    return tablesWith({
      baseball_players: [{ id: PLAYER_ID, user_id: USER_ID }],
      baseball_team_members: [{ id: 'mem-1', team_id: TEAM_A, player_id: PLAYER_ID }],
      baseball_coach_notes: extraNotes,
    });
  }

  it('a staff_only-scoped note for THIS player never leaks into the player-visible feed', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: membershipTables([
        {
          id: 'note-staff-only',
          player_id: PLAYER_ID,
          team_id: TEAM_A,
          scope: 'staff_only',
          archived_at: null,
          title: 'Staff eyes only',
          body: 'Never show this to the player.',
          pinned: false,
          created_at: '2026-03-01T00:00:00Z',
        },
      ]),
    });

    const result = await getPlayerToday(TEAM_A, { forDate: DAY });
    expect(result.coachNotes.items).toEqual([]);
  });

  it('an ARCHIVED player_visible note for THIS player is excluded', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: membershipTables([
        {
          id: 'note-archived',
          player_id: PLAYER_ID,
          team_id: TEAM_A,
          scope: 'player_visible',
          archived_at: '2026-03-15T00:00:00Z',
          title: 'Old note',
          body: 'This was archived.',
          pinned: false,
          created_at: '2026-03-01T00:00:00Z',
        },
      ]),
    });

    const result = await getPlayerToday(TEAM_A, { forDate: DAY });
    expect(result.coachNotes.items).toEqual([]);
  });

  it('a player_visible, non-archived note belonging to a DIFFERENT player never leaks in', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: membershipTables([
        {
          id: 'note-other-player',
          player_id: 'someone-else',
          team_id: TEAM_A,
          scope: 'player_visible',
          archived_at: null,
          title: "Not yours",
          body: "This belongs to a different player.",
          pinned: false,
          created_at: '2026-03-01T00:00:00Z',
        },
      ]),
    });

    const result = await getPlayerToday(TEAM_A, { forDate: DAY });
    expect(result.coachNotes.items).toEqual([]);
  });

  it('a player_visible, non-archived note for THIS player on THIS team DOES surface', async () => {
    fake = createFakeSupabase({
      user: { id: USER_ID },
      tables: membershipTables([
        {
          id: 'note-mine',
          player_id: PLAYER_ID,
          team_id: TEAM_A,
          scope: 'player_visible',
          archived_at: null,
          title: 'Good work',
          body: 'Keep it up.',
          pinned: true,
          created_at: '2026-03-01T00:00:00Z',
        },
      ]),
    });

    const result = await getPlayerToday(TEAM_A, { forDate: DAY });
    const ids = result.coachNotes.items.map((n) => n.id);
    expect(ids).toEqual(['note-mine']);
  });
});
