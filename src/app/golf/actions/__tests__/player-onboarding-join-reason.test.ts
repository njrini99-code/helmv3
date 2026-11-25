/**
 * @vitest-environment node
 *
 * Finishing player onboarding when the team could not be joined: the profile is saved, and the server's own reason comes
 * back so the finish screen can say what to do (another team, a code that no longer matches). A second submit after a
 * lost response rewrites nothing and still lands on the team. Synthetic ids only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

type Row = Record<string, unknown>;
let fake: ReturnType<typeof createFakeSupabase>;
let tables: Record<string, Row[]>;
const invite = vi.hoisted(() => ({ impl: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => fake) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('@/app/golf/actions/teams', () => ({ processGolfTeamInvitation: invite.impl }));

import { completePlayerOnboarding } from '../onboarding';

const INPUT = { firstName: 'Ana', lastName: 'Ruiz', gradYear: 2027 };

beforeEach(() => {
  invite.impl.mockReset();
  tables = { golf_players: [{ id: 'player-1', user_id: 'user-1', first_name: '', last_name: '', onboarding_completed: false }], golf_coaches: [], users: [] };
  fake = createFakeSupabase({ user: { id: 'user-1', email: 'ana@school.test' }, tables });
});

describe('completePlayerOnboarding reports why a player is not on the team', () => {
  it('already on another team: saved, not joined, and the reason is the server’s', async () => {
    invite.impl.mockResolvedValue({ success: false, error: 'You are already on Men’s Golf. Golf players can only be on one team at a time.' });
    const r = await completePlayerOnboarding(INPUT, 'WOMENS99');
    expect(r).toMatchObject({ success: true, joinedTeam: false, joinError: expect.stringMatching(/already on Men’s Golf/) });
    expect(tables.golf_players?.[0]).toMatchObject({ first_name: 'Ana', onboarding_completed: true });
  });

  it('a lookup that throws still saves the profile, with a reason', async () => {
    invite.impl.mockRejectedValue(new Error('boom'));
    const r = await completePlayerOnboarding(INPUT, 'K7PQX4MN');
    expect(r).toMatchObject({ success: true, joinedTeam: false, joinError: expect.any(String) });
  });

  it('a join that works carries no reason', async () => {
    invite.impl.mockResolvedValue({ success: true });
    expect(await completePlayerOnboarding(INPUT, 'K7PQX4MN')).toMatchObject({ success: true, joinedTeam: true, joinError: null });
  });

  it('a second submit after a lost response writes one player row and still joins', async () => {
    invite.impl.mockResolvedValue({ success: true, alreadyMember: true });
    await completePlayerOnboarding(INPUT, 'K7PQX4MN');
    const r = await completePlayerOnboarding(INPUT, 'K7PQX4MN');
    expect(r).toMatchObject({ success: true, joinedTeam: true });
    expect(tables.golf_players?.length).toBe(1);
  });

  it('a missing name is refused with its own sentence', async () => {
    const r = await completePlayerOnboarding({ ...INPUT, firstName: '' }, 'K7PQX4MN');
    expect(r.success).toBe(false);
    expect(invite.impl).not.toHaveBeenCalled();
  });
});
