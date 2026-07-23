import { describe, it, expect } from 'vitest';
import {
  biggestLeakArea,
  buildLedger,
  buildPriorities,
  formatSgSigned,
  sgToTrackPct,
  buildStandingTrack,
  buildVerdict,
  categorizePattern,
  buildCategoryInsights,
  buildCategoryTrends,
  type CategorizablePatternWithImpact,
} from '../buildStatsViewModel';

describe('biggestLeakArea', () => {
  it('picks putting given a fixture where sg_putting is the most negative category', () => {
    const rows = [
      { metricId: 'sg_ott', value: 0.1 },
      { metricId: 'sg_approach', value: -0.2 },
      { metricId: 'sg_around_green', value: 0.05 },
      { metricId: 'sg_putting', value: -0.8 },
    ];
    expect(biggestLeakArea(rows)).toBe('putting');
  });

  it('picks driving when sg_ott is the most negative category', () => {
    const rows = [
      { metricId: 'sg_ott', value: -1.1 },
      { metricId: 'sg_approach', value: -0.2 },
      { metricId: 'sg_around_green', value: 0.05 },
      { metricId: 'sg_putting', value: -0.4 },
    ];
    expect(biggestLeakArea(rows)).toBe('driving');
  });

  it('ignores non-SG metric ids', () => {
    const rows = [
      { metricId: 'gir_pct', value: -50 },
      { metricId: 'sg_approach', value: -0.3 },
    ];
    expect(biggestLeakArea(rows)).toBe('approach');
  });

  it('falls back to putting when every value is null/undefined (cold start)', () => {
    const rows = [
      { metricId: 'sg_ott', value: null },
      { metricId: 'sg_approach', value: undefined },
    ];
    expect(biggestLeakArea(rows)).toBe('putting');
  });

  it('falls back to putting on an empty fixture', () => {
    expect(biggestLeakArea([])).toBe('putting');
  });
});

