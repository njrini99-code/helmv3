// =============================================================================
// Regression test for the OUTCOME LEDGER honesty rule (V10 — did-it-move).
//
// THE BUG (orphan mechanic): recordActionOutcomes was never triggered, so the
// "did the metric the action targeted actually move?" verdict never ran. As part
// of wiring it into a cron + the postgame path, the verdict logic was extracted
// into the pure outcomeVerdictFor() so all three callers stay HONEST.
//
// These lock the honesty guarantees the migration header demands:
//   * a one-game (thin) after-window is 'too_early', NEVER 'improved';
//   * a neutral_threshold metric (null signed movement) is 'insufficient_sample',
//     never a fake direction;
//   * a measured direction only earns improved/regressed past the dead-band;
//   * a missing baseline/observed is 'insufficient_sample'.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { outcomeVerdictFor } from '@/lib/baseball/coachhelm/outcome-sweep';

describe('outcomeVerdictFor — did-it-move honesty', () => {
  it("renders 'too_early' for a one-game after-window even with positive movement", () => {
    // The whole point: 1 game is not proof. Must NOT say 'improved'.
    expect(outcomeVerdictFor(0.08, 1, true)).toBe('too_early');
    expect(outcomeVerdictFor(-0.08, 1, true)).toBe('too_early');
    expect(outcomeVerdictFor(0.08, 0, true)).toBe('too_early');
  });

  it("renders 'insufficient_sample' when baseline/observed is missing", () => {
    expect(outcomeVerdictFor(null, 5, false)).toBe('insufficient_sample');
    expect(outcomeVerdictFor(0.5, 5, false)).toBe('insufficient_sample');
  });

  it("renders 'insufficient_sample' for a neutral_threshold metric (null movement)", () => {
    // sign 0 → signedMovement null even with a fat sample.
    expect(outcomeVerdictFor(null, 10, true)).toBe('insufficient_sample');
  });

  it("renders 'improved' only past the dead-band with an adequate after-window", () => {
    expect(outcomeVerdictFor(0.05, 3, true)).toBe('improved');
    expect(outcomeVerdictFor(0.006, 2, true)).toBe('improved');
  });

  it("renders 'regressed' for adequately-sampled negative movement", () => {
    expect(outcomeVerdictFor(-0.05, 3, true)).toBe('regressed');
    expect(outcomeVerdictFor(-0.006, 2, true)).toBe('regressed');
  });

  it("renders 'no_change' inside the dead-band", () => {
    expect(outcomeVerdictFor(0.004, 4, true)).toBe('no_change');
    expect(outcomeVerdictFor(-0.004, 4, true)).toBe('no_change');
    expect(outcomeVerdictFor(0, 4, true)).toBe('no_change');
  });

  it('the sample gate beats the direction gate (a thin win is still too_early)', () => {
    // A large positive movement on a single game is STILL too_early — sample
    // honesty is checked before direction.
    expect(outcomeVerdictFor(99, 1, true)).toBe('too_early');
  });
});
