import { describe, it, expect, vi } from 'vitest';

const NOW = new Date('2026-09-03T12:00:00.000Z');

describe('runInvariantChecks', () => {
  it('maps a clean read to pass/fail rows with a real feature_id and label', async () => {
    vi.resetModules();
    vi.doMock('../round-graph-data', () => ({
      fetchRoundGraphInvariants: async () => ({
        status: 'ok',
        error: null,
        results: [
          {
            id: 'round-graph-orphaned-shots',
            label: 'Shots reference a persisted hole',
            rule: 'rule text',
            consequence: 'consequence text',
            severity: 'critical',
            violations: 0,
            sampleIds: [],
          },
          {
            id: 'round-graph-completed-without-holes',
            label: 'Completed rounds have played holes',
            rule: 'rule text 2',
            consequence: 'consequence text 2',
            severity: 'critical',
            violations: 2,
            sampleIds: ['r1', 'r2'],
          },
        ],
      }),
    }));
    const { runInvariantChecks } = await import('../run-checks');

    const summary = await runInvariantChecks(NOW);
    expect(summary.blind).toBe(false);
    expect(summary.checks).toHaveLength(2);

    const orphaned = summary.checks.find((c) => c.id === 'round-graph-orphaned-shots')!;
    expect(orphaned.state).toBe('pass');
    expect(orphaned.violations).toBe(0);
    expect(orphaned.featureId).toBe('shot_tracking');

    const completed = summary.checks.find((c) => c.id === 'round-graph-completed-without-holes')!;
    expect(completed.state).toBe('fail');
    expect(completed.violations).toBe(2);
    expect(completed.sampleIds).toEqual(['r1', 'r2']);
    expect(completed.featureId).toBe('golf_round_lifecycle');
  });

  it('a timed-out group reports every check as unknown, never pass', async () => {
    vi.resetModules();
    vi.doMock('../round-graph-data', () => ({
      // Never resolves within the test's window — simulates a hung query.
      fetchRoundGraphInvariants: () => new Promise(() => {}),
    }));
    const { runInvariantChecks } = await import('../run-checks');

    const summary = await runInvariantChecks(NOW);
    expect(summary.blind).toBe(true);
    expect(summary.checks).toHaveLength(2);
    for (const check of summary.checks) {
      expect(check.state).toBe('unknown');
      expect(check.violations).toBeNull();
    }
  }, 15_000);

  it('a fetch error reports unknown for the missing checks, never a fabricated pass', async () => {
    vi.resetModules();
    vi.doMock('../round-graph-data', () => ({
      fetchRoundGraphInvariants: async () => ({
        status: 'error',
        error: 'connection refused',
        results: [],
      }),
    }));
    const { runInvariantChecks } = await import('../run-checks');

    const summary = await runInvariantChecks(NOW);
    expect(summary.blind).toBe(true);
    for (const check of summary.checks) {
      expect(check.state).toBe('unknown');
      expect(check.detail).toContain('connection refused');
    }
  });
});
