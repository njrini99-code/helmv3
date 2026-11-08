import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('the service client must not be used'); } }));

import { describeQueryTables, queryTeamData, TeamQueryInput } from '../team-query';
import { person, pgrst, type Tables } from './pgrst-double';

const ctx: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Varsity', timezone: 'America/New_York', roster: [person('p1', 'Owen Carter'), person('p2', 'Cole Bennett')] };
const parse = (input: unknown) => TeamQueryInput.parse(input);
const on = { tournamentsOn: true };
const rowsOf = (e: { detail?: unknown }) => (e.detail as { rows: Array<Record<string, unknown>> }).rows;

const round = (id: string, player_id: string, round_date: string, over: Record<string, unknown> = {}) => ({
  id, player_id, round_date, course_name: 'Pines', round_type: 'tournament', status: 'completed', holes_played: 18, total_score: 74, score_to_par: 2, total_putts: 31, total_gir: 9, total_gir_possible: 18,
  total_fairways_hit: 8, total_fairways: 14, total_penalties: 1, front_nine: 37, back_nine: 37, strokes_gained_total: -1.2, strokes_gained_tee: 0.1, strokes_gained_approach: -0.8, strokes_gained_around_green: -0.2, strokes_gained_putting: -0.3, is_test: false, ...over,
});
const line = (round_id: string, over: Record<string, unknown> = {}) => ({ round_id, three_putts: 2, total_putts: 31, greens_hit: 9, greens_total: 18, fairways_hit: 8, fairways_total: 14, penalty_strokes: 1, front_nine: 37, back_nine: 37, ...over });

const tables = (): Tables => ({
  golf_rounds: {
    rows: [
      round('r1', 'p1', '2026-10-21'),
      round('r2', 'p1', '2026-10-21', { round_type: 'practice', total_score: 71 }),
      round('r3', 'p2', '2026-10-19', { total_putts: null, total_gir: null, total_score: 80 }),
      round('r4', 'p2', '2026-10-22', { status: 'in_progress', total_score: null, score_to_par: null, strokes_gained_total: null }),
      round('r5', 'other', '2026-10-23'),
      round('r6', 'p1', '2026-10-25', { is_test: true }),
    ],
  },
  golf_round_stats_cache: { rows: [line('r1'), line('r2', { three_putts: 0 }), line('r3', { three_putts: 4, total_putts: 34, greens_hit: 6 })] },
});

