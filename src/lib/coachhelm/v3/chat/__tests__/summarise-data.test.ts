import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { CoachChatContext } from '../context';
import { auditNumericClaims, collectEnvelopeDates, collectEnvelopeNumbers, ToolEnvelope } from '../provenance';
import { competitionRank, summariseData, type SummariseInput } from '../summarise-data';
import { queryTeamData } from '../team-query';

// `summarise_data`: counts, places, averages, joins and differences worked out by the server over rows the turn has read, so each
// is a measurement with a ref and not a number the model made up in its head.

const person = (id: string, name: string) => ({ id, name, first_name: name, last_name: null, graduation_year: null });
const ctx = { coach_id: 'c', user_id: 'u', team_id: 'team-1', team_name: 'Demo University Golf', timezone: 'America/New_York', roster: [person('p-cole', 'Cole Bennett'), person('p-owen', 'Owen Carter'), person('p-ethan', 'Ethan Park')] } as CoachChatContext;

const env = (detail: unknown, over: Partial<ToolEnvelope> = {}): ToolEnvelope => ({ summary: 'x', measurements: [], series: [], detail, coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z', ...over });

const round = (id: string, player: string, date: string, score: number | null, status = 'completed') => ({ id, player, player_id: `p-${player.split(' ')[0]!.toLowerCase()}`, status, round_date: date, round_type: 'tournament', course_name: 'Springfield', total_score: score });
const rounds = env({
  kind: 'team_data',
  rows: [
    round('r1', 'Cole Bennett', '2026-10-21', 74),
    round('r2', 'Cole Bennett', '2026-10-21', 77),
    round('r3', 'Cole Bennett', '2026-10-21', 73),
    round('r4', 'Owen Carter', '2026-09-26', 70),
    round('r5', 'Owen Carter', '2026-08-30', 72),
    round('r6', 'Cole Bennett', '2026-10-22', null, 'in_progress'),
  ],
});
const stat = (round_id: string, three_putts: number, total_putts: number) => ({ round_id, player: 'x', three_putts, total_putts });
const stats = env({ kind: 'team_data', rows: [stat('r1', 3, 37), stat('r2', 3, 34), stat('r3', 1, 30), stat('r4', 4, 33), stat('r5', 3, 31)] });
const evidence = new Map<string, ToolEnvelope>([['e1', rounds], ['e2', stats]]);

const run = (input: SummariseInput, deps: Parameters<typeof summariseData>[2] = { evidence }) => summariseData(ctx, input, deps);
const value = (e: ToolEnvelope, id: string) => e.measurements.find((m) => m.metric_id === `summary:${id}`)?.value;

describe('count, sum, mean, min, max', () => {
  it('works them out over the rows, with a where', async () => {
    const e = await run({ source: { ref: 'e1' }, ops: [{ op: 'count', id: 'all' }, { op: 'count', id: 'done', where: [{ field: 'status', op: 'eq', value: 'completed' }] }, { op: 'sum', id: 'total', field: 'total_score' }, { op: 'mean', id: 'avg', field: 'total_score' }, { op: 'min', id: 'low', field: 'total_score' }, { op: 'max', id: 'high', field: 'total_score' }] });
    expect(['all', 'done', 'total', 'avg', 'low', 'high'].map((id) => value(e, id))).toEqual([6, 5, 366, 73.2, 70, 77]);
    // The result is a normal envelope: it parses, carries the window of the dates it read, and says what it rests on.
    expect(() => ToolEnvelope.parse(e)).not.toThrow();
    expect(e.measurements.find((m) => m.metric_id === 'summary:avg')).toMatchObject({ unit: 'score', sample_size: 5, window_start: '2026-08-30', window_end: '2026-10-22', source: 'summarised reads' });
    expect(e.coverage).toBe('complete');
  });
  it('counts by value, and a mean by player is one figure per player, as that player’s', async () => {
    const e = await run({ source: { ref: 'e1' }, ops: [{ op: 'count_by', id: 'status', field: 'status' }, { op: 'mean', id: 'avg', field: 'total_score', by: 'player' }] });
    expect(value(e, 'status:completed')).toBe(5);
    expect(value(e, 'status:in_progress')).toBe(1);
    const cole = e.measurements.find((m) => m.metric_id === 'summary:avg:cole_bennett')!;
    expect(cole).toMatchObject({ value: 74.67, entity: { kind: 'player', id: 'p-cole', label: 'Cole Bennett' } });
  });
  it('a count pinned to one player is that player’s', async () => {
    const e = await run({ source: { ref: 'e1' }, ops: [{ op: 'count', id: 'cole', where: [{ field: 'player_id', op: 'eq', value: 'p-cole' }] }] });
    expect(e.measurements[0]).toMatchObject({ value: 4, entity: { kind: 'player', id: 'p-cole' } });
  });
  it('no rows is no figure, not zero', async () => {
    const e = await run({ source: { ref: 'e1' }, ops: [{ op: 'mean', id: 'm', field: 'total_score', where: [{ field: 'status', op: 'eq', value: 'cancelled' }] }] });
    expect(e.measurements[0]).toMatchObject({ value: null, coverage: 'empty' });
    expect(e.coverage).toBe('empty');
  });
});

describe('rank', () => {
  it('shares a place on a tie and states the number of players', () => {
    expect(competitionRank([-1, -2, -2, -3], -2, 'high_first')).toBe(2);
    expect(competitionRank([-1, -2, -2, -3], -3, 'high_first')).toBe(4);
    expect(competitionRank([-1, -2, -2, -3], -1, 'low_first')).toBe(4);
  });
  const ranking = env(null, {
    measurements: [-0.97, -1.54, -1.54, -2.44, -4.16].map((v, i) => ({ metric_id: 'sg_approach', metric_label: 'Strokes gained approach', unit: 'strokes' as const, value: v, entity: { kind: 'player' as const, id: `p${i}`, label: `Player ${i}` }, window_start: null, window_end: null, sample_size: 8, sample_unit: 'rounds' as const, as_of: '2026-11-08T00:00:00.000Z', coverage: 'complete' as const, coverage_note: null, source: 'rounds', method: 'm', denominator: null, benchmark: null, direction: 'higher_better' as const })),
  });
  it('places a player among the ranked: "5th of 5", with their value', async () => {
    const e = await run({ source: { ref: 'e9', list: 'measurements' }, ops: [{ op: 'rank', id: 'place', field: 'value', subject: { field: 'player_id', equals: 'p4' }, order: 'high_first' }] }, { evidence: new Map([['e9', ranking]]) });
    expect(e.measurements[0]).toMatchObject({ metric_id: 'summary:place', value: 5, denominator: 5, sample_size: 5 });
    expect(value(e, 'place_value')).toBe(-4.16);
    const tied = await run({ source: { ref: 'e9', list: 'measurements' }, ops: [{ op: 'rank', id: 'place', field: 'value', subject: { field: 'player_id', equals: 'p2' }, order: 'high_first' }] }, { evidence: new Map([['e9', ranking]]) });
    expect(value(tied, 'place')).toBe(2);
  });
});

describe('join, list', () => {
  it('joins stat lines to rounds on round_id = id: the three-putt question', async () => {
    const e = await run({
      source: { ref: 'e2' },
      join: { with: { ref: 'e1' }, left_key: 'round_id', right_key: 'id', keep: 'matched' },
      where: [{ field: 'three_putts', op: 'gte', value: 3 }, { field: 'round_date', op: 'gte', value: '2026-09-01' }],
      ops: [{ op: 'count', id: 'matching' }, { op: 'list', id: 'which', fields: ['player', 'round_date', 'course_name', 'total_score', 'three_putts'], order_by: 'round_date', descending: true }],
    });
    // r1 and r2 (Cole, Oct 21, 74 and 77); r4 is Sept 26 with 4 three-putts; r5 is August; r3 has one.
    expect(value(e, 'matching')).toBe(3);
    expect((e.detail as { rows: Array<Record<string, unknown>> }).rows.map((r) => r.total_score)).toEqual([74, 77, 70]);
    expect(e.detail).toMatchObject({ matching_rows: 3 });
    // A field both reads have keeps the left one (the stat line's `player` here); the right one is named right_player.
    const both = await run({ source: { ref: 'e2' }, join: { with: { ref: 'e1' }, left_key: 'round_id', right_key: 'id', keep: 'matched' }, ops: [{ op: 'list', fields: ['player', 'right_player'] }] });
    expect((both.detail as { rows: Array<Record<string, unknown>> }).rows[0]).toEqual({ player: 'x', right_player: 'Cole Bennett' });
  });
  it('a left join keeps the rows that match nothing', async () => {
    const e = await run({ source: { ref: 'e1' }, join: { with: { ref: 'e2' }, left_key: 'id', right_key: 'round_id', keep: 'all_left' }, ops: [{ op: 'count', id: 'n' }, { op: 'count', id: 'nostat', where: [{ field: 'three_putts', op: 'is_null' }] }] });
    expect([value(e, 'n'), value(e, 'nostat')]).toEqual([6, 1]);
  });
});

describe('difference and ratio', () => {
  const read = env(null, { measurements: ['sg_approach'].flatMap((metric_id) => [{ metric_id, metric_label: 'Strokes gained approach', unit: 'strokes' as const, value: -4.16, entity: { kind: 'player' as const, id: 'p-owen', label: 'Owen Carter' }, window_start: '2026-06-09', window_end: '2026-09-26', sample_size: 8, sample_unit: 'rounds' as const, as_of: '2026-11-08T00:00:00.000Z', coverage: 'complete' as const, coverage_note: null, source: 'rounds', method: 'm', denominator: null, benchmark: null, direction: 'higher_better' as const }, { metric_id, metric_label: 'Strokes gained approach', unit: 'strokes' as const, value: -2.33, entity: { kind: 'team' as const, id: 'team-1', label: 'Demo University Golf' }, window_start: '2026-06-09', window_end: '2026-09-26', sample_size: 7, sample_unit: 'rounds' as const, as_of: '2026-11-08T00:00:00.000Z', coverage: 'complete' as const, coverage_note: null, source: 'rounds', method: 'm', denominator: null, benchmark: null, direction: 'higher_better' as const }]) });
  it('subtracts two figures of a read, and takes the first one’s subject and window', async () => {
    const e = await run({ ops: [{ op: 'difference', id: 'gap', a: { ref: 'e5', metric_id: 'sg_approach', subject: 'p-owen' }, b: { ref: 'e5', metric_id: 'sg_approach', subject: 'team' } }, { op: 'ratio', id: 'times', a: { op: 'gap' }, b: { ref: 'e5', metric_id: 'sg_approach', subject: 'team' } }] }, { evidence: new Map([['e5', read]]) });
    expect(e.measurements[0]).toMatchObject({ metric_id: 'summary:gap', value: -1.83, unit: 'strokes', entity: { id: 'p-owen' }, window_start: '2026-06-09', window_end: '2026-09-26' });
    expect(value(e, 'times')).toBe(0.79);
  });
  it('asks which one when a figure is ambiguous, and refuses a read it was not given', async () => {
    const ambiguous = await run({ ops: [{ op: 'difference', a: { ref: 'e5', metric_id: 'sg_approach' }, b: { ref: 'e5', metric_id: 'sg_approach', subject: 'team' } }] }, { evidence: new Map([['e5', read]]) });
    expect(ambiguous.coverage).toBe('unavailable');
    expect(ambiguous.coverage_note).toMatch(/name the subject/);
    const unknown = await run({ ops: [{ op: 'difference', a: { ref: 'e7', metric_id: 'x' }, b: { ref: 'e7', metric_id: 'x' } }] });
    expect(unknown.coverage_note).toMatch(/No read named e7/);
  });
});

describe('what it refuses', () => {
  it('a field the rows do not have, naming the ones they do', async () => {
    const e = await run({ source: { ref: 'e1' }, ops: [{ op: 'sum', field: 'not_a_column' }] });
    expect(e.coverage).toBe('unavailable');
    expect(e.coverage_note).toMatch(/no field "not_a_column".*status/);
  });
  it('a read that is not this turn’s, and rows with no source', async () => {
    expect((await run({ source: { ref: 'e9' }, ops: [{ op: 'count' }] })).coverage_note).toMatch(/No read named e9/);
    expect((await run({ ops: [{ op: 'count' }] })).coverage_note).toMatch(/Name the rows/);
  });
  it('a query when it is a player (no reader), and a column the allowlist does not hold when it is a coach', async () => {
    expect((await run({ source: { query: { table: 'golf_rounds', columns: ['total_score'], filters: [], limit: 5 } }, ops: [{ op: 'count' }] })).coverage_note).toMatch(/cannot run a query/);
    const sb = { from: vi.fn() } as never;
    const forbidden = await run({ source: { query: { table: 'golf_rounds', columns: ['round_notes'], filters: [], limit: 5 } }, ops: [{ op: 'count' }] }, { evidence, query: (spec) => queryTeamData(sb, ctx, spec, { tournamentsOn: false }) });
    expect(forbidden.coverage).toBe('unavailable');
    expect(forbidden.coverage_note).toMatch(/not a column you can read/);
    expect((sb as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });
  it('a query spec for a table that is not on the allowlist does not parse', async () => {
    const e = await run({ source: { query: { table: 'golf_players', columns: ['email'], filters: [], limit: 5 } as never }, ops: [{ op: 'count' }] });
    expect(e.coverage).toBe('unavailable');
  });
  it('a read that was cut short says so', async () => {
    const cut = env({ rows: [{ a: 1 }, { a: 2 }] }, { coverage: 'partial', coverage_note: 'Showing the first 2 rows.' });
    const e = await run({ source: { ref: 'e1' }, ops: [{ op: 'sum', field: 'a' }] }, { evidence: new Map([['e1', cut]]) });
    expect(e).toMatchObject({ coverage: 'partial', coverage_note: 'Showing the first 2 rows.' });
  });
});

describe('what the audit makes of a result', () => {
  const audit = (text: string, envelopes: ToolEnvelope[]) =>
    auditNumericClaims(text, envelopes.flatMap((e) => e.measurements), [], envelopes.flatMap((e) => collectEnvelopeNumbers(e)), envelopes.flatMap((e) => collectEnvelopeDates(e, 'America/New_York')), 'America/New_York', { players: ctx.roster.map((p) => ({ id: p.id, name: p.name })) }).map((c) => c.text);

  it('a derived number is evidence once it has been worked out, and not before', async () => {
    const out = await run({ source: { ref: 'e1' }, ops: [{ op: 'sum', id: 'total', field: 'total_score' }, { op: 'mean', id: 'avgscore', field: 'total_score' }] });
    expect(audit('Those five rounds add up to 366 strokes, an average of 73.2.', [rounds, out])).toEqual([]);
    // Without the call, the same sum and average are the model's own arithmetic: no read returns them.
    expect(audit('Those five rounds add up to 366 strokes, an average of 73.2.', [rounds])).toEqual(['366', '73.2']);
    // And a wrong one is no more evidence for having gone through the tool.
    expect(audit('Those five rounds add up to 367 strokes.', [rounds, out])).toEqual(['367']);
  });
});

// Staging, 2026-11-08 (conversation d1b3e917, 221a34d4): the model could not predict the join's field names, could not address the team
// average a ranking states, and a mean of strokes came back as a count.
describe('the names and units the model reaches for', () => {
  it('a join offers every right-hand field as right_<field>, and a field only the right has also by its own name', async () => {
    const join = { source: { ref: 'e2' }, join: { with: { ref: 'e1' }, left_key: 'round_id', right_key: 'id', keep: 'matched' as const } };
    const e = await run({ ...join, ops: [{ op: 'list', fields: ['three_putts', 'right_total_score', 'total_score', 'right_player', 'right_round_date', 'round_date'], limit: 1 }] });
    expect((e.detail as { rows: Array<Record<string, unknown>> }).rows[0]).toEqual({ three_putts: 3, right_total_score: 74, total_score: 74, right_player: 'Cole Bennett', right_round_date: '2026-10-21', round_date: '2026-10-21' });
    // "three_putts" is the stat line's own; the model's "right_three_putts" is no field, and the refusal says what to ask for.
    const wrong = await run({ ...join, ops: [{ op: 'list', fields: ['right_three_putts'] }] });
    expect(wrong.coverage).toBe('unavailable');
    expect(wrong.coverage_note).toMatch(/no field "right_three_putts"/);
    expect(wrong.coverage_note).toMatch(/three_putts/);
  });

  const player = (id: string, label: string, v: number | null, team: number | null) => ({ metric_id: 'sg_approach', metric_label: 'Strokes gained approach', unit: 'strokes' as const, value: v, entity: { kind: 'player' as const, id, label }, window_start: '2026-06-09', window_end: '2026-09-26', sample_size: 8, sample_unit: 'rounds' as const, as_of: '2026-11-08T00:00:00.000Z', coverage: 'complete' as const, coverage_note: null, source: 'rounds', method: 'm', denominator: null, benchmark: null, direction: 'higher_better' as const, comparisons: [{ kind: 'team' as const, label: 'Team average', value: team, place_of: 7, place_percent: null, place: null, note: null, missing_reason: null }] });
  const ranking = env({ metric_id: 'sg_approach' }, { measurements: [player('p-cole', 'Cole Bennett', -3.6, -2.33), player('p-owen', 'Owen Carter', -4.16, -2.33), player('p-ethan', 'Ethan Park', -4.4, -2.33)] });

  it('"team" on a ranking is the team average that read states beside the players, with its sample and method in words', async () => {
    const e = await run({ ops: [{ op: 'difference', id: 'gap', a: { ref: 'e1', metric_id: 'sg_approach', subject: 'p-owen' }, b: { ref: 'e1', metric_id: 'sg_approach', subject: 'team' } }] }, { evidence: new Map([['e1', ranking]]) });
    expect(e.measurements[0]).toMatchObject({ metric_id: 'summary:gap', value: -1.83, unit: 'strokes', entity: { id: 'p-owen' } });
    expect(e.coverage).toBe('complete');
  });
  it('a player can be named by name, and two different team averages in one read are refused, not guessed', async () => {
    const byName = await run({ ops: [{ op: 'difference', id: 'gap', a: { ref: 'e1', metric_id: 'sg_approach', subject: 'Owen Carter' }, b: { ref: 'e1', metric_id: 'sg_approach', subject: 'team' } }] }, { evidence: new Map([['e1', ranking]]) });
    expect(value(byName, 'gap')).toBe(-1.83);
    const mixed = env(null, { measurements: [player('p-cole', 'Cole Bennett', -3.6, -2.33), player('p-owen', 'Owen Carter', -4.16, -3.09)] });
    const refused = await run({ ops: [{ op: 'difference', a: { ref: 'e1', metric_id: 'sg_approach', subject: 'p-owen' }, b: { ref: 'e1', metric_id: 'sg_approach', subject: 'team' } }] }, { evidence: new Map([['e1', mixed]]) });
    expect(refused.coverage_note).toMatch(/more than one team average/);
    const none = await run({ ops: [{ op: 'difference', a: { ref: 'e1', metric_id: 'sg_approach', subject: 'p-owen' }, b: { ref: 'e1', metric_id: 'sg_approach', subject: 'team' } }] }, { evidence: new Map([['e1', env(null, { measurements: [player('p-owen', 'Owen Carter', -4.16, null)] })]]) });
    expect(none.coverage_note).toMatch(/states no team average/);
  });
  it('a read of measurements is a list with entity.id and entity.label, and a mean of strokes is in strokes', async () => {
    const e = await run({ source: { ref: 'e1', list: 'measurements' }, ops: [{ op: 'mean', id: 'avg', field: 'value' }, { op: 'rank', id: 'place', field: 'value', subject: { field: 'entity.id', equals: 'p-owen' }, order: 'high_first' }, { op: 'count', id: 'ethan', where: [{ field: 'entity.label', op: 'eq', value: 'Ethan Park' }] }] }, { evidence: new Map([['e1', ranking]]) });
    expect(e.measurements.find((m) => m.metric_id === 'summary:avg')).toMatchObject({ value: -4.05, unit: 'strokes', metric_label: "Average Strokes gained approach (average of 3 players' figures)" });
    expect(e.measurements.find((m) => m.metric_id === 'summary:place')).toMatchObject({ value: 2, denominator: 3 });
    expect(e.measurements.find((m) => m.metric_id === 'summary:place_value')).toMatchObject({ unit: 'strokes' });
    expect(value(e, 'ethan')).toBe(1);
    const lowest = await run({ source: { ref: 'e1', list: 'measurements' }, ops: [{ op: 'min', id: 'lo', field: 'value' }, { op: 'sum', id: 'tot', field: 'value' }] }, { evidence: new Map([['e1', ranking]]) });
    expect(lowest.measurements.map((m) => m.unit)).toEqual(['strokes', 'strokes']);
  });
});

describe('detail.sources', () => {
  it('names the reads a summary was worked out from: source, join and the figures of a difference', async () => {
    const e = await run({ source: { ref: 'e2' }, join: { with: { ref: 'e1' }, left_key: 'round_id', right_key: 'id', keep: 'matched' }, ops: [{ op: 'count', id: 'n' }] });
    expect((e.detail as { sources: string[] }).sources).toEqual(['e2', 'e1']);
    const read = env(null, { measurements: [] });
    const d = await run({ ops: [{ op: 'difference', a: { ref: 'e5', metric_id: 'x' }, b: { ref: 'e6', metric_id: 'x' } }] }, { evidence: new Map([['e5', read], ['e6', read]]) });
    expect(d.coverage_note).toMatch(/has no figure x/);
  });
  it('a result carries sources even for a difference of earlier ops', async () => {
    const read = env(null, { measurements: [{ metric_id: 'x', metric_label: 'X', unit: 'strokes' as const, value: 3, entity: { kind: 'player' as const, id: 'p-owen', label: 'Owen Carter' }, window_start: null, window_end: null, sample_size: 1, sample_unit: 'rounds' as const, as_of: '2026-11-08T00:00:00.000Z', coverage: 'complete' as const, coverage_note: null, source: 'rounds', method: 'm', denominator: null, benchmark: null, direction: null }] });
    const e = await run({ ops: [{ op: 'difference', id: 'd', a: { ref: 'e5', metric_id: 'x' }, b: { ref: 'e5', metric_id: 'x' } }] }, { evidence: new Map([['e5', read]]) });
    expect((e.detail as { sources: string[] }).sources).toEqual(['e5']);
  });
});
