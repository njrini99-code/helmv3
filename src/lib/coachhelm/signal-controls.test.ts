import { describe, expect, it } from 'vitest';
import {
  PHILOSOPHY_DEFAULTS,
  SIGNAL_CONTROL_RANGES,
  SENSITIVITY_CONFIDENCE_FLOOR,
  confidenceFloorForSensitivity,
} from './constants';

/**
 * The signal controls added on 2026-07-25 replace constants the engine used to
 * hard-code. The contract that makes them safe to ship is that their DEFAULTS
 * reproduce the old behaviour exactly — these tests hold that line, because a
 * drift here silently changes every coach's alert volume.
 */
describe('signal-control defaults reproduce the prior hard-coded engine', () => {
  it('minInsightConfidence defaults to insight-scorer DEFAULT_MINIMUM_THRESHOLD', () => {
    expect(PHILOSOPHY_DEFAULTS.minInsightConfidence).toBe(0.3);
  });

  it('minRoundsForSignal defaults to the prior "Need 3+ rounds" gate', () => {
    expect(PHILOSOPHY_DEFAULTS.minRoundsForSignal).toBe(3);
  });

  it('alertDigest defaults to the prior immediate delivery', () => {
    expect(PHILOSOPHY_DEFAULTS.alertDigest).toBe('immediate');
  });

  it('the default confidence floor sits BELOW every sensitivity preset, so it is a no-op', () => {
    // This is the whole safety argument for shipping the control enabled:
    // max(preset, 0.30) === preset for all three presets.
    for (const preset of Object.values(SENSITIVITY_CONFIDENCE_FLOOR)) {
      expect(PHILOSOPHY_DEFAULTS.minInsightConfidence).toBeLessThan(preset);
      expect(Math.max(preset, PHILOSOPHY_DEFAULTS.minInsightConfidence)).toBe(preset);
    }
  });
});

describe('confidenceFloorForSensitivity', () => {
  it('maps each preset to its documented floor', () => {
    expect(confidenceFloorForSensitivity('aggressive')).toBe(0.4);
    expect(confidenceFloorForSensitivity('balanced')).toBe(0.55);
    expect(confidenceFloorForSensitivity('conservative')).toBe(0.7);
  });

  it('falls back to balanced for an unrecognized value', () => {
    expect(confidenceFloorForSensitivity('nonsense')).toBe(0.55);
  });
});

describe('SIGNAL_CONTROL_RANGES stays in step with the DB CHECK constraints', () => {
  // Migration 20260725090000 constrains min_insight_confidence to [0.10, 0.90]
  // and min_rounds_for_signal to [1, 15]. A UI range wider than the constraint
  // would let a coach pick a value the write then rejects.
  it('confidence range matches the constraint', () => {
    expect(SIGNAL_CONTROL_RANGES.minInsightConfidence.min).toBe(0.1);
    expect(SIGNAL_CONTROL_RANGES.minInsightConfidence.max).toBe(0.9);
  });

  it('rounds range matches the constraint', () => {
    expect(SIGNAL_CONTROL_RANGES.minRoundsForSignal.min).toBe(1);
    expect(SIGNAL_CONTROL_RANGES.minRoundsForSignal.max).toBe(15);
  });

  it('the confidence range can exceed every preset, or the control could never bite', () => {
    const strictest = Math.max(...Object.values(SENSITIVITY_CONFIDENCE_FLOOR));
    expect(SIGNAL_CONTROL_RANGES.minInsightConfidence.max).toBeGreaterThan(strictest);
  });
});
