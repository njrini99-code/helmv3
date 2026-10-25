import { describe, expect, it } from 'vitest';
import { changeInk, changeTone, changeVerdict, formatSigned } from '../format';
import { sgTint } from '../sg';

/**
 * A2 (Clubhouse A+ handoff): a change that prints as 0.0 or +0.0 is no change, so it is never painted green or amber.
 * Every screen asks `changeTone` (or its two forms) with the digits it prints, instead of testing `>= 0` itself.
 */
describe('A value that rounds to zero has no tone', () => {
  it('is untoned at the digits it is shown with', () => {
    expect(changeTone(0.04, false, 1)).toBe('');
    expect(changeTone(-0.04, true, 1)).toBe('');
    expect(changeTone(0, false, 1)).toBe('');
    expect(changeTone(0.4, false, 0)).toBe('');
    expect(formatSigned(0.04)).toBe('0.0');
  });

  it('is toned once it shows as a change', () => {
    expect(changeTone(0.05, false, 1)).toBe('is-gain');
    expect(changeTone(-0.05, false, 1)).toBe('is-loss');
    expect(changeTone(-0.05, true, 1)).toBe('is-gain');
    expect(changeTone(0.006, true, 2)).toBe('is-loss');
  });

  it('has the same zero in its text-class and good-or-bad forms', () => {
    expect(changeInk(0.04)).toBe('');
    expect(changeInk(0.3)).toBe('ch-gain');
    expect(changeInk(0.3, true)).toBe('ch-loss');
    expect(changeInk(null)).toBe('');
    expect(changeVerdict(-0.04)).toBeUndefined();
    expect(changeVerdict(1.2)).toBe('good');
    expect(changeVerdict(-1, true, 0)).toBe('good');
    expect(changeVerdict(0, true, 0)).toBeUndefined();
  });

  it('leaves a zero grid cell clear, unlike a cell with no data', () => {
    expect(sgTint(0.04, 3)).toBe('transparent');
    expect(sgTint(0.04, 3, 1)).not.toBe(sgTint(null, 3));
    expect(sgTint(0.2, 3)).toContain('--ch-chart-gain');
  });
});
