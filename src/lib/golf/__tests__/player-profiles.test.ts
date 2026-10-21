import { describe, expect, it, vi } from 'vitest';
import { profilesById, profilesByUserId, readGolfPlayerProfiles, type GolfPlayerProfile } from '../player-profiles';

const profile = (id: string, userId: string | null = `u-${id}`): GolfPlayerProfile => ({
  id,
  user_id: userId,
  first_name: id,
  last_name: 'X',
  avatar_url: null,
  graduation_year: null,
  handicap: null,
  handicap_index: null,
});

const MISSING = { code: 'PGRST202', message: 'Could not find the function public.golf_player_profiles' };

type Reply = { data: unknown; error: unknown };

/** A client whose rpc and table reads answer from the given handlers; every call is recorded. */
function client(opts: { rpc?: (args: Record<string, unknown>) => Reply; table?: (name: string, column: string | null, ids: string[]) => Reply }) {
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => (opts.rpc ? opts.rpc(args) : { data: [], error: null }));
  const reads: Array<{ table: string; select: string; column: string; ids: string[] }> = [];
  const from = vi.fn((table: string) => ({
    select: (select: string) => ({
      in: async (column: string, ids: string[]) => {
        reads.push({ table, select, column, ids });
        return opts.table ? opts.table(table, column, ids) : { data: [], error: null };
      },
    }),
  }));
  return { supabase: { rpc, from } as never, rpc, from, reads };
}

describe('readGolfPlayerProfiles', () => {
  it('makes no request for an empty list', async () => {
    const c = client({});
    expect(await readGolfPlayerProfiles(c.supabase, { playerIds: [] })).toEqual({ data: [], error: null });
    expect(c.rpc).not.toHaveBeenCalled();
    expect(c.from).not.toHaveBeenCalled();
  });

  it('reads through the function, once per id kind, with the ids de-duplicated', async () => {
    const c = client({ rpc: () => ({ data: [profile('p1'), profile('p2')], error: null }) });
    const res = await readGolfPlayerProfiles(c.supabase, { playerIds: ['p1', 'p2', 'p1', ''] });
    expect(res.error).toBeNull();
    expect(res.data?.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(c.rpc).toHaveBeenCalledTimes(1);
    expect(c.rpc).toHaveBeenCalledWith('golf_player_profiles', { p_player_ids: ['p1', 'p2'] });
    expect(c.from).not.toHaveBeenCalled();
  });

  it('asks by account id and by team id with the matching argument', async () => {
    const c = client({ rpc: () => ({ data: [], error: null }) });
    await readGolfPlayerProfiles(c.supabase, { userIds: ['u1'] });
    await readGolfPlayerProfiles(c.supabase, { teamIds: ['t1'] });
    expect(c.rpc).toHaveBeenNthCalledWith(1, 'golf_player_profiles', { p_user_ids: ['u1'] });
    expect(c.rpc).toHaveBeenNthCalledWith(2, 'golf_player_profiles', { p_team_ids: ['t1'] });
  });

  it('pages a long id list under the row cap and merges the pages without duplicates', async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `p${i}`);
    const c = client({ rpc: (args) => ({ data: (args.p_player_ids as string[]).map((id) => profile(id)), error: null }) });
    const res = await readGolfPlayerProfiles(c.supabase, { playerIds: ids });
    expect(c.rpc).toHaveBeenCalledTimes(3);
    expect(res.data).toHaveLength(1200);
  });

  it('while the function is not applied (PGRST202 or 42883) it reads the table columns it replaces, and keeps going on the table', async () => {
    for (const code of ['PGRST202', '42883']) {
      const c = client({
        rpc: () => ({ data: null, error: { ...MISSING, code } }),
        table: (_t, _column, ids) => ({ data: ids.map((id) => profile(id)), error: null }),
      });
      const res = await readGolfPlayerProfiles(c.supabase, { playerIds: ['p1', 'p2'] });
      expect(res.data?.map((p) => p.id)).toEqual(['p1', 'p2']);
      expect(c.reads).toHaveLength(1);
      expect(c.reads[0]).toMatchObject({ table: 'golf_players', column: 'id', ids: ['p1', 'p2'] });
      // Display columns only: the table fallback never selects email, phone, gpa, school, hometown or state.
      expect(c.reads[0]!.select).not.toMatch(/email|phone|gpa|high_school|hometown|state/);
    }
  });

  it('a failed function call that is not "function missing" is an error, never an empty list, and does not fall back', async () => {
    const c = client({ rpc: () => ({ data: null, error: { code: '57014', message: 'statement timeout' } }) });
    const res = await readGolfPlayerProfiles(c.supabase, { playerIds: ['p1'] });
    expect(res.data).toBeNull();
    expect(res.error).toMatchObject({ code: '57014' });
    expect(c.from).not.toHaveBeenCalled();
  });

  it('a failed table fallback is an error too', async () => {
    const c = client({
      rpc: () => ({ data: null, error: MISSING }),
      table: () => ({ data: null, error: { code: '42501', message: 'permission denied' } }),
    });
    const res = await readGolfPlayerProfiles(c.supabase, { userIds: ['u1'] });
    expect(res.data).toBeNull();
    expect(res.error).toMatchObject({ code: '42501' });
    expect(c.reads[0]).toMatchObject({ column: 'user_id' });
  });
});

describe('profile lookups', () => {
  it('key by player id, and by account id leaving out players with no account', () => {
    const rows = [profile('p1'), profile('p2', null)];
    expect([...profilesById(rows).keys()]).toEqual(['p1', 'p2']);
    expect([...profilesByUserId(rows).keys()]).toEqual(['u-p1']);
  });
});
