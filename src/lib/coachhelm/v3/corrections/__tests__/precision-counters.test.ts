import { describe, expect, it } from 'vitest';
import {
  rollupPrecision,
  rungFromRankFactors,
  type CorrectionForPrecision,
  type ExposureForPrecision,
} from '../precision-counters';

function exposure(
  insight_id: string,
  shown_at: string,
  ladder: string | null,
  family = 'putt_distance',
): ExposureForPrecision {
  return {
    insight_id,
    family,
    shown_at,
    rank_factors: ladder === null ? null : { version: 'support_v1', ladder, R: 0.85, S: 0.4 },
  };
}

function correction(
  insight_id: string,
  kind: CorrectionForPrecision['kind'],
  created_at: string,
  author_user_id = 'coach-user-a',
): CorrectionForPrecision {
  return { insight_id, kind, created_at, author_user_id, author_role: 'coach' };
}

describe('rungFromRankFactors', () => {
  it('reads the Slice 1 ladder and falls back to unrated', () => {
    expect(rungFromRankFactors({ ladder: 'observed' })).toBe('observed');
    expect(rungFromRankFactors({ ladder: 'seen_repeatedly' })).toBe('seen_repeatedly');
    expect(rungFromRankFactors({ ladder: 'solid' })).toBe('unrated');
    expect(rungFromRankFactors(null)).toBe('unrated');
    expect(rungFromRankFactors([])).toBe('unrated');
    expect(rungFromRankFactors({ score: 1 })).toBe('unrated');
  });
});

describe('rollupPrecision', () => {
  it('is all zeros on no input', () => {
    expect(rollupPrecision({ exposures: [] })).toEqual({
      cells: [],
      totals: { shown: 0, held: 0, cleared: 0, contradicted: 0, not_this: 0 },
    });
  });

  it('counts reads, not exposures', () => {
    const rows = [
      exposure('r1', '2026-10-01T00:00:00Z', 'observed'),
      exposure('r1', '2026-10-02T00:00:00Z', 'observed'),
      exposure('r1', '2026-10-03T00:00:00Z', 'observed'),
      exposure('r2', '2026-10-01T00:00:00Z', 'observed'),
    ];
    const { cells, totals } = rollupPrecision({ exposures: rows });
    expect(cells).toEqual([
      { family: 'putt_distance', rung: 'observed', shown: 2, held: 0, cleared: 0, contradicted: 0, not_this: 0 },
    ]);
    expect(totals.shown).toBe(2);
  });

  it('files a read under the rung of its newest exposure; pre-Slice-1 rows are unrated', () => {
    const rows = [
      exposure('r1', '2026-10-01T00:00:00Z', 'likely'),
      exposure('r1', '2026-10-05T00:00:00Z', 'seen_repeatedly'),
      exposure('r2', '2026-10-01T00:00:00Z', null, 'approach_miss'),
    ];
    const { cells } = rollupPrecision({ exposures: rows });
    expect(cells.map((c) => [c.family, c.rung, c.shown])).toEqual([
      ['approach_miss', 'unrated', 1],
      ['putt_distance', 'seen_repeatedly', 1],
    ]);
  });

  it('counts the newest recheck outcome of shown reads only', () => {
    const rows = [
      exposure('r1', '2026-10-01T00:00:00Z', 'observed'),
      exposure('r2', '2026-10-01T00:00:00Z', 'observed'),
      exposure('r3', '2026-10-01T00:00:00Z', 'observed'),
    ];
    const { cells } = rollupPrecision({
      exposures: rows,
      outcomes: [
        { insight_id: 'r1', outcome: 'cleared', at: '2026-10-02T00:00:00Z' },
        { insight_id: 'r1', outcome: 'held', at: '2026-10-09T00:00:00Z' },
        { insight_id: 'r2', outcome: 'contradicted', at: '2026-10-09T00:00:00Z' },
        { insight_id: 'never-shown', outcome: 'held', at: '2026-10-09T00:00:00Z' },
      ],
    });
    expect(cells[0]).toMatchObject({ shown: 3, held: 1, cleared: 0, contradicted: 1 });
  });

  it('counts not_this once per read, from each author’s newest correction', () => {
    const rows = [
      exposure('r1', '2026-10-01T00:00:00Z', 'likely'),
      exposure('r2', '2026-10-01T00:00:00Z', 'likely'),
      exposure('r3', '2026-10-01T00:00:00Z', 'likely'),
    ];
    const { cells, totals } = rollupPrecision({
      exposures: rows,
      corrections: [
        // r1: two coaches say Not this -> one read.
        correction('r1', 'not_this', '2026-10-02T00:00:00Z', 'coach-user-a'),
        correction('r1', 'not_this', '2026-10-03T00:00:00Z', 'coach-user-b'),
        // r2: Not this, then the same coach says Good read -> not counted.
        correction('r2', 'not_this', '2026-10-02T00:00:00Z'),
        correction('r2', 'confirm', '2026-10-04T00:00:00Z'),
        // r3: a snooze is not a Not this.
        correction('r3', 'snooze', '2026-10-02T00:00:00Z'),
        // never shown: ignored.
        correction('r9', 'not_this', '2026-10-02T00:00:00Z'),
      ],
    });
    expect(cells[0]).toMatchObject({ rung: 'likely', shown: 3, not_this: 1 });
    expect(totals.not_this).toBe(1);
  });

  it('sorts cells by family, then by rung strength', () => {
    const rows = [
      exposure('a', '2026-10-01T00:00:00Z', 'likely', 'tee_strategy'),
      exposure('b', '2026-10-01T00:00:00Z', 'observed', 'tee_strategy'),
      exposure('c', '2026-10-01T00:00:00Z', 'observed', 'approach_miss'),
    ];
    expect(rollupPrecision({ exposures: rows }).cells.map((c) => `${c.family}/${c.rung}`)).toEqual([
      'approach_miss/observed',
      'tee_strategy/observed',
      'tee_strategy/likely',
    ]);
  });
});
