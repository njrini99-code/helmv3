import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const channels = vi.hoisted(() => ({ made: [] as Array<{ topic: string; config?: unknown; emit: (p: unknown) => void }>, removed: [] as unknown[] }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    realtime: { setAuth: async () => {} },
    channel: (topic: string, config?: unknown) => {
      const ch = {
        topic,
        config,
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

  it('hears the private topic too (M4): a Clubhouse typer reaches the row, and the viewer still does not', async () => {
    const { result } = renderHook(() => useTypingByConversation('me', ids, null, true));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    const priv = channels.made.find((c) => c.topic === 'golf-typing:a')!;
    expect(priv.config).toEqual({ config: { private: true } });
    act(() => priv.emit({ payload: { userId: 'me', isTyping: true } }));
    expect(result.current.get('a')).toBeUndefined();
    act(() => priv.emit({ payload: { userId: 'maya', isTyping: true } }));
    expect(result.current.get('a')).toEqual(['maya']);
    act(() => priv.emit({ payload: { userId: 'maya', isTyping: false } }));
    expect(result.current.get('a')).toBeUndefined();
  });

  it('skips the open conversation on both topics, caps conversations, and leaves on unmount', async () => {
    const { unmount } = renderHook(() => useTypingByConversation('me', ids, 'a', true));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(channels.made.map((c) => c.topic).sort()).toEqual(['golf-conversation:b', 'golf-typing:b']);
    unmount();
    expect(channels.removed).toHaveLength(2);
    channels.made.length = 0;
    const many = Array.from({ length: 40 }, (_, i) => `c${i}`);
    renderHook(() => useTypingByConversation('me', many, null, true));
    await act(async () => void (await vi.advanceTimersByTimeAsync(0)));
    expect(channels.made.filter((c) => c.topic.startsWith('golf-conversation:'))).toHaveLength(TYPING_CHANNEL_CAP);
    expect(channels.made.filter((c) => c.topic.startsWith('golf-typing:'))).toHaveLength(TYPING_CHANNEL_CAP);
  });

  it('joins nothing with the flag off', () => {
    renderHook(() => useTypingByConversation('me', ids, null, false));
    expect(channels.made).toHaveLength(0);
  });
});
