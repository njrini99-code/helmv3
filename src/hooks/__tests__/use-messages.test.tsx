/**
 * useMessages — send-failure integrity + live read-receipt updates.
 *
 * Covers:
 *  - #450: a failed send (`{ success: false }` from the server action, which
 *    never throws) must be reported back as `false`, not swallowed as a sent
 *    message.
 *  - #455: an `UPDATE` on `baseball_messages` (fired when the recipient opens
 *    the thread and `markMessagesAsRead` flips `read=true`) must update the
 *    matching message in place so the checkmark upgrades live.
 *  - INSERT dedup: the realtime INSERT handler must not double-add a message
 *    it has already seen.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMessages } from '../use-messages';
import type { Message } from '@/lib/types';

// ── Server action mocks (controllable per test) ─────────────────────────────
const sendMessageMock = vi.fn();
const markMessagesAsReadMock = vi.fn();

vi.mock('@/app/baseball/actions/messages', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  markMessagesAsRead: (...args: unknown[]) => markMessagesAsReadMock(...args),
}));

// ── Supabase client mock — chainable query builder + a channel stub that
// records `.on(...)` handlers so tests can fire simulated realtime events ──
type Handler = (payload: { new: unknown }) => void;
const channelHandlers = new Map<string, Handler[]>();

let queryResult: { data: Message[] | null } = { data: [] };

function makeQueryChain() {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order']) {
    chain[method] = () => chain;
  }
  (chain as { then: (resolve: (v: unknown) => void) => void }).then = (resolve) => {
    resolve(queryResult);
  };
  return chain;
}

function fireChannelEvent(event: string, payload: { new: unknown }) {
  for (const handler of channelHandlers.get(event) ?? []) {
    handler(payload);
  }
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => makeQueryChain(),
    channel: () => {
      const channelStub = {
        on: (_type: string, config: { event: string }, handler: Handler) => {
          const list = channelHandlers.get(config.event) ?? [];
          list.push(handler);
          channelHandlers.set(config.event, list);
          return channelStub;
        },
        subscribe: () => channelStub,
      };
      return channelStub;
    },
    removeChannel: () => undefined,
  }),
}));

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    conversation_id: 'convo-1',
    sender_id: 'me',
    content: 'hey',
    read: false,
    created_at: new Date().toISOString(),
    ...overrides,
  } as Message;
}

describe('useMessages', () => {
  beforeEach(() => {
    channelHandlers.clear();
    queryResult = { data: [] };
    sendMessageMock.mockReset();
    markMessagesAsReadMock.mockReset().mockResolvedValue({ success: true });
  });

  describe('sendMessage (#450)', () => {
    it('returns false when the server action resolves { success: false } (no throw)', async () => {
      sendMessageMock.mockResolvedValue({ success: false, error: 'Not a participant in this conversation' });

      const { result } = renderHook(() => useMessages('convo-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      let sendResult: boolean | undefined;
      await act(async () => {
        sendResult = await result.current.sendMessage('hello');
      });

      expect(sendResult).toBe(false);
    });

    it('returns true when the server action resolves { success: true }', async () => {
      sendMessageMock.mockResolvedValue({ success: true });

      const { result } = renderHook(() => useMessages('convo-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      let sendResult: boolean | undefined;
      await act(async () => {
        sendResult = await result.current.sendMessage('hello');
      });

      expect(sendResult).toBe(true);
    });

    it('still returns false if the action throws directly (network failure)', async () => {
      sendMessageMock.mockRejectedValue(new Error('network down'));

      const { result } = renderHook(() => useMessages('convo-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      let sendResult: boolean | undefined;
      await act(async () => {
        sendResult = await result.current.sendMessage('hello');
      });

      expect(sendResult).toBe(false);
    });
  });

  describe('realtime read receipts (#455)', () => {
    it('flips a message to read when an UPDATE event arrives for it', async () => {
      const initialMessage = makeMessage({ id: 'msg-1', read: false });
      queryResult = { data: [initialMessage] };

      const { result } = renderHook(() => useMessages('convo-1'));
      await waitFor(() => expect(result.current.messages).toHaveLength(1));
      expect(result.current.messages[0]?.read).toBe(false);

      act(() => {
        fireChannelEvent('UPDATE', { new: { ...initialMessage, read: true } });
      });

      await waitFor(() => expect(result.current.messages[0]?.read).toBe(true));
    });

    it('does not duplicate a message the INSERT handler has already seen', async () => {
      const { result } = renderHook(() => useMessages('convo-1'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      const incoming = makeMessage({ id: 'msg-2' });
      act(() => {
        fireChannelEvent('INSERT', { new: incoming });
        fireChannelEvent('INSERT', { new: incoming });
      });

      await waitFor(() => expect(result.current.messages).toHaveLength(1));
    });
  });
});
