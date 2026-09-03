import { describe, it, expect } from 'vitest';
import {
  evaluateRepairCompleteness,
  REPAIR_CHECK_IDS,
  type RepairCompletenessInput,
} from '../repair-completeness';

function allPassing(): RepairCompletenessInput {
  const input: RepairCompletenessInput = {};
  for (const id of REPAIR_CHECK_IDS) {
    input[id] = { status: 'PASS', evidence: `verified: ${id}` };
  }
  return input;
}

describe('the checklist itself', () => {
  it('covers every criterion the brief names, and nothing else', () => {
    expect([...REPAIR_CHECK_IDS]).toEqual([
      'root_cause_proven',
      'regression_test_exists',
      'rls_unchanged_or_deliberate',
      'performance_not_degraded',
      'invariant_restored',
      'no_telemetry_hidden',
      'neighbours_healthy',
      'post_deploy_signal_healthy',
    ]);
  });

  it('always returns one result per criterion, in a stable order', () => {
    const result = evaluateRepairCompleteness({});
    expect(result.items.map((i) => i.id)).toEqual([...REPAIR_CHECK_IDS]);
  });

  it('gives every item a human-readable question so a surface can render the checklist', () => {
    const result = evaluateRepairCompleteness(allPassing());
    expect(result.items.every((i) => i.question.length > 0)).toBe(true);
  });
});

describe('per-item verdicts are PASS / FAIL / UNKNOWN', () => {
  it('is PASS only where the caller supplied PASS evidence', () => {
    const result = evaluateRepairCompleteness(allPassing());
    expect(result.items.every((i) => i.status === 'PASS')).toBe(true);
    expect(result.overall).toBe('COMPLETE');
  });

  it('treats a criterion with no evidence supplied as UNKNOWN, never as PASS', () => {
    const result = evaluateRepairCompleteness({});
    expect(result.items.every((i) => i.status === 'UNKNOWN')).toBe(true);
    expect(result.items.every((i) => i.evidence.length > 0)).toBe(true);
  });

  it('treats PASS evidence with an empty justification as UNKNOWN — an assertion is not evidence', () => {
    const input = { ...allPassing(), root_cause_proven: { status: 'PASS' as const, evidence: '   ' } };
    const result = evaluateRepairCompleteness(input);
    const item = result.items.find((i) => i.id === 'root_cause_proven');
    expect(item?.status).toBe('UNKNOWN');
  });

  it('carries FAIL through unchanged', () => {
    const input = { ...allPassing(), invariant_restored: { status: 'FAIL' as const, evidence: 'still 3 orphan rows' } };
    const result = evaluateRepairCompleteness(input);
    expect(result.items.find((i) => i.id === 'invariant_restored')?.status).toBe('FAIL');
  });
});

describe('the roll-up can never hide an UNKNOWN', () => {
  it('is INDETERMINATE — not COMPLETE — when a single criterion is unknown', () => {
    const input = allPassing();
    delete input.neighbours_healthy;
    const result = evaluateRepairCompleteness(input);

    expect(result.overall).toBe('INDETERMINATE');
    expect(result.overall).not.toBe('COMPLETE');
    expect(result.unknownIds).toEqual(['neighbours_healthy']);
  });

  it('is INCOMPLETE when anything failed — a decisive negative outranks an unknown', () => {
    const input = allPassing();
    delete input.neighbours_healthy;
    input.performance_not_degraded = { status: 'FAIL', evidence: 'p95 doubled after the deploy' };
    const result = evaluateRepairCompleteness(input);

    expect(result.overall).toBe('INCOMPLETE');
    expect(result.failedIds).toEqual(['performance_not_degraded']);
    // The unknown is still reported, not swallowed by the failure.
    expect(result.unknownIds).toEqual(['neighbours_healthy']);
  });

  it('COMPLETE requires every single criterion to be PASS', () => {
    for (const id of REPAIR_CHECK_IDS) {
      const input = allPassing();
      delete input[id];
      expect(evaluateRepairCompleteness(input).overall).not.toBe('COMPLETE');
    }
  });

  it('exposes no numeric score — a percentage is exactly how an unknown gets hidden', () => {
    const result = evaluateRepairCompleteness(allPassing()) as unknown as Record<string, unknown>;
    for (const key of Object.keys(result)) {
      expect(typeof result[key]).not.toBe('number');
    }
    expect(Object.keys(result)).not.toContain('score');
    expect(Object.keys(result)).not.toContain('percentComplete');
  });

  it('has no boolean `complete` flag sitting beside the per-item results', () => {
    const result = evaluateRepairCompleteness(allPassing()) as unknown as Record<string, unknown>;
    expect(Object.keys(result)).not.toContain('complete');
    for (const key of Object.keys(result)) {
      expect(typeof result[key]).not.toBe('boolean');
    }
  });
});

describe('purity', () => {
  it('does not mutate its input', () => {
    const input = allPassing();
    const snapshot = JSON.stringify(input);
    evaluateRepairCompleteness(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
