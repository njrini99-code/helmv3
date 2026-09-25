import { describe, expect, it } from 'vitest';
import { coachCopyOf, withCoachVoice } from './coach-copy';

const row = (evidence: unknown) => ({ id: 'i1', title: 'Your putting', content: 'You miss short.', evidence });

describe('coach copy', () => {
  it('swaps title and content for the stored coach copy', () => {
    const out = withCoachVoice(row({ coach_copy: { title: 'Putting', content: 'The player misses short.' } }));
    expect(out).toMatchObject({ id: 'i1', title: 'Putting', content: 'The player misses short.' });
  });

  it('keeps the stored text when there is no coach copy, or it is malformed or blank', () => {
    for (const ev of [null, {}, { coach_copy: null }, { coach_copy: { title: 'x' } }, { coach_copy: { title: ' ', content: 'y' } }]) {
      expect(withCoachVoice(row(ev))).toMatchObject({ title: 'Your putting', content: 'You miss short.' });
      expect(coachCopyOf(ev)).toBeNull();
    }
  });
});