describe('buildLedger', () => {
  it('extracts rounds/fairways/greens/putts with honest formatting', () => {
    const rows = buildLedger({ roundsPlayed: 12, fairwayPct: 61.4, girPct: 52.9, puttsPerRound: 29.3 });
    expect(rows).toEqual([
      { label: 'Rounds', value: '12' },
      { label: 'Fairways', value: '61%' },
      { label: 'Greens', value: '53%' },
      { label: 'Putts / rd', value: '29.3' },
    ]);
  });

  it('em-dashes null/undefined fields instead of fabricating zeros', () => {
    const rows = buildLedger({ roundsPlayed: 0, fairwayPct: null, girPct: undefined, puttsPerRound: null });
    expect(rows).toEqual([
      { label: 'Rounds', value: '0' },
      { label: 'Fairways', value: '—' },
      { label: 'Greens', value: '—' },
      { label: 'Putts / rd', value: '—' },
    ]);
  });

  it('omits deltas when last30/previous30 are not supplied (unchanged flat rows)', () => {
    const rows = buildLedger({ roundsPlayed: 12, fairwayPct: 61.4, girPct: 52.9, puttsPerRound: 29.3 });
    expect(rows.every((r) => r.delta === undefined)).toBe(true);
  });

  it('marks a higher-is-better metric (Fairways) rising as a GOOD up delta', () => {
    const rows = buildLedger({
      roundsPlayed: 12,
      fairwayPct: 65,
      girPct: null,
      puttsPerRound: null,
      last30: { fairwayPct: 65, girPct: null, puttsPerRound: null },
      previous30: { fairwayPct: 58, girPct: null, puttsPerRound: null },
    });
    const fairways = rows.find((r) => r.label === 'Fairways');
    expect(fairways?.delta).toEqual({ text: '+7%', direction: 'up', good: true });
  });

  it('marks a higher-is-better metric (Greens) falling as a BAD down delta', () => {
    const rows = buildLedger({
      roundsPlayed: 12,
      fairwayPct: null,
      girPct: 48,
      puttsPerRound: null,
      last30: { fairwayPct: null, girPct: 48, puttsPerRound: null },
      previous30: { fairwayPct: null, girPct: 55, puttsPerRound: null },
    });
    const greens = rows.find((r) => r.label === 'Greens');
    expect(greens?.delta).toEqual({ text: '−7%', direction: 'down', good: false });
  });

  it('direction-aware: fewer putts per round is a GOOD delta even though the raw number fell', () => {
    const rows = buildLedger({
      roundsPlayed: 12,
      fairwayPct: null,
      girPct: null,
      puttsPerRound: 28.4,
      last30: { fairwayPct: null, girPct: null, puttsPerRound: 28.4 },
      previous30: { fairwayPct: null, girPct: null, puttsPerRound: 29.6 },
    });
    const putts = rows.find((r) => r.label === 'Putts / rd');
    // Raw direction is genuinely "down" (28.4 < 29.6) — the glyph must stay
    // honest to that — but `good` flips true because fewer putts is the win.
    expect(putts?.delta).toEqual({ text: '−1.2', direction: 'down', good: true });
  });

  it('direction-aware: MORE putts per round is a BAD delta', () => {
    const rows = buildLedger({
      roundsPlayed: 12,
      fairwayPct: null,
      girPct: null,
      puttsPerRound: 30.1,
      last30: { fairwayPct: null, girPct: null, puttsPerRound: 30.1 },
      previous30: { fairwayPct: null, girPct: null, puttsPerRound: 28.9 },
    });
    const putts = rows.find((r) => r.label === 'Putts / rd');
    expect(putts?.delta).toEqual({ text: '+1.2', direction: 'up', good: false });
  });

  it('reads an exact tie as a flat, non-good delta', () => {
    const rows = buildLedger({
      roundsPlayed: 12,
      fairwayPct: 60,
      girPct: null,
      puttsPerRound: null,
      last30: { fairwayPct: 60, girPct: null, puttsPerRound: null },
      previous30: { fairwayPct: 60, girPct: null, puttsPerRound: null },
    });
    const fairways = rows.find((r) => r.label === 'Fairways');
    expect(fairways?.delta).toEqual({ text: '0%', direction: 'flat', good: false });
  });

  it('omits a delta when only one side of the comparison is known', () => {
    const rows = buildLedger({
      roundsPlayed: 12,
      fairwayPct: 60,
      girPct: null,
      puttsPerRound: null,
      last30: { fairwayPct: 60, girPct: null, puttsPerRound: null },
      previous30: { fairwayPct: null, girPct: null, puttsPerRound: null },
    });
    const fairways = rows.find((r) => r.label === 'Fairways');
    expect(fairways?.delta).toBeUndefined();
  });
});

describe('buildPriorities', () => {
  it('ranks weaknesses by absolute stroke impact, numbered by order', () => {
    const items = buildPriorities([
      { label: 'Putting 5-10ft', strokeImpact: -0.3 },
      { label: 'Approach 150-175yd', strokeImpact: -0.9 },
      { label: 'Off the tee accuracy', strokeImpact: -0.5 },
    ]);
    expect(items).toEqual([
      { rank: 1, title: 'Approach 150-175yd', value: '−0.90' },
      { rank: 2, title: 'Off the tee accuracy', value: '−0.50' },
      { rank: 3, title: 'Putting 5-10ft', value: '−0.30' },
    ]);
  });

  it('caps at the requested max', () => {
    const items = buildPriorities(
      [
        { label: 'A', strokeImpact: -1 },
        { label: 'B', strokeImpact: -2 },
        { label: 'C', strokeImpact: -3 },
        { label: 'D', strokeImpact: -4 },
      ],
      2,
    );
    expect(items.map((i) => i.title)).toEqual(['D', 'C']);
  });

  it('drops null/undefined/zero-impact entries', () => {
    const items = buildPriorities([
      { label: 'Zero', strokeImpact: 0 },
      { label: 'Missing', strokeImpact: null },
      { label: 'Real', strokeImpact: -0.6 },
    ]);
    expect(items).toEqual([{ rank: 1, title: 'Real', value: '−0.60' }]);
  });
});

