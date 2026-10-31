import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
const state = vi.hoisted(() => ({
  on: true,
  role: 'coach' as 'coach' | 'player' | null,
  rpc: { data: null as unknown, error: null as null | { code: string; message: string } },
  upsert: { error: null as null | { code: string; message: string } },
  lineup: [{ player_id: '00000000-0000-0000-0000-000000000002', role: 'lineup' }] as Array<{ player_id: string; role: string }>,
  calls: [] as string[],
}));
vi.mock('@/lib/flags', () => ({ isFlagEnabled: () => state.on }));
vi.mock('@/lib/auth/get-golf-dashboard-role', () => ({ getGolfDashboardRole: async () => state.role }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => ({ coach: { id: 'c1', organization_id: 'o1' } }) }));
vi.mock('@/lib/golf/dashboard-request-cache', () => ({ resolveCoachActiveTeamForRequest: async () => ({ status: 'ok', teamId: 'team-1' }) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    rpc: async (fn: string, args: unknown) => {
      state.calls.push(`${fn} ${JSON.stringify(args)}`);
      return state.rpc;
    },
    from: (t: string) => {
      const read: Record<string, unknown> = {
        select: () => read,
        eq: () => read,
        maybeSingle: async () => ({ data: { tournament_id: 't1' }, error: null }),
        then: (ok: (v: unknown) => void) => ok(t === 'golf_tournament_round_lineups' ? { data: [], error: null } : { data: state.lineup, error: null }),
      };
      return {
        ...read,
        upsert: async (row: unknown) => {
          state.calls.push(`${t} ${JSON.stringify(row)}`);
          return state.upsert;
        },
      };
    },
  }),
}));

import { createTournament, deleteTournament, enterTournamentScore, setTournamentRoundStatus, substituteTournamentPlayer, updateTournament } from '../tournaments';

const ID = '00000000-0000-0000-0000-000000000001';
const ID2 = '00000000-0000-0000-0000-000000000002';
const ID3 = '00000000-0000-0000-0000-000000000003';

beforeEach(() => {
  state.on = true;
  state.role = 'coach';
  state.rpc = { data: null, error: null };
  state.upsert = { error: null };
  state.calls = [];
  state.lineup = [{ player_id: ID2, role: 'lineup' }];
});

describe('tournament actions: the gate', () => {
  it('flag off: refused as off, before any read or write', async () => {
    state.on = false;
    await expect(deleteTournament(ID)).resolves.toMatchObject({ success: false, code: 'off' });
    expect(state.calls).toEqual([]);
  });

  it('a player is refused as not_coach', async () => {
    state.role = 'player';
    await expect(deleteTournament(ID)).resolves.toMatchObject({ success: false, code: 'not_coach' });
    expect(state.calls).toEqual([]);
  });
});

describe('tournament actions: typed refusals beside the copy', () => {
  it('an edit on an old version comes back as stale', async () => {
    state.rpc = { data: null, error: { code: 'P0001', message: 'stale' } };
    const r = await updateTournament(ID, { name: 'Oakmont' }, 2);
    expect(r).toMatchObject({ success: false, code: 'stale' });
    if (!r.success) expect(r.error).toMatch(/changed since you opened it/);
  });

  it('round order and a started round keep their codes', async () => {
    state.rpc = { data: null, error: { code: 'P0001', message: 'round_order' } };
    await expect(setTournamentRoundStatus(ID, 'live')).resolves.toMatchObject({ code: 'round_order' });
    state.rpc = { data: null, error: { code: 'P0001', message: 'round_started' } };
    await expect(substituteTournamentPlayer(ID, ID2, ID3)).resolves.toMatchObject({ code: 'round_started' });
  });

  it('the RPC not being there yet is not_set_up', async () => {
    state.rpc = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
    await expect(deleteTournament(ID)).resolves.toMatchObject({ success: false, code: 'not_set_up' });
    state.upsert = { error: { code: 'PGRST205', message: 'Could not find the table' } };
    await expect(enterTournamentScore(ID, ID2, { total: 72 })).resolves.toMatchObject({ code: 'not_set_up' });
  });

  it('bad input is invalid without a database call', async () => {
    await expect(updateTournament('not-an-id', {}, 1)).resolves.toMatchObject({ code: 'invalid' });
    await expect(enterTournamentScore(ID, ID2, { total: 12 })).resolves.toMatchObject({ code: 'invalid' });
    expect(state.calls).toEqual([]);
  });
});

describe('tournament actions: the payloads', () => {
  it('create sends the team, snake-case fields and one row per round', async () => {
    state.rpc = { data: ID, error: null };
    const r = await createTournament({ name: 'Oakmont Fall Classic', startDate: '2026-10-05', endDate: '2026-10-07', rounds: [{ date: '2026-10-05' }, { date: '2026-10-06', firstTeeAt: '2026-10-06T08:10:00-04:00' }] });
    expect(r).toEqual({ success: true, data: { id: ID } });
    const sent = JSON.parse(state.calls[0]!.replace(/^golf_tournament_create /, '')) as { p_payload: Record<string, unknown> };
    expect(sent.p_payload).toMatchObject({ team_id: 'team-1', name: 'Oakmont Fall Classic', start_date: '2026-10-05' });
    expect(sent.p_payload.rounds).toEqual([
      { date: '2026-10-05', course_id: null, tee_id: null, start_type: 'tee_times', first_tee_at: null },
      { date: '2026-10-06', course_id: null, tee_id: null, start_type: 'tee_times', first_tee_at: '2026-10-06T08:10:00-04:00' },
    ]);
  });

  it('a score for a player who is not in the round (an alternate, or not entered) is refused, not saved unseen', async () => {
    state.lineup = [{ player_id: ID2, role: 'alternate' }];
    await expect(enterTournamentScore(ID, ID2, { total: 72 })).resolves.toMatchObject({ success: false, code: 'not_in_lineup' });
    expect(state.calls).toEqual([]);
  });

  it('an entered score clears any link (one source, D-82)', async () => {
    await expect(enterTournamentScore(ID, ID2, { total: 72 })).resolves.toEqual({ success: true, data: null });
    expect(state.calls[0]).toContain('"round_id":null');
    expect(state.calls[0]).toContain('"entered_total":72');
  });
});
