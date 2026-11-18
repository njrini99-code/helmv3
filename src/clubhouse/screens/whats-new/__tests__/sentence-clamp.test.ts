import { describe, expect, it } from 'vitest';
import { sentenceClamp } from '../WhatsNew';

/** L-065: What's new bodies end at a sentence, never mid-word ("When yo…"). */
describe('sentenceClamp', () => {
  const body = 'Approach play dropped 0.4 a round. When you miss, it is long. Try one less club into firm greens this week.';
  it('keeps only the first sentence on the phone', () => {
    expect(sentenceClamp(body, true)).toBe('Approach play dropped 0.4 a round.');
  });
  it('keeps whole sentences up to the limit on the desk', () => {
    expect(sentenceClamp(body, false, 70)).toBe('Approach play dropped 0.4 a round. When you miss, it is long.');
    expect(sentenceClamp(body, false)).toBe(body);
  });
  it('never splits a decimal, and leaves a body with one sentence whole', () => {
    expect(sentenceClamp('Average 74.5 over five rounds', true)).toBe('Average 74.5 over five rounds');
  });
});
