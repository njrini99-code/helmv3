import { describe, expect, it } from 'vitest';
import { createFakeSupabase } from './fake-supabase';

describe('fake-supabase', () => {
  it('returns seeded rows on simple from().select()', async () => {
    const fake = createFakeSupabase({
      tables: {
        golf_players: [
          { id: 'p1', user_id: 'u1', first_name: 'A' },
          { id: 'p2', user_id: 'u2', first_name: 'B' },
        ],
      },
    });
    const { data, error } = await fake.from('golf_players').select('*');
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it('chains eq and returns matching rows', async () => {
    const fake = createFakeSupabase({
      tables: {
        golf_players: [
          { id: 'p1', user_id: 'u1' },
          { id: 'p2', user_id: 'u2' },
        ],
      },
    });
    const { data } = await fake
      .from('golf_players')
      .select('*')
      .eq('user_id', 'u2');
    expect(data).toEqual([{ id: 'p2', user_id: 'u2' }]);
  });

  it('order + limit + maybeSingle compose', async () => {
    const fake = createFakeSupabase({
      tables: {
        golf_rounds: [
          { id: 'r1', score: 80 },
          { id: 'r2', score: 75 },
          { id: 'r3', score: 78 },
        ],
      },
    });
    const { data } = await fake
      .from('golf_rounds')
      .select('id, score')
      .order('score', { ascending: true })
      .limit(1)
      .maybeSingle();
    expect(data).toEqual({ id: 'r2', score: 75 });
  });

  it('supports rpc with registered handler', async () => {
    const fake = createFakeSupabase({
      rpc: {
        get_coach_today_schedule: async (args) => ({
          data: [{ id: 'evt1', team_id: (args as { p_team_id: string }).p_team_id }],
          error: null,
        }),
      },
    });
    const { data } = await fake.rpc('get_coach_today_schedule', {
      p_team_id: 'team1',
      p_today_start: '2026-05-17T00:00:00Z',
      p_today_end: '2026-05-18T00:00:00Z',
    });
    expect(data).toEqual([{ id: 'evt1', team_id: 'team1' }]);
  });

  it('returns supabase-shape error when rpc not registered', async () => {
    const fake = createFakeSupabase({});
    const { data, error } = await fake.rpc('unknown_fn', {});
    expect(data).toBeNull();
    expect((error as { message: string }).message).toMatch(/not registered/);
  });

  it('upsert returns inserted rows and updates seeded table', async () => {
    const fake = createFakeSupabase({ tables: { golf_event_attendance: [] } });
    const { error } = await fake
      .from('golf_event_attendance')
      .upsert(
        { event_id: 'e1', player_id: 'p1', status: 'going' },
        { onConflict: 'event_id,player_id' },
      );
    expect(error).toBeNull();
    const { data } = await fake.from('golf_event_attendance').select('*');
    expect(data).toHaveLength(1);
  });

  it('upsert with onConflict updates existing row instead of inserting duplicate', async () => {
    const fake = createFakeSupabase({
      tables: {
        golf_event_attendance: [{ event_id: 'e1', player_id: 'p1', status: 'going' }],
      },
    });
    await fake
      .from('golf_event_attendance')
      .upsert(
        { event_id: 'e1', player_id: 'p1', status: 'declined' },
        { onConflict: 'event_id,player_id' },
      );
    const { data } = await fake.from('golf_event_attendance').select('*');
    expect(data).toHaveLength(1);
    expect((data![0] as { status: string }).status).toBe('declined');
  });

  it('update with eq mutates matching rows and returns affected', async () => {
    const fake = createFakeSupabase({
      tables: {
        golf_rounds: [
          { id: 'r1', score: 80 },
          { id: 'r2', score: 75 },
        ],
      },
    });
    const result = await fake.from('golf_rounds').update({ score: 99 }).eq('id', 'r1');
    expect(result.error).toBeNull();
    expect(result.count).toBe(1);
    const { data } = await fake.from('golf_rounds').select('*').eq('id', 'r1');
    expect((data![0] as { score: number }).score).toBe(99);
  });

  it('delete with eq removes rows and returns count', async () => {
    const fake = createFakeSupabase({
      tables: {
        golf_rounds: [
          { id: 'r1' },
          { id: 'r2' },
        ],
      },
    });
    const result = await fake.from('golf_rounds').delete().eq('id', 'r1');
    expect(result.count).toBe(1);
    const { data } = await fake.from('golf_rounds').select('*');
    expect(data).toHaveLength(1);
  });

  it('auth.getUser returns provided user', async () => {
    const fake = createFakeSupabase({ user: { id: 'u1', email: 'a@b.c' } });
    const { data } = await fake.auth.getUser();
    expect(data.user?.id).toBe('u1');
  });

  it('auth.getUser returns null when no user provided', async () => {
    const fake = createFakeSupabase();
    const { data } = await fake.auth.getUser();
    expect(data.user).toBeNull();
  });
});
