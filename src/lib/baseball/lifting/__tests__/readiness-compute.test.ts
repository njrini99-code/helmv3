// =============================================================================
// Unit tests for V11 readiness compute (honesty + non-medical bands).
// =============================================================================

import { describe, it, expect } from 'vitest';
import { computeReadiness, readinessBandLabel } from '../readiness-compute';
import type { ReadinessInputs } from '../readiness-compute';

const base: ReadinessInputs = {
  playerId: 'p1',
  checkDate: '2026-06-23',
  today: '2026-06-23',
  sleepHours: 8,
  energyLevel: 4,
  stressLevel: 2,
  sorenessLevel: 1,
  armStatus: 'normal',
  lowerBodyStatus: 1,
  illnessFlag: false,
  maxSorenessSeverity: 0,
  hasUpperSoreness: false,
  hasLowerSoreness: false,
  bodyweightDelta7d: 0,
  availabilityStatus: null,
};

describe('computeReadiness', () => {
  it('returns green with full fresh inputs', () => {
    const r = computeReadiness(base);
    expect(r.band).toBe('green');
    expect(r.confidence).toBe('high');
  });

  it('NEVER emits a confident green on stale data', () => {
    const r = computeReadiness({ ...base, checkDate: '2026-06-19' });
    expect(r.band).not.toBe('green');
    expect(r.confidence).toBe('low');
  });

  it('NEVER emits a confident green when 3+ inputs are missing', () => {
    const r = computeReadiness({
      ...base, sleepHours: null, energyLevel: null, sorenessLevel: null, armStatus: null,
    });
    expect(r.band).toBe('yellow');
    expect(r.confidence).toBe('low');
    expect(r.missing_inputs.length).toBeGreaterThanOrEqual(3);
  });

  it('flags red on reported arm pain (operational, not medical)', () => {
    const r = computeReadiness({ ...base, armStatus: 'pain' });
    expect(r.band).toBe('red');
    expect(r.reasons.join(' ')).toMatch(/arm pain/i);
    // never a diagnosis
    expect(r.suggested_action ?? '').not.toMatch(/inj(ury|ured)|diagnos/i);
  });

  it('flags red on illness', () => {
    expect(computeReadiness({ ...base, illnessFlag: true }).band).toBe('red');
  });

  it('flags orange_upper on arm soreness only', () => {
    const r = computeReadiness({ ...base, armStatus: 'sore', hasUpperSoreness: true });
    expect(r.band).toBe('orange_upper');
  });

  it('flags orange_lower on lower-body soreness only', () => {
    const r = computeReadiness({ ...base, lowerBodyStatus: 5, hasLowerSoreness: true });
    expect(r.band).toBe('orange_lower');
  });

  it('escalates to red when both regions are sore', () => {
    const r = computeReadiness({
      ...base, armStatus: 'sore', hasUpperSoreness: true, lowerBodyStatus: 5, hasLowerSoreness: true,
    });
    expect(r.band).toBe('red');
  });

  it('flags yellow on poor sleep', () => {
    expect(computeReadiness({ ...base, sleepHours: 4 }).band).toBe('yellow');
  });

  it('flags yellow on a 3+ lb 7-day bodyweight drop', () => {
    const r = computeReadiness({ ...base, bodyweightDelta7d: -4 });
    expect(r.band).toBe('yellow');
    expect(r.reasons.join(' ')).toMatch(/bodyweight down/i);
  });

  it('availability=unavailable short-circuits to red', () => {
    const r = computeReadiness({ ...base, availabilityStatus: 'unavailable' });
    expect(r.band).toBe('red');
  });

  it('availability=return_to_play maps to blue band', () => {
    const r = computeReadiness({ ...base, availabilityStatus: 'return_to_play' });
    expect(r.band).toBe('blue');
  });

  it('labels are player-safe (never medical)', () => {
    for (const band of ['green', 'yellow', 'orange_lower', 'orange_upper', 'red', 'blue'] as const) {
      expect(readinessBandLabel(band)).not.toMatch(/inj(ury|ured)|risk of injury|diagnos/i);
    }
  });
});
