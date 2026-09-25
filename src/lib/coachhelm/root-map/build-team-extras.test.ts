import { describe, expect, it } from 'vitest';
import type { GroupedSignal } from '@/lib/coachhelm/signal-grouping';
import { buildFocusSlopes, buildNeedsYou, type MetricMeta } from './build-team-extras';
import { stackTeamTrend, type TeamTrendWeek } from './area-trends';
import { buildTeamHeadline, buildTeamRoots, type TeamRosterPlayer } from './build-team-roots';
import type { StoredAttributionRow } from './loaders';

const meta = (id: string): MetricMeta =>
  id === 'sg_ott'
    ? { label: 'SG: Off the Tee', unit: 'strokes', direction: 'higher_better' }
    : id === 'big_number_rate'
      ? { label: 'Big numbers', unit: 'percent', direction: 'lower_better' }
      : { label: id, unit: null, direction: null };

function attr(over: Partial<StoredAttributionRow> & { insightId: string }): StoredAttributionRow {
  return {
    targetMetricId: 'sg_ott',
    baseline: -1,
    post: -0.5,
    nBefore: 5,
    nAfter: 4,
    methodVersion: null,
    ...over,
  };
}

describe('buildFocusSlopes', () => {
  const focusAreas = [
    { id: 'fa1', playerId: 'p1', title: 'Driver', fromInsightId: 'i1' },
    { id: 'fa2', playerId: 'p2', title: 'Big numbers', fromInsightId: 'i2' },
    { id: 'fa3', playerId: 'p1', title: 'Thin', fromInsightId: 'i3' },
    { id: 'fa4', playerId: 'p2', title: 'No source', fromInsightId: null },
  ];

  it('keeps only rows with enough rounds on both sides and colours by metric direction', () => {
    const rows = buildFocusSlopes({
      focusAreas,
      attribution: [
        attr({ insightId: 'i1' }),
        attr({ insightId: 'i2', targetMetricId: 'big_number_rate', baseline: 8, post: 10 }),
        attr({ insightId: 'i3', nAfter: 2 }),
      ],
      playerNameById: { p1: 'Ann', p2: 'Bo' },
      metricMeta: meta,
    });
    expect(rows.map((r) => r.focusAreaId).sort()).toEqual(['fa1', 'fa2']);
    expect(rows.find((r) => r.focusAreaId === 'fa1')!.tone).toBe('better');
    // lower is better: a rise reads as worse
    expect(rows.find((r) => r.focusAreaId === 'fa2')!.tone).toBe('worse');
    // null method_version is the earlier method, never presented as clean
    expect(rows.every((r) => !r.isClean)).toBe(true);
  });

  it('never colours a metric whose direction is unknown', () => {
    const rows = buildFocusSlopes({
      focusAreas,
      attribution: [attr({ insightId: 'i1', targetMetricId: 'mystery' })],
      playerNameById: {},
      metricMeta: meta,
    });
    expect(rows[0]!.tone).toBe('neutral');
    expect(rows[0]!.playerName).toBe('Player');
  });
});

describe('buildNeedsYou', () => {
  const sig = (id: string, severity: GroupedSignal['severity'], kind: GroupedSignal['kind'] = 'insight'): GroupedSignal => ({
    id,
    kind,
    category: 'putting',
    severity,
    title: `t-${id}`,
    claim: '',
    ageDays: 1,
    status: 'active',
    strokeImpact: null,
    playerId: 'p1',
    supersededCount: 0,
  });

  it('lists changed open focus areas first, then urgent before high, capped', () => {
    const items = buildNeedsYou({
      focusAreas: [
        { id: 'f1', playerId: 'p1', title: 'Putting', status: 'active', evidenceRevisionStatus: 'changed' },
        { id: 'f2', playerId: 'p1', title: 'Done', status: 'completed', evidenceRevisionStatus: 'changed' },
        { id: 'f3', playerId: 'p1', title: 'Same', status: 'active', evidenceRevisionStatus: 'match' },
      ],
      signals: [sig('h1', 'high'), sig('u1', 'urgent'), sig('m1', 'medium'), sig('t1', 'urgent', 'team_synthesis'), sig('h2', 'high'), sig('h3', 'high')],
      playerNameById: { p1: 'Ann' },
    });
    expect(items.map((i) => i.key)).toEqual(['fa:f1', 'sig:u1', 'sig:h1', 'sig:h2']);
  });
});

