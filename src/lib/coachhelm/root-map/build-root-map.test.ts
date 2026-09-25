import { describe, expect, it } from 'vitest';
import type { RankableEvidenceInsight } from '@/app/golf/actions/insight-delivery-ranking';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import {
  humanizeCauseLabel,
  buildRootHeadline,
  confidenceTier,
  findBranch,
  layoutRootMap,
  rootStyleFor,
  strokesPerRound,
  type RootMapAreaInput,
} from './build-root-map';
import { buildRootMap } from './build-player-root-map';
import { buildAreaSparklines, buildTeamTrend, weekStartOf } from './area-trends';
import { buildTeamRoots } from './build-team-roots';
import type { GroupedSignal } from '@/lib/coachhelm/signal-grouping';

function evidence(over: Partial<InsightEvidence> & Record<string, unknown> = {}): InsightEvidence {
  return {
    metric: 'putts_made_3_5ft_pct',
    metric_label: '3-5 ft putts',
    unit: 'percent',
    your_value: 48,
    your_value_display: '48%',
    comparison_value: 91,
    comparison_label: 'Tour',
    comparison_source: 'pga_baseline',
    sample_n: 31,
    window_days: 90,
    window_start: '2026-06-01',
    window_end: '2026-09-17',
    strokes_impact: 0,
    strokes_impact_method: 'sg_baseline',
    confidence: 0.8,
    confidence_factors: { sample_adequacy: 0.8, recency: 1, variance: 0.5 },
    ...over,
  } as InsightEvidence;
}

function diagnosis(level: 'observed_sequence' | 'inferred_hypothesis') {
  return {
    symptom: 's',
    root_cause: 'Downhill slope',
    causality_level: level,
    drivers: [],
    recommended_action: 'a',
    confidence_reason: 'r',
  };
}

let n = 0;
function insight(over: {
  id?: string;
  category: RankableEvidenceInsight['category'];
  metric?: string;
  label?: string;
  strokes?: number | null;
  confidence?: number;
  level?: 'observed_sequence' | 'inferred_hypothesis' | null;
  created_at?: string;
  updated_at?: string;
  player_id?: string;
}): RankableEvidenceInsight {
  n += 1;
  const cf =
    over.strokes === undefined || over.strokes === null
      ? null
      : { strokes_saved_per_round: over.strokes, suppressed: false, current_baseline_score: 74.1, projected_score_if_closed: 73.2, weeks_to_typical_close: 6 };
  return {
    id: over.id ?? `ins-${n}`,
    player_id: over.player_id ?? 'p1',
    category: over.category,
    title: `Title ${over.label ?? n}`,
    content: 'c',
    signature: `v3:${n}`,
    evidence: evidence({
      metric: over.metric ?? `metric_${n}`,
      metric_label: over.label ?? `Metric ${n}`,
      confidence: over.confidence ?? 0.8,
      counterfactual: cf,
      ...(over.level === null ? {} : { diagnosis: diagnosis(over.level ?? 'inferred_hypothesis') }),
    }),
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at: over.created_at ?? '2026-09-01T12:00:00Z',
    updated_at: over.updated_at ?? over.created_at ?? '2026-09-01T12:00:00Z',
  };
}

const AREAS: RootMapAreaInput[] = [
  { area: 'tee', sgPerRound: 1.98 },
  { area: 'approach', sgPerRound: -0.6 },
  { area: 'short_game', sgPerRound: 0.16 },
  { area: 'putting', sgPerRound: -2.93 },
];