describe('round_lines', () => {
  it('is one row per round, with the stat line joined: player, day, course, type, status, score, putts, three-putts, greens, fairways and strokes gained', async () => {
    const { sb } = pgrst(tables());
    const columns = ['round_date', 'course_name', 'round_type', 'status', 'holes_played', 'total_score', 'score_to_par', 'total_putts', 'three_putts', 'total_gir', 'total_gir_possible', 'total_fairways_hit', 'total_fairways', 'strokes_gained_total', 'strokes_gained_putting'];
    const e = await queryTeamData(sb, ctx, parse({ table: 'round_lines', columns }), on);
    const rows = rowsOf(e);
    expect(rows.map((r) => r.player)).toEqual(['Cole Bennett', 'Owen Carter', 'Owen Carter', 'Cole Bennett']);
    // Newest day first; two rounds on one day are two rows.
    expect(rows.map((r) => r.round_date)).toEqual(['2026-10-22', '2026-10-21', '2026-10-21', '2026-10-19']);
    const owen = rows.filter((r) => r.player === 'Owen Carter');
    expect(owen.map((r) => [r.round_type, r.three_putts, r.total_score])).toEqual([['tournament', 2, 74], ['practice', 0, 71]]);
    expect(Object.keys(owen[0]!).sort()).toEqual(['player', 'player_id', ...columns].sort());
    expect(e.detail).toMatchObject({ kind: 'team_data', row_count: 4, total_rows: 4, truncated: false, ordered_by: 'round_date', newest_first: true });
    expect(e.coverage).toBe('complete');
  });

  it('keeps a round with no stat line, and fills a figure its own row lacks from the stat line, empty never zero', async () => {
    const { sb } = pgrst(tables());
    const rows = rowsOf(await queryTeamData(sb, ctx, parse({ table: 'round_lines', columns: ['round_date', 'status', 'total_score', 'total_putts', 'total_gir', 'three_putts'] }), on));
    const unfinished = rows.find((r) => r.status === 'in_progress')!;
    expect(unfinished).toMatchObject({ total_score: null, total_putts: 31, three_putts: null });
    const filled = rows.find((r) => r.round_date === '2026-10-19')!;
    // The round row has no putts or greens; the stat line sums the holes.
    expect(filled).toMatchObject({ total_score: 80, total_putts: 34, total_gir: 6, three_putts: 4 });
  });

  it('is scoped like every other read: the roster only, test rounds out, the session client, and no scope the model can set', async () => {
    const { sb, of } = pgrst(tables());
    const e = await queryTeamData(sb, ctx, parse({ table: 'round_lines', columns: ['round_date'] }), on);
    expect(JSON.stringify(e)).not.toMatch(/\bother\b|2026-10-23|2026-10-25/);
    const calls = of('golf_rounds');
    expect(calls.find((c) => c.method === 'in')!.args).toEqual(['player_id', ['p1', 'p2']]);
    expect(calls.filter((c) => c.method === 'eq').map((c) => c.args)).toContainEqual(['is_test', false]);
    expect(rowsOf(await queryTeamData(sb, ctx, parse({ table: 'round_lines', columns: ['round_date'], filters: [{ column: 'player_id', op: 'in', value: ['p1', 'stranger'] }] }), on)).map((r) => r.player_id)).toEqual(['p1', 'p1']);
    expect((await queryTeamData(sb, ctx, parse({ table: 'round_lines', columns: ['round_date'], filters: [{ column: 'team_id', op: 'eq', value: 'team-2' }] }), on)).coverage).toBe('unavailable');
    expect(of('golf_round_stats_cache')).toEqual([]);
  });

  it('reads the stat lines of exactly the rounds it shows, and only when a column needs them', async () => {
    const { sb, of } = pgrst(tables());
    await queryTeamData(sb, ctx, parse({ table: 'round_lines', columns: ['round_date', 'three_putts'], limit: 2 }), on);
    expect(of('golf_round_stats_cache').find((c) => c.method === 'in')!.args).toEqual(['round_id', ['r4', 'r1']]);
  });

  it('orders by the day by default, by the asked column with the day as the tie-break, and refuses what the stat line holds', async () => {
    const { sb, of } = pgrst(tables());
    await queryTeamData(sb, ctx, parse({ table: 'round_lines', columns: ['total_score'], order: { column: 'total_score', ascending: true } }), on);
    expect(of('golf_rounds').filter((c) => c.method === 'order').map((c) => c.args[0])).toEqual(['total_score', 'round_date', 'id']);
    const by = await queryTeamData(pgrst(tables()).sb, ctx, parse({ table: 'round_lines', columns: ['round_date', 'total_score'], order: { column: 'total_score', ascending: true } }), on);
    expect(rowsOf(by).map((r) => r.total_score).filter((v) => v !== null)).toEqual([71, 74, 80]);
    const bad = await queryTeamData(sb, ctx, parse({ table: 'round_lines', columns: ['three_putts'], order: { column: 'three_putts', ascending: false } }), on);
    expect(bad.coverage).toBe('unavailable');
    expect(bad.coverage_note).toMatch(/three_putts/);
    expect((await queryTeamData(sb, ctx, parse({ table: 'round_lines', columns: ['round_date'], filters: [{ column: 'three_putts', op: 'gte', value: 2 }] }), on)).coverage).toBe('unavailable');
  });

  it('filters on the round’s own columns', async () => {
    const { sb } = pgrst(tables());
    const rows = rowsOf(await queryTeamData(sb, ctx, parse({ table: 'round_lines', columns: ['round_date', 'round_type'], filters: [{ column: 'round_type', op: 'eq', value: 'practice' }, { column: 'round_date', op: 'gte', value: '2026-10-01' }] }), on));
    expect(rows.map((r) => r.round_type)).toEqual(['practice']);
  });

  it('says plainly when the cap cut the result: the first N of M, partial, and what to do', async () => {
    const { sb } = pgrst(tables());
    const e = await queryTeamData(sb, ctx, parse({ table: 'round_lines', columns: ['round_date', 'total_score'], limit: 2 }), on);
    expect(e.coverage).toBe('partial');
    expect(e.summary).toBe('2 rows of rounds, the first 2 of 4.');
    expect(e.coverage_note).toMatch(/first 2 of 4 rows/);
    expect(e.coverage_note).toMatch(/say so/i);
    expect(e.detail).toMatchObject({ total_rows: 4, truncated: true, row_count: 2 });
  });

  it('carries the unit of every column so an answer says "34 putts", not "34"', async () => {
    const { sb } = pgrst(tables());
    const e = await queryTeamData(sb, ctx, parse({ table: 'round_lines', columns: ['round_date', 'total_score', 'score_to_par', 'total_putts', 'strokes_gained_putting'] }), on);
    expect((e.detail as { units: object }).units).toEqual({ total_score: 'strokes', score_to_par: 'to_par', total_putts: 'count', strokes_gained_putting: 'strokes' });
  });

  it('is offered first in the tool description, with units and the reading guide', () => {
    const d = describeQueryTables({ tournamentsOn: false });
    expect(d.startsWith('round_lines')).toBe(true);
    expect(d).toContain('total_score[strokes]');
    expect(d).toContain('three_putts[n]');
    expect(d).toMatch(/Reading the data/);
    expect(d).toMatch(/Prefer round_lines/);
  });
});

