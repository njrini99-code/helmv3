import { describe, it, expect } from 'vitest';
import { rankByValue, weightedMean, signalToneFor, scoringTrendVerdict, worstCategoryLabel, worstStandingMetric, formatMetricValue, fmtSg, buildTeamBoardViewModel, TREND_SIGNAL_MIN_ROUNDS, type TeamBoardPlayerInput } from '../buildTeamBoardViewModel';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';

function standing(overrides: Partial<PlayerStanding> & { player_value: number }): PlayerStanding {
  return {
    player_id: 'p1',
    metric_id: 'sg_putting',
    team_avg: null,
    team_n: 0,
    team_pct: null,
    level_avg: null,
    level_n: 0,
    level_pct: null,
    pga_value: 0,
    pga_delta: null,
    computed_at: '2026-07-19T00:00:00Z',
    ...overrides,
  };
}

describe('rankByValue', () => {
  it('ranks higher_better values 1..N best first', () => {
    const ranks = rankByValue(
      [
        { id: 'a', value: 0.5 },
        { id: 'b', value: -0.2 },
        { id: 'c', value: 1.1 },
      ],
      'higher_better',
    );
    expect(ranks.get('c')).toEqual({ rank: 1, of: 3 });
    expect(ranks.get('a')).toEqual({ rank: 2, of: 3 });
    expect(ranks.get('b')).toEqual({ rank: 3, of: 3 });
  });

  it('ranks lower_better values 1..N best first', () => {
    const ranks = rankByValue(
      [
        { id: 'a', value: 72.4 },
        { id: 'b', value: 79.8 },
      ],
      'lower_better',
    );
    expect(ranks.get('a')).toEqual({ rank: 1, of: 2 });
    expect(ranks.get('b')).toEqual({ rank: 2, of: 2 });
  });

  it('excludes null/non-finite values from both the ranking and the denominator', () => {
    const ranks = rankByValue(
      [
        { id: 'a', value: 1 },
        { id: 'b', value: null },
        { id: 'c', value: Number.NaN },
      ],
      'higher_better',
    );
    expect(ranks.get('a')).toEqual({ rank: 1, of: 1 });
    expect(ranks.has('b')).toBe(false);
    expect(ranks.has('c')).toBe(false);
  });
});

describe('weightedMean', () => {
  it('weights by rounds played', () => {
    // (0.5*10 + -0.5*2) / 12 = 4/12 = 0.3333...
    const mean = weightedMean([
      { value: 0.5, weight: 10 },
      { value: -0.5, weight: 2 },
    ]);
    expect(mean).toBeCloseTo(1 / 3, 5);
  });

  it('falls back to an unweighted mean when no entry has a positive weight', () => {
    const mean = weightedMean([
      { value: 1, weight: 0 },
      { value: 3, weight: 0 },
    ]);
    expect(mean).toBe(2);
  });

  it('returns null when every value is null', () => {
    expect(weightedMean([{ value: null, weight: 5 }])).toBeNull();
  });
});

describe('signalToneFor — hot/watch/quiet rules', () => {
  it('is hot when the player is the top performer', () => {
    expect(
      signalToneFor({
        isTopPerformer: true,
        trend: 'stable',
        topInsightPriority: null,
      }),
    ).toBe('hot');
  });

  it('is hot when improving, even without the top-performer crown', () => {
    expect(
      signalToneFor({
        isTopPerformer: false,
        trend: 'improving',
        topInsightPriority: null,
      }),
    ).toBe('hot');
  });

  it('is watch when declining', () => {
    expect(
      signalToneFor({
        isTopPerformer: false,
        trend: 'declining',
        topInsightPriority: null,
      }),
    ).toBe('watch');
  });

  it('is watch on a high-priority top insight even without a declining trend', () => {
    expect(
      signalToneFor({
        isTopPerformer: false,
        trend: 'stable',
        topInsightPriority: 'high',
      }),
    ).toBe('watch');
    expect(
      signalToneFor({
        isTopPerformer: false,
        trend: null,
        topInsightPriority: 'critical',
      }),
    ).toBe('watch');
  });

  it('is quiet for a steady player with no flagged insight', () => {
    expect(
      signalToneFor({
        isTopPerformer: false,
        trend: 'stable',
        topInsightPriority: null,
      }),
    ).toBe('quiet');
  });

  it('is quiet (not watch) for a low/medium-priority insight', () => {
    expect(
      signalToneFor({
        isTopPerformer: false,
        trend: 'stable',
        topInsightPriority: 'medium',
      }),
    ).toBe('quiet');
  });

  it('is quiet for a cold-start player awaiting a trend signal', () => {
    expect(
      signalToneFor({
        isTopPerformer: false,
        trend: null,
        topInsightPriority: null,
      }),
    ).toBe('quiet');
  });
});

