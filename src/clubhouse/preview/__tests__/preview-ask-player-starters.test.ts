import { describe, expect, it } from 'vitest';
import { PREVIEW_ASK_DATA, PREVIEW_ASK_PLAYER_SUGGESTIONS } from '../fixtures-ask';

/** G2 (12 Nov): the preview's player Ask offered "Brief me on Finley University", which a real player's home never does. */
describe('the preview player Ask starters', () => {
  it('match the real player loader: no team openers, only the week', () => {
    expect(PREVIEW_ASK_PLAYER_SUGGESTIONS.map((s) => s.id)).toEqual(['week']);
  });
  it('the coach preview keeps its openers', () => {
    expect(PREVIEW_ASK_DATA.suggestions.map((s) => s.id)).toContain('brief');
  });
});
