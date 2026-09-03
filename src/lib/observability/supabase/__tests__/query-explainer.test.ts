import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  explainQueryClass,
  MAX_HYPOTHESES,
  type ExplainQueryInput,
} from '../query-explainer';

function input(overrides: Partial<ExplainQueryInput> = {}): ExplainQueryInput {
  return {
    safeQueryClass: 'select golf_rounds',
    shape: {
      callsDelta: 900,
      meanExecMsWindow: 40,
      meanExecMsBaseline: 12,
      maxExecMsObserved: 300,
      rowsPerCall: 12,
      rowsPerCallBaseline: 12,
      sharedBlksHitDelta: 900,
      sharedBlksReadDelta: 100,
      tempBlksWrittenDelta: 0,
    },
    regressionFlags: ['mean_3x_baseline'],
    explainRequest: { requested: false },
    ...overrides,
  };
}

describe('it is on demand — nothing runs unless an operator asks', () => {
  it('emits no EXPLAIN command at all when none was requested', () => {
    const g = explainQueryClass(input());
    expect(g.explainCommand).toBeNull();
    expect(g.hypotheses.length).toBeGreaterThan(0);
  });

  it('emits a command only when an operator explicitly requested one', () => {
    const g = explainQueryClass(input({ explainRequest: { requested: true, environment: 'local' } }));
    expect(g.explainCommand).not.toBeNull();
  });

  it('has no imports at all, so "never runs automatically" is structural rather than a promise', () => {
    const source = readFileSync(new URL('../query-explainer.ts', import.meta.url), 'utf8');
    const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line));
    expect(importLines).toEqual([]);
    expect(source).not.toMatch(/from '@supabase/);
  });
});

describe('it is non-destructive', () => {
  it('never emits ANALYZE against production, because ANALYZE executes the statement', () => {
    const g = explainQueryClass(
      input({ explainRequest: { requested: true, environment: 'production' } }),
    );
    expect(g.explainCommand).not.toMatch(/ANALYZE/i);
    expect(g.warnings.join(' ')).toMatch(/executes/i);
  });

  it('never emits ANALYZE for a mutating query class, in any environment', () => {
    for (const cls of ['insert golf_shots', 'update golf_rounds', 'delete golf_shots']) {
      const g = explainQueryClass(
        input({ safeQueryClass: cls, explainRequest: { requested: true, environment: 'local' } }),
      );
      expect(g.explainCommand).not.toMatch(/ANALYZE/i);
    }
  });

  it('allows ANALYZE for a read against a local stack, and bounds it with a statement timeout', () => {
    const g = explainQueryClass(input({ explainRequest: { requested: true, environment: 'local' } }));
    expect(g.explainCommand).toMatch(/ANALYZE/i);
    expect(g.explainCommand).toMatch(/statement_timeout/i);
  });

  it('declares that it persists no plan', () => {
    const g = explainQueryClass(input({ explainRequest: { requested: true, environment: 'local' } }));
    expect(g.persistsPlan).toBe(false);
    expect(g.nonDestructive).toBe(true);
  });
});

describe('it is bounded', () => {
  it('never returns more than MAX_HYPOTHESES, however many symptoms are present', () => {
    const g = explainQueryClass(
      input({
        shape: {
          callsDelta: 90_000,
          meanExecMsWindow: 900,
          meanExecMsBaseline: 5,
          maxExecMsObserved: 30_000,
          rowsPerCall: 9000,
          rowsPerCallBaseline: 3,
          sharedBlksHitDelta: 10,
          sharedBlksReadDelta: 900_000,
          tempBlksWrittenDelta: 40_000,
        },
        regressionFlags: ['mean_3x_baseline', 'total_time_5x_expected', 'max_reaches_timeout'],
      }),
    );
    expect(g.hypotheses.length).toBeLessThanOrEqual(MAX_HYPOTHESES);
    expect(g.hypotheses.length).toBeGreaterThan(0);
  });
});

describe('it refuses anything that is not a safe query class', () => {
  it('refuses raw SQL and emits no command', () => {
    const g = explainQueryClass(
      input({
        safeQueryClass: "select * from golf_rounds where coach_email = 'coach@example.com'",
        explainRequest: { requested: true, environment: 'local' },
      }),
    );
    expect(g.explainCommand).toBeNull();
    expect(g.warnings.join(' ')).toMatch(/safe query class/i);
    expect(g.hypotheses).toEqual([]);
  });

  it('refuses a class carrying a UUID or an email', () => {
    for (const cls of ['select 3f2504e0-4f89-11d3-9a0c-0305e82c3301', 'select coach@example.com']) {
      const g = explainQueryClass(input({ safeQueryClass: cls, explainRequest: { requested: true, environment: 'local' } }));
      expect(g.explainCommand).toBeNull();
    }
  });

  it('never echoes the rejected input back into its own output', () => {
    const g = explainQueryClass(
      input({ safeQueryClass: "select * from x where email = 'coach@example.com'", explainRequest: { requested: false } }),
    );
    expect(JSON.stringify(g)).not.toContain('coach@example.com');
  });
});

describe('the guidance itself', () => {
  it('names disk reads when the cache hit ratio collapsed', () => {
    const g = explainQueryClass(
      input({
        shape: { ...input().shape, sharedBlksHitDelta: 10, sharedBlksReadDelta: 5000 },
      }),
    );
    expect(g.hypotheses.map((h) => h.id)).toContain('low_cache_hit');
  });

  it('names a spill to disk when temp blocks were written', () => {
    const g = explainQueryClass(input({ shape: { ...input().shape, tempBlksWrittenDelta: 4000 } }));
    expect(g.hypotheses.map((h) => h.id)).toContain('temp_spill');
  });

  it('distinguishes more calls from slower calls', () => {
    const g = explainQueryClass(
      input({
        shape: { ...input().shape, meanExecMsWindow: 12, meanExecMsBaseline: 12, callsDelta: 90_000 },
        regressionFlags: ['total_time_5x_expected'],
      }),
    );
    expect(g.hypotheses.map((h) => h.id)).toContain('call_volume');
  });

  it('sends a timeout-reaching statement to the lock runbook before the plan', () => {
    const g = explainQueryClass(input({ regressionFlags: ['max_reaches_timeout'] }));
    const hypothesis = g.hypotheses.find((h) => h.id === 'timeout_reached');
    expect(hypothesis).toBeDefined();
    expect(hypothesis?.nextStep).toMatch(/lock/i);
  });

  it('gives every hypothesis a concrete next step', () => {
    const g = explainQueryClass(input());
    expect(g.hypotheses.every((h) => h.nextStep.trim().length > 0)).toBe(true);
  });
});

describe('purity', () => {
  it('does not mutate its input', () => {
    const value = input();
    const snapshot = JSON.stringify(value);
    explainQueryClass(value);
    expect(JSON.stringify(value)).toBe(snapshot);
  });
});
