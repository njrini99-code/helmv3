import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('the service client must not be used'); } }));

import { applyComparisons, benchmarkSource, getBenchmarks, getMetricDefinitions, levelFromDivision, STANDING_ID_BY_CHAT_ID, tourForGender } from '../benchmark-reads';
import { auditNumericClaims, collectEnvelopeNumbers, readFigure, type ToolEnvelope } from '../provenance';
import { person, pgrst, type Tables } from './pgrst-double';

const ctx: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Varsity', timezone: 'America/New_York', roster: [person('p1', 'Owen Carter'), person('p2', 'Cole Bennett'), person('p3', 'Dylan Reed'), person('p4', 'Ethan Park'), person('p5', 'Max Hill'), person('p6', 'Leo Marsh'), person('p7', 'Sam Cole')] };

const std = (tour: string, metric: string, v: Partial<Record<string, number | null>> = {}) => ({
  tour,
  metric_id: metric,
  season: '2024',
  display_label: metric,
  pga_tour_value: null,
  korn_ferry_value: null,
  div1_avg_value: null,
  div2_avg_value: null,
  div3_avg_value: null,
  hs_avg_value: null,
  pga_p25: null,
  pga_p50: null,
  pga_p75: null,
  source: `${tour} ${metric} source`,
  ...v,
});

const tables = (gender = 'mens', division: string | null = 'D3', orgDivision: string | null = null): Tables => ({
  golf_teams: { rows: [{ id: 'team-1', gender, organization_id: 'org-1' }] },
  organizations: { rows: [{ id: 'org-1', division: orgDivision }] },
  golf_team_seasons: { rows: division ? [{ team_id: 'team-1', season: '2026-27', division }, { team_id: 'team-1', season: '2024-25', division: 'd1' }] : [] },
  golf_pga_standards: {
    rows: [
      std('pga', 'gir_pct', { pga_tour_value: 66, div1_avg_value: 60, div3_avg_value: 50, hs_avg_value: 40, pga_p25: 62, pga_p50: 66, pga_p75: 72 }),
      std('lpga', 'gir_pct', { pga_tour_value: 70, div1_avg_value: 63 }),
      std('pga', 'sg_putting', { pga_tour_value: 0, pga_p25: -0.3, pga_p50: 0, pga_p75: 0.4 }),
      std('lpga', 'sg_putting', { pga_tour_value: 0 }),
      std('pga', 'sg_ott', { pga_tour_value: 0 }),
      std('pga', 'approach_proximity_50_125ft', { pga_tour_value: 18, div1_avg_value: 28 }),
      std('pga', 'putt_miss_bias_high_pct'),
      std('pga', 'scrambling_pct_sand', { pga_tour_value: 50, div1_avg_value: 40 }),
    ],
  },
  golf_metrics: {
    rows: [
      { metric_id: 'gir_pct', display_label: 'GIR %', unit: 'percent', direction: 'higher_better' },
      { metric_id: 'sg_putting', display_label: 'SG: Putting', unit: 'strokes', direction: 'higher_better' },
      { metric_id: 'approach_proximity_50_125ft', display_label: 'Approach Proximity 50-125 yd', unit: 'feet', direction: 'lower_better' },
      { metric_id: 'putt_miss_bias_high_pct', display_label: 'Putt Miss High %', unit: 'percent', direction: 'lower_better' },
    ],
  },
  // Each player's GIR over all recorded rounds (the stats cache): the team's window values. Mean 54.6; Owen is 3rd of 7 (higher is better).
  golf_player_stats_cache: {
    rows: [58.3, 71.9, 40, 50, 55, 62, 45].map((gir, i) => ({ player_id: `p${i + 1}`, rounds_played: 12, gir_percentage: gir, greens_hit: Math.round(gir * 2), greens_total: 200, updated_at: '2026-11-07T00:00:00Z' })),
  },
  golf_player_standing: {
    rows: [
      { player_id: 'p1', metric_id: 'gir_pct', player_value: 58.123, level_avg: 61.5, level_n: 70, level_pct: 30.4, team_avg: 57.2, team_n: 9, team_pct: 55.5, basis: null, computed_at: '2026-11-07T02:20:00+00:00' },
      { player_id: 'p1', metric_id: 'approach_proximity_50_125ft', player_value: 29, level_avg: 27, level_n: 70, level_pct: 40, team_avg: 30, team_n: 3, team_pct: 50, basis: 'on_green', computed_at: '2026-11-07T02:20:00+00:00' },
      { player_id: 'p2', metric_id: 'gir_pct', player_value: 71.9, level_avg: 61.5, level_n: 70, level_pct: 90, team_avg: 57.2, team_n: 9, team_pct: 99, basis: null, computed_at: '2026-11-07T02:20:00+00:00' },
    ],
  },
});

