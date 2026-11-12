import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/golf/actions/coachhelm-ask', () => ({}));

import { lastTurnWindow } from '../ask-scope-window';
const { askScope } = await import('../Ask');

const user = (text: string) => ({ role: 'user' as const, parts: [{ type: 'text' as const, text }] });
const read = (window_label?: string) => ({ type: 'data-evidence' as const, data: { tool: 't', envelope: { summary: 's', window_label }, ref: 'e1' } });
const assistant = (...parts: Array<ReturnType<typeof read>>) => ({ role: 'assistant' as const, parts: parts as never });

describe('the scope line follows the window the reads used', () => {
  it('is null before any read, so the line falls back to the question’s words', () => {
    expect(lastTurnWindow([])).toBeNull();
    expect(lastTurnWindow([user('How is Eli?')])).toBeNull();
    expect(lastTurnWindow([user('How is Eli?'), assistant(read())])).toBeNull();
  });

  it('takes the window of the last turn’s reads', () => {
    expect(lastTurnWindow([user('How is Eli?'), assistant(read('last 10 rounds'))])).toBe('last 10 rounds');
  });

  it('ignores an earlier turn’s reads', () => {
    const messages = [user('q1'), assistant(read('this season')), user('q2'), assistant(read('last 5 rounds'))];
    expect(lastTurnWindow(messages)).toBe('last 5 rounds');
    expect(lastTurnWindow([...messages, user('q3')])).toBeNull();
  });

  it('says both when the reads of one turn disagree, newest first, and each once', () => {
    expect(lastTurnWindow([user('q'), assistant(read('last 10 rounds'), read('this season'), read('last 10 rounds'))])).toBe('last 10 rounds, this season');
  });

  it('beats the question’s guess in the line, and leaves the question’s words when no read named one', () => {
    const NAMES = ['Eli Brandt'];
    expect(askScope('How is Eli this season?', 'Varsity', NAMES, 'last 10 rounds')).toBe('Eli Brandt · last 10 rounds');
    expect(askScope('How is Eli this season?', 'Varsity', NAMES, null)).toBe('Eli Brandt · this season');
    expect(askScope('How is Eli?', 'Varsity', NAMES)).toBe('Eli Brandt');
  });
});
