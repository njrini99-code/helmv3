import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { chNavCommitted, chNavHeld, chNavOnceReset, chNavStarted } from '../../../lib/nav-once';

/**
 * Design lab pilot P5 (dsx-06): a Rounds row to its round on the phone as one touch sequence. Most of it was built by the motion
 * thread (pa-mot-01 to 04): the press wash (lib/press.ts), the push over 520 ms with the page arriving inert (E-2), a Back
 * mid-push reversing from where it stood (lib/__tests__/grab-push.test.ts), the double-tap hold (lib/nav-once.ts). This file pins
 * the parts that are Rounds' own, so the sequence cannot come apart one file at a time.
 */
const src = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/screens/rounds', f), 'utf8');

describe('Rounds row to round, one sequence (P5)', () => {
  it('the row’s score and the review’s hero share one key, so the figure travels into the page (E-6)', () => {
    const key = /data-ch-share="([a-z-]+)"/;
    expect(src('TeamRounds.tsx').match(key)?.[1]).toBe('round-score');
    expect(src('RoundReview.tsx').match(key)?.[1]).toBe('round-score');
  });

  it('the row tap itself is silent (D-70: other taps are silent)', () => {
    expect(src('TeamRounds.tsx')).not.toMatch(/haptic\(/);
  });

  it('a double tap on a row opens the round once: the twin tap is held through the commit', () => {
    chNavOnceReset();
    const t0 = 1000;
    chNavStarted('/golf/dashboard/rounds/r1', t0);
    expect(chNavHeld(t0 + 80)).toBe(true);
    chNavCommitted(t0 + 120);
    // Still inside the double-tap window after the page commits.
    expect(chNavHeld(t0 + 300)).toBe(true);
    chNavOnceReset();
  });
});
