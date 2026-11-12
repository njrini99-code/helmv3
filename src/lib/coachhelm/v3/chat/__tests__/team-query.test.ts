import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('the service client must not be used'); } }));

import { describeQueryTables, queryTeamData, QUERY_ROW_LIMIT, TeamQueryInput } from '../team-query';
import { person, pgrst, type Tables } from './pgrst-double';

const ctx: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Varsity', timezone: 'America/New_York', roster: [person('p1', 'Owen Carter'), person('p2', 'Cole Bennett')] };
const parse = (input: unknown) => TeamQueryInput.parse(input);
const on = { tournamentsOn: true };
const eqs = (calls: Array<{ method: string; args: unknown[] }>) => calls.filter((c) => c.method === 'eq').map((c) => c.args);

const rounds = [
  { id: 'r1', player_id: 'p1', team_id: 'team-1', round_date: '2026-10-05', total_score: 74, round_type: 'tournament', is_test: false, notes: 'secret note' },
  { id: 'r2', player_id: 'p2', team_id: 'team-1', round_date: '2026-10-04', total_score: 78, round_type: 'practice', is_test: false },
  { id: 'r3', player_id: 'other', team_id: 'team-2', round_date: '2026-10-06', total_score: 66, round_type: 'tournament', is_test: false },
  { id: 'r4', player_id: 'p1', team_id: 'team-1', round_date: '2026-10-07', total_score: 50, round_type: 'practice', is_test: true },
];
const events = [
  { id: 'e1', team_id: 'team-1', title: 'Range', start_time: '2026-11-03T20:00:00Z', event_type: 'practice' },
  { id: 'e2', team_id: 'team-2', title: 'Elsewhere', start_time: '2026-11-04T20:00:00Z', event_type: 'practice' },
];
const tables: Tables = { golf_rounds: { rows: rounds }, golf_events: { rows: events }, golf_tournaments: { rows: [{ id: 't1', team_id: 'team-1', name: 'Invitational', start_date: '2026-10-10' }] } };

