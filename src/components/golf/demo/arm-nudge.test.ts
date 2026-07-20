import { describe, it, expect } from 'vitest';
import {
  DEMO_PRICING_NUDGE_CLICK_THRESHOLD,
  DEMO_PRICING_NUDGE_DELAY_MS,
  resolveNudgeArming,
  shouldFireNudge,
} from './arm-nudge';

describe('shouldFireNudge', () => {
  it('does not fire before either threshold is reached', () => {
    expect(shouldFireNudge(0, 0)).toBe(false);
    expect(shouldFireNudge(DEMO_PRICING_NUDGE_DELAY_MS - 1, DEMO_PRICING_NUDGE_CLICK_THRESHOLD - 1)).toBe(false);
  });

  it('fires once the 30s timer elapses, regardless of click count', () => {
    expect(shouldFireNudge(DEMO_PRICING_NUDGE_DELAY_MS, 0)).toBe(true);
    expect(shouldFireNudge(DEMO_PRICING_NUDGE_DELAY_MS + 5_000, 0)).toBe(true);
  });

  it('fires once the pointerdown counter reaches 8, regardless of elapsed time', () => {
    expect(shouldFireNudge(0, DEMO_PRICING_NUDGE_CLICK_THRESHOLD)).toBe(true);
    expect(shouldFireNudge(0, DEMO_PRICING_NUDGE_CLICK_THRESHOLD + 3)).toBe(true);
  });

  it('does not fire at 7 clicks and 29999ms — one under each threshold', () => {
    expect(shouldFireNudge(DEMO_PRICING_NUDGE_DELAY_MS - 1, DEMO_PRICING_NUDGE_CLICK_THRESHOLD - 1)).toBe(false);
  });
});

describe('resolveNudgeArming', () => {
  it('marks the tour and arms on first landing (?demo=1, no flags set yet)', () => {
    const result = resolveNudgeArming({
      locationSearch: '?demo=1',
      tourFlag: null,
      nudgedFlag: null,
    });
    expect(result).toEqual({ shouldMarkTour: true, shouldArm: true });
  });

  it('tolerates ?demo=1 combined with other query params', () => {
    const result = resolveNudgeArming({
      locationSearch: '?utm_source=email&demo=1',
      tourFlag: null,
      nudgedFlag: null,
    });
    expect(result.shouldMarkTour).toBe(true);
    expect(result.shouldArm).toBe(true);
  });

  it('arms on subsequent pages once the tour flag is already set (no ?demo=1 present)', () => {
    const result = resolveNudgeArming({
      locationSearch: '',
      tourFlag: '1',
      nudgedFlag: null,
    });
    expect(result).toEqual({ shouldMarkTour: false, shouldArm: true });
  });

  it('does not arm when neither ?demo=1 nor the tour flag is present (non-demo user)', () => {
    const result = resolveNudgeArming({
      locationSearch: '',
      tourFlag: null,
      nudgedFlag: null,
    });
    expect(result).toEqual({ shouldMarkTour: false, shouldArm: false });
  });

  it('does not re-arm once already nudged this session', () => {
    const result = resolveNudgeArming({
      locationSearch: '',
      tourFlag: '1',
      nudgedFlag: '1',
    });
    expect(result.shouldArm).toBe(false);
  });

  it('does not re-arm on a later ?demo=1 landing (e.g. re-shared link) if already nudged', () => {
    const result = resolveNudgeArming({
      locationSearch: '?demo=1',
      tourFlag: null,
      nudgedFlag: '1',
    });
    // Still (re)marks the tour flag — that's independent of the nudged state —
    // but must not re-arm the toast.
    expect(result.shouldMarkTour).toBe(true);
    expect(result.shouldArm).toBe(false);
  });
});
