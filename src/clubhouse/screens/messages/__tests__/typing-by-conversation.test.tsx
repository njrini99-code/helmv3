import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const channels = vi.hoisted(() => ({ made: [] as Array<{ topic: string; emit: (p: unknown) => void }>, removed: [] as unknown[] }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: (topic: string) => {
      const ch = {
        topic,
        emit: (_: unknown) => {},
        on(_: string, __: unknown, cb: (p: unknown) => void) {
          ch.emit = cb;
          return ch;
        },
        subscribe: () => ch,
      };
      channels.made.push(ch);
      return ch;
    },
    removeChannel: (c: unknown) => channels.removed.push(c),
  }),
}));

import { TYPING_CHANNEL_CAP, useTypingByConversation } from '../use-typing-by-conversation';

const ids = ['a', 'b'];
beforeEach(() => {
  vi.useFakeTimers();
  channels.made.length = 0;
  channels.removed.length = 0;
});
afterEach(() => vi.useRealTimers());

describe('useTypingByConversation', () => {
  it('ignores the viewer, and a typer expires after 5 seconds', () => {
    const { result } = renderHook(() => useTypingByConversation('me', ids, null, true));
    const a = channels.made.find((c) => c.topic === 'golf-conversation:a')!;
    act(() => a.emit({ payload: { userId: 'me', isTyping: true } }));
    expect(result.current.get('a')).toBeUndefined();
    act(() => a.emit({ payload: { userId: 'maya', isTyping: true } }));
    expect(result.current.get('a')).toEqual(['maya']);
    act(() => void vi.advanceTimersByTime(5100));
    expect(result.current.get('a')).toBeUndefined();
  });

  it('skips the open conversation, caps channels, and leaves on unmount', () => {
    const { unmount } = renderHook(() => useTypingByConversation('me', ids, 'a', true));
    expect(channels.made.map((c) => c.topic)).toEqual(['golf-conversation:b']);
    unmount();
    expect(channels.removed).toHaveLength(1);
    channels.made.length = 0;
    const many = Array.from({ length: 40 }, (_, i) => `c${i}`);
    renderHook(() => useTypingByConversation('me', many, null, true));
    expect(channels.made).toHaveLength(TYPING_CHANNEL_CAP);
  });

  it('joins nothing with the flag off', () => {
    renderHook(() => useTypingByConversation('me', ids, null, false));
    expect(channels.made).toHaveLength(0);
  });
});