describe('query_team_data scoping', () => {
  it('forces the roster on a player-scoped table, drops test rounds, and labels each row with its player', async () => {
    const { sb, of } = pgrst(tables);
    const e = await queryTeamData(sb, ctx, parse({ table: 'golf_rounds', columns: ['round_date', 'total_score'] }), on);
    expect(of('golf_rounds').find((c) => c.method === 'in')!.args).toEqual(['player_id', ['p1', 'p2']]);
    expect(eqs(of('golf_rounds'))).toContainEqual(['is_test', false]);
    const rows = (e.detail as { rows: Array<Record<string, unknown>> }).rows;
    expect(rows.map((r) => r.player)).toEqual(['Owen Carter', 'Cole Bennett']);
    expect(rows.map((r) => r.total_score)).toEqual([74, 78]);
    expect(JSON.stringify(rows)).not.toMatch(/secret note|team-2|\b66\b|\b50\b/);
    // The scope column is selected so every row can be attributed, and nothing else is.
    expect(of('golf_rounds').find((c) => c.method === 'select')!.args[0]).toBe('round_date, total_score, player_id');
  });

  it('forces the session’s team on a team-scoped table', async () => {
    const { sb, of } = pgrst(tables);
    const e = await queryTeamData(sb, ctx, parse({ table: 'golf_events', columns: ['title', 'start_time'] }), on);
    expect(eqs(of('golf_events'))).toContainEqual(['team_id', 'team-1']);
    expect((e.detail as { rows: Array<{ title: string }> }).rows.map((r) => r.title)).toEqual(['Range']);
  });

  it('lets a player_id filter only narrow the roster: an id off the roster is dropped, never queried', async () => {
    const { sb, of } = pgrst(tables);
    await queryTeamData(sb, ctx, parse({ table: 'golf_rounds', columns: ['total_score'], filters: [{ column: 'player_id', op: 'in', value: ['p2', 'other'] }] }), on);
    expect(of('golf_rounds').find((c) => c.method === 'in')!.args).toEqual(['player_id', ['p2']]);
    const none = pgrst(tables);
    const e = await queryTeamData(none.sb, ctx, parse({ table: 'golf_rounds', columns: ['total_score'], filters: [{ column: 'player_id', op: 'eq', value: 'other' }] }), on);
    expect(e.coverage).toBe('empty');
    expect(none.calls).toEqual([]);
  });

  it('refuses a team_id filter, an operator other than eq/in on player_id, and an empty roster reads nothing', async () => {
    const { sb, calls } = pgrst(tables);
    expect((await queryTeamData(sb, ctx, parse({ table: 'golf_events', columns: ['title'], filters: [{ column: 'team_id', op: 'eq', value: 'team-2' }] }), on)).coverage).toBe('unavailable');
    expect((await queryTeamData(sb, ctx, parse({ table: 'golf_rounds', columns: ['total_score'], filters: [{ column: 'player_id', op: 'gte', value: 'a' }] }), on)).coverage).toBe('unavailable');
    const none = await queryTeamData(sb, { ...ctx, roster: [] }, parse({ table: 'golf_rounds', columns: ['total_score'] }), on);
    expect(none.coverage).toBe('empty');
    expect(calls).toEqual([]);
  });

  it('never uses the service client (the module’s mock throws if it is touched)', async () => {
    const { sb } = pgrst(tables);
    await expect(queryTeamData(sb, ctx, parse({ table: 'golf_events', columns: ['title'] }), on)).resolves.toBeDefined();
  });

  it('merges slices by an order column that was not asked for, and does not return it', async () => {
    const roster = Array.from({ length: 250 }, (_, i) => person(`p${i}`, `Player ${i}`));
    const many: Tables = { golf_rounds: { rows: [{ player_id: 'p0', round_date: '2026-10-01', total_score: 70, is_test: false }, { player_id: 'p240', round_date: '2026-10-09', total_score: 71, is_test: false }] } };
    const { sb, of } = pgrst(many);
    const e = await queryTeamData(sb, { ...ctx, roster }, parse({ table: 'golf_rounds', columns: ['total_score'], limit: 5 }), on);
    expect(of('golf_rounds').find((c) => c.method === 'select')!.args[0]).toBe('total_score, player_id, round_date');
    const rows = (e.detail as { rows: Array<Record<string, unknown>> }).rows;
    expect(rows.map((r) => r.total_score)).toEqual([71, 70]);
    expect(rows.every((r) => !('round_date' in r))).toBe(true);
  });

  it('runs a big roster in slices of 200 and merges them in the requested order', async () => {
    const roster = Array.from({ length: 450 }, (_, i) => person(`p${i}`, `Player ${i}`));
    const many: Tables = { golf_rounds: { rows: [{ player_id: 'p0', round_date: '2026-10-01', total_score: 70, is_test: false }, { player_id: 'p250', round_date: '2026-10-09', total_score: 71, is_test: false }, { player_id: 'p449', round_date: '2026-10-05', total_score: 72, is_test: false }] } };
    const { sb, of } = pgrst(many);
    const e = await queryTeamData(sb, { ...ctx, roster }, parse({ table: 'golf_rounds', columns: ['round_date', 'total_score'], limit: 2 }), on);
    expect(of('golf_rounds').filter((c) => c.method === 'in').map((c) => (c.args[1] as string[]).length)).toEqual([200, 200, 50]);
    expect((e.detail as { rows: Array<{ round_date: string }> }).rows.map((r) => r.round_date)).toEqual(['2026-10-09', '2026-10-05']);
  });
});

