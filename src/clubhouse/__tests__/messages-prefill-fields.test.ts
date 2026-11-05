// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { messagesPrefillHref, takePrefill } from '../screens/messages/prefill';

const take = (href: string) => takePrefill(new URL(href, 'https://x.test').searchParams);

describe('a prefill keeps what Ask handed it (W-MSG-16)', () => {
  it('returns the thread, the poll and the way back', () => {
    const poll = { question: 'Which van?', options: ['One', 'Two'], multi: true };
    const out = take(messagesPrefillHref({ players: ['p'], draft: 'x', conversationId: 'c', poll, returnTo: 'ask' })!);
    expect(out).toMatchObject({ players: ['p'], draft: 'x', conversationId: 'c', poll, returnTo: 'ask' });
  });

  it('leaves them off when they were never set', () => {
    const out = take(messagesPrefillHref({ players: ['p'], draft: 'x' })!);
    expect(out).toEqual({ players: ['p'], draft: 'x', title: undefined });
  });
});