describe('tourForGender', () => {
  it('grades a women’s team against the LPGA, everyone else against the PGA Tour', () => {
    expect(tourForGender('womens')).toBe('lpga');
    expect(tourForGender('mens')).toBe('pga');
    expect(tourForGender(null)).toBe('pga');
  });
});

describe('levelFromDivision', () => {
  it('reads the divisions teams write, and nothing that has no published average', () => {
    expect(['d1', 'D1', 'Division I', 'div 1', '1'].map(levelFromDivision)).toEqual(['d1', 'd1', 'd1', 'd1', 'd1']);
    expect(['d2', 'Division II'].map(levelFromDivision)).toEqual(['d2', 'd2']);
    expect(['d3', 'Division III', 'DIII'].map(levelFromDivision)).toEqual(['d3', 'd3', 'd3']);
    expect([null, '', 'NAIA', 'JUCO'].map(levelFromDivision)).toEqual([null, null, null, null]);
  });

  it('reads what Settings, Team, Division lets a coach type ("NCAA D1" is its placeholder)', () => {
    expect(['NCAA D1', 'NCAA Division III', 'NCAA D-II', 'ncaa div. 2'].map(levelFromDivision)).toEqual(['d1', 'd3', 'd2', 'd2']);
    expect(['NJCAA Division I', 'NAIA Division II', 'Big Ten'].map(levelFromDivision)).toEqual([null, null, null]);
  });
});

describe('the team’s level source', () => {
  it('is the newest season row, else the program’s Division on Settings, Team, else not set', async () => {
    const season = pgrst(tables('mens', 'D2', 'NCAA D1'));
    expect(await benchmarkSource(season.sb, 'team-1', { ctx }).level()).toBe('d2');
    const org = pgrst(tables('mens', null, 'NCAA D1'));
    expect(await benchmarkSource(org.sb, 'team-1', { ctx }).level()).toBe('d1');
    expect(org.of('organizations').some((c) => c.method === 'select')).toBe(true);
    const none = pgrst(tables('mens', null, null));
    expect(await benchmarkSource(none.sb, 'team-1', { ctx }).level()).toBeNull();
    const naia = pgrst(tables('mens', null, 'NAIA'));
    expect(await benchmarkSource(naia.sb, 'team-1', { ctx }).level()).toBeNull();
  });
});

type Ref = { kind: string; label: string; value: number | null; place_percent: number | null; place: number | null; place_of: number | null; note: string | null; missing_reason: string | null };
type StandingRowOut = { metric_id: string; player_value: number; comparisons: Ref[]; gaps: Record<string, number | null> };
const standingOf = (e: ToolEnvelope) => (e.detail as { standing: { player: string; rows: StandingRowOut[] } }).standing;
const row = (e: ToolEnvelope, id: string) => standingOf(e).rows.find((r) => r.metric_id === id)!;
const kinds = (r: StandingRowOut) => r.comparisons.map((c) => c.kind);

