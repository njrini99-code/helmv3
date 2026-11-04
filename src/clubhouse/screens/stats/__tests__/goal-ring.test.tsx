import { describe, expect, it } from 'vitest';
import { progressOf } from '../dev-format';

describe('progressOf', () => {
  it('reads 0 at the baseline and 100 at the target', () => {
    expect(progressOf(80, 80, 75)).toBe(0);
    expect(progressOf(80, 75, 75)).toBe(100);
  });
  it('holds past the target at 100, and before the baseline at 0', () => {
    expect(progressOf(80, 70, 75)).toBe(100);
    expect(progressOf(80, 85, 75)).toBe(0);
  });
  it('never invents progress without a baseline, a current figure or a target', () => {
    expect(progressOf(null, 75, 75)).toBeNull();
    expect(progressOf(80, null, 75)).toBeNull();
    expect(progressOf(80, 75, null)).toBeNull();
    expect(progressOf(75, 75, 75)).toBeNull();
  });
});
