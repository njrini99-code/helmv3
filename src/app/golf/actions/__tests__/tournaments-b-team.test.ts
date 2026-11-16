import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
/**
 * setTournamentEntries with a B team (F-05). The squad column arrives with held migration 20261116090000: before it the
 * probe answers 42703 and a B entry is refused, so the old function never saves a B player as an A individual.
 */
const state = vi.hoisted(() => ({
  probe: null as null | { code: string; message: string },
  calls: [] as string[],
}));
vi.mock('@/lib/flags', () => ({ isFlagEnabled: () => true }));
vi.mock('@/lib/auth/get-golf-dashboard-role', () => ({ getGolfDashboardRole: async () => 'coach' }));
vi.mock('@/lib/auth/session', () => ({ getGolfSessionProfile: async () => ({ coach: { id: 'c1', organization_id: 'o1' } }) }));
vi.mock('@/lib/golf/dashboard-request-cache', () => ({ resolveCoachActiveTeamForRequest: async () => ({ status: 'ok', teamId: 'team-1' }) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    rpc: async (fn: string, args: unknown) => {
      state.calls.push(`${fn} ${JSON.stringify(args)}`);
      return { data: 4, error: null };
    },
    from: (t: string) => {
      const q: Record<string, unknown> = {
        select: (cols: string) => {
          state.calls.push(`select ${t} ${cols}`);
          return q;
        },
        eq: () => q,
        limit: () => q,
        then: (ok: (v: unknown) => void) => ok({ data: [], error: state.probe }),
      };
      return q;
    },
  }),
}));

import { setTournamentEntries } from '../tournaments';

const EVENT = '00000000-0000-0000-0000-000000000001';
const A1 = '00000000-0000-0000-0000-0000000000a1';
const B1 = '00000000-0000-0000-0000-0000000000b1';
const B2 = '00000000-0000-0000-0000-0000000000b2';

beforeEach(() => {
  state.probe = null;
  state.calls = [];
});

describe('setTournamentEntries with a B team (F-05)', () => {
  it('160981 sends the B team as individuals of squad B with their spots, and the A entries exactly as before', async () => {
    const r = await setTournamentEntries(
      EVENT,
      [
        { playerId: A1, role: 'lineup', slot: 1 },
        { playerId: B1, role: 'individual', slot: 1, squad: 'B' },
        { playerId: B2, role: 'alternate', slot: null, squad: 'B' },
      ],
      3,
    );
    expect(r).toEqual({ success: true, data: { version: 4 } });
    const rpc = state.calls.find((c) => c.startsWith('golf_tournament_set_entries'))!;
    const args = JSON.parse(rpc.slice(rpc.indexOf(' ') + 1));
    expect(args.p_entries).toEqual([
      { player_id: A1, role: 'lineup', slot: 1 },
      { player_id: B1, role: 'individual', slot: 1, squad: 'B' },
      { player_id: B2, role: 'alternate', slot: null, squad: 'B' },
    ]);
  });

  it('a save with no B entry never probes for the squad column', async () => {
    await setTournamentEntries(EVENT, [{ playerId: A1, role: 'lineup', slot: 1 }], 3);
    expect(state.calls.some((c) => c.startsWith('select'))).toBe(false);
    expect(state.calls).toHaveLength(1);
  });

  it('before the held migration a B entry is refused and nothing is written', async () => {
    state.probe = { code: '42703', message: 'column golf_tournament_entries.squad does not exist' };
    const r = await setTournamentEntries(EVENT, [{ playerId: B1, role: 'individual', slot: 1, squad: 'B' }], 3);
    expect(r).toMatchObject({ success: false, code: 'b_team_unavailable', error: 'A B team arrives with the next update. Nothing was saved.' });
    expect(state.calls.some((c) => c.startsWith('golf_tournament_set_entries'))).toBe(false);
  });

  it('a B player in the lineup is invalid', async () => {
    const r = await setTournamentEntries(EVENT, [{ playerId: B1, role: 'lineup', slot: 1, squad: 'B' }], 3);
    expect(r).toMatchObject({ success: false, code: 'invalid' });
    expect(state.calls).toEqual([]);
  });
});