describe('query_team_data validation', () => {
  it('refuses a column that is not on the allowlist and says which are', async () => {
    const { sb, calls } = pgrst(tables);
    const e = await queryTeamData(sb, ctx, parse({ table: 'golf_rounds', columns: ['notes'] }), on);
    expect(e.coverage).toBe('unavailable');
    expect((e.detail as { allowed_columns: string[] }).allowed_columns).toContain('total_score');
    expect((e.detail as { allowed_columns: string[] }).allowed_columns).not.toContain('notes');
    expect(calls).toEqual([]);
  });

  it('refuses a filter or an order on a column that is not allowlisted', async () => {
    const { sb, calls } = pgrst(tables);
    expect((await queryTeamData(sb, ctx, parse({ table: 'golf_rounds', columns: ['total_score'], filters: [{ column: 'notes', op: 'eq', value: 'x' }] }), on)).coverage).toBe('unavailable');
    expect((await queryTeamData(sb, ctx, parse({ table: 'golf_rounds', columns: ['total_score'], order: { column: 'notes' } }), on)).coverage).toBe('unavailable');
    expect(calls).toEqual([]);
  });

  it('rejects, at the schema, a table off the list, an operator off the list, too many filters and a limit over 200', () => {
    expect(() => parse({ table: 'golf_players', columns: ['email'] })).toThrow();
    expect(() => parse({ table: 'golf_messages', columns: ['body'] })).toThrow();
    expect(() => parse({ table: 'golf_rounds', columns: ['total_score'], filters: [{ column: 'total_score', op: 'like', value: '7%' }] })).toThrow();
    expect(() => parse({ table: 'golf_rounds', columns: ['total_score'], filters: Array.from({ length: 9 }, () => ({ column: 'total_score', op: 'eq', value: 1 })) })).toThrow();
    expect(() => parse({ table: 'golf_rounds', columns: ['total_score'], limit: QUERY_ROW_LIMIT + 1 })).toThrow();
    expect(parse({ table: 'golf_rounds', columns: ['total_score'] }).limit).toBe(50);
  });

  it('checks the shape of each operator’s value', async () => {
    const { sb } = pgrst(tables);
    const bad = (filters: unknown[]) => queryTeamData(sb, ctx, parse({ table: 'golf_rounds', columns: ['total_score'], filters }), on);
    expect((await bad([{ column: 'round_type', op: 'in', value: 'practice' }])).coverage).toBe('unavailable');
    expect((await bad([{ column: 'round_type', op: 'in', value: [] }])).coverage).toBe('unavailable');
    expect((await bad([{ column: 'total_score', op: 'is', value: 7 }])).coverage).toBe('unavailable');
    expect((await bad([{ column: 'total_score', op: 'gte', value: ['a'] }])).coverage).toBe('unavailable');
    expect((await bad([{ column: 'round_type', op: 'in', value: ['practice', 'qualifier'] }])).coverage).not.toBe('unavailable');
  });

  it('applies eq, in, gte, lte and is to the columns asked, with the order and the cap', async () => {
    const { sb, of } = pgrst(tables);
    await queryTeamData(sb, ctx, parse({ table: 'golf_rounds', columns: ['total_score'], filters: [{ column: 'round_type', op: 'eq', value: 'tournament' }, { column: 'round_date', op: 'gte', value: '2026-10-01' }, { column: 'round_date', op: 'lte', value: '2026-10-31' }, { column: 'total_score', op: 'is', value: null }, { column: 'round_type', op: 'in', value: ['tournament'] }], order: { column: 'total_score', ascending: true }, limit: 25 }), on);
    const calls = of('golf_rounds').map((c) => `${c.method}:${JSON.stringify(c.args)}`);
    expect(calls).toEqual(expect.arrayContaining(['eq:["round_type","tournament"]', 'gte:["round_date","2026-10-01"]', 'lte:["round_date","2026-10-31"]', 'is:["total_score",null]', 'order:["total_score",{"ascending":true}]', 'limit:[25]']));
  });

  it('keeps the tournament tables behind golf_tournaments_v1', async () => {
    const { sb, calls } = pgrst(tables);
    const off = await queryTeamData(sb, ctx, parse({ table: 'golf_tournaments', columns: ['name'] }), { tournamentsOn: false });
    expect(off.coverage).toBe('unavailable');
    expect(calls).toEqual([]);
    expect((await queryTeamData(sb, ctx, parse({ table: 'golf_tournaments', columns: ['name'] }), on)).coverage).toBe('complete');
    expect(describeQueryTables({ tournamentsOn: false })).not.toContain('golf_tournaments');
    expect(describeQueryTables({ tournamentsOn: true })).toContain('golf_tournaments');
  });
});

describe('query_team_data results', () => {
  it('marks a full page partial and an empty one empty, and says unavailable for a failed read', async () => {
    const full = pgrst(tables);
    const e = await queryTeamData(full.sb, ctx, parse({ table: 'golf_rounds', columns: ['total_score'], limit: 1 }), on);
    expect(e.coverage).toBe('partial');
    expect(e.coverage_note).toMatch(/first 1 of 2 rows/);
    // A page that is exactly full is not cut: the server's own count says so.
    expect((await queryTeamData(pgrst(tables).sb, ctx, parse({ table: 'golf_rounds', columns: ['total_score'], limit: 2 }), on)).coverage).toBe('complete');
    expect((await queryTeamData(pgrst({ golf_rounds: { rows: [] } }).sb, ctx, parse({ table: 'golf_rounds', columns: ['total_score'] }), on)).coverage).toBe('empty');
    expect((await queryTeamData(pgrst({ golf_rounds: { error: { message: 'down' } } }).sb, ctx, parse({ table: 'golf_rounds', columns: ['total_score'] }), on)).coverage).toBe('unavailable');
  });

  it('does not name a table in its summary', async () => {
    const e = await queryTeamData(pgrst(tables).sb, ctx, parse({ table: 'golf_rounds', columns: ['total_score'] }), on);
    expect(e.summary).toBe('2 rows of rounds.');
  });

});