describe('confidence + causality mapping', () => {
  it('tiers confidence with the counterfactual bands', () => {
    expect(confidenceTier(0.39)).toBe('thin');
    expect(confidenceTier(0.4)).toBe('early');
    expect(confidenceTier(0.69)).toBe('early');
    expect(confidenceTier(0.7)).toBe('solid');
    expect(confidenceTier(null)).toBeNull();
    expect(confidenceTier(Number.NaN)).toBeNull();
  });

  it('maps diagnosis + confidence to a root style', () => {
    expect(rootStyleFor(evidence({ diagnosis: diagnosis('observed_sequence'), confidence: 0.9 }))).toBe('observed');
    expect(rootStyleFor(evidence({ diagnosis: diagnosis('inferred_hypothesis'), confidence: 0.9 }))).toBe('likely');
    expect(rootStyleFor(evidence({ diagnosis: diagnosis('observed_sequence'), confidence: 0.5 }))).toBe('forming');
    expect(rootStyleFor(evidence({ diagnosis: diagnosis('inferred_hypothesis'), confidence: 0.2 }))).toBe('forming');
    expect(rootStyleFor(evidence({ confidence: 0.9 }))).toBe('unexplained');
  });

  it('falls back to evidence.causality_level when the diagnosis omits it', () => {
    const d = { ...diagnosis('inferred_hypothesis'), causality_level: undefined } as unknown as ReturnType<typeof diagnosis>;
    expect(rootStyleFor(evidence({ diagnosis: d as never, causality_level: 'observed_sequence', confidence: 0.9 }))).toBe('observed');
  });

  it('only a live, positive counterfactual gives a strokes value', () => {
    expect(strokesPerRound(evidence({ counterfactual: { strokes_saved_per_round: 1.2, suppressed: false } } as never))).toBe(1.2);
    expect(strokesPerRound(evidence({ counterfactual: { strokes_saved_per_round: 1.2, suppressed: true } } as never))).toBeNull();
    expect(strokesPerRound(evidence({ counterfactual: null } as never))).toBeNull();
    expect(strokesPerRound(evidence({ counterfactual: { strokes_saved_per_round: 0, suppressed: false } } as never))).toBeNull();
  });
});

describe('buildRootMap geometry', () => {
  it('uses one scale for gains and losses and keeps area slices contiguous', () => {
    const model = buildRootMap({ areas: AREAS, insights: [] });
    // losses 3.53 > gains 2.14 → losses fill the width
    expect(model.scale).toBeCloseTo(3.53, 6);
    const lossW = model.losses.reduce((s, a) => s + a.w, 0);
    expect(lossW).toBeCloseTo(1, 9);
    const gainW = model.gains.reduce((s, a) => s + a.w, 0);
    expect(gainW).toBeCloseTo(2.14 / 3.53, 9);
    // largest loss first, contiguous
    expect(model.losses.map((a) => a.area)).toEqual(['putting', 'approach']);
    expect(model.losses[1]!.x).toBeCloseTo(model.losses[0]!.x + model.losses[0]!.w, 12);
    expect(model.gains.map((g) => g.area)).toEqual(['tee', 'short_game']);
    expect(model.netSg).toBeCloseTo(1.98 - 0.6 + 0.16 - 2.93, 9);
  });

  it('cause widths are proportional to stored strokes and slices + remainder sum to the parent', () => {
    const a = insight({ category: 'putting', strokes: 1.5 });
    const b = insight({ category: 'putting', strokes: 0.5 });
    const model = buildRootMap({ areas: AREAS, insights: [b, a] });
    const putting = model.losses[0]!;
    expect(putting.causes.map((c) => c.id)).toEqual([a.id, b.id]);
    expect(putting.causes[0]!.w / putting.causes[1]!.w).toBeCloseTo(3, 9);
    const sum = putting.causes.reduce((s, c) => s + c.w, 0) + (putting.remainder?.w ?? 0);
    expect(sum).toBeCloseTo(putting.w, 12);
    expect(putting.remainder?.strokes).toBeCloseTo(2.93 - 2, 9);
    expect(putting.scaledToFit).toBe(false);
    // first cause starts at the area's left edge; each follows the previous
    expect(putting.causes[0]!.x).toBeCloseTo(putting.x, 12);
    expect(putting.causes[1]!.x).toBeCloseTo(putting.causes[0]!.x + putting.causes[0]!.w, 12);
  });

  it('scales children that add up past the parent to fit, keeping stored values', () => {
    const a = insight({ category: 'approach', strokes: 0.9 });
    const b = insight({ category: 'approach', strokes: 0.6 });
    const model = buildRootMap({ areas: AREAS, insights: [a, b] });
    const approach = model.losses.find((l) => l.area === 'approach')!;
    expect(approach.scaledToFit).toBe(true);
    expect(approach.remainder).toBeNull();
    const sum = approach.causes.reduce((s, c) => s + c.w, 0);
    expect(sum).toBeCloseTo(approach.w, 12);
    expect(approach.causes.every((c) => c.w > 0)).toBe(true);
    // printed numbers are the stored ones, not the scaled ones
    expect(approach.causes.map((c) => c.strokes)).toEqual([0.9, 0.6]);
  });

  it('never produces negative or NaN widths', () => {
    const model = layoutRootMap({
      areas: [{ area: 'putting', sgPerRound: -1 }],
      sized: [
        { id: 'x', area: 'putting', title: 't', label: 'l', strokes: -2, style: 'likely', tier: 'solid', causality: null, rootCause: null, isNew: false },
        { id: 'y', area: 'putting', title: 't', label: 'l', strokes: Number.NaN, style: 'likely', tier: 'solid', causality: null, rootCause: null, isNew: false },
      ],
      unsized: [],
      other: [],
      newCount: 0,
    });
    expect(model.losses[0]!.causes).toHaveLength(0);
    expect(model.losses[0]!.remainder?.w).toBeCloseTo(1, 9);
  });

  it('draws nothing when there is no area SG', () => {
    const model = buildRootMap({ areas: [{ area: 'putting', sgPerRound: null }], insights: [insight({ category: 'putting', strokes: 1 })] });
    expect(model.scale).toBe(0);
    expect(model.losses).toHaveLength(0);
    expect(model.netSg).toBeNull();
    expect(buildRootHeadline(model, null)).toBeNull();
    // the cause is still rendered somewhere, never dropped
    expect(model.other).toHaveLength(1);
  });
});

