import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sent: unknown[] = [];
let handler: ((p: { payload: unknown }) => void) | null = null;
const order: string[] = [];
const channel = {
  on: vi.fn((_t: string, _f: unknown, cb: (p: { payload: unknown }) => void) => {
    handler = cb;
    return channel;
  }),
  subscribe: vi.fn(() => channel),
  send: vi.fn((m: unknown) => sent.push(m)),
};
const supabase = {
  realtime: { setAuth: vi.fn(async () => void order.push('setAuth')) },
  channel: vi.fn((topic: string, opts?: unknown) => {
    order.push(`channel ${topic} ${JSON.stringify(opts)}`);
    return channel;
  }),
  removeChannel: vi.fn(),
};
vi.mock('@/lib/supabase/client', () => ({ createClient: () => supabase }));

import { typingTopic, usePrivateTyping } from '../typing-channel';

let api: ReturnType<typeof usePrivateTyping>;
function Probe({ id }: { id: string }) {
  api = usePrivateTyping(id, 'me', 5000);
  return null;
}

beforeEach(() => {
  sent.length = 0;
  order.length = 0;
  handler = null;
  supabase.removeChannel.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('private typing channel (M4)', () => {
  it('joins golf-typing:<id> as a private channel after setAuth', async () => {
    render(<Probe id="c1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(typingTopic('c1')).toBe('golf-typing:c1');
    expect(order).toEqual(['setAuth', 'channel golf-typing:c1 {"config":{"private":true}}']);
  });

  it('lists a typer, ignores the viewer, and expires each typer after 5 seconds', async () => {
    render(<Probe id="c1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => handler!({ payload: { userId: 'me', isTyping: true } }));
    expect(api.typingUserIds).toEqual([]);
    act(() => handler!({ payload: { userId: 'u2', isTyping: true } }));
    expect(api.typingUserIds).toEqual(['u2']);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5001);
    });
    expect(api.typingUserIds).toEqual([]);
  });

  it('broadcasts the viewer typing, throttled to once per 500 ms', async () => {
    render(<Probe id="c1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => api.send(true));
    act(() => api.send(true));
    expect(sent).toEqual([{ type: 'broadcast', event: 'typing', payload: { userId: 'me', isTyping: true } }]);
    act(() => api.send(false));
    expect(sent).toHaveLength(2);
  });

  it('leaves its channel when the conversation changes (re-render)', async () => {
    const { rerender } = render(<Probe id="c1" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    rerender(<Probe id="c2" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(supabase.removeChannel).toHaveBeenCalledTimes(1);
    expect(order.at(-1)).toContain('golf-typing:c2');
  });
});
