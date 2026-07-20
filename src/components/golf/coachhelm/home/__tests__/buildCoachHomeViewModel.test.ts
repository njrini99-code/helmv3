import { describe, expect, it } from 'vitest';
import type { TeamCategory } from '@/app/golf/actions/team-category-insights';
import {
  buildCoachLedger,
  buildCompositeHero,
  buildDirectiveVerdict,
  buildFlaggedPlayerPriorities,
  buildRosterHeatSentence,
  buildSignalsSummary,
  buildTrajectoryCounts,
  buildTrajectorySentence,
  countDistinctAttentionPlayers,
  formatAccuracyReadout,
  formatAnalyzedDate,
  rankCoachCategories,
  resolveSignalsFilter,
  type TeamCategoryRatings,
} from '../buildCoachHomeViewModel';

function makeCategory(overrides: Partial<TeamCategory> & { id: string }): TeamCategory {
  return {
    label: overrides.label ?? overrides.id,
    teamAvg: 0,
    teamAvgLabel: '',
    trend: overrides.trend ?? 'stable',
    insights: overrides.insights ?? [],
    players: overrides.players ?? [],
    primaryMetric: overrides.primaryMetric ?? '',
    attentionCount: overrides.attentionCount ?? 0,
    ...overrides,
  };
}

const RATINGS: TeamCategoryRatings = { teeGame: 70, approach: 40, shortGame: 60, putting: 20, scoring: 55 };

describe('rankCoachCategories', () => {
  it('returns [] when teamCategories is absent (cold start, never a fabricated ranking)', () => {
    expect(rankCoachCategories(null, [])).toEqual([]);
    expect(rankCoachCategories(undefined, [])).toEqual([]);
  });

  it('ranks worst-first by rating', () => {
    const ranked = rankCoachCategories(RATINGS, []);
    expect(ranked.map((r) => r.categoryId)).toEqual(['putting', 'approach', 'scoring', 'short_game', 'driving']);
    expect(ranked[0]?.rating).toBe(20);
  });

  it('joins each row to its TeamCategory by categoryId', () => {
    const puttingCat = makeCategory({ id: 'putting', label: 'Putting' });
    const ranked = rankCoachCategories(RATINGS, [puttingCat]);
    const putting = ranked.find((r) => r.categoryId === 'putting');
    expect(putting?.cat).toBe(puttingCat);
    expect(ranked.find((r) => r.categoryId === 'driving')?.cat).toBeUndefined();
  });
});

describe('buildCompositeHero', () => {
  it('formats a finite composite', () => {
    expect(buildCompositeHero(62.4)).toEqual({ value: '62', unit: 'composite' });
  });
  it('honestly em-dashes a missing composite', () => {
    expect(buildCompositeHero(null)).toEqual({ value: '—' });
    expect(buildCompositeHero(undefined)).toEqual({ value: '—' });
    expect(buildCompositeHero(NaN)).toEqual({ value: '—' });
  });
});

describe('buildDirectiveVerdict', () => {
  it('names the weakest category and its rating', () => {
    const ranked = rankCoachCategories(RATINGS, []);
    expect(buildDirectiveVerdict(ranked[0] ?? null)).toBe('Putting needs the most work right now — 20 of 100.');
  });
  it('falls back to an honest cold-start sentence when there is no weakest category', () => {
    expect(buildDirectiveVerdict(null)).toBe(
      'The team directive fills in once players log rounds with shot detail.',
    );
  });
});

describe('buildTrajectoryCounts / buildTrajectorySentence', () => {
  it('counts each category trend bucket', () => {
    const categories = [
      makeCategory({ id: 'a', trend: 'improving' }),
      makeCategory({ id: 'b', trend: 'improving' }),
      makeCategory({ id: 'c', trend: 'declining' }),
      makeCategory({ id: 'd', trend: 'stable' }),
    ];
    expect(buildTrajectoryCounts(categories)).toEqual({ improving: 2, stable: 1, declining: 1 });
  });

  it('formats the sentence', () => {
    expect(buildTrajectorySentence({ improving: 2, stable: 1, declining: 1 })).toBe(
      '2 improving · 1 steady · 1 declining',
    );
  });

  it('honestly degrades to a fill-in sentence with zero categories', () => {
    expect(buildTrajectorySentence({ improving: 0, stable: 0, declining: 0 })).toBe(
      'Trajectory fills in once category trends are computed.',
    );
  });
});

describe('buildFlaggedPlayerPriorities', () => {
  const labelById = new Map([
    ['putting', 'Putting'],
    ['approach', 'Approach'],
    ['driving', 'Driving'],
  ]);

  it('ranks players by how many categories flag them, top 3, deduped', () => {
    const categories: TeamCategory[] = [
      makeCategory({
        id: 'putting',
        players: [
          { playerId: 'p1', playerName: 'Alice', avatarUrl: null, value: 0, trend: 'stable', trendDelta: 0, needsAttention: true },
          { playerId: 'p2', playerName: 'Bob', avatarUrl: null, value: 0, trend: 'stable', trendDelta: 0, needsAttention: true },
        ],
      }),
      makeCategory({
        id: 'approach',
        players: [
          { playerId: 'p1', playerName: 'Alice', avatarUrl: null, value: 0, trend: 'stable', trendDelta: 0, needsAttention: true },
          { playerId: 'p3', playerName: 'Cara', avatarUrl: null, value: 0, trend: 'stable', trendDelta: 0, needsAttention: false },
        ],
      }),
    ];
    const out = buildFlaggedPlayerPriorities(categories, labelById);
    expect(out).toEqual([
      { rank: 1, title: 'Alice', value: '2 areas' },
      { rank: 2, title: 'Bob', value: 'Putting' },
    ]);
  });

  it('caps at max and never invents a player who is not flagged', () => {
    const categories: TeamCategory[] = [
      makeCategory({
        id: 'driving',
        players: [
          { playerId: 'p1', playerName: 'A', avatarUrl: null, value: 0, trend: 'stable', trendDelta: 0, needsAttention: false },
        ],
      }),
    ];
    expect(buildFlaggedPlayerPriorities(categories, labelById)).toEqual([]);
  });
});