describe('buildRootMap routing (every returned row lands somewhere)', () => {
  it('splits sized, unsized and other reads', () => {
    const sized = insight({ category: 'putting', strokes: 1 });
    const unsized = insight({ category: 'approach', strokes: null });
    const scoring = insight({ category: 'scoring', strokes: 0.8 });
    const underGain = insight({ category: 'tee', strokes: 0.3 });
    const model = buildRootMap({ areas: AREAS, insights: [sized, unsized, scoring, underGain] });
    expect(model.losses.flatMap((l) => l.causes).map((c) => c.id)).toEqual([sized.id]);
    expect(model.unsized.map((u) => u.id)).toEqual([unsized.id]);
    expect(model.other.map((o) => o.id).sort()).toEqual([scoring.id, underGain.id].sort());
    const placed = model.losses.flatMap((l) => l.causes).length + model.unsized.length + model.other.length;
    expect(placed).toBe(4);
  });

  it('dedupes by subject, newest evidence wins', () => {
    const old = insight({ id: 'old', category: 'putting', metric: 'putts_made_3_5ft_pct', strokes: 2, updated_at: '2026-08-01T00:00:00Z' });
    const fresh = insight({ id: 'fresh', category: 'putting', metric: 'putts_made_3_5ft_pct', strokes: 1, updated_at: '2026-09-10T00:00:00Z' });
    const model = buildRootMap({ areas: AREAS, insights: [old, fresh] });
    const ids = model.losses.flatMap((l) => l.causes).map((c) => c.id);
    expect(ids).toEqual(['fresh']);
    // the folded-away row was exposed upstream, so it still renders as an other read
    expect(model.other.map((o) => o.id)).toEqual(['old']);
  });

  it('marks insights first detected on/after the last round as new', () => {
    const before = insight({ category: 'putting', strokes: 1, created_at: '2026-09-16T23:00:00Z' });
    const on = insight({ category: 'putting', strokes: 0.5, created_at: '2026-09-17T08:00:00Z' });
    const model = buildRootMap({ areas: AREAS, insights: [before, on], newSinceDate: '2026-09-17' });
    const byId = Object.fromEntries(model.losses[0]!.causes.map((c) => [c.id, c.isNew]));
    expect(byId[before.id]).toBe(false);
    expect(byId[on.id]).toBe(true);
    expect(model.newCount).toBe(1);
  });
});

describe('default selection', () => {
  it('prefers the largest observed root', () => {
    const likelyBig = insight({ category: 'putting', strokes: 1.5, level: 'inferred_hypothesis' });
    const observedSmall = insight({ category: 'putting', strokes: 0.4, level: 'observed_sequence' });
    const model = buildRootMap({ areas: AREAS, insights: [likelyBig, observedSmall] });
    expect(model.defaultSelectedId).toBe(observedSmall.id);
  });

  it('falls back to the largest likely root when nothing is observed (production today)', () => {
    const formingBig = insight({ category: 'putting', strokes: 1.9, confidence: 0.5 });
    const likely = insight({ category: 'putting', strokes: 0.7 });
    const likelySmall = insight({ category: 'approach', strokes: 0.2 });
    const model = buildRootMap({ areas: AREAS, insights: [formingBig, likely, likelySmall] });
    expect(model.defaultSelectedId).toBe(likely.id);
  });

  it('falls back to the largest branch when every root is forming or unexplained', () => {
    const a = insight({ category: 'putting', strokes: 0.5, confidence: 0.45 });
    const b = insight({ category: 'putting', strokes: 1.1, confidence: 0.3 });
    const c = insight({ category: 'approach', strokes: 0.9, level: null });
    const model = buildRootMap({ areas: AREAS, insights: [a, b, c] });
    expect(model.defaultSelectedId).toBe(b.id);
  });

  it('is null with no sized branch', () => {
    const model = buildRootMap({ areas: AREAS, insights: [insight({ category: 'approach', strokes: null })] });
    expect(model.defaultSelectedId).toBeNull();
  });
});

