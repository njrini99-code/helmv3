import { describe, expect, it } from 'vitest';
import { FAILURE_COPY } from '../ui/Notices';
import { hits, walk } from './_scan';

/**
 * B10.3: a failure says what didn't happen and what to do ("Your rounds didn't load. Posted rounds are safe. Try again."),
 * not that it was reported (the coach can't act on that) or a guess at the cause. Every folder, the shell and the shared
 * ui/ included: the page, section and route failures live there.
 */
describe('error copy (B10)', () => {
  const src = walk(undefined, /\.tsx?$/);
  it('nothing says the error was reported', () => {
    expect(hits(/error has been reported|reported automatically/i, src)).toEqual([]);
  });
  it('nothing guesses at the cause', () => {
    expect(hits(/display problem|usually clears/i, src)).toEqual([]);
  });
  it('a hint beside Try again says Try again, not Retry (CONS-6)', () => {
    expect(hits(/['"`]Retry to\b|\. Retry to\b/, src)).toEqual([]);
  });
  it('the templates end on what to do, and never report or guess', () => {
    const all = [FAILURE_COPY.load(['your rounds', 'this week’s schedule']), FAILURE_COPY.shown, FAILURE_COPY.page, FAILURE_COPY.offline];
    expect(all[0]).toBe('Your rounds and this week’s schedule didn’t load. Nothing you saved is lost. Try again.');
    for (const line of all) {
      expect(line).toMatch(/try again\.$/i);
      expect(line).not.toMatch(/reported|usually/i);
    }
  });
});
