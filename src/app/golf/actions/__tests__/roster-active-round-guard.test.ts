/**
 * The database deliberately refuses to remove a player whose unfinished
 * round would otherwise disappear from Continue Round.  That refusal is a
 * safety outcome, not an opaque server failure: the coach needs the exact
 * next step.
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
}));

import { removePlayerFromTeam } from '../roster';
import { logServerError } from '@/lib/server-error-logger';

beforeEach(() => {
  vi.clearAllMocks();
  fake = createFakeSupabase({
    user: { id: 'coach-user' },
    tables: {
      golf_coaches: [{ id: 'coach-1', user_id: 'coach-user', organization_id: 'org-1' }],
      golf_team_members: [{ id: 'membership-1', team_id: 'team-1', player_id: 'player-1' }],
      golf_players: [{ id: 'player-1', first_name: 'Player', last_name: 'One' }],
      golf_teams: [{ id: 'team-1', name: 'Team One' }],
    },
  });
});

describe('removePlayerFromTeam — active-round safety guard', () => {
  it('explains that an unfinished round must be completed or explicitly discarded', async () => {
    const originalFrom = fake.from.bind(fake);
    (fake as unknown as { from: (table: string) => ReturnType<FakeSupabase['from']> }).from = (table) => {
      const builder = originalFrom(table);
      if (table !== 'golf_team_members') return builder;

      return {
        ...builder,
        delete: () => ({
          eq: () => ({
            eq: () => Promise.resolve({
              data: null,
              error: {
                code: '55000',
                message: 'This player has a saved round. Have them finish or explicitly discard it before removing them from the team.',
              },
            }),
          }),
        }),
      } as unknown as typeof builder;
    };

    await expect(removePlayerFromTeam('player-1')).resolves.toEqual({
      success: false,
      error: 'This player has a saved in-progress round. Have them finish or discard it before removing them from the team.',
      code: 'active_round_in_progress',
    });
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('Roster removal protected an in-progress round'),
      expect.objectContaining({ action: 'roster.removePlayerFromTeam' }),
      'warning',
    );
  });
});
