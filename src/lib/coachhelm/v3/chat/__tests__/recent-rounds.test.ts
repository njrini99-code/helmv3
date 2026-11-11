import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const logged = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: logged }));

import { getRecentRounds, type PlayerFigures } from '../read-tools';
import { person, pgrst } from './pgrst-double';

// Player Ask, staging, 2026-11-08: "How many three-putts did I have?" The player's own rounds read had no stat line, so the answer said the data
// "only holds a rate" from the stats cache. A player reads their own rounds' stat lines; and the list is the window Stats counts.

const ctx = { coach_id: '', user_id: 'u', team_id: 't', team_name: 'T', timezone: 'UTC', roster: [person('p1', 'Cole Bennett')] } as never;
const round = (id: string, round_date: string, over: Record<string, unknown> = {}) => ({
  id, player_id: 'p1', round_date, course_name: 'Pines', round_type: 'tournament', status: 'completed', is_test: false, total_score: 74, score_to_par: 2, total_putts: 31,
  strokes_gained_total: -1, holes_played: 18, front_nine: 37, back_nine: 37, ...over,
});
const line = (round_id: string, over: Record<string, unknown> = {}) => ({ round_id, total_putts: 31, three_putts: 2, greens_hit: 9, greens_total: 18, fairways_hit: 8, fairways_total: 14, scrambles_converted: 4, scramble_attempts: 9, ...over });

const rows = [
  round('r1', '2026-10-21'),
  round('r2', '2026-10-21', { round_type: 'practice', total_score: 82 }),
  round('r3', '2026-09-26', { round_type: 'qualifier', total_putts: null }),
  round('r4', '2026-09-25', { round_type: 'qualifier', total_putts: 0 }),
];
const stat = [line('r1'), line('r2', { three_putts: 5 }), line('r3', { total_putts: null, three_putts: 0 }), line('r4', { total_putts: 0, three_putts: 0 })];
const roundsOf = (e: { detail?: unknown }) => (e.detail as { rounds: Array<Record<string, unknown>> }).rounds;

describe('a player’s recent rounds carry their stat line', () => {
  it('three-putts, putts, greens, fairways and up-and-downs per round; empty, never 0, where no putts were entered', async () => {
    const { sb } = pgrst({ golf_rounds: { rows }, golf_round_stats_cache: { rows: stat } });
    const e = await getRecentRounds(sb, ctx, { player_id: 'p1', last_n: 4 });
    const byId = new Map(roundsOf(e).map((r) => [r.round_id, r]));
    expect(byId.get('r1')).toMatchObject({ putts: 31, three_putts: 2, greens_hit: 9, greens_total: 18, fairways_hit: 8, fairways_total: 14, up_and_downs: 4, up_and_down_chances: 9 });
    // The stat line writes 0 three-putts for a round with no putts entered: that is not recorded.
    expect(byId.get('r3')).toMatchObject({ putts: null, three_putts: null });
    expect(byId.get('r4')).toMatchObject({ putts: null, three_putts: null });
    // Without a figures source every round is listed, and each says whether Stats counts it.
    expect(roundsOf(e).map((r) => [r.round_id, r.counts_for_stats])).toEqual([['r1', true], ['r2', false], ['r3', true], ['r4', true]]);
    expect(e.summary).toBe("Cole Bennett's last 4 recorded rounds.");
  });

  it('only the player’s own rounds are read: the query is pinned to the one player', async () => {
    const { sb, calls } = pgrst({ golf_rounds: { rows }, golf_round_stats_cache: { rows: stat } });
    await getRecentRounds(sb, ctx, { player_id: 'p1', last_n: 2 });
    expect(calls.filter((c) => c.table === 'golf_rounds' && c.method === 'eq').map((c) => JSON.stringify(c.args))).toContain('["player_id","p1"]');
  });

  it('with a figures source it lists the window’s rounds, practice out, and says so', async () => {
    const { sb } = pgrst({ golf_rounds: { rows }, golf_round_stats_cache: { rows: stat } });
    const figures = async () => new Map<string, PlayerFigures>([['p1', { round_ids: ['r1', 'r3', 'r4'] } as PlayerFigures]]);
    const e = await getRecentRounds(sb, ctx, { player_id: 'p1', last_n: 2 }, figures);
    expect(roundsOf(e).map((r) => r.round_id)).toEqual(['r1', 'r3']);
    expect(e.summary).toBe("Cole Bennett's last 2 rounds that count in Stats.");
    expect((e.detail as { window_rule: string }).window_rule).toMatch(/practice rounds are left out/);
  });

  it('stat lines that could not be read: the rounds stand, the read is partial and says the lines were not read', async () => {
    logged.mockClear();
    const { sb } = pgrst({ golf_rounds: { rows }, golf_round_stats_cache: { error: { code: '57014', message: 'canceling statement due to statement timeout' } } });
    const e = await getRecentRounds(sb, ctx, { player_id: 'p1', last_n: 4 });
    // The scores are the rounds' own, so the list is still the answer to "what did I shoot".
    expect(roundsOf(e).map((r) => [r.round_id, r.total_score])).toEqual([['r1', 74], ['r2', 82], ['r3', 74], ['r4', 74]]);
    // No stat-line field is invented: absent, not 0.
    for (const r of roundsOf(e)) expect(r).not.toHaveProperty('three_putts');
    expect(e.coverage).toBe('partial');
    expect(e.coverage_note).toMatch(/could not be read/);
    expect(e.coverage_note).toMatch(/not the same as none recorded/);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]![1]).toMatchObject({ action: 'coachhelm.ask.recent_rounds', errorCode: '57014', handled: true });
  });

  it('stat lines that read and hold nothing for a round are a complete read: nothing is logged', async () => {
    logged.mockClear();
    const { sb } = pgrst({ golf_rounds: { rows }, golf_round_stats_cache: { rows: [] } });
    const e = await getRecentRounds(sb, ctx, { player_id: 'p1', last_n: 4 });
    expect(e.coverage).toBe('complete');
    expect(e.coverage_note).toBeNull();
    expect(logged).not.toHaveBeenCalled();
  });
});
