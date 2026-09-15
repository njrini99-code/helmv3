/**
 * ============================================================================
 * rounds-library-logic — unit coverage for the coach Rounds Library's pure
 * derivations (docs/design/fairway-facelift/screens/rounds-library.v3.md)
 * ========================================================================== */
import { describe, it, expect } from 'vitest';
import type { RoundLibraryRound } from '../FairwayRoundsLibrary';
import {
  playerName,
  dateParts,
  firstMonthLabel,
  honestRange,
  roundsDateDomain,
  seriesDelta,
  chronoNormalizedScores,
  formatSignedDecimal,
  roundFieldCap,
  buildRoundFieldMarks,
  computeScopedSummary,
  bestOfRounds,
  rankPlayersByAvgToPar,
  buildRoundsVerdict,
  isMajorRoundType,
} from '../rounds-library-logic';

function makeRound(overrides: Partial<RoundLibraryRound> = {}): RoundLibraryRound {
  return {
    id: 'r1',
    course_name: 'Pebble Beach Golf Links',
    course_city: 'Pebble Beach',
    course_state: 'CA',
    round_date: '2026-06-15',
    round_type: 'practice',
    total_score: 74,
    score_to_par: 2,
    total_putts: 32,
    total_fairways: 14,
    total_fairways_hit: 10,
    total_gir: 12,
    total_gir_possible: 18,
    holes_played: 18,
    status: 'completed',
    player: { first_name: 'Nick', last_name: 'Rini', avatar_url: null },
    ...overrides,
  };
}

describe('playerName', () => {
  it('joins first and last name', () => {
    expect(playerName(makeRound())).toBe('Nick Rini');
  });
  it('is null when unattributed', () => {
    expect(playerName(makeRound({ player: null }))).toBeNull();
  });
  it('is null when both names are blank', () => {
    expect(playerName(makeRound({ player: { first_name: '', last_name: '', avatar_url: null } }))).toBeNull();
  });
});

describe('isMajorRoundType', () => {
  it('treats qualifier, qualifying and tournament as major', () => {
    expect(isMajorRoundType('qualifier')).toBe(true);
    expect(isMajorRoundType('qualifying')).toBe(true);
    expect(isMajorRoundType('tournament')).toBe(true);
    expect(isMajorRoundType('Tournament')).toBe(true);
  });
  it('treats practice and null as not major', () => {
    expect(isMajorRoundType('practice')).toBe(false);
    expect(isMajorRoundType(null)).toBe(false);
  });
});

