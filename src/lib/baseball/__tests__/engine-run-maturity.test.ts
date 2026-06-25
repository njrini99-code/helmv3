// =============================================================================
// Test for the INSIGHT MATURITY counter + 'matured' promotion (V10 gap closure).
//
// Before this fix every engine run reset lifecycle_state to detected/tentative,
// so the shared ladder's 'matured' state was unreachable and the ranker's
// "repeated trend (matured)" PROMOTE term was dead. computeMaturityState is the
// pure decision the row builder now uses. These lock:
//   * observation_count starts at 1 on first insert, increments on re-fire;
//   * first_detected_at is STABLE across re-fires;
//   * promotion to 'matured' on ≥3 observations OR sufficient age;
//   * a prior 'matured' is never demoted;
//   * a terminal 'resolved' (set by the outcome sweep) is preserved.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  computeMaturityState,
  type PriorInsightState,
} from '@/lib/baseball/coachhelm/engine-run';

const NOW = '2026-06-24T12:00:00.000Z';
const prior = (over: Partial<PriorInsightState>): PriorInsightState => ({
  lifecycle_state: 'detected',
  observation_count: 1,
  first_detected_at: NOW,
  status: 'active',
  ...over,
});

describe('computeMaturityState — repeat-validation maturity', () => {
  it('starts at observation_count 1 and base ladder on a genuine first insert', () => {
    const s = computeMaturityState('high', undefined, NOW);
    expect(s.observationCount).toBe(1);
    expect(s.firstDetectedAt).toBe(NOW);
    expect(s.lifecycle).toBe('detected'); // high/urgent → detected
    const low = computeMaturityState('low', undefined, NOW);
    expect(low.lifecycle).toBe('tentative'); // below high → tentative
  });

  it('increments observation_count and keeps first_detected_at stable on a re-fire', () => {
    const firstSeen = '2026-06-22T12:00:00.000Z';
    const s = computeMaturityState(
      'medium',
      prior({ observation_count: 1, first_detected_at: firstSeen, lifecycle_state: 'tentative' }),
      NOW,
    );
    expect(s.observationCount).toBe(2);
    expect(s.firstDetectedAt).toBe(firstSeen); // NOT reset to NOW
    expect(s.lifecycle).toBe('tentative'); // 2 < 3 and < 7 days → not yet matured
  });

  it("promotes to 'matured' at the 3rd observation", () => {
    const s = computeMaturityState(
      'medium',
      prior({ observation_count: 2, lifecycle_state: 'tentative', first_detected_at: NOW }),
      NOW,
    );
    expect(s.observationCount).toBe(3);
    expect(s.lifecycle).toBe('matured');
  });

  it("promotes to 'matured' on age alone (persisted ≥ window) even at low count", () => {
    const old = '2026-06-10T12:00:00.000Z'; // 14 days before NOW (≥ 7-day window)
    const s = computeMaturityState(
      'low',
      prior({ observation_count: 1, first_detected_at: old, lifecycle_state: 'tentative' }),
      NOW,
    );
    expect(s.lifecycle).toBe('matured');
  });

  it('never demotes a prior matured row back down', () => {
    const s = computeMaturityState(
      'low',
      prior({ observation_count: 1, lifecycle_state: 'matured', first_detected_at: NOW }),
      NOW,
    );
    expect(s.lifecycle).toBe('matured');
  });

  it("preserves a terminal 'resolved' lifecycle (outcome-sweep owned)", () => {
    const s = computeMaturityState(
      'high',
      prior({ observation_count: 5, lifecycle_state: 'resolved', first_detected_at: NOW }),
      NOW,
    );
    // A re-firing detection must NOT re-open a sweep-resolved insight.
    expect(s.lifecycle).toBe('resolved');
  });
});