describe('query_team_data keeps its place, units and an honest cut', () => {
  it('says the first N of M for any table, from the server’s own count', async () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: `g${i}`, player_id: 'p1', title: `Goal ${i}`, state: 'active', ends_at: `2026-12-0${i + 1}` }));
    const { sb } = pgrst({ golf_goals: { rows: many } });
    const e = await queryTeamData(sb, ctx, parse({ table: 'golf_goals', columns: ['title', 'ends_at'], limit: 3 }), on);
    expect(e.coverage).toBe('partial');
    expect(e.coverage_note).toMatch(/first 3 of 5 rows/);
    expect(e.detail).toMatchObject({ total_rows: 5, row_count: 3, truncated: true });
  });

  it('orders by the date the question is about, not by the bookkeeping time', async () => {
    const rows = [
      { id: 'f1', player_id: 'p1', title: 'A', target_date: '2026-12-01', updated_at: '2026-11-01T00:00:00Z' },
      { id: 'f2', player_id: 'p1', title: 'B', target_date: '2027-01-15', updated_at: '2026-10-01T00:00:00Z' },
    ];
    const asked = await queryTeamData(pgrst({ golf_player_focus_areas: { rows } }).sb, ctx, parse({ table: 'golf_player_focus_areas', columns: ['title', 'target_date', 'updated_at'] }), on);
    expect(rowsOf(asked).map((r) => r.title)).toEqual(['B', 'A']);
    expect(asked.detail).toMatchObject({ ordered_by: 'target_date' });
    // A filter on a date leads over a date merely asked for.
    const filtered = await queryTeamData(pgrst({ golf_player_focus_areas: { rows } }).sb, ctx, parse({ table: 'golf_player_focus_areas', columns: ['title', 'started_at'], filters: [{ column: 'target_date', op: 'gte', value: '2026-01-01' }] }), on);
    expect(filtered.detail).toMatchObject({ ordered_by: 'target_date' });
    // Nothing to follow in the question: the table’s own order, and an explicit order is always obeyed.
    const plain = await queryTeamData(pgrst({ golf_player_focus_areas: { rows } }).sb, ctx, parse({ table: 'golf_player_focus_areas', columns: ['title'] }), on);
    expect(plain.detail).toMatchObject({ ordered_by: 'updated_at' });
    const explicit = await queryTeamData(pgrst({ golf_player_focus_areas: { rows } }).sb, ctx, parse({ table: 'golf_player_focus_areas', columns: ['title', 'target_date'], order: { column: 'updated_at', ascending: true } }), on);
    expect(rowsOf(explicit).map((r) => r.title)).toEqual(['B', 'A']);
    expect(explicit.detail).toMatchObject({ ordered_by: 'updated_at', newest_first: false });
  });

  it('carries units on a typed table’s rows', async () => {
    const { sb } = pgrst({ golf_player_stats_cache: { rows: [{ player_id: 'p1', approach_proximity_average: 15.3, gir_percentage: 61.2, trend_direction: 'stable', updated_at: '2026-11-01T00:00:00Z' }] } });
    const e = await queryTeamData(sb, ctx, parse({ table: 'golf_player_stats_cache', columns: ['approach_proximity_average', 'gir_percentage', 'trend_direction'] }), on);
    expect((e.detail as { units: object }).units).toEqual({ approach_proximity_average: 'feet', gir_percentage: 'percent' });
  });
});