describe('scoringTrendVerdict', () => {
  it('returns null (no signal) for a null delta', () => {
    expect(scoringTrendVerdict(null)).toBeNull();
  });

  it('classifies a negative (improving, lower-is-better) delta past the threshold', () => {
    expect(scoringTrendVerdict(-1.2)).toBe('improving');
  });

  it('classifies a positive delta past the threshold as declining', () => {
    expect(scoringTrendVerdict(1.2)).toBe('declining');
  });

  it('classifies a delta inside the threshold as stable', () => {
    expect(scoringTrendVerdict(0.05)).toBe('stable');
  });
});

describe('worstCategoryLabel', () => {
  it('picks the category with the highest (worst) rank', () => {
    const label = worstCategoryLabel({
      tee: { rank: 2, of: 6 },
      app: { rank: 4, of: 6 },
      short: { rank: 1, of: 6 },
      putt: { rank: 5, of: 6 },
    });
    expect(label).toBe('Putting');
  });

  it('breaks ties in putt > app > tee > short priority order', () => {
    const label = worstCategoryLabel({
      tee: { rank: 6, of: 6 },
      app: { rank: 6, of: 6 },
      short: null,
      putt: null,
    });
    expect(label).toBe('Approach');
  });

  it('returns null when no category has a rank', () => {
    expect(worstCategoryLabel({ tee: null, app: null, short: null, putt: null })).toBeNull();
  });

  // FIX 1: `of` differs per category (rankByValue only counts players who
  // carry a standing value for THAT metric), so raw rank numbers aren't
  // comparable across categories — normalize to a rank/of percentile first.
  it('normalizes rank/of across categories with unequal denominators — same raw rank, worse percentile wins', () => {
    const label = worstCategoryLabel({
      tee: { rank: 5, of: 12 }, // 0.417 — a big-roster metric, mid-pack
      app: { rank: 3, of: 4 }, // 0.75
      short: null,
      putt: { rank: 5, of: 6 }, // 0.833 — same raw rank as tee, worse percentile
    });
    expect(label).toBe('Putting');
  });

  it('picks a lower raw rank number when its percentile is actually worse', () => {
    // app: dead last of a small 4-player field (1.0) beats putt's raw rank
    // 5 despite putt's rank number being numerically higher.
    const label = worstCategoryLabel({
      tee: null,
      app: { rank: 4, of: 4 },
      short: null,
      putt: { rank: 5, of: 12 },
    });
    expect(label).toBe('Approach');
  });
});

describe('worstStandingMetric', () => {
  it('picks the row with the lowest team percentile', () => {
    const map = new Map<MetricId, PlayerStanding>([
      ['sg_putting', standing({ metric_id: 'sg_putting', player_value: -1.6, team_pct: 20 })],
      ['sg_approach', standing({ metric_id: 'sg_approach', player_value: 0.2, team_pct: 60 })],
    ]);
    const worst = worstStandingMetric(map);
    expect(worst?.metric).toBe('sg_putting');
  });

  it('ignores rows with a null team_pct (cold-start)', () => {
    const map = new Map<MetricId, PlayerStanding>([
      [
        'sg_putting',
        standing({
          metric_id: 'sg_putting',
          player_value: -1.6,
          team_pct: null,
        }),
      ],
      ['sg_approach', standing({ metric_id: 'sg_approach', player_value: 0.2, team_pct: 60 })],
    ]);
    expect(worstStandingMetric(map)?.metric).toBe('sg_approach');
  });

  it('returns null for an undefined or empty map', () => {
    expect(worstStandingMetric(undefined)).toBeNull();
    expect(worstStandingMetric(new Map())).toBeNull();
  });
});

describe('formatMetricValue', () => {
  it('formats percent/strokes/feet/yards/count', () => {
    expect(formatMetricValue(41.4, 'percent')).toBe('41%');
    expect(formatMetricValue(-1.6, 'strokes')).toBe(fmtSg(-1.6));
    expect(formatMetricValue(12.34, 'feet')).toBe('12.3 ft');
    expect(formatMetricValue(220.5, 'yards')).toBe('220.5 yd');
    expect(formatMetricValue(1.2, 'count')).toBe('1.2');
  });
});