describe('get_benchmarks (coach)', () => {
  it('reads a player against three references, level first, team second, Tour third, each with where the player sits', async () => {
    const { sb } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1', { ctx }), { metric_ids: ['gir_pct'], player_id: 'p1' }, { role: 'coach' });
    const r = row(e, 'gir_pct');
    expect(kinds(r)).toEqual(['level', 'team', 'tour']);
    expect(r.comparisons).toEqual([
      { kind: 'level', label: 'Division III average', value: 50, place_percent: 30, place: null, place_of: 70, note: 'Place is among college players on helm over all recorded rounds.', missing_reason: null },
      // The team is the roster's values over the figure's own window: here the stats cache's (all recorded rounds), mean 54.6, Owen 3rd of 7.
      { kind: 'team', label: 'Team average of the players’ figures, all rounds on record', value: 54.6, place_percent: null, place: 3, place_of: 7, note: 'Rank 3 of 7 players with a figure; 1 is best.', missing_reason: null },
      { kind: 'tour', label: 'PGA Tour', value: 66, place_percent: null, place: null, place_of: null, note: null, missing_reason: null },
    ]);
    expect(r.gaps).toEqual({ vs_level: 8.3, vs_team: 3.7, vs_tour: -7.7 });
    // The row says the window its figures are over; the standing's own all-rounds figure is kept apart.
    expect(r).toMatchObject({ window: 'cache', player_value: 58.3, standing_value: 58.12 });
    expect(standingOf(e).player).toBe('Owen Carter');
    // The teammate’s row is not in it.
    expect(JSON.stringify(e.detail)).not.toContain('71.9');
  });

  it('lists the team’s level and the Tour by default (only the Tour, and says the level is not set, with no division), and the levels asked for', async () => {
    const { sb } = pgrst(tables());
    const dflt = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1', { ctx }), { metric_ids: ['gir_pct'] }, { role: 'coach' });
    const d = dflt.detail as { team_level: string; benchmarks: Array<{ levels: Record<string, { label: string; value: number }>; tour_percentiles?: unknown }> };
    expect(d.team_level).toBe('Division III average');
    expect(Object.keys(d.benchmarks[0]!.levels)).toEqual(['d3', 'pga']);
    expect(d.benchmarks[0]!.levels.pga).toEqual({ label: 'PGA Tour', value: 66 });
    expect(d.benchmarks[0]!.tour_percentiles).toEqual({ p25: 62, p50: 66, p75: 72 });
    const none = pgrst(tables('mens', null));
    const e = await getBenchmarks(none.sb, ctx, benchmarkSource(none.sb, 'team-1', { ctx }), { metric_ids: ['gir_pct'] }, { role: 'coach' });
    expect(Object.keys((e.detail as { benchmarks: Array<{ levels: object }> }).benchmarks[0]!.levels)).toEqual(['pga']);
    expect((e.detail as { team_level: unknown }).team_level).toBeNull();
    expect(e.coverage_note).toMatch(/Level not set/);
    expect(e.coverage_note).toMatch(/Settings, Team, Division/);
    const asked = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1', { ctx }), { metric_ids: ['gir_pct'], levels: ['pga', 'd1', 'd3', 'hs'] }, { role: 'coach' });
    const gir = (asked.detail as { benchmarks: Array<{ levels: Record<string, { value: number; label: string }>; source: string }> }).benchmarks[0]!;
    expect(gir.levels).toMatchObject({ pga: { value: 66 }, d1: { value: 60 }, d3: { value: 50 }, hs: { value: 40 } });
    expect(gir.source).toBe('pga gir_pct source');
  });

  it('says the level is not set when no division is on record, and still gives the team and the Tour; a women’s team gets the LPGA', async () => {
    const mens = pgrst(tables('mens', null));
    const m = row(await getBenchmarks(mens.sb, ctx, benchmarkSource(mens.sb, 'team-1', { ctx }), { metric_ids: ['gir_pct'], player_id: 'p1' }, { role: 'coach' }), 'gir_pct');
    expect(kinds(m)).toEqual(['level', 'team', 'tour']);
    expect(m.comparisons[0]).toMatchObject({ kind: 'level', value: null, missing_reason: 'not set' });
    expect(m.comparisons[0]!.note).toMatch(/Level not set.*Settings, Team, Division/);
    expect(m.comparisons[1]).toMatchObject({ kind: 'team', value: 54.6, place: 3, place_of: 7 });
    expect(m.comparisons[2]).toMatchObject({ kind: 'tour', value: 66 });
    expect(m.gaps).toEqual({ vs_level: null, vs_team: 3.7, vs_tour: -7.7 });
    const womens = pgrst(tables('womens', null));
    const w = row(await getBenchmarks(womens.sb, ctx, benchmarkSource(womens.sb, 'team-1', { ctx }), { metric_ids: ['gir_pct'], player_id: 'p1' }, { role: 'coach' }), 'gir_pct');
    expect(w.comparisons[2]).toMatchObject({ kind: 'tour', label: 'LPGA Tour', value: 70 });
    expect(womens.of('golf_pga_standards').some((c) => c.method === 'eq' && c.args[0] === 'tour' && c.args[1] === 'lpga')).toBe(true);
  });

  it('takes the level from Settings, Team, Division when the season rows have none', async () => {
    const { sb } = pgrst(tables('mens', null, 'NCAA D1'));
    const r = row(await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1', { ctx }), { metric_ids: ['gir_pct'], player_id: 'p1' }, { role: 'coach' }), 'gir_pct');
    expect(r.comparisons[0]).toMatchObject({ kind: 'level', label: 'Division I average', value: 60 });
  });

  it('lists a missing reference with its reason, never drops it, and never fills it with another', async () => {
    const t = tables();
    t.golf_player_standing!.rows!.push({ player_id: 'p1', metric_id: 'sg_putting', player_value: -0.4, level_avg: null, level_n: 0, level_pct: null, team_avg: 0.1, team_n: 2, team_pct: null, basis: null, computed_at: '2026-11-07T02:20:00+00:00' });
    const { sb } = pgrst(t);
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1', { ctx }), { metric_ids: ['sg_putting', 'approach_proximity_50_125ft'], player_id: 'p1' }, { role: 'coach' });
    const sg = row(e, 'sg_putting');
    expect(kinds(sg)).toEqual(['level', 'team', 'tour']);
    expect(sg.comparisons[0]).toMatchObject({ kind: 'level', value: null, missing_reason: 'no college figure' });
    expect(sg.comparisons[0]!.note).toMatch(/no college figure/i);
    expect(sg.comparisons[1]).toMatchObject({ kind: 'team', value: null, missing_reason: 'fewer than 5 players' });
    expect(sg.comparisons[1]!.note).toMatch(/Fewer than 5 players/);
    expect(sg.comparisons[2]).toMatchObject({ kind: 'tour', value: 0 });
    expect(sg.gaps).toEqual({ vs_level: null, vs_team: null, vs_tour: -0.4 });
    // On-green proximity is not measured the way the Tour's is: the Tour is listed as not compared, the level (the cohort here) is there.
    const ap = row(e, 'approach_proximity_50_125ft');
    expect(ap.comparisons[2]).toMatchObject({ kind: 'tour', value: null });
    expect(ap.comparisons[2]!.note).toMatch(/not measured the way/);
    expect(ap.comparisons[2]!.missing_reason).toBe('not compared');
  });

  it('claims no Tour when the team’s tour cannot be read, and refuses a player off the roster before any query', async () => {
    const { sb } = pgrst({ ...tables(), golf_teams: { error: { message: 'down' } } });
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1', { ctx }), { metric_ids: ['gir_pct'] }, { role: 'coach' });
    expect(e.coverage).toBe('unavailable');
    expect(e.detail).toBeUndefined();
    const other = pgrst(tables());
    await expect(getBenchmarks(other.sb, ctx, benchmarkSource(other.sb, 'team-1', { ctx }), { metric_ids: ['gir_pct'], player_id: 'stranger' }, { role: 'coach' })).rejects.toMatchObject({ status: 403 });
    expect(other.of('golf_player_standing')).toEqual([]);
  });

  it('maps Ask’s own metric names to the standards’ and reports ones with no benchmark', async () => {
    expect(STANDING_ID_BY_CHAT_ID('sg_tee')).toBe('sg_ott');
    expect(STANDING_ID_BY_CHAT_ID('sand_save_pct')).toBe('scrambling_pct_sand');
    expect(STANDING_ID_BY_CHAT_ID('putts_per_round')).toBeNull();
    const { sb } = pgrst(tables());
    expect((await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1', { ctx }), { metric_ids: ['putts_per_round'] }, { role: 'coach' })).coverage).toBe('empty');
  });

  it('marks a metric with no published value at the level asked as partial', async () => {
    const { sb } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1', { ctx }), { metric_ids: ['putt_miss_bias_high_pct'], levels: ['pga', 'd1'] }, { role: 'coach' });
    expect(e.coverage).toBe('partial');
    expect(e.coverage_note).toMatch(/No published value/);
  });
});

describe('get_benchmarks (player)', () => {
  it('reads the session’s own standing against the same three references, whatever the input names, and shows no teammate', async () => {
    const { sb, of } = pgrst(tables());
    const solo = { ...ctx, roster: [person('p1', 'Owen Carter')] };
    const e = await getBenchmarks(sb, solo, benchmarkSource(sb, 'team-1', { ctx: solo, role: 'player' }), { metric_ids: ['gir_pct'], player_id: 'p2' }, { role: 'player', playerId: 'p1' });
    const wire = JSON.stringify(e);
    expect(of('golf_player_standing').filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([['player_id', 'p1']]);
    expect(wire).not.toContain('"player_id":"p2"');
    expect(wire).not.toContain('Cole Bennett');
    expect(wire).not.toContain('71.9');
    expect(standingOf(e).player).toBe('You');
    const r = row(e, 'gir_pct');
    expect(kinds(r)).toEqual(['level', 'team', 'tour']);
    // A player's team figure is the standing's, over all recorded rounds (a player cannot read teammates' windowed figures), with a share, not a rank.
    expect(r.comparisons[1]).toMatchObject({ label: 'Team average over all recorded rounds', value: 57.2, place_percent: 56, place: null, place_of: 9 });
  });
});

describe('benchmarks in the audit', () => {
  const named = [{ id: 'p1', name: 'Owen Carter' }];
  const audit = (e: ToolEnvelope, text: string) => auditNumericClaims(text, e.measurements, e.series, collectEnvelopeNumbers(e), [], 'America/New_York', { players: named }).map((c) => c.value);

  it('grounds each of the three, and the gap to each, in a sentence that names its source', async () => {
    const { sb } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1', { ctx }), { metric_ids: ['gir_pct'], player_id: 'p1' }, { role: 'coach' });
    expect(audit(e, 'Owen hits 58.3% of greens, 8.3 above the Division III average of 50%, 3.7 above the team average of 54.6%, and 7.7 behind the 66% PGA Tour mark.')).toEqual([]);
    expect(audit(e, 'He is ahead of 30% of 70 college players at his level.')).toEqual([]);
  });

  it('refuses a level or Tour figure with no source named, and one no read returned', async () => {
    const { sb } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1', { ctx }), { metric_ids: ['gir_pct'], player_id: 'p1' }, { role: 'coach' });
    expect(audit(e, 'Owen hits 58.12% of greens, and the team hits 50%.')).toEqual([50]);
    expect(audit(e, 'The Division III average is 37%.')).toEqual([37]);
  });

  it('binds each benchmark to its own metric: a Tour GIR does not ground a number in a putting sentence', async () => {
    const { sb } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1', { ctx }), { metric_ids: ['gir_pct', 'sg_putting', 'sand_save_pct'], levels: ['pga', 'd1'], player_id: 'p1' }, { role: 'coach' });
    expect(audit(e, 'The PGA Tour hits 66% of greens in regulation.')).toEqual([]);
    expect(audit(e, 'Owen’s strokes gained putting is 66.')).toEqual([66]);
    expect(audit(e, 'The PGA Tour saves 50% of its bunker shots.')).toEqual([]);
    expect(audit(e, 'The Division I average for sand saves is 40%.')).toEqual([]);
    expect(audit(e, 'Owen putts to 50% inside ten feet.')).toEqual([50]);
  });
});

describe('applyComparisons', () => {
  const base = (over: Partial<ToolEnvelope>): ToolEnvelope => ({ summary: 'ok', measurements: [], series: [], detail: { window: 'cache' }, coverage: 'complete', coverage_note: null, as_of: '2026-11-07T00:00:00Z', ...over });
  const fig = (metric_id: string, kind: 'player' | 'team' | 'round' = 'player', id = 'p1', value = 58.3) => readFigure({ metric_id, metric_label: metric_id, unit: 'percent', value, entity: { kind, id: kind === 'player' ? id : 'x', label: 'Owen Carter' }, window_start: null, window_end: null, sample_size: 40, sample_unit: 'rounds', source: 'rounds', method: 'm' });

  it('puts the three references on a player’s measurement, level first, and grades the chip against the level', async () => {
    const { sb } = pgrst(tables());
    const out = await applyComparisons(base({ measurements: [fig('gir_pct')] }), benchmarkSource(sb, 'team-1', { ctx }));
    const m = out.measurements[0]!;
    expect(m.comparisons!.map((c) => [c.kind, c.value])).toEqual([['level', 50], ['team', 54.6], ['tour', 66]]);
    expect(m.comparisons![0]).toMatchObject({ label: 'Division III average', place_percent: 30 });
    expect(m.comparisons![1]).toMatchObject({ place: 3, place_of: 7, place_percent: null });
    expect(m.benchmark).toEqual({ source: 'Division III average 2024', version: '2024', value: 50, omitted_for_cohort: false });
  });

  it('gives a team-level figure the level and the Tour only', async () => {
    const { sb } = pgrst(tables());
    const out = await applyComparisons(base({ measurements: [fig('gir_pct', 'team')] }), benchmarkSource(sb, 'team-1', { ctx }));
    expect(out.measurements[0]!.comparisons!.map((c) => c.kind)).toEqual(['level', 'tour']);
  });

  it('with too few players with a figure the team average is listed as missing, and the Tour stands in for a missing level without hiding that it is missing', async () => {
    const { sb } = pgrst(tables());
    // p9 has no standing; sg_putting has no published college average.
    const out = await applyComparisons(base({ measurements: [fig('sg_putting', 'player', 'p9', -0.4)] }), benchmarkSource(sb, 'team-1', { ctx }));
    const m = out.measurements[0]!;
    expect(m.comparisons!.map((c) => [c.kind, c.value])).toEqual([['level', null], ['team', null], ['tour', 0]]);
    expect(m.comparisons![0]!.note).toBeTruthy();
    expect(m.comparisons![1]!.note).toMatch(/Fewer than 5 players/);
    expect(m.benchmark).toMatchObject({ source: 'PGA Tour 2024', value: 0 });
  });

  it('leaves a metric the standards do not cover, a round, an unavailable read and a benchmark already carried alone', async () => {
    const { sb } = pgrst(tables());
    const own = { ...fig('gir_pct'), benchmark: { source: 'x', version: '1', value: 9, omitted_for_cohort: false } };
    const out = await applyComparisons(base({ measurements: [fig('putts_per_round'), fig('gir_pct', 'round'), own] }), benchmarkSource(sb, 'team-1', { ctx }));
    expect(out.measurements[0]!.comparisons).toBeUndefined();
    expect(out.measurements[1]!.comparisons).toBeUndefined();
    expect(out.measurements[2]!.benchmark!.value).toBe(9);
    const down = base({ coverage: 'unavailable', measurements: [fig('gir_pct')] });
    expect(await applyComparisons(down, benchmarkSource(sb, 'team-1', { ctx }))).toBe(down);
  });

  it('reads the team’s level, tour and standards once for the turn, and the standing once per read', async () => {
    const { sb, of } = pgrst(tables());
    const src = benchmarkSource(sb, 'team-1', { ctx });
    await applyComparisons(base({ measurements: [fig('gir_pct')] }), src);
    await applyComparisons(base({ measurements: [fig('gir_pct')] }), src);
    expect(of('golf_pga_standards').filter((c) => c.method === 'select')).toHaveLength(1);
    expect(of('golf_team_seasons').filter((c) => c.method === 'select')).toHaveLength(1);
    expect(of('golf_player_standing').filter((c) => c.method === 'select')).toHaveLength(2);
  });

  it('draws nothing when the team’s tour is unknown, and the audit takes the figures it carries only with their source named', async () => {
    const down = pgrst({ ...tables(), golf_teams: { error: { message: 'down' } } });
    expect((await applyComparisons(base({ measurements: [fig('gir_pct')] }), benchmarkSource(down.sb, 'team-1', { ctx }))).measurements[0]!.comparisons).toBeUndefined();
    const { sb } = pgrst(tables());
    const m = (await applyComparisons(base({ measurements: [fig('gir_pct')] }), benchmarkSource(sb, 'team-1', { ctx }))).measurements[0]!;
    const players = [{ id: 'p1', name: 'Owen Carter' }];
    const audit = (text: string) => auditNumericClaims(text, [m], [], [], [], 'America/New_York', { players }).map((c) => c.value);
    expect(audit('Owen hits 58.3% of greens, against 50% for the Division III average, 54.6% for the team and 66% for the Tour.')).toEqual([]);
    expect(audit('Owen hits 58.3% of greens, and the team hits 50%.')).toEqual([50]);
  });
});

describe('get_metric_definitions', () => {
  const defs: Tables = {
    golf_metrics: {
      rows: [
        { metric_id: 'putts_made_3_5ft_pct', display_label: 'Putts Made 3-5 ft', category: 'putting', unit: 'percent', direction: 'higher_better', description: 'Make percentage from 3-5 feet (Tour ~85%, the highest-leverage short-putt zone).', active: true },
        { metric_id: 'penalty_rate_per_round', display_label: 'Penalties per Round', category: 'course_mgmt', unit: 'count', direction: 'lower_better', description: 'Average penalty strokes per round. 70% of double bogeys start with a penalty (Part V.4 causal chain).', active: true },
        { metric_id: 'sg_ott', display_label: 'SG: Off the Tee', category: 'sg', unit: 'strokes', direction: 'higher_better', description: 'Strokes gained on par-4 and par-5 tee shots only.', active: true },
        { metric_id: 'old_metric', display_label: 'Old', category: 'sg', unit: 'strokes', direction: 'higher_better', description: 'x', active: false },
      ],
    },
  };

  it('gives label, unit, direction and a description without the Tour figures or the internal references the table quotes', async () => {
    const { sb } = pgrst(defs);
    const e = await getMetricDefinitions(sb, { metric_ids: ['putts_made_3_5ft_pct', 'penalty_rate_per_round', 'sg_tee'] });
    const d = (e.detail as { definitions: Array<{ metric_id: string; description?: string; direction: string }> }).definitions;
    expect(d.map((x) => x.metric_id).sort()).toEqual(['penalty_rate_per_round', 'putts_made_3_5ft_pct', 'sg_ott']);
    expect(d.find((x) => x.metric_id === 'putts_made_3_5ft_pct')!.description).toBe('Make percentage from 3-5 feet.');
    expect(JSON.stringify(e.detail)).not.toMatch(/Part V|85%/);
    expect(JSON.stringify(e.detail)).not.toContain('old_metric');
  });

  it('adds the stats-cache metrics the standards table does not carry', async () => {
    const { sb } = pgrst(defs);
    const e = await getMetricDefinitions(sb, { metric_ids: ['scoring_average'] });
    expect((e.detail as { definitions: Array<{ metric_id: string; direction: string }> }).definitions).toEqual([expect.objectContaining({ metric_id: 'scoring_average', direction: 'lower_better' })]);
  });

  it('says it could not read, rather than that nothing exists', async () => {
    const { sb } = pgrst({ golf_metrics: { error: { message: 'down' } } });
    expect((await getMetricDefinitions(sb, {})).coverage).toBe('unavailable');
  });
});
