import { describe, it, expect } from 'vitest';
import { evaluateRollback, summarizeReliabilityWindow } from '../rollback';
import type { ReliabilityRun, CorrelatedSignal } from '@/lib/reliability/types';
import type { ReliabilityWindowSummary } from '../types';

function signal(severity: CorrelatedSignal['severity']): CorrelatedSignal {
  return {
    signature: 'sig',
    severity,
    title: 't',
    summary: 's',
    route: null,
    errorCode: null,
    count: 1,
    firstSeen: '2026-09-01T00:00:00Z',
    lastSeen: '2026-09-01T00:00:00Z',
    sources: [],
    featureId: null,
    proposedRisk: 'R0',
    evidence: [],
  };
}

function run(signals: CorrelatedSignal[]): ReliabilityRun {
  return {
    version: 1,
    windowStart: '2026-09-01T00:00:00Z',
    windowEnd: '2026-09-01T03:00:00Z',
    overallStatus: 'ok',
    sources: [],
    signals,
    truncatedSignals: 0,
  };
}

describe('summarizeReliabilityWindow', () => {
  it('returns null for an empty run set — never a zero-signal summary', () => {
    expect(summarizeReliabilityWindow([])).toBeNull();
  });

  it('folds signals across runs into aggregate counts', () => {
    const summary = summarizeReliabilityWindow([
      run([signal('critical'), signal('error')]),
      run([signal('warning')]),
    ]);
    expect(summary).toEqual<ReliabilityWindowSummary>({
      runCount: 2,
      totalSignals: 3,
      criticalSignals: 1,
      errorSignals: 1,
    });
  });
});

describe('evaluateRollback', () => {
  it('returns UNKNOWN with no candidate SHA', () => {
    const verdict = evaluateRollback({ candidateSha: null, candidate: null, baseline: null });
    expect(verdict.recommendation).toBe('UNKNOWN');
  });

  it('returns UNKNOWN when the candidate window has no readable rows', () => {
    const verdict = evaluateRollback({ candidateSha: 'abc123', candidate: null, baseline: null });
    expect(verdict.recommendation).toBe('UNKNOWN');
  });

  it('returns UNKNOWN when the baseline window has no readable rows, even with a candidate', () => {
    const candidate: ReliabilityWindowSummary = { runCount: 1, totalSignals: 0, criticalSignals: 0, errorSignals: 0 };
    const verdict = evaluateRollback({ candidateSha: 'abc123', candidate, baseline: null });
    expect(verdict.recommendation).toBe('UNKNOWN');
  });

  it('never returns KEEP when either window is unreadable — the core UNKNOWN-not-KEEP guarantee', () => {
    const clean: ReliabilityWindowSummary = { runCount: 1, totalSignals: 0, criticalSignals: 0, errorSignals: 0 };
    expect(evaluateRollback({ candidateSha: 'x', candidate: null, baseline: clean }).recommendation).not.toBe('KEEP');
    expect(evaluateRollback({ candidateSha: 'x', candidate: clean, baseline: null }).recommendation).not.toBe('KEEP');
  });

  it('KEEP when candidate signal volume matches or improves on baseline', () => {
    const baseline: ReliabilityWindowSummary = { runCount: 2, totalSignals: 4, criticalSignals: 0, errorSignals: 1 };
    const candidate: ReliabilityWindowSummary = { runCount: 2, totalSignals: 3, criticalSignals: 0, errorSignals: 0 };
    expect(evaluateRollback({ candidateSha: 'x', candidate, baseline }).recommendation).toBe('KEEP');
  });

  it('WATCH on mild signal growth below the pause threshold', () => {
    const baseline: ReliabilityWindowSummary = { runCount: 2, totalSignals: 4, criticalSignals: 0, errorSignals: 0 };
    const candidate: ReliabilityWindowSummary = { runCount: 2, totalSignals: 5, criticalSignals: 0, errorSignals: 0 };
    expect(evaluateRollback({ candidateSha: 'x', candidate, baseline }).recommendation).toBe('WATCH');
  });

  it('PAUSE_ROLLOUT on 1.5x+ total signal growth', () => {
    const baseline: ReliabilityWindowSummary = { runCount: 2, totalSignals: 4, criticalSignals: 0, errorSignals: 0 };
    const candidate: ReliabilityWindowSummary = { runCount: 2, totalSignals: 7, criticalSignals: 0, errorSignals: 0 };
    expect(evaluateRollback({ candidateSha: 'x', candidate, baseline }).recommendation).toBe('PAUSE_ROLLOUT');
  });

  it('PAUSE_ROLLOUT when critical signals rise by exactly 1', () => {
    const baseline: ReliabilityWindowSummary = { runCount: 2, totalSignals: 4, criticalSignals: 0, errorSignals: 0 };
    const candidate: ReliabilityWindowSummary = { runCount: 2, totalSignals: 4, criticalSignals: 1, errorSignals: 0 };
    expect(evaluateRollback({ candidateSha: 'x', candidate, baseline }).recommendation).toBe('PAUSE_ROLLOUT');
  });

  it('ROLLBACK_RECOMMENDED on 2x+ total signal growth', () => {
    const baseline: ReliabilityWindowSummary = { runCount: 2, totalSignals: 4, criticalSignals: 0, errorSignals: 0 };
    const candidate: ReliabilityWindowSummary = { runCount: 2, totalSignals: 9, criticalSignals: 0, errorSignals: 0 };
    expect(evaluateRollback({ candidateSha: 'x', candidate, baseline }).recommendation).toBe('ROLLBACK_RECOMMENDED');
  });

  it('ROLLBACK_RECOMMENDED when critical signals rise by 3 or more', () => {
    const baseline: ReliabilityWindowSummary = { runCount: 2, totalSignals: 4, criticalSignals: 0, errorSignals: 0 };
    const candidate: ReliabilityWindowSummary = { runCount: 2, totalSignals: 4, criticalSignals: 3, errorSignals: 0 };
    expect(evaluateRollback({ candidateSha: 'x', candidate, baseline }).recommendation).toBe('ROLLBACK_RECOMMENDED');
  });

  it('ROLLBACK_RECOMMENDED when baseline was zero and candidate has any signal at all', () => {
    const baseline: ReliabilityWindowSummary = { runCount: 1, totalSignals: 0, criticalSignals: 0, errorSignals: 0 };
    const candidate: ReliabilityWindowSummary = { runCount: 1, totalSignals: 2, criticalSignals: 0, errorSignals: 1 };
    expect(evaluateRollback({ candidateSha: 'x', candidate, baseline }).recommendation).toBe('ROLLBACK_RECOMMENDED');
  });

  it('every verdict carries at least one evidence item', () => {
    const baseline: ReliabilityWindowSummary = { runCount: 2, totalSignals: 4, criticalSignals: 0, errorSignals: 0 };
    const candidate: ReliabilityWindowSummary = { runCount: 2, totalSignals: 3, criticalSignals: 0, errorSignals: 0 };
    const verdict = evaluateRollback({ candidateSha: 'x', candidate, baseline });
    expect(verdict.evidence.length).toBeGreaterThan(0);
  });
});
