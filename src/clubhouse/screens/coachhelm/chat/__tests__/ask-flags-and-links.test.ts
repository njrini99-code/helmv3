import { describe, expect, it } from 'vitest';
import { askAboutHref, askAboutReadHref } from '../ask-links';

/** Ask CP-69. */
describe('ask-links', () => {
  it('seed the question, encoded', () => {
    expect(askAboutHref({ question: 'Why & how?' })).toContain(`q=${encodeURIComponent('Why & how?')}`);
  });
  it('a coach’s link names the player; a player’s says "my"', () => {
    expect(decodeURIComponent(askAboutReadHref({ insightId: 'i1', title: 'Putts', first: 'Eli' }))).toContain('Tell me about Eli: Putts');
    const mine = decodeURIComponent(askAboutReadHref({ insightId: 'i1', title: 'Putts' }));
    expect(mine).toContain('Tell me about my read: Putts');
    expect(mine).toContain('insight=i1');
  });
});
