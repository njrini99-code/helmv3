import { describe, expect, it } from 'vitest';
import { isPlaceholderCause } from '../placeholder-cause';

describe('isPlaceholderCause', () => {
  it('matches the sentence generator-base writes, with or without the final stop and with any metric label', () => {
    expect(isPlaceholderCause('Greens hit from 50-125 yd is off its benchmark. Likely cause inferred from the aggregate, not a measured shot sequence')).toBe(true);
    expect(isPlaceholderCause('Penalties per Round is off its benchmark. Likely cause inferred from the aggregate, not a measured shot sequence.')).toBe(true);
    expect(isPlaceholderCause('  Putts made 3-5 ft is off its benchmark.  Likely cause inferred from the aggregate, not a measured shot sequence ')).toBe(true);
  });

  it('never matches a stated cause', () => {
    expect(isPlaceholderCause('approach missed → chip to inside 6 ft → 1 putt — 10 of 13 missed greens from 50–125 yd')).toBe(false);
    expect(isPlaceholderCause('It looks like a pace-control pattern rather than a green-reading one')).toBe(false);
    expect(isPlaceholderCause('Most of them come off the tee with the driver, on holes where the trouble is on the right')).toBe(false);
    expect(isPlaceholderCause('Likely cause inferred from the aggregate, not a measured shot sequence, and a long approach is the reason')).toBe(false);
  });

  it('treats empty and missing text as not a placeholder', () => {
    expect(isPlaceholderCause('')).toBe(false);
    expect(isPlaceholderCause(null)).toBe(false);
    expect(isPlaceholderCause(undefined)).toBe(false);
  });
});
