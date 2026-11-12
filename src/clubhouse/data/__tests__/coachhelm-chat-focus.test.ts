/**
 * The player's Ask home reads their own open focus areas. "The player has none" and "the read failed" are different
 * answers: the first is an empty list, the second leaves `focus` off the data, so nothing downstream can take a failed
 * read for a player with no focus areas. Synthetic ids only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  focus: { data: [], error: null } as { data: unknown; error: { code?: string; message: string } | null },
  filters: [] as Array<[string, unknown]>,
  log: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('../../lib/track-server', () => ({ chLogServer: state.log }));
vi.mock('@/lib/coachhelm/v3/chat/request-cache', () => ({ getCoachChatContext: vi.fn(), getCoachProgramPulse: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/ask-knows', () => ({ readAskKnows: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/chat/player-context', () => ({
  resolvePlayerChatContext: async () => ({ player_id: 'player-1', user_id: 'user-1', team_id: 'team-1', team_name: 'Finley University', timezone: 'America/New_York', roster: [{ id: 'player-1', name: 'Jonah Okafor' }] }),
}));
vi.mock('@/lib/coachhelm/v3/chat/player-allowance', () => ({ readBucket: async () => 'plenty' }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table !== 'golf_player_focus_areas') throw new Error(`unexpected table ${table}`);
      const q = {
        select: () => q,
        eq: (column: string, value: unknown) => (state.filters.push([column, value]), q),
        order: () => q,
        limit: async () => state.focus,
      };
      return q;
    },
  }),
}));

import { loadAskPlayer } from '../coachhelm-chat';

async function ready() {
  const load = await loadAskPlayer();
  if (load.status !== 'ready') throw new Error(`expected the player's Ask to load, got ${load.status}`);
  return load.data;
}

beforeEach(() => {
  state.focus = { data: [], error: null };
  state.filters = [];
  state.log.mockClear();
});

describe('the player’s focus lines on Ask’s home', () => {
  it('a failed read leaves focus off the data and is logged: it is not an empty list', async () => {
    state.focus = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };

    const data = await ready();

    expect(data.focus).toBeUndefined();
    expect('focus' in data && data.focus !== undefined).toBe(false);
    expect(state.log).toHaveBeenCalledWith('coachhelm.ask', 'player focus', expect.objectContaining({ code: '57014' }), 'coachhelm');
    // The rest of the home still loads: one failed side read does not take the page down.
    expect(data.role).toBe('player');
    expect(data.firstName).toBe('Jonah');
  });

  it('a player with no open focus areas gets an empty list, and nothing is logged', async () => {
    const data = await ready();

    expect(data.focus).toEqual([]);
    expect(state.log).not.toHaveBeenCalled();
  });

  it('reads only the session player’s own active focus areas, with how each is going', async () => {
    state.focus = { data: [{ title: 'Lag putting', outcome_status: 'improved' }, { title: 'Wedges inside 100', outcome_status: 'worsened' }, { title: 'Tee shots', outcome_status: null }], error: null };

    const data = await ready();

    expect(state.filters).toEqual([['player_id', 'player-1'], ['status', 'active']]);
    expect(data.focus).toEqual([
      { text: 'Lag putting', ask: 'How is Lag putting going for me?', trend: 'up' },
      { text: 'Wedges inside 100', ask: 'How is Wedges inside 100 going for me?', trend: 'warn' },
      { text: 'Tee shots', ask: 'How is Tee shots going for me?', trend: undefined },
    ]);
  });
});