function player(overrides: Partial<TeamBoardPlayerInput>): TeamBoardPlayerInput {
  return {
    id: 'p1',
    name: 'Player One',
    classYear: "'26",
    roundsPlayed: 12,
    scoringAverage: 73.5,
    // Defaults mirror an all-18-hole player (roundsPlayed18 === roundsPlayed,
    // scoringAverage18 === scoringAverage) so existing fixtures that predate
    // the 9-hole/partial-round split keep behaving as an all-18 roster.
    roundsPlayed18: 12,
    scoringAverage18: 73.5,
    fairwayPct: 58,
    fairwayHits: 58,
    fairwayAttempts: 100,
    girPct: 62,
    girHits: 62,
    girAttempts: 100,
    scramblingPct: 45,
    scramblesMade: 18,
    scrambleAttempts: 40,
    puttsPerRound: 30,
    totalPutts: 200,
    holesWithPutts: 120,
    birdiesPerRound: 2.1,
    totalBirdies: 14,
    holesWithScore: 120,
    scoringTrend: null,
    lastRoundScore: 74,
    recentScores: [],
    composite: null,
    topInsightTitle: null,
    topInsightPriority: null,
    ...overrides,
  };
}

describe('buildTeamBoardViewModel', () => {
  it('ranks cells from the standing map and marks the top composite hot', () => {
    const jackson = player({
      id: 'jackson',
      composite: 82,
      scoringTrend: -0.1,
    });
    const mason = player({
      id: 'mason',
      composite: 65,
      scoringTrend: 0.9,
      topInsightPriority: 'high',
    });

    const standingByPlayer = new Map<string, Map<MetricId, PlayerStanding>>([
      [
        'jackson',
        new Map([
          [
            'sg_putting',
            standing({
              metric_id: 'sg_putting',
              player_value: 0.6,
              team_pct: 90,
            }),
          ],
        ]),
      ],
      [
        'mason',
        new Map([
          [
            'sg_putting',
            standing({
              metric_id: 'sg_putting',
              player_value: -1.6,
              team_pct: 15,
            }),
          ],
        ]),
      ],
    ]);

    const vm = buildTeamBoardViewModel({
      players: [jackson, mason],
      standingByPlayer,
      intelligenceSampleSize: 4,
      rounds30d: 41,
    });

    const jacksonRow = vm.rows.find((r) => r.id === 'jackson');
    const masonRow = vm.rows.find((r) => r.id === 'mason');

    expect(jacksonRow?.ranks.putt).toEqual({ rank: 1, of: 2 });
    expect(masonRow?.ranks.putt).toEqual({ rank: 2, of: 2 });
    expect(jacksonRow?.signal.tone).toBe('hot');
    expect(jacksonRow?.signal.label).toBe('Top performer');
    expect(masonRow?.signal.tone).toBe('watch');
    expect(masonRow?.expand.worstMetricLabel).toBe('SG: Putting');

    // Expand-band links use `?player=<id>` (NOT `?playerId=`), and the
    // fingerprint link is the player's game page — the shape the stats
    // surfaces and the roster fingerprint route actually read.
    expect(jacksonRow?.expand.links.fullStats).toBe('/golf/dashboard/stats?player=jackson');
    expect(jacksonRow?.expand.links.fingerprint).toBe('/golf/dashboard/players/jackson/game');
    expect(masonRow?.expand.links.fullStats).toBe('/golf/dashboard/stats?player=mason');
    expect(masonRow?.expand.links.fingerprint).toBe('/golf/dashboard/players/mason/game');
  });

  it('reports "N rds to trend" for a cold-start player under the signal minimum', () => {
    const p = player({ id: 'rookie', roundsPlayed: 5, scoringTrend: null });
    const vm = buildTeamBoardViewModel({
      players: [p],
      standingByPlayer: new Map(),
      intelligenceSampleSize: 0,
      rounds30d: 3,
    });
    expect(vm.rows[0]?.signal.tone).toBe('quiet');
    expect(vm.rows[0]?.signal.label).toBe(`${TREND_SIGNAL_MIN_ROUNDS - 5} rds to trend`);
  });

  it('produces an honest em-dash team scoring/SG when the roster has no data', () => {
    // Override scoringAverage18/roundsPlayed18 too — the `player()` helper's
    // defaults mirror an all-18-hole player, which would otherwise mask this
    // "no data at all" fixture's intent now that the KPI reads the 18-only fields.
    const vm = buildTeamBoardViewModel({
      players: [
        player({
          id: 'a',
          scoringAverage: null,
          scoringAverage18: null,
          roundsPlayed18: 0,
        }),
      ],
      standingByPlayer: new Map(),
      intelligenceSampleSize: 0,
      rounds30d: 0,
    });
    expect(vm.kpis.teamScoring).toBe('—');
    expect(vm.kpis.teamSg).toBe('—');
  });

  it('pools raw attempts for team fundamentals and exposes player drill-in values', () => {
    const small = player({
      id: 'small',
      fairwayPct: 100,
      fairwayHits: 1,
      fairwayAttempts: 1,
      girPct: 100,
      girHits: 1,
      girAttempts: 1,
      scramblingPct: 100,
      scramblesMade: 1,
      scrambleAttempts: 1,
      totalPutts: 30,
      holesWithPutts: 18,
      puttsPerRound: 30,
      totalBirdies: 2,
      holesWithScore: 18,
      birdiesPerRound: 2,
    });
    const large = player({
      id: 'large',
      fairwayPct: 50,
      fairwayHits: 50,
      fairwayAttempts: 100,
      girPct: 50,
      girHits: 50,
      girAttempts: 100,
      scramblingPct: 25,
      scramblesMade: 25,
      scrambleAttempts: 100,
      totalPutts: 300,
      holesWithPutts: 180,
      puttsPerRound: 30,
      totalBirdies: 20,
      holesWithScore: 180,
      birdiesPerRound: 2,
    });

    const vm = buildTeamBoardViewModel({
      players: [small, large],
      standingByPlayer: new Map(),
      intelligenceSampleSize: 0,
      rounds30d: 12,
    });

    // Exact pooled rate is 51/101, not the misleading unweighted mean 75%.
    expect(vm.fundamentals.fairwayPct).toBeCloseTo((51 / 101) * 100);
    expect(vm.fundamentals.girPct).toBeCloseTo((51 / 101) * 100);
    expect(vm.fundamentals.scramblingPct).toBeCloseTo((26 / 101) * 100);
    expect(vm.fundamentals.puttsPerRound).toBeCloseTo(30);
    expect(vm.fundamentals.birdiesPerRound).toBeCloseTo(2);
    expect(vm.rows.find((row) => row.id === 'small')?.expand.scrambling).toBe('100.0%');
  });

  // FIX 2: "Team scoring" must be round-weighted like the coach dashboard's
  // "Team Scoring Avg" (pooled round scores / total rounds), NOT an
  // unweighted mean of each player's own average — the two disagree
  // whenever round counts differ across the roster. Both players here are
  // all-18-hole, so roundsPlayed18/scoringAverage18 equal roundsPlayed/
  // scoringAverage.
  it('round-weights team scoring across two players with unequal round counts', () => {
    const heavy = player({
      id: 'heavy',
      scoringAverage: 70,
      roundsPlayed: 20,
      scoringAverage18: 70,
      roundsPlayed18: 20,
    });
    const light = player({
      id: 'light',
      scoringAverage: 80,
      roundsPlayed: 5,
      scoringAverage18: 80,
      roundsPlayed18: 5,
    });

    const vm = buildTeamBoardViewModel({
      players: [heavy, light],
      standingByPlayer: new Map(),
      intelligenceSampleSize: 0,
      rounds30d: 25,
    });

    // Round-weighted: (70*20 + 80*5) / 25 = 72.0 — matches pooling every
    // round score and dividing by total rounds, as dashboard-data.ts does.
    // An unweighted mean of the two averages would wrongly read 75.0.
    expect(vm.kpis.teamScoring).toBe('72.0');
  });

  // Regression: weighting by the ALL-format `roundsPlayed` (which includes
  // 9-hole/partial rounds) instead of the strictly-18-hole `roundsPlayed18`
  // over-weights a mixed-round-type player's 18-hole average and disagrees
  // with the dashboard, which only ever pools 18-hole scores.
  it('round-weights by 18-hole-only counts for a mixed 9-hole/18-hole player', () => {
    // Player A: 3x 18-hole rounds avg 70 + 2x 9-hole rounds — roundsPlayed
    // (all formats) is 5, but roundsPlayed18/scoringAverage18 is 3 rounds @ 70.
    const mixed = player({
      id: 'a',
      scoringAverage: 70,
      roundsPlayed: 5,
      scoringAverage18: 70,
      roundsPlayed18: 3,
    });
    // Player B: 1x 18-hole round scoring 80 — all-format and 18-only agree.
    const pure18 = player({
      id: 'b',
      scoringAverage: 80,
      roundsPlayed: 1,
      scoringAverage18: 80,
      roundsPlayed18: 1,
    });

    const vm = buildTeamBoardViewModel({
      players: [mixed, pure18],
      standingByPlayer: new Map(),
      intelligenceSampleSize: 0,
      rounds30d: 6,
    });

    // Dashboard's true pooled figure: (70*3 + 80*1) / 4 = 72.5. Weighting by
    // the all-format roundsPlayed (5 + 1 = 6) would wrongly read
    // (70*5 + 80*1) / 6 = 71.67.
    expect(vm.kpis.teamScoring).toBe('72.5');
  });
});