describe('formatSgSigned', () => {
  it('formats a positive value with a leading +', () => {
    expect(formatSgSigned(0.42)).toBe('+0.42');
  });
  it('formats a negative value with a minus sign', () => {
    expect(formatSgSigned(-0.31)).toBe('−0.31');
  });
  it('formats exactly zero as E', () => {
    expect(formatSgSigned(0)).toBe('E');
  });
  it('formats null/undefined as an em dash', () => {
    expect(formatSgSigned(null)).toBe('—');
    expect(formatSgSigned(undefined)).toBe('—');
  });
});

describe('sgToTrackPct', () => {
  it('anchors 0 SG at the rail center', () => {
    expect(sgToTrackPct(0)).toBe(50);
  });
  it('clamps a value beyond +halfRange to 100', () => {
    expect(sgToTrackPct(5, 2)).toBe(100);
  });
  it('clamps a value beyond -halfRange to 0', () => {
    expect(sgToTrackPct(-5, 2)).toBe(0);
  });
  it('defaults null to the center (no fabricated lean)', () => {
    expect(sgToTrackPct(null)).toBe(50);
  });
});

describe('buildStandingTrack', () => {
  it('returns undefined when sgTotal has no value yet', () => {
    expect(buildStandingTrack(null, 0.1)).toBeUndefined();
  });

  it('includes a Tour benchmark anchored at 50 and a Team benchmark when known', () => {
    const track = buildStandingTrack(0.5, 0.2);
    expect(track?.subjectLabel).toBe('You');
    expect(track?.benchmarks.find((b) => b.label === 'Tour')?.pct).toBe(sgToTrackPct(0));
    expect(track?.benchmarks.find((b) => b.label === 'Team')).toBeDefined();
  });

  it('omits the Team benchmark when team average is unknown', () => {
    const track = buildStandingTrack(0.5, null);
    expect(track?.benchmarks.find((b) => b.label === 'Team')).toBeUndefined();
  });

  it('labels the subject with the player\'s initials when a coach views a teammate', () => {
    const track = buildStandingTrack(0.5, 0.2, 'coach', 'Jordan Smith');
    expect(track?.subjectLabel).toBe('JS');
  });

  it('defaults to "You" for the self viewer context', () => {
    const track = buildStandingTrack(0.5, 0.2, 'self', 'Jordan Smith');
    expect(track?.subjectLabel).toBe('You');
  });
});

describe('buildVerdict', () => {
  it('reads a cold-start message when SG total is unknown', () => {
    expect(buildVerdict(null, null)).toMatch(/fills in/);
  });

  it('reads a gaining headline for a positive SG total', () => {
    expect(buildVerdict(0.6, null)).toBe('Gaining +0.60 strokes per round on the field.');
  });

  it('appends the leak label when known', () => {
    expect(buildVerdict(-0.4, 'Putting')).toBe(
      '−0.40 strokes per round vs the field. Leaking most in putting.',
    );
  });
});

