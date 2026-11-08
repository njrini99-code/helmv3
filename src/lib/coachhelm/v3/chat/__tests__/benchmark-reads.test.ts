import { describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => { throw new Error('the service client must not be used'); } }));

import { applyLevelBenchmarks, benchmarkSource, getBenchmarks, getMetricDefinitions, levelFromDivision, STANDING_ID_BY_CHAT_ID, tourForGender } from '../benchmark-reads';
import { auditNumericClaims, collectEnvelopeNumbers, readFigure, type ToolEnvelope } from '../provenance';
import { person, pgrst, type Tables } from './pgrst-double';

const ctx: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Varsity', timezone: 'America/New_York', roster: [person('p1', 'Owen Carter'), person('p2', 'Cole Bennett')] };

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

const tables = (gender = 'mens', division: string | null = 'D3'): Tables => ({
  golf_teams: { rows: [{ id: 'team-1', gender }] },
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
});

describe('get_benchmarks (coach)', () => {
  it('compares with the team’s own level by default, and leaves the Tour out unless it is asked for', async () => {
    const { sb } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1'), { metric_ids: ['gir_pct'] }, { role: 'coach' });
    const d = e.detail as { team_level: string; benchmarks: Array<{ levels: Record<string, { value: number; label: string }>; tour_percentiles?: unknown }> };
    expect(d.team_level).toBe('Division III average');
    expect(d.benchmarks[0]!.levels).toEqual({ d3: { label: 'Division III average', value: 50 } });
    expect(d.benchmarks[0]!.tour_percentiles).toBeUndefined();
    expect(e.summary).toBe('Division III average for 1 metric.');
    expect(JSON.stringify(e)).not.toMatch(/PGA Tour/);
  });

  it('shows the three college levels, saying so, when the team’s division is not on record', async () => {
    const { sb } = pgrst(tables('mens', null));
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1'), { metric_ids: ['gir_pct'] }, { role: 'coach' });
    expect(Object.keys((e.detail as { benchmarks: Array<{ levels: object }> }).benchmarks[0]!.levels)).toEqual(['d1', 'd3']);
    expect((e.detail as { team_level: unknown }).team_level).toBeNull();
    expect(e.coverage_note).toMatch(/division is not on record/);
  });

  it('returns the Tour, college and high-school values with percentiles and the source, for the metrics asked', async () => {
    const { sb } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1'), { metric_ids: ['gir_pct', 'sg_putting'], levels: ['pga', 'd1', 'd3', 'hs'] }, { role: 'coach' });
    expect(e.coverage).toBe('complete');
    const d = e.detail as { benchmarks: Array<{ metric_id: string; levels: Record<string, { value: number; label: string }>; tour_percentiles?: Record<string, number>; source: string }> };
    const gir = d.benchmarks.find((b) => b.metric_id === 'gir_pct')!;
    expect(gir.levels.pga!.label).toBe('PGA Tour');
    expect(gir.levels).toMatchObject({ pga: { value: 66 }, d1: { value: 60 }, d3: { value: 50 }, hs: { value: 40 } });
    expect(gir.tour_percentiles).toEqual({ p25: 62, p50: 66, p75: 72 });
    expect(gir.source).toBe('pga gir_pct source');
    expect(gir.levels.d2).toBeUndefined();
  });

  it('uses the LPGA rows for a women’s team and never falls back to the men’s value', async () => {
    const { sb, of } = pgrst(tables('womens'));
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1'), { metric_ids: ['gir_pct', 'sg_ott'], levels: ['pga', 'd1'] }, { role: 'coach' });
    expect(of('golf_pga_standards').some((c) => c.method === 'eq' && c.args[0] === 'tour' && c.args[1] === 'lpga')).toBe(true);
    const d = e.detail as { benchmarks: Array<{ metric_id: string; levels: Record<string, { value: number; label: string }> }> };
    expect(d.benchmarks.find((b) => b.metric_id === 'gir_pct')!.levels.pga!.label).toBe('LPGA Tour');
    expect(d.benchmarks.find((b) => b.metric_id === 'gir_pct')!.levels.pga!.value).toBe(70);
    // sg_ott has no LPGA row in this table: it is absent, not the men's 0.
    expect(d.benchmarks.find((b) => b.metric_id === 'sg_ott')).toBeUndefined();
    expect(e.coverage).toBe('partial');
  });

  it('claims no benchmark when the team’s tour cannot be read', async () => {
    const { sb } = pgrst({ ...tables(), golf_teams: { error: { message: 'down' } } });
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1'), { metric_ids: ['gir_pct'] }, { role: 'coach' });
    expect(e.coverage).toBe('unavailable');
    expect(e.detail).toBeUndefined();
  });

  it('reads one roster player’s standing, and refuses anyone off the roster before any query', async () => {
    const { sb, of } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1'), { metric_ids: ['gir_pct'], player_id: 'p1', levels: ['pga'] }, { role: 'coach' });
    const standing = (e.detail as { standing: { player_id: string; player: string; rows: Array<Record<string, unknown>> } }).standing;
    expect(standing.player_id).toBe('p1');
    expect(standing.player).toBe('Owen Carter');
    expect(standing.rows).toHaveLength(1);
    expect(standing.rows[0]).toMatchObject({ metric_id: 'gir_pct', player_value: 58.12, level_value: 50, vs_level: 8.12, level_label: 'Division III average', tour_value: 66, vs_tour: -7.88, team_average: 57.2, team_size: 9, team_percentile: 55.5, level_average: 61.5 });
    expect(JSON.stringify(e.detail)).not.toContain('71.9');
    // Without the Tour asked for, the standing is against the level alone.
    const byLevel = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1'), { metric_ids: ['gir_pct'], player_id: 'p1' }, { role: 'coach' });
    const row0 = (byLevel.detail as { standing: { rows: Array<Record<string, unknown>> } }).standing.rows[0]!;
    expect(row0).toMatchObject({ level_value: 50, vs_level: 8.12 });
    expect(row0.tour_value).toBeUndefined();
    expect(row0.vs_tour).toBeUndefined();
    expect(of('golf_player_standing').some((c) => c.method === 'eq' && c.args[0] === 'player_id' && c.args[1] === 'p1')).toBe(true);

    const other = pgrst(tables());
    await expect(getBenchmarks(other.sb, ctx, benchmarkSource(other.sb, 'team-1'), { metric_ids: ['gir_pct'], player_id: 'stranger' }, { role: 'coach' })).rejects.toMatchObject({ status: 403 });
    expect(other.of('golf_player_standing')).toEqual([]);
  });

  it('withholds a team average under five teammates, and a Tour comparison that is not like for like', async () => {
    const { sb } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1'), { metric_ids: ['approach_proximity_50_125ft'], player_id: 'p1', levels: ['pga'] }, { role: 'coach' });
    const row = (e.detail as { standing: { rows: Array<Record<string, unknown>> } }).standing.rows[0]!;
    expect(row.player_value).toBe(29);
    expect(row.team_average).toBeUndefined();
    expect(row.vs_tour).toBeUndefined();
    expect(row.tour_value).toBeUndefined();
    expect(row.level_average).toBe(27);
  });

  it('maps Ask’s own metric names to the standards’ and reports ones with no benchmark', async () => {
    expect(STANDING_ID_BY_CHAT_ID('sg_tee')).toBe('sg_ott');
    expect(STANDING_ID_BY_CHAT_ID('sand_save_pct')).toBe('scrambling_pct_sand');
    expect(STANDING_ID_BY_CHAT_ID('putts_per_round')).toBeNull();
    const { sb } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1'), { metric_ids: ['putts_per_round'] }, { role: 'coach' });
    expect(e.coverage).toBe('empty');
  });

  it('marks a metric with no published value at the level asked as partial', async () => {
    const { sb } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1'), { metric_ids: ['putt_miss_bias_high_pct'], levels: ['pga', 'd1'] }, { role: 'coach' });
    expect(e.coverage).toBe('partial');
    expect(e.coverage_note).toMatch(/No published value/);
  });
});

