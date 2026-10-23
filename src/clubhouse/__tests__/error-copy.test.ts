import { describe, expect, it } from 'vitest';
import { hits, walk } from './_scan';

/**
 * B10.3: a failure says what didn't happen and what to do ("Your rounds didn't load. Posted rounds are safe. Try again."),
 * not that it was reported (the coach can't act on that) or a guess at the cause.
 */
describe('error copy (B10)', () => {
  const src = walk(undefined, /\.tsx?$/);
  it('no screen says the error has been reported', () => {
    expect(hits(/error has been reported/i, src)).toEqual([]);
  });
  it('no screen guesses at the cause', () => {
    expect(hits(/display problem|usually clears it/i, src.filter((f) => f.includes('/screens/')))).toEqual([]);
  });
});
