import { describe, it, expect, vi } from 'vitest';
import { applyPhilosophyThresholds, computePersonalizedThresholds } from '@/lib/coachhelm/v2/orchestrator';

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

describe('computePersonalizedThresholds (coachhelm_v2_alert_personalization)', () => {
  it('reports no change and returns the input thresholds when the learner returns the same values', async () => {
    const behaviorLearner = {
      getPersonalizedThreshold: vi.fn(async (_metric: string, defaultThreshold: number) => defaultThreshold),
    };

    const result = await computePersonalizedThresholds(behaviorLearner, 3, 2);

    expect(result).toEqual({
      declineThreshold: 3,
      pressureGapThreshold: 2,
      declineChanged: false,
      pressureChanged: false,
    });
  });

  it('flags declineChanged/pressureChanged independently and carries the personalized values', async () => {
    const behaviorLearner = {
      getPersonalizedThreshold: vi.fn(async (metric: string, defaultThreshold: number) =>
        metric === 'scoring_decline' ? defaultThreshold * 1.15 : defaultThreshold,
      ),
    };

    const result = await computePersonalizedThresholds(behaviorLearner, 3, 2);

    expect(result.declineThreshold).toBeCloseTo(3.45);
    expect(result.declineChanged).toBe(true);
    expect(result.pressureGapThreshold).toBe(2);
    expect(result.pressureChanged).toBe(false);
  });

  it('calls getPersonalizedThreshold with the metric keys generateAlerts uses', async () => {
    const getPersonalizedThreshold = vi.fn(async (_metric: string, defaultThreshold: number) => defaultThreshold);

    await computePersonalizedThresholds({ getPersonalizedThreshold }, 3, 2);

    expect(getPersonalizedThreshold).toHaveBeenCalledWith('scoring_decline', 3);
    expect(getPersonalizedThreshold).toHaveBeenCalledWith('pressure_gap', 2);
  });
});
