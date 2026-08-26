/**
 * Coverage for the withGolfAction retrofit on removePlayerFromTeam.
 *
 * withGolfAction is nested INSIDE the existing withAdminObserved wrapper
 * (see the comment on golfActionRemovePlayerFromTeam in ../roster.ts):
 * withAdminObserved still owns the demoSafe gate + request-context scope,
 * and withGolfAction now owns the classify -> RLS-denial-capture -> log
 * sequence plus a toErrorResult safety net for a genuinely unexpected throw.
 * These tests pin the two things that nesting must NOT change: the normal
 * success/known-failure return shapes, and — the new behavior being
 * retrofitted in — that an uncaught exception is now returned as a clean
 * RosterActionResult instead of propagating as a raw rejection.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1'),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

import { removePlayerFromTeam } from '../roster';

function baseFake(): FakeSupabase {
  return createFakeSupabase({
    user: { id: 'coach-user' },
    tables: {
      golf_coaches: [{ id: 'coach-1', user_id: 'coach-user', organization_id: 'org-1' }],
      golf_team_members: [{ id: 'membership-1', team_id: 'team-1', player_id: 'player-1' }],
      golf_players: [{ id: 'player-1', first_name: 'Player', last_name: 'One' }],
      golf_teams: [{ id: 'team-1', name: 'Team One' }],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fake = baseFake();
});

describe('removePlayerFromTeam — withGolfAction nesting', () => {
  it('still returns { success: true } on a normal removal (unaffected by the new wrapper)', async () => {
    const result = await removePlayerFromTeam('player-1');
    expect(result).toEqual({ success: true });
  });

  it('still returns the known-failure envelope unchanged for a player not on the team', async () => {
    const result = await removePlayerFromTeam('someone-else');
    expect(result).toEqual({ success: false, error: 'Player is not on your team' });
  });

  it('converts a genuinely unexpected thrown exception into a clean RosterActionResult instead of an unhandled rejection', async () => {
    const originalFrom = fake.from.bind(fake);
    (fake as unknown as { from: (table: string) => ReturnType<FakeSupabase['from']> }).from = (
      table,
    ) => {
      if (table === 'golf_team_members') {
        throw new Error('unexpected: connection reset');
      }
      return originalFrom(table);
    };

    await expect(removePlayerFromTeam('player-1')).resolves.toEqual({
      success: false,
      error: 'Something went wrong. Please try again.',
      code: undefined,
    });
  });
});