describe('dateParts (#139 UTC-pinned)', () => {
  it('reads the 1st of a month as that month, not the day before, under a non-UTC host TZ', () => {
    const original = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(dateParts('2026-02-01').md).toBe('Feb 1');
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('firstMonthLabel / honestRange', () => {
  it('is null with no parseable dates', () => {
    expect(firstMonthLabel([])).toBeNull();
    expect(honestRange([])).toBeNull();
  });
  it('reports the earliest month and the full range', () => {
    const rounds = [makeRound({ round_date: '2026-01-01' }), makeRound({ round_date: '2026-04-30' })];
    expect(firstMonthLabel(rounds)).toBe('Jan 2026');
    expect(honestRange(rounds)).toBe('Jan–Apr 2026');
  });
});

describe('roundsDateDomain', () => {
  it('is null with no dated rounds', () => {
    expect(roundsDateDomain([])).toBeNull();
  });
  it('spans the earliest to the latest round_date, scored or not', () => {
    const rounds = [
      makeRound({ round_date: '2026-03-10', total_score: null, score_to_par: null }),
      makeRound({ round_date: '2026-01-05' }),
      makeRound({ round_date: '2026-02-20' }),
    ];
    expect(roundsDateDomain(rounds)).toEqual({ start: '2026-01-05', end: '2026-03-10' });
  });
});

describe('seriesDelta', () => {
  it('is null under two points', () => {
    expect(seriesDelta([])).toBeNull();
    expect(seriesDelta([74])).toBeNull();
  });
  it('is the last-minus-first over a chronological series', () => {
    expect(seriesDelta([76, 75, 72])).toBe(-4);
    expect(seriesDelta([70, 74])).toBe(4);
  });
});

describe('chronoNormalizedScores', () => {
  it('sorts oldest to newest and normalizes 9-hole rounds to 18', () => {
    const rounds = [
      makeRound({ id: 'a', round_date: '2026-02-01', total_score: 40, holes_played: 9 }),
      makeRound({ id: 'b', round_date: '2026-01-01', total_score: 74, holes_played: 18 }),
      makeRound({ id: 'c', round_date: '2026-03-01', total_score: null }),
    ];
    expect(chronoNormalizedScores(rounds)).toEqual([74, 80]);
  });
});

describe('formatSignedDecimal', () => {
  it('signs positive values, leaves negative/zero as plain decimals', () => {
    expect(formatSignedDecimal(2.3)).toBe('+2.3');
    expect(formatSignedDecimal(-1.5)).toBe('-1.5');
    expect(formatSignedDecimal(0)).toBe('0.0');
  });
});

describe('roundFieldCap', () => {
  it('floors at 4 with small swings', () => {
    const rounds = [makeRound({ score_to_par: 1 }), makeRound({ score_to_par: -2 })];
    expect(roundFieldCap(rounds)).toBe(4);
  });
  it('caps at 12 with a huge outlier', () => {
    const rounds = [makeRound({ score_to_par: 20 })];
    expect(roundFieldCap(rounds)).toBe(12);
  });
  it('tracks the largest absolute swing between the floor and the cap', () => {
    const rounds = [makeRound({ score_to_par: 7 }), makeRound({ score_to_par: -3 })];
    expect(roundFieldCap(rounds)).toBe(7);
  });
  it('ignores rounds with no score_to_par', () => {
    expect(roundFieldCap([makeRound({ score_to_par: null })])).toBe(4);
  });
});

describe('buildRoundFieldMarks', () => {
  it('excludes rounds with no score_to_par — an honest mark needs a real height', () => {
    const rounds = [makeRound({ id: 'a', score_to_par: 2 }), makeRound({ id: 'b', score_to_par: null })];
    const marks = buildRoundFieldMarks(rounds);
    expect(marks.map((m) => m.id)).toEqual(['a']);
  });
  it('marks qualifier/tournament rounds as major (the bigger dot)', () => {
    const [mark] = buildRoundFieldMarks([makeRound({ round_type: 'tournament', score_to_par: 3 })]);
    expect(mark!.isMajor).toBe(true);
  });
  it('marks practice/untyped rounds as not major', () => {
    const [mark] = buildRoundFieldMarks([makeRound({ round_type: 'practice', score_to_par: 3 })]);
    expect(mark!.isMajor).toBe(false);
  });
});

describe('computeScopedSummary', () => {
  it('keeps three separate denominators — count, scoredCount and toParCount never collapse into one', () => {
    // 4 rounds logged, none carry a score_to_par: count=4, toParCount=0.
    const rounds = [1, 2, 3, 4].map((i) =>
      makeRound({ id: `r${i}`, total_score: null, score_to_par: null }),
    );
    const summary = computeScopedSummary(rounds);
    expect(summary.count).toBe(4);
    expect(summary.scoredCount).toBe(0);
    expect(summary.toParCount).toBe(0);
    expect(summary.avg).toBeNull();
    expect(summary.avgToPar).toBeNull();
    expect(summary.best).toBeNull();
  });
  it('computes avg/best over scoredCount and avgToPar over toParCount independently', () => {
    const rounds = [
      makeRound({ id: 'a', total_score: 76, score_to_par: 4 }),
      makeRound({ id: 'b', total_score: 72, score_to_par: 0 }),
      // Scored but no to-par on record.
      makeRound({ id: 'c', total_score: 80, score_to_par: null }),
    ];
    const summary = computeScopedSummary(rounds);
    expect(summary.count).toBe(3);
    expect(summary.scoredCount).toBe(3);
    expect(summary.toParCount).toBe(2);
    expect(summary.avg).toBeCloseTo((76 + 72 + 80) / 3);
    expect(summary.avgToPar).toBeCloseTo(2);
    expect(summary.best).toBe(72);
  });
  it('counts qualifier/tournament rounds independent of whether they are scored', () => {
    const rounds = [
      makeRound({ round_type: 'qualifier', total_score: null, score_to_par: null }),
      makeRound({ round_type: 'practice' }),
    ];
    expect(computeScopedSummary(rounds).qualifierCount).toBe(1);
  });
});

describe('bestOfRounds', () => {
  it('is null with no to-par rounds', () => {
    expect(bestOfRounds([makeRound({ score_to_par: null })])).toBeNull();
  });
  it('picks the lowest score_to_par, first on a tie', () => {
    const best = bestOfRounds([
      makeRound({ id: 'a', score_to_par: 2 }),
      makeRound({ id: 'b', score_to_par: -3 }),
      makeRound({ id: 'c', score_to_par: -3 }),
    ]);
    expect(best!.id).toBe('b');
  });
});

describe('rankPlayersByAvgToPar', () => {
  it('sorts ascending — the lowest avg-to-par leads', () => {
    const stats = new Map([
      ['Alice', { avgToPar: 1.2, count: 3, avatarUrl: null }],
      ['Bob', { avgToPar: -0.5, count: 4, avatarUrl: null }],
    ]);
    expect(rankPlayersByAvgToPar(stats).map(([name]) => name)).toEqual(['Bob', 'Alice']);
  });
});

describe('buildRoundsVerdict', () => {
  it('full template: rounds, shots delta, and the leader clause', () => {
    const parts = buildRoundsVerdict({
      roundsCount: 12,
      firstMonth: 'Jan 2026',
      scoreDelta: -4,
      leader: { name: 'Nick Rini', avgToPar: -1.2 },
    });
    const text = parts.map((p) => p.text).join('');
    expect(text).toBe('12 rounds since Jan 2026. 4 shots better than where the season started, led by Nick Rini at -1.2.');
    // Numbers and the (not-yet-linkable) leader name render mono.
    expect(parts.filter((p) => p.mono).map((p) => p.text)).toEqual(['12', '4', 'Nick Rini', '-1.2']);
  });

  it('drops the shots clause when scoreDelta is null (fewer than 2 scored rounds team-wide)', () => {
    const parts = buildRoundsVerdict({ roundsCount: 1, firstMonth: 'Jun 2026', scoreDelta: null, leader: null });
    expect(parts.map((p) => p.text).join('')).toBe('1 round since Jun 2026.');
  });

  it('drops the shots clause AND appends the leader clause when both apply', () => {
    const parts = buildRoundsVerdict({
      roundsCount: 3,
      firstMonth: 'Jun 2026',
      scoreDelta: null,
      leader: { name: 'Ana', avgToPar: 0 },
    });
    expect(parts.map((p) => p.text).join('')).toBe('3 rounds since Jun 2026, led by Ana at 0.0.');
  });

  it('drops the "since" clause entirely when firstMonth is unparseable', () => {
    const parts = buildRoundsVerdict({ roundsCount: 5, firstMonth: null, scoreDelta: -2, leader: null });
    expect(parts.map((p) => p.text).join('')).toBe('5 rounds recorded.');
  });

  it('drops the leader clause when no player qualifies', () => {
    const parts = buildRoundsVerdict({ roundsCount: 4, firstMonth: 'May 2026', scoreDelta: 3, leader: null });
    expect(parts.map((p) => p.text).join('')).toBe('4 rounds since May 2026. 3 shots worse than where the season started.');
  });

  it('uses "even" when the delta rounds to zero', () => {
    const parts = buildRoundsVerdict({ roundsCount: 2, firstMonth: 'May 2026', scoreDelta: 0, leader: null });
    expect(parts.map((p) => p.text).join('')).toContain('0 shots even than where the season started');
  });
});