describe('stackTeamTrend', () => {
  const week = (values: TeamTrendWeek['values']): TeamTrendWeek => ({ weekStart: '2026-09-07', values, players: 3, rounds: 4 });

  it('stacks gains up and losses down from the Tour line, contiguously', () => {
    const s = stackTeamTrend([week({ tee: 0.5, approach: -1, short_game: 0.25, putting: -0.5 })]);
    const b = Object.fromEntries(s.bands.map((x) => [x.area, x.bounds[0]]));
    expect(b.tee).toEqual([0, 0.5]);
    expect(b.approach).toEqual([-1, 0]);
    expect(b.short_game).toEqual([0.5, 0.75]);
    expect(b.putting).toEqual([-1.5, -1]);
    expect(s.net[0]).toBeCloseTo(-0.75, 9);
    expect(s.extent).toBeCloseTo(1.5, 9);
  });

  it('draws a null week value as zero thickness, never NaN', () => {
    const s = stackTeamTrend([week({ tee: null, approach: null, short_game: null, putting: -0.2 })]);
    for (const band of s.bands) for (const [lo, hi] of band.bounds) expect(Number.isFinite(lo) && Number.isFinite(hi)).toBe(true);
    expect(s.net[0]).toBeCloseTo(-0.2, 9);
  });
});

describe('team roots before the new engine is deployed (all hatched/forming, approach unsized)', () => {
  const players: TeamRosterPlayer[] = ['a', 'b', 'c'].map((id) => ({
    id,
    name: id.toUpperCase(),
    roundsPlayed: 8,
    sgTotal: -2,
    sg: { tee: 0.2, approach: -1.1, short_game: -0.3, putting: -0.4 },
  }));
  const signal = (playerId: string, metric: string, category: string, strokes: number | null, confidence: number): GroupedSignal => ({
    id: `${playerId}-${metric}`,
    kind: 'insight',
    category,
    severity: 'high',
    title: metric,
    claim: '',
    ageDays: 3,
    status: 'active',
    strokeImpact: 0,
    playerId,
    supersededCount: 0,
    evidence: {
      metric,
      metric_label: metric,
      confidence,
      counterfactual: strokes === null ? null : { strokes_saved_per_round: strokes, suppressed: false },
      diagnosis: { causality_level: 'inferred_hypothesis', root_cause: 'r', drivers: [] },
    },
  });

  it('keeps unsized approach causes in the matrix, never on the map, and still writes a headline', () => {
    const model = buildTeamRoots({
      players,
      signals: [
        ...['a', 'b', 'c'].map((p) => signal(p, 'approach_125_150', 'approach', null, 0.8)),
        ...['a', 'b', 'c'].map((p) => signal(p, 'lag_putting', 'putting', 0.3, 0.6)),
      ],
    });
    const approachCol = model.columns.find((c) => c.metric === 'approach_125_150')!;
    expect(approachCol.teamStrokes).toBeNull();
    expect(model.rows.every((r) => r.cells.approach_125_150!.strokes === null)).toBe(true);
    const branches = model.map.losses.flatMap((l) => l.causes);
    expect(branches.map((b) => b.id)).toEqual(['team:lag_putting']);
    // nothing is observed yet: the one branch reads as forming, never solid
    expect(branches.every((b) => b.style !== 'observed')).toBe(true);
    expect(branches[0]!.style).toBe('forming');
    expect(model.map.defaultSelectedId).toBe('team:lag_putting');
    expect(buildTeamHeadline(model)).toBe(
      'On average the team gives back 1.10 a round to the Tour line on approach; 3 players carry “approach_125_150” there.',
    );
  });

  it('returns no headline when nobody has stored strokes gained', () => {
    const model = buildTeamRoots({
      players: players.map((p) => ({ ...p, sg: { tee: null, approach: null, short_game: null, putting: null } })),
      signals: [],
    });
    expect(buildTeamHeadline(model)).toBeNull();
  });
});

