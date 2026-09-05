import { describe, it, expect, vi } from 'vitest';
import { randomSuffix } from '../useAnalyticsTracking';

/**
 * js/insecure-randomness (#102, #103): the client-side analytics session id
 * used to be seeded from Math.random(). Pins that it now comes from
 * crypto.getRandomValues instead, and that repeated calls don't collide in
 * any way that would suggest the underlying source degraded back to a weak
 * PRNG.
 */
describe('randomSuffix', () => {
  it('never calls Math.random', () => {
    const spy = vi.spyOn(Math, 'random');
    randomSuffix();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('draws from crypto.getRandomValues', () => {
    const spy = vi.spyOn(crypto, 'getRandomValues');
    randomSuffix();
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('produces a short, url-safe, non-empty string', () => {
    const value = randomSuffix();
    expect(value.length).toBeGreaterThan(0);
    expect(value).toMatch(/^[a-z0-9]+$/);
  });

  it('is not deterministic across calls', () => {
    const values = new Set(Array.from({ length: 20 }, () => randomSuffix()));
    // Cryptographically random output should not collide 20 times in a row.
    expect(values.size).toBeGreaterThan(1);
  });
});