describe('headline wording follows causality', () => {
  it('says "likely" for a hypothesis and never claims it was seen', () => {
    const likely = insight({ category: 'putting', strokes: 1, label: '3-5 ft putts' });
    const model = buildRootMap({ areas: AREAS, insights: [likely] });
    const text = buildRootHeadline(model, findBranch(model, model.defaultSelectedId))!;
    expect(text).toContain('Off the tee is gaining 1.98');
    expect(text).toContain('Putting gives back 2.93, likely around 3–5 ft putts.');
    expect(text).not.toMatch(/seen in your shots/i);
  });

  it('says "seen in your shots" only for an observed root', () => {
    const observed = insight({ category: 'putting', strokes: 1, label: '3-5 ft putts', level: 'observed_sequence' });
    const model = buildRootMap({ areas: AREAS, insights: [observed] });
    expect(buildRootHeadline(model, findBranch(model, observed.id))).toContain('seen in your shots');
  });

  it('reads honestly when every root is forming and every approach is unsized', () => {
    const forming = insight({ category: 'putting', strokes: 1, label: '3-5 ft putts', confidence: 0.5 });
    const unsized = insight({ category: 'approach', strokes: null });
    const model = buildRootMap({ areas: AREAS, insights: [forming, unsized] });
    const text = buildRootHeadline(model, findBranch(model, model.defaultSelectedId))!;
    expect(text).toContain('still forming');
    expect(text).not.toMatch(/seen in your shots|likely/i);
    expect(model.losses.find((l) => l.area === 'approach')!.causes).toHaveLength(0);
    expect(model.unsized).toHaveLength(1);
  });

  it('handles a player with no gaining area', () => {
    const model = buildRootMap({ areas: [{ area: 'putting', sgPerRound: -1 }], insights: [] });
    expect(buildRootHeadline(model, null)).toBe('Every area sits below the Tour line right now. Putting gives back 1.00.');
  });
});

describe('area trends', () => {
  it('builds chronological sparklines and omits the strip without two points', () => {
    const rounds = [
      { date: '2026-09-17', tee: 1, approach: null, short_game: 0.1, putting: -3 },
      { date: '2026-09-10', tee: 0.5, approach: -0.2, short_game: null, putting: -2 },
    ];
    const lines = buildAreaSparklines(rounds);
    expect(lines.find((l) => l.area === 'tee')!.points).toEqual([0.5, 1]);
    expect(lines.find((l) => l.area === 'approach')!.points).toEqual([-0.2]);
    expect(buildAreaSparklines(rounds.slice(0, 1))).toEqual([]);
  });

  it('computes Monday week starts in UTC', () => {
    expect(weekStartOf('2026-09-17')).toBe('2026-09-14'); // Thu → Mon
    expect(weekStartOf('2026-09-14')).toBe('2026-09-14');
    expect(weekStartOf('2026-09-20')).toBe('2026-09-14'); // Sun → Mon
  });

  it('averages each player once per week', () => {
    const weeks = buildTeamTrend([
      { playerId: 'a', date: '2026-09-15', tee: 1, approach: null, short_game: null, putting: -2 },
      { playerId: 'a', date: '2026-09-16', tee: 3, approach: null, short_game: null, putting: -2 },
      { playerId: 'b', date: '2026-09-17', tee: 0, approach: null, short_game: null, putting: 0 },
      { playerId: 'b', date: '2026-09-08', tee: 1, approach: null, short_game: null, putting: null },
    ]);
    expect(weeks.map((w) => w.weekStart)).toEqual(['2026-09-07', '2026-09-14']);
    // week of 14th: a mean tee 2, b 0 → 1
    expect(weeks[1]!.values.tee).toBeCloseTo(1, 9);
    expect(weeks[1]!.values.putting).toBeCloseTo(-1, 9);
    expect(weeks[1]!.values.approach).toBeNull();
    expect(weeks[1]!.players).toBe(2);
    expect(weeks[1]!.rounds).toBe(3);
  });
});