describe('categorizePattern', () => {
  // Fixtures below are drawn verbatim (or near-verbatim) from the real mined-
  // pattern copy in src/lib/coachhelm/v2/mining/{team-pattern-generator,
  // approach-analytics,shot-pattern-miner}.ts — real description/
  // recommendation prose + real outcome.metric / condition.field names.

  it('categorizes an approach-miss pattern as approach, even when the resulting lie is a short-game word', () => {
    // approach-analytics.ts:444 — outcome.metric is literally
    // `approach_miss_lie_${bucket}_bunker` when the miss lands in a greenside
    // bunker. "bunker" is short-game vocabulary, but "approach" is the more
    // decisive term and must win.
    expect(
      categorizePattern({
        description: 'Jordan Smith misses left 42% of the time on approach — suggests a consistent swing path issue',
        recommendation: 'Aim slightly right of target to play the natural miss.',
        outcome: { metric: 'approach_miss_lie_150_175_bunker' },
      }),
    ).toBe('approach');
  });

  it('categorizes a scrambling/short-game pattern correctly (no "approach" word present)', () => {
    // team-pattern-generator.ts:493-494
    expect(
      categorizePattern({
        description: 'Team scrambling average is 61% (benchmark: 68%) — the team is leaving strokes around the green',
        recommendation: 'Dedicate 30% of practice time to up-and-down situations from various lies.',
        outcome: { metric: 'scrambling_percentage' },
      }),
    ).toBe('short_game');
  });

  it('categorizes a putting pattern from a three-putt outcome metric', () => {
    // team-pattern-generator.ts:648-653
    expect(
      categorizePattern({
        description: 'Team three-putt rate is 8.2% (benchmark: 5%) — this is costing the team strokes on the green',
        recommendation: 'Speed control is the #1 factor in avoiding three-putts.',
        outcome: { metric: 'three_putt_percentage' },
      }),
    ).toBe('putting');
  });

  it('categorizes a driving pattern from a tee-strategy metric with no description text', () => {
    // tee-strategy.ts:282 — description/recommendation absent for this fixture on purpose.
    expect(categorizePattern({ outcome: { metric: 'tee_strategy_driver_vs_layback' } })).toBe('driving');
  });

  it('categorizes a scoring pattern from a penalty-strokes metric', () => {
    // team-pattern-generator.ts:606-611
    expect(
      categorizePattern({
        description: 'Jordan Smith averages 2.1 penalty strokes per round (team avg: 1.4, benchmark: 1.0)',
        recommendation: 'Penalty strokes are free strokes to the field. Focus on course management.',
        outcome: { metric: 'penalty_strokes_per_round' },
      }),
    ).toBe('scoring');
  });

  it('resolves strokes-gained metric ids via the same sg_* → category convention buildStandingTrack/biggestLeakArea use', () => {
    expect(categorizePattern({ outcome: { metric: 'sg_ott' } })).toBe('driving');
    expect(categorizePattern({ outcome: { metric: 'sg_approach' } })).toBe('approach');
    expect(categorizePattern({ outcome: { metric: 'sg_around_green' } })).toBe('short_game');
    expect(categorizePattern({ outcome: { metric: 'sg_putting' } })).toBe('putting');
  });

  it('falls back to general for a genuinely ambiguous shot-level pattern (no description text persisted)', () => {
    // shot-pattern-miner.ts's savePatterns — contextual shot-dispersion rows
    // persist NO human-readable description/recommendation at all.
    expect(
      categorizePattern({
        outcome: { metric: 'miss_direction' },
        conditions: [
          { field: 'distance_range', label: '150-175 yd' },
          { field: 'lie' },
        ],
      }),
    ).toBe('general');
  });

  it('falls back to general for a pattern about something outside the five stat categories', () => {
    // team-pattern-generator.ts:567 description — freshman/upperclassman
    // experience gap. (The real fixture's paired recommendation mentions
    // "course management", which this categorizer correctly treats as
    // scoring-adjacent vocabulary — omitted here to isolate the true
    // no-signal case: a pattern that names none of the five categories.)
    expect(
      categorizePattern({
        description: 'Freshmen average 76.4 vs upperclassmen 73.1 — a 3.3 stroke gap that narrows with experience',
        outcome: { metric: 'class_year_gap' },
      }),
    ).toBe('general');
  });

  it('treats course-management / penalty vocabulary as scoring-adjacent (they are literal strokes on the card)', () => {
    // team-pattern-generator.ts:567-568 — the same freshman fixture's REAL
    // recommendation does mention course management, and that is a deliberate
    // categorization choice (not a leak): ScoringDrill is where course-
    // management/worst-hole content already surfaces on this surface.
    expect(
      categorizePattern({
        description: 'Freshmen average 76.4 vs upperclassmen 73.1 — a 3.3 stroke gap that narrows with experience',
        recommendation: 'Pair freshmen with upperclassmen mentors for course management tips.',
        outcome: { metric: 'class_year_gap' },
      }),
    ).toBe('scoring');
  });

  it('falls back to general for a pattern with no text or metric at all', () => {
    expect(categorizePattern({})).toBe('general');
  });

  it('is case-insensitive and tolerant of snake_case field/label vocabulary', () => {
    expect(categorizePattern({ conditions: [{ field: 'PUTT_MISS_DIRECTION' }] })).toBe('putting');
  });
});