describe('countDistinctAttentionPlayers', () => {
  it('unions flagged players across categories instead of summing per-category counts', () => {
    const categories: TeamCategory[] = [
      makeCategory({
        id: 'putting',
        players: [
          { playerId: 'p1', playerName: 'A', avatarUrl: null, value: 0, trend: 'stable', trendDelta: 0, needsAttention: true },
        ],
      }),
      makeCategory({
        id: 'approach',
        players: [
          { playerId: 'p1', playerName: 'A', avatarUrl: null, value: 0, trend: 'stable', trendDelta: 0, needsAttention: true },
          { playerId: 'p2', playerName: 'B', avatarUrl: null, value: 0, trend: 'stable', trendDelta: 0, needsAttention: true },
        ],
      }),
    ];
    // p1 flagged in 2 categories, p2 in 1 — distinct count is 2, not 3.
    expect(countDistinctAttentionPlayers(categories)).toBe(2);
  });
});

describe('buildCoachLedger', () => {
  it('formats every field', () => {
    expect(buildCoachLedger({ playerCount: 8, attentionCount: 3, lastAnalyzed: 'Jul 18' })).toEqual([
      { label: 'Players', value: '8' },
      { label: 'Attention', value: '3' },
      { label: 'Last analyzed', value: 'Jul 18' },
    ]);
  });
  it('honestly em-dashes a missing lastAnalyzed', () => {
    expect(buildCoachLedger({ playerCount: 0, attentionCount: 0, lastAnalyzed: '' })).toEqual([
      { label: 'Players', value: '0' },
      { label: 'Attention', value: '0' },
      { label: 'Last analyzed', value: '—' },
    ]);
  });
});

describe('formatAnalyzedDate', () => {
  it('formats a date-only string in UTC (no timezone shift, no fabricated time)', () => {
    expect(formatAnalyzedDate('2026-06-08')).toBe('Jun 8');
  });
  it('returns empty for an empty/invalid input', () => {
    expect(formatAnalyzedDate('')).toBe('');
    expect(formatAnalyzedDate('not-a-date')).toBe('');
  });
});

describe('buildSignalsSummary', () => {
  it('computes percentages that sum near 100', () => {
    const out = buildSignalsSummary({ critical: 2, warning: 1, info: 1, total: 4 });
    expect(out).toEqual({ criticalPct: 50, warningPct: 25, infoPct: 25, total: 4, unavailable: false });
  });
  it('honestly zeroes out (available) when the team really has zero signals', () => {
    expect(buildSignalsSummary({ critical: 0, warning: 0, info: 0, total: 0 })).toEqual({
      criticalPct: 0,
      warningPct: 0,
      infoPct: 0,
      total: 0,
      unavailable: false,
    });
  });
  // getAlertCounts FAILED (intelligence/page.tsx counts.success===false → null)
  // is a DISTINCT state from a real zero — must not read as the reassuring
  // "no open signals" copy.
  it('flags unavailable (not a fabricated zero) when counts is null', () => {
    expect(buildSignalsSummary(null)).toEqual({
      criticalPct: 0,
      warningPct: 0,
      infoPct: 0,
      total: 0,
      unavailable: true,
    });
    expect(buildSignalsSummary(undefined)).toEqual({
      criticalPct: 0,
      warningPct: 0,
      infoPct: 0,
      total: 0,
      unavailable: true,
    });
  });
});

describe('buildRosterHeatSentence', () => {
  it('handles zero players', () => {
    expect(buildRosterHeatSentence(0, 0)).toBe('No active players yet.');
  });
  it('handles zero flagged', () => {
    expect(buildRosterHeatSentence(6, 0)).toBe('6 players ranked — nobody flagged right now.');
  });
  it('handles a singular player', () => {
    expect(buildRosterHeatSentence(1, 0)).toBe('1 player ranked — nobody flagged right now.');
  });
  it('handles some flagged', () => {
    expect(buildRosterHeatSentence(6, 2)).toBe('2 of 6 players flagged across categories.');
  });
});

describe('formatAccuracyReadout', () => {
  it('formats a 0..1 fraction as a rounded percent', () => {
    expect(formatAccuracyReadout(0.734)).toBe('73%');
  });
  it('honestly em-dashes a missing accuracy', () => {
    expect(formatAccuracyReadout(null)).toBe('—');
    expect(formatAccuracyReadout(undefined)).toBe('—');
  });
});

describe('resolveSignalsFilter', () => {
  it('defaults to alerts when absent/unknown', () => {
    expect(resolveSignalsFilter(undefined)).toBe('alerts');
    expect(resolveSignalsFilter('bogus')).toBe('alerts');
  });
  it('passes through known filters', () => {
    expect(resolveSignalsFilter('insights')).toBe('insights');
    expect(resolveSignalsFilter('patterns')).toBe('patterns');
  });
  it('takes the first value from an array param', () => {
    expect(resolveSignalsFilter(['patterns', 'insights'])).toBe('patterns');
  });
});