describe('team roots', () => {
  function signal(over: Partial<GroupedSignal> & { metric: string; strokes: number | null; confidence?: number; level?: 'observed_sequence' | 'inferred_hypothesis' }): GroupedSignal {
    return {
      id: over.id ?? `s-${Math.random()}`,
      kind: over.kind ?? 'insight',
      category: over.category ?? 'putting',
      severity: 'high',
      title: 't',
      claim: 'c',
      ageDays: 1,
      status: 'active',
      strokeImpact: 0,
      playerId: over.playerId === undefined ? 'a' : over.playerId,
      supersededCount: 0,
      evidence: evidence({
        metric: over.metric,
        metric_label: over.metric,
        confidence: over.confidence ?? 0.8,
        counterfactual: over.strokes === null ? null : { strokes_saved_per_round: over.strokes, suppressed: false },
        diagnosis: diagnosis(over.level ?? 'inferred_hypothesis'),
      } as never),
    };
  }
  const sg = (putting: number) => ({ tee: 0.5, approach: -0.5, short_game: 0, putting });
  const players = [
    { id: 'a', name: 'A', roundsPlayed: 10, sg: sg(-2), sgTotal: -2 },
    { id: 'b', name: 'B', roundsPlayed: 10, sg: sg(-1), sgTotal: -4 },
    { id: 'c', name: 'C', roundsPlayed: 10, sg: sg(-3), sgTotal: null },
    { id: 'd', name: 'D', roundsPlayed: 0, sg: { tee: null, approach: null, short_game: null, putting: null }, sgTotal: -1 },
  ];

  it('groups by evidence.metric, skips synthesis/pattern rows, averages over the roster', () => {
    const model = buildTeamRoots({
      players,
      signals: [
        signal({ playerId: 'a', metric: 'short_putts', strokes: 1.2 }),
        signal({ playerId: 'b', metric: 'short_putts', strokes: 0.8 }),
        signal({ playerId: 'c', metric: 'short_putts', strokes: null }),
        signal({ playerId: 'a', metric: 'lag', strokes: 0.4 }),
        signal({ playerId: null, kind: 'team_synthesis', metric: 'short_putts', strokes: 9 }),
        signal({ playerId: 'a', kind: 'pattern', metric: 'short_putts', strokes: 9 }),
        signal({ playerId: 'zz', metric: 'short_putts', strokes: 9 }),
      ],
    });
    const col = model.columns.find((c) => c.metric === 'short_putts')!;
    expect(col.players).toBe(3);
    expect(col.shared).toBe(true);
    expect(col.teamStrokes).toBeCloseTo((1.2 + 0.8) / 4, 9);
    expect(model.columns.find((c) => c.metric === 'lag')!.shared).toBe(false);
    // team area SG averages only players with a stored value
    expect(model.teamAreaSg.putting).toBeCloseTo(-2, 9);
    expect(model.playersWithSg).toBe(3);
    // rows sorted by total vs Tour, unknown totals last
    expect(model.rows.map((r) => r.playerId)).toEqual(['b', 'a', 'd', 'c']);
    // unsized cell kept as present-but-unsized
    expect(model.rows.find((r) => r.playerId === 'c')!.cells.short_putts!.strokes).toBeNull();
    // team map: only shared SG columns become branches
    const branches = model.map.losses.flatMap((l) => l.causes);
    expect(branches.map((b) => b.id)).toEqual(['team:short_putts']);
    expect(branches[0]!.style).toBe('likely');
  });

  it('marks a shared column forming when its mean confidence is below solid', () => {
    const model = buildTeamRoots({
      players,
      signals: ['a', 'b', 'c'].map((p) => signal({ playerId: p, metric: 'short_putts', strokes: 0.5, confidence: 0.5 })),
    });
    expect(model.map.losses.flatMap((l) => l.causes)[0]!.style).toBe('forming');
  });
});

describe('humanizeCauseLabel', () => {
  it('turns stored metric labels into plain phrases', () => {
    expect(humanizeCauseLabel('Putts Made 3-5 ft')).toBe('3–5 ft putts');
    expect(humanizeCauseLabel('Greens hit from 125-175 yd')).toBe('Greens hit from 125–175 yd');
  });
});