describe('buildCategoryInsights', () => {
  const patterns: CategorizablePatternWithImpact[] = [
    {
      id: 'p1',
      strokeImpact: -0.9,
      patternType: 'contextual',
      description: 'Misses left 42% of the time on approach — suggests a consistent swing path issue',
      recommendation: 'Aim slightly right of target to play the natural miss.',
      outcome: { metric: 'approach_miss_lie_150_175_fairway' },
    },
    {
      id: 'p2',
      strokeImpact: -0.6,
      patternType: 'conditional',
      description: 'Misses short 38% of the time — distance control or club selection issue',
      recommendation: 'Club up one more often.',
      outcome: { metric: 'approach_severity_150_175' },
    },
    {
      id: 'p3',
      strokeImpact: -0.3,
      patternType: 'conditional',
      description: 'A third, weaker approach read that should be truncated by max=2',
      outcome: { metric: 'approach_direction_150_175_left' },
    },
    {
      id: 'p4',
      strokeImpact: 0.5,
      patternType: 'conditional',
      description: 'Makes only 31% from 5-10ft (benchmark: 45%) — a key distance for scoring',
      recommendation: 'Dedicated putting drills from 5-10ft.',
      outcome: { metric: 'putting_efficiency' },
    },
    {
      id: 'p5',
      strokeImpact: 0,
      patternType: 'conditional',
      description: 'Zero-impact pattern — must never render',
      outcome: { metric: 'putting_efficiency' },
    },
    {
      id: 'p6',
      strokeImpact: null,
      patternType: 'conditional',
      description: 'Missing-impact pattern — must never render',
      outcome: { metric: 'putting_efficiency' },
    },
  ];

  it('buckets each pattern into its categorized array, ranked by |strokeImpact| descending', () => {
    const buckets = buildCategoryInsights(patterns);
    expect(buckets.approach.map((i) => i.strokeImpact)).toEqual([-0.9, -0.6]);
    expect(buckets.putting.map((i) => i.strokeImpact)).toEqual([0.5]);
  });

  it('caps each category at `max` (default 2), dropping the weakest overflow entries', () => {
    const buckets = buildCategoryInsights(patterns);
    expect(buckets.approach).toHaveLength(2);
    expect(buckets.approach.some((i) => i.title.includes('third, weaker'))).toBe(false);
  });

  it('honors a custom max', () => {
    const buckets = buildCategoryInsights(patterns, 1);
    expect(buckets.approach).toHaveLength(1);
    expect(buckets.approach[0]?.strokeImpact).toBe(-0.9);
  });

  it('drops zero and null/undefined stroke-impact patterns entirely', () => {
    const buckets = buildCategoryInsights(patterns);
    const allTitles = Object.values(buckets).flatMap((rows) => rows.map((r) => r.title));
    expect(allTitles.some((t) => t.includes('must never render'))).toBe(false);
  });

  it('honest-falls-back to a pretty pattern-type label when description is missing', () => {
    const buckets = buildCategoryInsights([
      { id: 'shot1', strokeImpact: -0.4, patternType: 'contextual', outcome: { metric: 'miss_direction' } },
    ]);
    expect(buckets.general[0]?.title).toBe('Shot pattern');
  });

  it('carries the recommendation through when present, null when absent', () => {
    const buckets = buildCategoryInsights(patterns);
    expect(buckets.approach[0]?.recommendation).toBe('Aim slightly right of target to play the natural miss.');
    expect(buckets.approach[1]?.recommendation).toBe('Club up one more often.');
  });

  it('returns an entry (possibly empty) for every one of the six categories', () => {
    const buckets = buildCategoryInsights([]);
    expect(Object.keys(buckets).sort()).toEqual(
      ['approach', 'driving', 'general', 'putting', 'scoring', 'short_game'].sort(),
    );
    for (const rows of Object.values(buckets)) expect(rows).toEqual([]);
  });
});