describe('get_benchmarks (player)', () => {
  it('reads the session’s own standing, whatever the input names, and shows no teammate', async () => {
    const { sb, of } = pgrst(tables());
    const solo = { ...ctx, roster: [person('p1', 'Owen Carter')] };
    // A forged player_id in the input is ignored: the player's id is the session's.
    const e = await getBenchmarks(sb, solo, benchmarkSource(sb, 'team-1'), { metric_ids: ['gir_pct'], player_id: 'p2' }, { role: 'player', playerId: 'p1' });
    const wire = JSON.stringify(e);
    expect(of('golf_player_standing').filter((c) => c.method === 'eq').map((c) => c.args)).toEqual([['player_id', 'p1']]);
    expect(wire).not.toContain('"player_id":"p2"');
    expect(wire).not.toContain('Cole Bennett');
    expect(wire).not.toContain('71.9');
    const standing = (e.detail as { standing: { player: string; rows: Array<Record<string, unknown>> } }).standing;
    expect(standing.player).toBe('You');
    expect(standing.rows[0]).toMatchObject({ team_average: 57.2, team_size: 9 });
  });
});

describe('benchmarks in the audit', () => {
  it('grounds a college or Tour figure in the answer only when get_benchmarks returned it', async () => {
    const { sb } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1'), { metric_ids: ['gir_pct'], levels: ['pga', 'd1', 'd3'], player_id: 'p1' }, { role: 'coach' });
    const text = 'Owen hits 58.1% of greens, against 66% for the PGA Tour and 60% for the Division I average, 7.88 behind the Tour.';
    const named = [{ id: 'p1', name: 'Owen Carter' }];
    expect(auditNumericClaims(text, e.measurements, e.series, collectEnvelopeNumbers(e), [], 'America/New_York', { players: named })).toEqual([]);
    // A Division I figure no read returned is refused.
    const invented = 'The Division I average is 37%.';
    expect(auditNumericClaims(invented, e.measurements, e.series, collectEnvelopeNumbers(e), [], 'America/New_York', { players: named }).map((c) => c.value)).toEqual([37]);
    expect(auditNumericClaims(invented, [], [], [], [], 'America/New_York', { players: named }).map((c) => c.value)).toEqual([37]);
  });

  it('binds each benchmark to its own metric: a Tour GIR does not ground a number in a putting sentence', async () => {
    const { sb } = pgrst(tables());
    const e = await getBenchmarks(sb, ctx, benchmarkSource(sb, 'team-1'), { metric_ids: ['gir_pct', 'sg_putting', 'sand_save_pct'], levels: ['pga', 'd1'], player_id: 'p1' }, { role: 'coach' });
    const named = [{ id: 'p1', name: 'Owen Carter' }];
    const audit = (text: string) => auditNumericClaims(text, e.measurements, e.series, collectEnvelopeNumbers(e), [], 'America/New_York', { players: named }).map((c) => c.value);
    expect(audit('The PGA Tour hits 66% of greens in regulation.')).toEqual([]);
    expect(audit('Owen’s strokes gained putting is 66.')).toEqual([66]);
    // The sand-save rate is a scrambling_pct_ id in the table; it still binds to a sand-save sentence, and not to a putting one.
    expect(audit('The PGA Tour saves 50% of its bunker shots.')).toEqual([]);
    expect(audit('The Division I average for sand saves is 40%.')).toEqual([]);
    expect(audit('Owen putts to 50% inside ten feet.')).toEqual([50]);
  });

  it('grounds the level value a measurement carries, and the gap to it, only in a sentence that names the level', async () => {
    const { sb } = pgrst(tables());
    const src = benchmarkSource(sb, 'team-1');
    const m = readFigure({ metric_id: 'gir_pct', metric_label: 'GIR %', unit: 'percent', value: 58.3, entity: { kind: 'player', id: 'p1', label: 'Owen Carter' }, window_start: null, window_end: null, sample_size: 40, sample_unit: 'rounds', source: 'rounds', method: 'm' });
    const filled = await applyLevelBenchmarks({ summary: 'ok', measurements: [m], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-07T00:00:00Z' }, src);
    expect(filled.measurements[0]!.benchmark).toEqual({ source: 'Division III average 2024', version: '2024', value: 50, omitted_for_cohort: false });
    const players = [{ id: 'p1', name: 'Owen Carter' }];
    const audit = (text: string, ms = filled.measurements) => auditNumericClaims(text, ms, [], [], [], 'America/New_York', { players }).map((c) => c.value);
    expect(audit('Owen hits 58.3% of greens, against 50% for the Division III average, 8.3 above it.')).toEqual([]);
    // The level’s 50 is no one’s result: stated as if it were Owen’s or the team’s, with no source in the sentence, it is refused.
    expect(audit('Owen hits 58.3% of greens, and the team hits 50%.')).toEqual([50]);
    expect(audit('Owen hits 58.3% of greens, 50% for the Division III average.', [m])).toEqual([50]);
  });
})

describe('applyLevelBenchmarks', () => {
  const base = (over: Partial<ToolEnvelope>): ToolEnvelope => ({ summary: 'ok', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-07T00:00:00Z', ...over });
  const fig = (metric_id: string, kind: 'player' | 'team' | 'round' = 'player') => readFigure({ metric_id, metric_label: metric_id, unit: 'strokes', value: 1, entity: { kind, id: 'x', label: 'X' }, window_start: null, window_end: null, sample_size: 5, sample_unit: 'rounds', source: 'rounds', method: 'm' });

  it('fills the team’s own level where the standards publish one, and nowhere else', async () => {
    const { sb } = pgrst(tables());
    const out = await applyLevelBenchmarks(base({ measurements: [fig('gir_pct'), fig('sg_putting'), fig('sand_save_pct'), fig('putts_per_round'), fig('gir_pct', 'round'), fig('gir_pct_mean', 'team')] }), benchmarkSource(sb, 'team-1'));
    // GIR has a Division III value; strokes gained has no college value (there is no college strokes gained), nor does the sand-save rate here.
    expect(out.measurements.map((m) => m.benchmark?.value ?? null)).toEqual([50, null, null, null, null, 50]);
    expect(out.measurements[0]!.benchmark!.source).toBe('Division III average 2024');
  });

  it('uses the newest season’s division, and the Division I value for a Division I team', async () => {
    const { sb } = pgrst(tables('mens', 'd1'));
    const out = await applyLevelBenchmarks(base({ measurements: [fig('gir_pct')] }), benchmarkSource(sb, 'team-1'));
    expect(out.measurements[0]!.benchmark).toMatchObject({ value: 60, source: 'Division I average 2024' });
  });

  it('never falls back to the Tour: with no division on record, or one with no average, nothing is drawn', async () => {
    for (const division of [null, 'NAIA']) {
      const { sb } = pgrst(tables('mens', division));
      const out = await applyLevelBenchmarks(base({ measurements: [fig('gir_pct')] }), benchmarkSource(sb, 'team-1'));
      expect(out.measurements[0]!.benchmark).toBeNull();
    }
  });

  it('keeps a benchmark a read already carried and leaves an unavailable read alone', async () => {
    const { sb, of } = pgrst(tables());
    const own = { ...fig('sg_putting'), benchmark: { source: 'x', version: '1', value: 9, omitted_for_cohort: false } };
    const kept = await applyLevelBenchmarks(base({ measurements: [own] }), benchmarkSource(sb, 'team-1'));
    expect(kept.measurements[0]!.benchmark!.value).toBe(9);
    const down = base({ coverage: 'unavailable', measurements: [fig('sg_putting')] });
    expect(await applyLevelBenchmarks(down, benchmarkSource(sb, 'team-1'))).toBe(down);
    expect(of('golf_team_seasons')).toEqual([]);
  });

  it('reads the tour and standards once for the whole turn', async () => {
    const { sb, of } = pgrst(tables());
    const src = benchmarkSource(sb, 'team-1');
    await applyLevelBenchmarks(base({ measurements: [fig('gir_pct')] }), src);
    await applyLevelBenchmarks(base({ measurements: [fig('gir_pct')] }), src);
    expect(of('golf_pga_standards').filter((c) => c.method === 'select')).toHaveLength(1);
    expect(of('golf_team_seasons').filter((c) => c.method === 'select')).toHaveLength(1);
  });

  it('draws no benchmark when the team’s tour is unknown', async () => {
    const { sb } = pgrst({ ...tables(), golf_teams: { error: { message: 'down' } } });
    const env = base({ measurements: [fig('gir_pct')] });
    expect((await applyLevelBenchmarks(env, benchmarkSource(sb, 'team-1'))).measurements[0]!.benchmark).toBeNull();
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
