import { describe, it, expect } from 'vitest';
import { computeErrorBudgets, type ErrorBudgetWindowInput } from '../error-budget';
import type { CorrelatedSignal } from '../types';
import { TIER_THRESHOLDS } from '@/lib/admin/feature-registry';

const NOW = new Date('2026-09-03T12:00:00.000Z');

function signal(overrides: Partial<CorrelatedSignal> = {}): CorrelatedSignal {
  return {
    signature: 'sig-1',
    severity: 'error',
    title: 'boom',
    summary: 'boom',
    route: '/golf/round',
    errorCode: '42P10',
    count: 1,
    countIsFloor: false,
    firstSeen: NOW.toISOString(),
    lastSeen: NOW.toISOString(),
    sources: ['sentry'],
    featureId: 'round_tracking', // tier: high, redFp: 5
    proposedRisk: 'R1',
    evidence: [],
    ...overrides,
  };
}

function window(overrides: Partial<ErrorBudgetWindowInput> = {}): ErrorBudgetWindowInput {
  return {
    startedAt: NOW.toISOString(),
    readable: true,
    overallStatus: 'ok',
    signals: [],
    truncatedSignals: 0,
    ...overrides,
  };
}

function budgetFor(report: ReturnType<typeof computeErrorBudgets>, featureId: string) {
  const row = report.features.find((f) => f.featureId === featureId);
  if (!row) throw new Error(`no budget row for ${featureId}`);
  return row;
}

describe('computeErrorBudgets', () => {
  it('a feature with zero readable windows is unknown, never ok', () => {
    const report = computeErrorBudgets([], NOW);
    const row = budgetFor(report, 'round_tracking');
    expect(row.state).toBe('unknown');
    expect(row.windowsReadable).toBe(0);
    expect(row.allowedCount).toBeNull();
    expect(row.burnRate).toBeNull();
  });

  it('a fully blind window set never reports ok — every feature is unknown and fullyBlind is true', () => {
    const report = computeErrorBudgets([window({ overallStatus: 'blind' }), window({ readable: false, overallStatus: null })], NOW);
    expect(report.fullyBlind).toBe(true);
    expect(report.windowsReadable).toBe(0);
    for (const f of report.features) expect(f.state).toBe('unknown');
  });

  it('zero observed errors across readable windows is a real ok, not a fabricated one', () => {
    const report = computeErrorBudgets([window(), window(), window()], NOW);
    const row = budgetFor(report, 'round_tracking');
    expect(row.windowsReadable).toBe(3);
    expect(row.observedCount).toBe(0);
    expect(row.burnRate).toBe(0);
    expect(row.state).toBe('ok');
    expect(row.observedIsFloor).toBe(false);
  });

  it('burn rate crossing the tier redFp trips red', () => {
    // high tier: redFp=5 per window. 2 windows -> allowed=10. Observed=10 -> burnRate=1 -> red.
    const w1 = window({ signals: [signal({ count: 6 })] });
    const w2 = window({ signals: [signal({ count: 4 })] });
    const report = computeErrorBudgets([w1, w2], NOW);
    const row = budgetFor(report, 'round_tracking');
    expect(row.allowedCount).toBe(TIER_THRESHOLDS.high.redFp * 2);
    expect(row.observedCount).toBe(10);
    expect(row.burnRate).toBe(1);
    expect(row.state).toBe('red');
  });

  it('burn rate between amber and red ratio trips amber', () => {
    // high tier: amberFp=2, redFp=5 -> amber threshold ratio = 0.4. 1 window, allowed=5.
    // observed=2 -> burnRate=0.4 -> amber (>= 0.4).
    const report = computeErrorBudgets([window({ signals: [signal({ count: 2 })] })], NOW);
    const row = budgetFor(report, 'round_tracking');
    expect(row.burnRate).toBe(0.4);
    expect(row.state).toBe('amber');
  });

  it('a blind window contributes nothing and is excluded from windowsReadable', () => {
    const blind = window({ overallStatus: 'blind', signals: [signal({ count: 999 })] });
    const clean = window({ signals: [] });
    const report = computeErrorBudgets([blind, clean], NOW);
    const row = budgetFor(report, 'round_tracking');
    expect(row.windowsReadable).toBe(1);
    expect(row.observedCount).toBe(0);
    expect(row.windowsConsidered).toBe(2);
  });

  it('an unreadable (unparsed) row is excluded like a blind one', () => {
    const unreadable = window({ readable: false, overallStatus: null, signals: [signal({ count: 50 })] });
    const report = computeErrorBudgets([unreadable, window()], NOW);
    const row = budgetFor(report, 'round_tracking');
    expect(row.windowsReadable).toBe(1);
    expect(row.observedCount).toBe(0);
  });

  it('marks observedIsFloor when a contributing window is degraded or partial', () => {
    const degraded = window({ overallStatus: 'degraded', signals: [signal({ count: 1 })] });
    const report = computeErrorBudgets([degraded], NOW);
    const row = budgetFor(report, 'round_tracking');
    expect(row.observedIsFloor).toBe(true);
  });

  it('marks observedIsFloor when a folded signal carries countIsFloor', () => {
    const win = window({ signals: [signal({ count: 1, countIsFloor: true })] });
    const report = computeErrorBudgets([win], NOW);
    const row = budgetFor(report, 'round_tracking');
    expect(row.observedIsFloor).toBe(true);
  });

  it('marks observedIsFloor when the window reports truncatedSignals > 0', () => {
    const win = window({ signals: [signal({ count: 1 })], truncatedSignals: 3 });
    const report = computeErrorBudgets([win], NOW);
    const row = budgetFor(report, 'round_tracking');
    expect(row.observedIsFloor).toBe(true);
  });

  it('a signal with no featureId (unmapped route) is not attributed to any feature', () => {
    const win = window({ signals: [signal({ featureId: null, count: 5 })] });
    const report = computeErrorBudgets([win], NOW);
    // Nothing should have absorbed the 5 — every tracked feature stays at 0.
    for (const f of report.features) expect(f.observedCount).toBe(0);
  });

  it('sorts worst-first: red before amber before unknown before ok', () => {
    const red = window({ signals: [signal({ featureId: 'round_tracking', count: 10 })] }); // redFp=5 -> burn 2
    const amber = window({ signals: [signal({ featureId: 'my_qualifiers', count: 1 })] }); // low tier amberFp=1,redFp=2 -> burn 0.5
    const report = computeErrorBudgets([red, amber], NOW);
    const roundIdx = report.features.findIndex((f) => f.featureId === 'round_tracking');
    const qualIdx = report.features.findIndex((f) => f.featureId === 'my_qualifiers');
    expect(roundIdx).toBeGreaterThanOrEqual(0);
    expect(qualIdx).toBeGreaterThan(roundIdx);
  });

  it('excludes the crm_recruiting_pipeline feature (registry-listed, never wrapped)', () => {
    const report = computeErrorBudgets([window()], NOW);
    expect(report.features.some((f) => f.featureId === 'crm_recruiting_pipeline')).toBe(false);
  });
});