describe('buildCategoryTrends', () => {
  it('threads fairway/gir/putts/score series onto driving/approach/putting/scoring respectively', () => {
    const trends = buildCategoryTrends({
      fairway: [{ value: 55 }, { value: 61 }],
      gir: [{ value: 40 }, { value: 48 }],
      putts: [{ value: 30.1 }, { value: 28.4 }],
      score: [{ value: 78 }, { value: 74 }],
    });
    expect(trends.driving?.series).toEqual([55, 61]);
    expect(trends.approach?.series).toEqual([40, 48]);
    expect(trends.putting?.series).toEqual([30.1, 28.4]);
    expect(trends.scoring?.series).toEqual([78, 74]);
  });

  it('never fabricates a short_game trend — always null (no source data exists on this surface)', () => {
    const trends = buildCategoryTrends({
      fairway: [{ value: 55 }, { value: 61 }],
      gir: [{ value: 40 }, { value: 48 }],
      putts: [{ value: 30 }, { value: 28 }],
      score: [{ value: 78 }, { value: 74 }],
    });
    expect(trends.short_game).toBeNull();
  });

  it('returns null for a category whose series is empty/absent, not a fabricated flat line', () => {
    const trends = buildCategoryTrends({});
    expect(trends.driving).toBeNull();
    expect(trends.approach).toBeNull();
    expect(trends.putting).toBeNull();
    expect(trends.scoring).toBeNull();
  });

  it('returns null for an input of null/undefined entirely', () => {
    expect(buildCategoryTrends(null)).toEqual({
      driving: null,
      approach: null,
      putting: null,
      scoring: null,
      short_game: null,
    });
    expect(buildCategoryTrends(undefined).driving).toBeNull();
  });

  it('marks a higher-is-better rise (fairway%) as a GOOD up delta', () => {
    const trends = buildCategoryTrends({ fairway: [{ value: 55 }, { value: 63 }] });
    expect(trends.driving?.delta).toEqual({ text: '+8%', direction: 'up', good: true });
  });

  it('marks fewer putts per round (lower-is-better) as a GOOD delta even though the raw number fell', () => {
    const trends = buildCategoryTrends({ putts: [{ value: 30.2 }, { value: 28.6 }] });
    expect(trends.putting?.delta).toEqual({ text: '−1.6', direction: 'down', good: true });
  });

  it('marks a rising score (lower-is-better) as a BAD up delta', () => {
    const trends = buildCategoryTrends({ score: [{ value: 74 }, { value: 78 }] });
    expect(trends.scoring?.delta).toEqual({ text: '+4.0', direction: 'up', good: false });
  });

  it('omits the delta (but keeps the series) when fewer than 2 finite points exist', () => {
    const trends = buildCategoryTrends({ gir: [{ value: 42 }] });
    expect(trends.approach?.series).toEqual([42]);
    expect(trends.approach?.delta).toBeUndefined();
  });

  it('drops non-finite points from the series before computing anything', () => {
    const trends = buildCategoryTrends({ fairway: [{ value: 50 }, { value: Number.NaN }, { value: 60 }] });
    expect(trends.driving?.series).toEqual([50, 60]);
  });

  it('carries a human label per category for the strip/aria-label', () => {
    const trends = buildCategoryTrends({ fairway: [{ value: 55 }, { value: 61 }] });
    expect(trends.driving?.label).toBe('Fairways hit');
  });
});
