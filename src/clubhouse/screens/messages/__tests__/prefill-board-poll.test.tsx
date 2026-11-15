import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messagesPrefillHref, seedThreadFiles, subscribeThreadFiles, takePrefill, takeThreadFiles } from '../prefill';
import { clearPollDrafts, seedPollDraft } from '../polls';

const take = (href: string) => takePrefill(new URL(href, 'https://x.test').searchParams);

describe('what Ask hands Messages', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    clearPollDrafts();
  });

  it('a board picture rides with the prefill once, never in storage', () => {
    const file = new File(['x'], 'board.png', { type: 'image/png' });
    const href = messagesPrefillHref({ players: ['p1'], draft: 'Look', files: [file] })!;
    expect(JSON.stringify({ ...window.sessionStorage })).not.toContain('board.png');
    expect(take(href)?.files).toEqual([file]);
    const again = messagesPrefillHref({ players: ['p1'], draft: 'Look' })!;
    expect(take(again)?.files).toBeUndefined();
  });

  it('a thread with no players is enough; nobody and no thread is not', () => {
    expect(take(messagesPrefillHref({ players: [], draft: 'Hi', conversationId: 'c1' })!)?.conversationId).toBe('c1');
    expect(messagesPrefillHref({ players: [], draft: 'Hi' })).toBeNull();
  });

  it('files wait for the thread and tell an open composer', () => {
    const file = new File(['x'], 'board.png', { type: 'image/png' });
    const heard = vi.fn();
    const off = subscribeThreadFiles(heard);
    seedThreadFiles('c1', [file]);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(takeThreadFiles('c2')).toEqual([]);
    expect(takeThreadFiles('c1')).toEqual([file]);
    expect(takeThreadFiles('c1')).toEqual([]);
    off();
  });

  it('a poll seeds without throwing for an end in the team zone', () => {
    expect(() => seedPollDraft('c1', { question: 'Which?', options: ['A', 'B'], closes: '2030-03-01T17:00:00Z' }, 'America/New_York')).not.toThrow();
  });
});
