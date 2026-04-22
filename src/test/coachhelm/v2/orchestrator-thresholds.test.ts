import { describe, it, expect } from 'vitest';
import { applyPhilosophyThresholds } from '@/lib/coachhelm/v2/orchestrator';

describe('applyPhilosophyThresholds (LIVE-24)', () => {
  it('returns shouldAlert=true when signal exceeds decline threshold', () => {
    const result = applyPhilosophyThresholds(
      { predictedValue: 2.5 },
      { declineThreshold: 1.5, pressureGapThreshold: 1.0 },
    );
    expect(result.shouldAlert).toBe(true);
  });

  it('returns shouldAlert=true when strokeImpact exceeds pressure threshold', () => {
    const result = applyPhilosophyThresholds(
      { strokeImpact: 1.5 },
      { declineThreshold: 3.0, pressureGapThreshold: 1.0 },
    );
    expect(result.shouldAlert).toBe(true);
  });

  it('aggressive philosophy (lower thresholds) alerts where conservative does not', () => {
    const signal = { predictedValue: 2.5, strokeImpact: 1.5 };
    const aggressive = applyPhilosophyThresholds(signal, {
      declineThreshold: 1.5,
      pressureGapThreshold: 1.0,
    });
    const conservative = applyPhilosophyThresholds(signal, {
      declineThreshold: 4.0,
      pressureGapThreshold: 3.0,
    });
    expect(aggressive.shouldAlert).toBe(true);
    expect(conservative.shouldAlert).toBe(false);
  });

  it('severity=critical when predictedValue exceeds decline+2', () => {
    const result = applyPhilosophyThresholds(
      { predictedValue: 6 },
      { declineThreshold: 3, pressureGapThreshold: 2 },
    );
    expect(result.severity).toBe('critical');
  });

  it('severity=warning when shouldAlert but not critical', () => {
    const result = applyPhilosophyThresholds(
      { predictedValue: 3.5 },
      { declineThreshold: 3, pressureGapThreshold: 2 },
    );
    expect(result.severity).toBe('warning');
  });

  it('severity=info when no threshold crossed', () => {
    const result = applyPhilosophyThresholds(
      { predictedValue: 1 },
      { declineThreshold: 3, pressureGapThreshold: 2 },
    );
    expect(result.severity).toBe('info');
  });

  it('falls back to sensible defaults when thresholds are undefined', () => {
    // defaults: decline=3, pressure=2
    const result = applyPhilosophyThresholds(
      { predictedValue: 3.5 },
      { declineThreshold: undefined as unknown as number, pressureGapThreshold: undefined as unknown as number },
    );
    expect(result.shouldAlert).toBe(true);
  });
});