describe('stored miss concentrations (team roots)', () => {
  const players: TeamRosterPlayer[] = ['a', 'b'].map((id) => ({
    id,
    name: id.toUpperCase(),
    roundsPlayed: 12,
    sgTotal: -1,
    sg: { tee: 0, approach: -0.8, short_game: 0, putting: 0 },
  }));
  const step = (level: 'length' | 'par' | 'shape', passed: boolean, label: string | null, statement: string) => ({ level, passed, label, statement });
  const narrowingShape = {
    subject: 'approach',
    path: ['175+ yd', 'long par 3s', 'short-right'],
    stopped_at: null,
    steps: [
      step('length', true, '175+ yd', '34 of 75 approaches from 175+ yd missed the green (18 rounds)'),
      step('par', true, 'long par 3s', 'on long par 3s 13 of 18 missed the green (72%), vs 21 of 57 elsewhere (37%)'),
      step('shape', true, 'short-right', 'most misses finish short-right (8 of 10 short, 7 of 11 right)'),
    ],
    sentence: 'Observed, not a cause: …',
  };
  const narrowingLengthOnly = {
    subject: 'approach',
    path: ['175+ yd'],
    stopped_at: 'par',
    steps: [step('length', true, '175+ yd', 'x'), step('par', false, null, 'no par slice concentrates')],
    sentence: 's',
  };
  const signal = (id: string, playerId: string, narrowing: unknown, over: Partial<GroupedSignal> = {}): GroupedSignal => ({
    id,
    kind: 'insight',
    category: 'approach',
    severity: 'medium',
    title: `Greens from 175+ (${id})`,
    claim: '',
    ageDays: 2,
    status: 'active',
    strokeImpact: 0.4,
    playerId,
    supersededCount: 0,
    evidence: {
      metric: 'approach_175_plus',
      metric_label: 'Greens from 175+',
      confidence: 0.8,
      diagnosis: { causality_level: 'inferred_hypothesis', root_cause: 'r', drivers: [], basis: { kind: 'hypothesis_policy', checked: [], ...(narrowing ? { narrowing } : {}) } },
    },
    ...over,
  });

  it('carries the gated path on a matrix cell, and none for a length-only or absent narrowing', () => {
    const model = buildTeamRoots({ players, signals: [signal('s1', 'a', narrowingShape), signal('s2', 'b', narrowingLengthOnly)] });
    const byPlayer = Object.fromEntries(model.rows.map((r) => [r.playerId, r.cells.approach_175_plus!.contextPath]));
    expect(byPlayer).toEqual({ a: '175+ yd → long par 3s → short-right', b: null });
    const legacy = buildTeamRoots({ players, signals: [signal('s3', 'a', null)] });
    expect(legacy.rows.find((r) => r.playerId === 'a')!.cells.approach_175_plus!.contextPath).toBeNull();
  });

  it('rejects a malformed stored narrowing instead of trusting it', () => {
    const model = buildTeamRoots({ players, signals: [signal('s1', 'a', { path: ['175+ yd', 'par 4s'], steps: 'nope', sentence: 's' })] });
    expect(model.rows.find((r) => r.playerId === 'a')!.cells.approach_175_plus!.contextPath).toBeNull();
  });

  it('Needs you lists a gated concentration with its counts, one per player, after severe signals', () => {
    const items = buildNeedsYou({
      focusAreas: [],
      signals: [
        signal('s1', 'a', narrowingShape),
        signal('s1b', 'a', { ...narrowingShape, path: ['175+ yd', 'par 4s'], steps: narrowingShape.steps.slice(0, 2) }),
        signal('s2', 'b', narrowingLengthOnly),
        signal('u1', 'b', null, { severity: 'urgent' }),
        signal('d1', 'b', narrowingShape, { status: 'dismissed' }),
      ],
      playerNameById: { a: 'Ann', b: 'Bo' },
    });
    expect(items.map((i) => i.key)).toEqual(['sig:u1', 'conc:s1']);
    const conc = items[1]!;
    expect(conc.kind).toBe('concentration');
    expect(conc.signalId).toBe('s1');
    expect(conc.detail).toBe(
      'Misses concentrate: 175+ yd → long par 3s → short-right — most misses finish short-right (8 of 10 short, 7 of 11 right). Observed, not a cause.',
    );
  });

  it('keeps the last slot for a concentration when severe signals would fill the list', () => {
    const severe = ['u1', 'u2', 'u3', 'u4', 'u5'].map((id) => signal(id, 'b', null, { severity: 'urgent' }));
    const withConc = buildNeedsYou({ focusAreas: [], signals: [...severe, signal('s1', 'a', narrowingShape)], playerNameById: {} });
    expect(withConc.map((i) => i.key)).toEqual(['sig:u1', 'sig:u2', 'sig:u3', 'conc:s1']);
    const without = buildNeedsYou({ focusAreas: [], signals: severe, playerNameById: {} });
    expect(without.map((i) => i.key)).toEqual(['sig:u1', 'sig:u2', 'sig:u3', 'sig:u4']);
  });

  it('a tee narrowing that passed only its par step counts, and is worded as missed fairways', () => {
    const tee = {
      subject: 'tee',
      path: ['par 4 and 5 tee shots', 'long par 4s'],
      stopped_at: 'shape',
      steps: [
        step('length', true, 'par 4 and 5 tee shots', '40 of 90 missed the fairway'),
        step('par', true, 'long par 4s', 'on long par 4s 14 of 20 missed the fairway (70%), vs 26 of 70 elsewhere (37%)'),
        step('shape', false, null, 'direction not stated on long par 4s: no side holds 60%'),
      ],
      sentence: 's',
    };
    const items = buildNeedsYou({ focusAreas: [], signals: [signal('t1', 'a', tee, { category: 'tee' })], playerNameById: { a: 'Ann' } });
    expect(items).toHaveLength(1);
    expect(items[0]!.detail).toBe(
      'Missed fairways concentrate: par 4 and 5 tee shots → long par 4s — on long par 4s 14 of 20 missed the fairway (70%), vs 26 of 70 elsewhere (37%). Observed, not a cause.',
    );
  });

  it('Needs you lists nothing for concentrations that did not pass the par step', () => {
    const items = buildNeedsYou({ focusAreas: [], signals: [signal('s2', 'b', narrowingLengthOnly)], playerNameById: {} });
    expect(items).toEqual([]);
  });
});
