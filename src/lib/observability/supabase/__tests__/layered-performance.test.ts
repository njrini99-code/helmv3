import { describe, it, expect } from 'vitest';
import {
  evaluateLayeredPerformance,
  MIN_REQUEST_SAMPLES,
  DB_LAYER_STATISTICS_AVAILABLE,
  type DbStatementObservation,
  type RequestLatencyObservation,
} from '../layered-performance';

function stmt(overrides: Partial<DbStatementObservation> = {}): DbStatementObservation {
  return {
    safeQueryClass: 'select golf_rounds',
    sourceClass: 'product',
    meanExecMsWindow: 10,
    meanExecMsBaseline: 10,
    maxExecMsObserved: 40,
    callsDelta: 500,
    baselineStatus: 'established',
    regressionFlags: [],
    ...overrides,
  };
}

const REQUEST_STABLE: RequestLatencyObservation = {
  p95Ms: 300,
  baselineP95Ms: 300,
  sampleCount: 4000,
  readable: true,
};
const REQUEST_REGRESSED: RequestLatencyObservation = {
  p95Ms: 900,
  baselineP95Ms: 300,
  sampleCount: 4000,
  readable: true,
};
const REQUEST_BLIND: RequestLatencyObservation = {
  p95Ms: null,
  baselineP95Ms: null,
  sampleCount: null,
  readable: false,
};

describe('the four quadrants a caller actually needs to distinguish', () => {
  it('request p95 regressed AND DB regressed', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_REGRESSED,
      database: { readable: true, statements: [stmt({ regressionFlags: ['mean_3x_baseline'], meanExecMsWindow: 40 })] },
    });
    expect(v.request.axis).toBe('regressed');
    expect(v.database.axis).toBe('regressed');
    expect(v.conclusion).toBe('both_regressed');
  });

  it('request slow, DB stable — the request is slow ABOVE the database', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_REGRESSED,
      database: { readable: true, statements: [stmt()] },
    });
    expect(v.conclusion).toBe('request_regressed_db_stable');
  });

  it('DB regressed while the request layer is stable', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_STABLE,
      database: { readable: true, statements: [stmt({ regressionFlags: ['total_time_5x_expected'] })] },
    });
    expect(v.conclusion).toBe('db_regressed_request_stable');
  });

  it('both stable', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_STABLE,
      database: { readable: true, statements: [stmt()] },
    });
    expect(v.conclusion).toBe('both_stable');
  });
});

describe('the unknown quadrants — a missing layer is never a clean verdict', () => {
  it('a blind request layer does NOT make "DB stable" the answer', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_BLIND,
      database: { readable: true, statements: [stmt()] },
    });
    expect(v.request.axis).toBe('unknown');
    expect(v.conclusion).toBe('request_unknown');
    expect(v.conclusion).not.toBe('both_stable');
  });

  it('a blind DB layer does not make "request stable" the whole answer', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_STABLE,
      database: { readable: false, statements: [] },
    });
    expect(v.database.axis).toBe('unknown');
    expect(v.conclusion).toBe('database_unknown');
  });

  it('both blind is both_unknown, never stable', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_BLIND,
      database: { readable: false, statements: [] },
    });
    expect(v.conclusion).toBe('both_unknown');
  });

  it('a request layer with too few samples for a meaningful p95 is unknown', () => {
    const v = evaluateLayeredPerformance({
      request: { p95Ms: 900, baselineP95Ms: 300, sampleCount: MIN_REQUEST_SAMPLES - 1, readable: true },
      database: { readable: true, statements: [stmt()] },
    });
    expect(v.request.axis).toBe('unknown');
  });

  it('a request layer with no baseline is unknown, not stable', () => {
    const v = evaluateLayeredPerformance({
      request: { p95Ms: 300, baselineP95Ms: null, sampleCount: 4000, readable: true },
      database: { readable: true, statements: [stmt()] },
    });
    expect(v.request.axis).toBe('unknown');
  });

  it('a DB layer whose every baseline is still collecting is unknown, not stable', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_STABLE,
      database: { readable: true, statements: [stmt({ baselineStatus: 'collecting' })] },
    });
    expect(v.database.axis).toBe('unknown');
    expect(v.conclusion).toBe('database_unknown');
  });

  it('a readable DB layer with no statements at all is unknown, not stable', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_STABLE,
      database: { readable: true, statements: [] },
    });
    expect(v.database.axis).toBe('unknown');
  });

  it('a `new_query` flag alone is not a regression — it is not a comparison against a baseline', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_STABLE,
      database: { readable: true, statements: [stmt({ regressionFlags: ['new_query'] })] },
    });
    expect(v.database.axis).toBe('stable');
  });
});

describe('percentiles are never derived from aggregate-only statistics', () => {
  it('states plainly that the DB layer has no percentiles available', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_STABLE,
      database: { readable: true, statements: [stmt()] },
    });
    expect(v.database.percentilesAvailable).toBe(false);
    expect(v.database.statisticsAvailable).toEqual(DB_LAYER_STATISTICS_AVAILABLE);
    expect(v.database.percentileNote).toMatch(/cannot/i);
  });

  it('exposes no percentile-shaped field anywhere on the database side', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_REGRESSED,
      database: { readable: true, statements: [stmt({ regressionFlags: ['mean_3x_baseline'] })] },
    });
    // The temptation this guards against is `mean + 1.645 * stddev`, which
    // assumes a normal distribution that request latency does not have.
    const keys = Object.keys(v.database);
    expect(keys.some((k) => /^p\d/.test(k) || /percentile(?!sAvailable|Note)/i.test(k))).toBe(false);
    expect(keys).not.toContain('p95Ms');
    expect(keys).not.toContain('p99Ms');
  });

  it('keeps the measured request p95 labelled as MEASURED, on the request side only', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_REGRESSED,
      database: { readable: true, statements: [stmt()] },
    });
    expect(v.request.p95Source).toBe('measured_sentry_spans');
    expect(v.request.p95Ms).toBe(900);
  });
});

describe('database axis detail', () => {
  it('names the regressed statements by their safe query class, never raw SQL', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_STABLE,
      database: {
        readable: true,
        statements: [
          stmt({ safeQueryClass: 'select golf_rounds', regressionFlags: ['mean_3x_baseline'] }),
          stmt({ safeQueryClass: 'update golf_shots' }),
        ],
      },
    });
    expect(v.database.regressedQueryClasses).toEqual(['select golf_rounds']);
  });

  it('reports improvement when the call-weighted mean falls well below baseline', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_STABLE,
      database: { readable: true, statements: [stmt({ meanExecMsWindow: 3, meanExecMsBaseline: 30 })] },
    });
    expect(v.database.axis).toBe('improved');
    expect(v.conclusion).toBe('both_stable');
  });

  it('a max that reached the statement timeout is a regression even with a calm mean', () => {
    const v = evaluateLayeredPerformance({
      request: REQUEST_STABLE,
      database: { readable: true, statements: [stmt({ regressionFlags: ['max_reaches_timeout'] })] },
    });
    expect(v.database.axis).toBe('regressed');
  });
});

describe('purity', () => {
  it('does not mutate its input', () => {
    const input = { request: REQUEST_STABLE, database: { readable: true, statements: [stmt()] } };
    const snapshot = JSON.stringify(input);
    evaluateLayeredPerformance(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
