import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const TEAM = '00000000-0000-4000-8000-000000000001';
const PLAYER = '00000000-0000-4000-8000-0000000000b1';

/**
 * A stand-in for golf_team_roster_limits and golf_roster_exemptions as RLS answers the caller: a write the policies keep
 * returns no row (or 42501), and a missing table (the held migration 20261115250000) answers 42P01. No network.
 */
const state = vi.hoisted(() => ({
  user: { id: 'coach-1' } as { id: string } | null,
  allowed: true,
  error: null as { message: string; code?: string } | null,
  writes: [] as Array<{ table: string; op: string; row?: Record<string, unknown>; onConflict?: string }>,
}));
const revalidate = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidatePath: revalidate }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    from: (table: string) => {
      let row: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        eq: () => q,
        upsert: (r: Record<string, unknown>, o: { onConflict: string }) => {
          row = r;
          state.writes.push({ table, op: 'upsert', row: r, onConflict: o.onConflict });
          return q;
        },
        delete: () => {
          state.writes.push({ table, op: 'delete' });
          return q;
        },
        maybeSingle: async () => (state.error ? { data: null, error: state.error } : { data: state.allowed && row ? { ...row } : null, error: null }),
        then: (res: (v: unknown) => unknown) => res({ error: state.error }),
      };
      return q;
    },
  }),
}));

const { saveRosterLimit, setRosterExemption } = await import('../roster-limit');

beforeEach(() => {
  state.user = { id: 'coach-1' };
  state.allowed = true;
  state.error = null;
  state.writes = [];
  revalidate.mockReset();
});

describe('saveRosterLimit (F-05)', () => {
  it('30980 writes one row a team with the limit, and refreshes the roster', async () => {
    expect(await saveRosterLimit({ teamId: TEAM, enabled: true, max: 8 })).toEqual({ success: true });
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]).toMatchObject({
      table: 'golf_team_roster_limits',
      onConflict: 'team_id',
      row: { team_id: TEAM, enabled: true, max_players: 8, updated_by: 'coach-1' },
    });
    expect(revalidate).toHaveBeenCalledWith('/golf/dashboard/roster');
  });

  it('refuses a number outside 1 to 40 without writing', async () => {
    for (const max of [0, 41, 8.5]) {
      const r = await saveRosterLimit({ teamId: TEAM, enabled: true, max });
      expect(r).toMatchObject({ success: false, code: 'CH-3081' });
    }
    expect(state.writes).toHaveLength(0);
  });

  it('answers unavailable before the held migration', async () => {
    state.error = { code: '42P01', message: 'relation does not exist' };
    expect(await saveRosterLimit({ teamId: TEAM, enabled: false, max: 9 })).toEqual({
      success: false,
      error: 'Setting the roster limit arrives with the next update.',
      code: 'CH-3081',
      unavailable: true,
    });
  });

  it('a write RLS keeps (not a coach of the team) says so', async () => {
    state.allowed = false;
    expect(await saveRosterLimit({ teamId: TEAM, enabled: true, max: 9 })).toMatchObject({
      success: false,
      error: 'Only a coach of the team can change its roster limit.',
    });
    expect(revalidate).not.toHaveBeenCalled();
  });

  it('a signed-out caller writes nothing', async () => {
    state.user = null;
    expect(await saveRosterLimit({ teamId: TEAM, enabled: true, max: 9 })).toMatchObject({ success: false });
    expect(state.writes).toHaveLength(0);
  });
});

describe('setRosterExemption (F-05)', () => {
  it('30981 marks a player as not counting with the reason, and counting again deletes the mark', async () => {
    expect(await setRosterExemption({ teamId: TEAM, playerId: PLAYER, reason: 'designated', note: '  per compliance  ' })).toEqual({ success: true });
    expect(state.writes[0]).toMatchObject({
      table: 'golf_roster_exemptions',
      op: 'upsert',
      onConflict: 'team_id,player_id',
      row: { team_id: TEAM, player_id: PLAYER, reason: 'designated', note: 'per compliance', created_by: 'coach-1' },
    });
    expect(await setRosterExemption({ teamId: TEAM, playerId: PLAYER, reason: null })).toEqual({ success: true });
    expect(state.writes[1]).toMatchObject({ table: 'golf_roster_exemptions', op: 'delete' });
  });

  it('refuses a reason the NCAA does not name', async () => {
    const r = await setRosterExemption({ teamId: TEAM, playerId: PLAYER, reason: 'injury' as never });
    expect(r).toMatchObject({ success: false, code: 'CH-3082' });
    expect(state.writes).toHaveLength(0);
  });

  it('answers unavailable before the held migration', async () => {
    state.error = { code: 'PGRST205', message: 'not in schema cache' };
    expect(await setRosterExemption({ teamId: TEAM, playerId: PLAYER, reason: 'medical' })).toMatchObject({
      success: false,
      code: 'CH-3082',
      unavailable: true,
    });
  });
});
