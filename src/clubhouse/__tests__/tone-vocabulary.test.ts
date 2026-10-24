import { describe, expect, it } from 'vitest';
import { hits, ratchet, ROOT, slack, walk } from './_scan';

/**
 * CONS-20: one tone vocabulary. A figure that moved the good or the bad way says so with changeTone() (`is-gain`,
 * `is-loss`, or nothing at zero), painted with --ch-chart-gain and --ch-chart-loss. The older words below still stand in
 * these files; each is read before it moves (an `is-up` is a direction, and up is the bad way for a scoring average), so
 * their counts may only fall, toward none.
 */
const ALLOW_TONE_WORDS: Record<string, number> = {
  'screens/rounds/parts.tsx': 1,
  'styles/coachhelm-dive.css': 2,
  'styles/coachhelm-profile.css': 6,
  'styles/coachhelm.css': 1,
  'styles/roster.css': 3,
  'styles/rounds.css': 3,
  // The focus loop's verdict word (is-good) is CoachHelm's good/warn vocabulary, an open owner question.
  'styles/stats.css': 1,
};

describe('one tone vocabulary (CONS-20)', () => {
  it('no new is-good, is-bad, is-up, is-down, is-better, is-worse, is-positive or is-win', () => {
    const found = hits(/\bis-(good|bad|up|down|better|worse|positive|win)\b/, walk(ROOT, /\.(tsx?|css)$/));
    const r = ratchet(found, ALLOW_TONE_WORDS);
    expect(r.over).toEqual([]);
    expect(r.stale).toEqual([]);
    expect(slack(found, ALLOW_TONE_WORDS)).toEqual([]);
  });
});
