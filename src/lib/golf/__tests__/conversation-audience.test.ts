import { describe, it, expect, vi } from 'vitest';

/**
 * The shared createConversation ('use server', so an endpoint in its own
 * right) calls assertGolfConversationAudience for every golf conversation.
 * RLS lets a conversation's creator add any user id, so this is the check
 * that keeps an outsider out when the golf wrapper is bypassed.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => undefined) }));

const TABLES: Record<string, unknown> = {
  golf_teams: { id: 'team-1', organization_id: 'org-1' },
  golf_team_members: [{ player_id: 'p-1' }],
  golf_players: [{ user_id: 'player-user' }],
  golf_team_coach_staff: [{ coach_id: 'c-1' }],
  golf_coaches: [{ user_id: 'coach-user' }],
};

function chain(table: string) {
  const result = { data: TABLES[table], error: null };
  const c: Record<string, unknown> = {
    select: () => c,
    eq: () => c,
    in: () => c,
    maybeSingle: async () => result,
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return c;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (table: string) => chain(table) }),
}));

import { assertGolfConversationAudience } from '../conversation-audience';

describe('assertGolfConversationAudience', () => {
  it('admits a coach messaging their own player', async () => {
    await expect(assertGolfConversationAudience('coach-user', ['player-user'], 'team-1')).resolves.toBeUndefined();
  });

  it('refuses a recipient who is not on the team', async () => {
    await expect(assertGolfConversationAudience('coach-user', ['stranger'], 'team-1')).rejects.toThrow(
      'not on this team',
    );
  });

  it('refuses a caller who is not on the team', async () => {
    await expect(assertGolfConversationAudience('stranger', ['player-user'], 'team-1')).rejects.toThrow(
      'do not have access',
    );
  });
});
