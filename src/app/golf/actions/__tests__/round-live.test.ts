import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The player's live sharing writes (P-6): the database's answers map to the Clubhouse's words, and a busy round is retried once. */

const state = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  rpc: [] as Array<{ data: unknown; error: { code?: string; message?: string } | null }>,
  calls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  player: { id: 'p1' } as { id: string } | null,
  upsertError: null as { code?: string; message: string } | null,
  upserts: [] as Array<Record<string, unknown>>,
}));
const logged = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/lib/server-error-logger', () => ({ logServerError: logged, logServerException: logged, logServerEvent: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user }, error: null }) },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.calls.push({ fn, args });
      return state.rpc.shift() ?? { data: { ok: true, share: 'coaches', seq: 7, clamped: false }, error: null };
    },
    from: (table: string) => {
      if (table === 'golf_players') {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: state.player, error: null }) };
        return q;
      }
      return {
        upsert: async (row: Record<string, unknown>) => {
          state.upserts.push({ table, ...row });
          return { error: state.upsertError };
        },
      };
    },
  }),
}));

import { setLivePrefs, setLiveShare, setNextLiveShare } from '../round-live';

const ROUND = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.useRealTimers();
  state.user = { id: 'u1' };
  state.rpc = [];
  state.calls = [];
  state.player = { id: 'p1' };
  state.upsertError = null;
  state.upserts = [];
  logged.mockClear();
});

afterEach(() => vi.useRealTimers());

describe('setLiveShare', () => {
  it('asks the database to change the level, and returns what it stored', async () => {
    state.rpc = [{ data: { ok: true, share: 'team', seq: 12, clamped: false }, error: null }];
    const r = await setLiveShare(ROUND, 'team', true);
    expect(r).toEqual({ success: true, data: { share: 'team', seq: 12, clamped: false } });
    expect(state.calls).toEqual([{ fn: 'golf_round_live_set_share', args: { p_round_id: ROUND, p_share: 'team', p_remember: true } }]);
  });

  it('tells the person when the level was floored (a qualifier stays with coaches)', async () => {
    state.rpc = [{ data: { ok: true, share: 'coaches', seq: 3, clamped: true }, error: null }];
    const r = await setLiveShare(ROUND, 'off');
    expect(r).toMatchObject({ success: true, data: { share: 'coaches', clamped: true } });
  });

  it('refuses a bad id or level without calling the database (CH-16664)', async () => {
    expect(await setLiveShare('nope', 'team')).toMatchObject({ success: false, code: 'CH-16664' });
    expect(await setLiveShare(ROUND, 'everyone' as never)).toMatchObject({ success: false, code: 'CH-16664' });
    expect(state.calls).toHaveLength(0);
  });

  it('maps the database’s refusals: too many changes is CH-16665, the rest CH-16664', async () => {
    state.rpc = [{ data: { ok: false, error: 'too_many_changes', share: 'coaches' }, error: null }];
    expect(await setLiveShare(ROUND, 'team')).toEqual({ success: false, error: 'Sharing was changed too many times on this round.', code: 'CH-16665', retryable: false });
    for (const reason of ['not_found', 'not_in_progress', 'no_team', 'not_live', 'invalid_share']) {
      state.rpc = [{ data: { ok: false, error: reason }, error: null }];
      expect(await setLiveShare(ROUND, 'team')).toMatchObject({ success: false, code: 'CH-16664', error: 'Couldn’t change sharing. Try again.' });
    }
  });

  it('a missing function (PGRST202) is CH-16666, "Sharing isn’t available yet", and cannot be retried', async () => {
    state.rpc = [{ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }];
    expect(await setLiveShare(ROUND, 'team')).toEqual({ success: false, error: 'Sharing isn’t available yet.', code: 'CH-16666', retryable: false });
  });

  it('a busy round is retried once after a second, then reported', async () => {
    vi.useFakeTimers();
    state.rpc = [
      { data: { ok: false, error: 'busy' }, error: null },
      { data: { ok: true, share: 'team', seq: 2, clamped: false }, error: null },
    ];
    const pending = setLiveShare(ROUND, 'team');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toMatchObject({ success: true });
    expect(state.calls).toHaveLength(2);

    state.calls = [];
    state.rpc = [
      { data: { ok: false, error: 'busy' }, error: null },
      { data: { ok: false, error: 'busy' }, error: null },
    ];
    const again = setLiveShare(ROUND, 'team');
    await vi.advanceTimersByTimeAsync(1000);
    expect(await again).toMatchObject({ success: false, code: 'CH-16664', retryable: true });
    expect(state.calls).toHaveLength(2);
  });
});

describe('setNextLiveShare', () => {
  it('records the setup choice for the next round', async () => {
    state.rpc = [{ data: { ok: true, share: 'team' }, error: null }];
    expect(await setNextLiveShare('team', true)).toMatchObject({ success: true, data: { share: 'team' } });
    expect(state.calls).toEqual([{ fn: 'golf_round_live_set_next_share', args: { p_share: 'team', p_remember: true } }]);
  });
  it('is CH-16666 until the function exists', async () => {
    state.rpc = [{ data: null, error: { code: '42883', message: 'function does not exist' } }];
    expect(await setNextLiveShare('coaches')).toMatchObject({ success: false, code: 'CH-16666' });
  });
});

describe('setLivePrefs', () => {
  it('upserts the player’s own practice default', async () => {
    const r = await setLivePrefs({ practiceShare: 'coaches' });
    expect(r).toEqual({ success: true, data: { practiceShare: 'coaches' } });
    expect(state.upserts).toEqual([expect.objectContaining({ table: 'golf_round_live_prefs', player_id: 'p1', practice_share: 'coaches' })]);
  });
  it('fails closed with no signed-in player, a bad level, or a missing table', async () => {
    state.user = null;
    expect(await setLivePrefs({ practiceShare: 'team' })).toMatchObject({ success: false, code: 'CH-16664' });
    state.user = { id: 'u1' };
    expect(await setLivePrefs({ practiceShare: 'all' as never })).toMatchObject({ success: false });
    state.upsertError = { code: '42P01', message: 'relation does not exist' };
    expect(await setLivePrefs({ practiceShare: 'team' })).toMatchObject({ success: false, code: 'CH-16664' });
    expect(logged).toHaveBeenCalled();
  });
});
