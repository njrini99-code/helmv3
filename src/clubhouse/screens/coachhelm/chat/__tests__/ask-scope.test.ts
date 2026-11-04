import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/golf/actions/coachhelm-ask', () => ({}));

const { askScope } = await import('../Ask');

const NAMES = ['Jonah Okafor', 'Eli Brandt'];

describe('the scope line follows the question (S-ASK.scope)', () => {
  it('is the team and last 30 days when the question names neither', () => {
    expect(askScope('Why are we missing so many short putts?', 'Varsity', NAMES)).toBe('Varsity · last 30 days');
  });
  it('names the player a question is about', () => {
    expect(askScope('Where is Jonah losing strokes?', 'Varsity', NAMES)).toBe('Jonah Okafor · last 30 days');
  });
  it('takes the window the question gave', () => {
    expect(askScope('How is Eli over his last 8 rounds?', 'Varsity', NAMES)).toBe('Eli Brandt · last 8 rounds');
    expect(askScope('How are we scoring this fall?', 'Varsity', NAMES)).toBe('Varsity · this fall');
  });
  it('a player has no names to match, so it never shows a teammate', () => {
    expect(askScope('How does Jonah compare to me?', 'My rounds', [])).toBe('My rounds · last 30 days');
  });
});
