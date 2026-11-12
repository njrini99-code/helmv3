import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const state = vi.hoisted(() => ({
  on: true,
  role: 'player' as 'coach' | 'player' | null,
  player: { id: 'p1' } as { id: string } | null,
  membership: { data: { team_id: 'team-1' } as { team_id: string } | null, error: null as null | { message: string } },
  upsert: { error: null as null | { code: string; message: string } },
  tour: { data: { team_id: 'team-1' } as { team_id: string } | null, error: null as null | { code: string; message: string } },
  calls: [] as string[],
}));
vi.mock('@/lib/flags', () => ({ isFlagEnabled: () => state.on }));
vi.mock('@/lib/auth/get-golf-dashboard-role', () => ({ getGolfDashboardRole: async () => state.role }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => (state.player ? { player: state.player } : { player: null }) }));
vi.mock('@/lib/golf/dashboard-request-cache', () => ({ getActivePlayerTeamMembership: async () => state.membership }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (t: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => state.tour }) }),
      upsert: async (row: unknown, opts: unknown) => {
        state.calls.push(`${t} ${JSON.stringify(row)} ${JSON.stringify(opts)}`);
        return state.upsert;
      },
    }),
  }),
}));

import { saveTournamentReflection } from '../tournaments-player';

const ID = '00000000-0000-0000-0000-000000000001';

beforeEach(() => {
  state.on = true;
  state.role = 'player';
  state.player = { id: 'p1' };
  state.membership = { data: { team_id: 'team-1' }, error: null };
  state.upsert = { error: null };
  state.tour = { data: { team_id: 'team-1' }, error: null };
  state.calls = [];
});

describe('saveTournamentReflection', () => {
  it('writes the player’s own row for the event on their team, one per player and event', async () => {
    const res = await saveTournamentReflection(ID, '  Putting held up.  ');
    expect(res).toMatchObject({ success: true });
    expect(state.calls).toHaveLength(1);
    expect(state.calls[0]).toContain('golf_tournament_reflections');
    expect(state.calls[0]).toContain('"player_id":"p1"');
    expect(state.calls[0]).toContain('"team_id":"team-1"');
    expect(state.calls[0]).toContain('"body":"Putting held up."');
    expect(state.calls[0]).toContain('"onConflict":"tournament_id,player_id"');
  });

  it('refuses before any write: flag off, a coach, no session, no team, bad input', async () => {
    state.on = false;
    await expect(saveTournamentReflection(ID, 'x')).resolves.toMatchObject({ success: false, code: 'off' });
    state.on = true;
    state.role = 'coach';
    await expect(saveTournamentReflection(ID, 'x')).resolves.toMatchObject({ success: false, code: 'off' });
    state.role = 'player';
    state.player = null;
    await expect(saveTournamentReflection(ID, 'x')).resolves.toMatchObject({ success: false, code: 'not_signed_in' });
    state.player = { id: 'p1' };
    state.membership = { data: null, error: null };
    await expect(saveTournamentReflection(ID, 'x')).resolves.toMatchObject({ success: false, code: 'not_found' });
    state.membership = { data: { team_id: 'team-1' }, error: null };
    await expect(saveTournamentReflection('not-an-id', 'x')).resolves.toMatchObject({ success: false, code: 'invalid' });
    await expect(saveTournamentReflection(ID, '   ')).resolves.toMatchObject({ success: false, code: 'invalid' });
    await expect(saveTournamentReflection(ID, 'x'.repeat(4001))).resolves.toMatchObject({ success: false, code: 'invalid' });
    expect(state.calls).toEqual([]);
  });

  it('refuses a tournament that is not on the player’s own team, or that is gone, and writes nothing', async () => {
    state.tour = { data: { team_id: 'team-2' }, error: null };
    await expect(saveTournamentReflection(ID, 'x')).resolves.toMatchObject({ success: false, code: 'not_found' });
    state.tour = { data: null, error: null };
    await expect(saveTournamentReflection(ID, 'x')).resolves.toMatchObject({ success: false, code: 'not_found' });
    state.tour = { data: null, error: { code: 'XX000', message: 'boom' } };
    await expect(saveTournamentReflection(ID, 'x')).resolves.toMatchObject({ success: false, code: 'failed' });
    expect(state.calls).toEqual([]);
  });

  it('a policy refusal comes back as a code with its words, not a thrown error', async () => {
    state.upsert = { error: { code: '42501', message: 'new row violates row-level security policy' } };
    await expect(saveTournamentReflection(ID, 'x')).resolves.toMatchObject({ success: false, code: 'not_coach', error: expect.any(String) });
  });

  it('the schema being absent is not_set_up, and any other failure is the generic one', async () => {
    state.upsert = { error: { code: '42P01', message: 'relation does not exist' } };
    await expect(saveTournamentReflection(ID, 'x')).resolves.toMatchObject({ success: false, code: 'not_set_up' });
    state.upsert = { error: { code: 'XX000', message: 'boom' } };
    await expect(saveTournamentReflection(ID, 'x')).resolves.toMatchObject({ success: false, code: 'failed' });
  });
});
