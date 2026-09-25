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
