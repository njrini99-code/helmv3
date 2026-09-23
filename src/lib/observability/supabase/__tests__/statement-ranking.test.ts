import { describe, expect, it } from 'vitest';
import {
  rankStatements,
  selectStatementsToPage,
  slowStatementFingerprint,
  startOfUtcDay,
  STATEMENT_RANK_LIMIT,
  SLOW_STATEMENT_MEAN_THRESHOLD_MS,
  type RankableStatement,
} from '../statement-ranking';

function row(overrides: Partial<RankableStatement> & { queryid: string }): RankableStatement {
  return {
    safeQueryClass: 'unclassified',
    sourceClass: 'unknown',
    calls: 10,
    rows: 10,
    totalExecMs: 100,
    meanExecMs: 10,
    maxExecMs: 20,
    ...overrides,
  };
}

describe('rankStatements', () => {
  it('sorts by total and by mean independently and caps at the rank limit', () => {
    const rows: RankableStatement[] = [
      row({ queryid: 'a', totalExecMs: 1000, meanExecMs: 5 }),
      row({ queryid: 'b', totalExecMs: 200, meanExecMs: 900 }),
      row({ queryid: 'c', totalExecMs: 500, meanExecMs: 50 }),
    ];

    const { topByTotal, topByMean } = rankStatements(rows);

    expect(topByTotal.map((r) => r.queryid)).toEqual(['a', 'c', 'b']);
    expect(topByMean.map((r) => r.queryid)).toEqual(['b', 'c', 'a']);
  });

  it('caps each ranking at STATEMENT_RANK_LIMIT', () => {
    const rows: RankableStatement[] = Array.from({ length: 40 }, (_, i) =>
      row({ queryid: `q${i}`, totalExecMs: i, meanExecMs: i }),
    );
    const { topByTotal, topByMean } = rankStatements(rows);
    expect(topByTotal).toHaveLength(STATEMENT_RANK_LIMIT);
    expect(topByMean).toHaveLength(STATEMENT_RANK_LIMIT);
  });

  it('does not mutate the input array', () => {
    const rows: RankableStatement[] = [row({ queryid: 'a', totalExecMs: 1 }), row({ queryid: 'b', totalExecMs: 2 })];
    const original = [...rows];
    rankStatements(rows);
    expect(rows).toEqual(original);
  });
});

describe('startOfUtcDay', () => {
  it('truncates to midnight UTC', () => {
    const d = new Date('2026-09-06T14:32:10.000Z');
    expect(startOfUtcDay(d).toISOString()).toBe('2026-09-06T00:00:00.000Z');
  });
});

describe('selectStatementsToPage', () => {
  const now = new Date('2026-09-06T14:00:00.000Z');

  it('selects statements whose mean is over threshold and never paged', () => {
    const ranked = rankStatements([
      row({ queryid: 'slow', meanExecMs: 600 }),
      row({ queryid: 'fast', meanExecMs: 10 }),
    ]);
    const result = selectStatementsToPage(ranked, {}, now);
    expect(result.map((c) => c.queryid)).toEqual(['slow']);
  });

  it('does not re-page a statement already paged earlier today (UTC)', () => {
    const ranked = rankStatements([row({ queryid: 'slow', meanExecMs: 600 })]);
    const result = selectStatementsToPage(ranked, { slow: '2026-09-06T01:00:00.000Z' }, now);
    expect(result).toEqual([]);
  });

  it('re-pages a statement last paged before today (UTC)', () => {
    const ranked = rankStatements([row({ queryid: 'slow', meanExecMs: 600 })]);
    const result = selectStatementsToPage(ranked, { slow: '2026-09-05T23:00:00.000Z' }, now);
    expect(result.map((c) => c.queryid)).toEqual(['slow']);
  });

  it('dedupes a queryid appearing in both rankings', () => {
    const ranked: ReturnType<typeof rankStatements> = {
      topByTotal: [row({ queryid: 'slow', meanExecMs: 600 })],
      topByMean: [row({ queryid: 'slow', meanExecMs: 600 })],
    };
    const result = selectStatementsToPage(ranked, {}, now);
    expect(result).toHaveLength(1);
  });

  it('respects a custom threshold', () => {
    const ranked = rankStatements([row({ queryid: 'q', meanExecMs: 300 })]);
    expect(selectStatementsToPage(ranked, {}, now, 1000)).toEqual([]);
    expect(selectStatementsToPage(ranked, {}, now, 100)).toHaveLength(1);
  });

  it('uses the documented default threshold', () => {
    expect(SLOW_STATEMENT_MEAN_THRESHOLD_MS).toBe(500);
  });
});

describe('slowStatementFingerprint', () => {
  it('builds the db:slow:<queryid> fingerprint', () => {
    expect(slowStatementFingerprint('12345')).toBe('db:slow:12345');
  });
});
