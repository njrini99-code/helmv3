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
 *  - #451: useConversations must NOT subscribe unfiltered to every row of
 *    baseball_messages platform-wide; it must scope its realtime
 *    subscription to the viewer's own rows (baseball_conversation_participants
 *    filtered by user_id).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMessages, useConversations } from '../use-messages';
import { useAuthStore } from '@/stores/auth-store';
import type { Message } from '@/lib/types';

// ── Server action mocks (controllable per test) ─────────────────────────────
const sendMessageMock = vi.fn();
const markMessagesAsReadMock = vi.fn();
const logErrorMock = vi.fn();

vi.mock('@/app/baseball/actions/messages', () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  markMessagesAsRead: (...args: unknown[]) => markMessagesAsReadMock(...args),
}));

vi.mock('@/lib/error-logging', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}));

// ── Supabase client mock — chainable query builder + a channel stub that
// records `.on(...)` handlers so tests can fire simulated realtime events ──
type Handler = (payload: { new: unknown }) => void;
const channelHandlers = new Map<string, Handler[]>();
// Every `.on('postgres_changes', config, handler)` call across every channel
// created during a test, so #451 can assert exactly which tables/filters the
// hook actually subscribed to (not just which events fired).
type SubscriptionConfig = { event: string; schema?: string; table?: string; filter?: string };
let subscriptionConfigs: SubscriptionConfig[] = [];

let queryResult: { data: Message[] | null } = { data: [] };
let rpcResult: {
  data: unknown[];
  error: null | {
    message: string;
    code?: string;
    details?: string | null;
    hint?: string | null;
  };
} = { data: [], error: null };

function makeQueryChain() {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'in', 'limit']) {
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
    rpc: () => Promise.resolve(rpcResult),
    channel: () => {
      const channelStub = {
        on: (_type: string, config: SubscriptionConfig, handler: Handler) => {
          subscriptionConfigs.push(config);
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

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
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
    subscriptionConfigs = [];
    queryResult = { data: [] };
    rpcResult = { data: [], error: null };
    sendMessageMock.mockReset();
    markMessagesAsReadMock.mockReset().mockResolvedValue({ success: true });
    logErrorMock.mockReset();
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: 'me' } } as unknown as ReturnType<typeof useAuthStore>);
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

describe('useConversations realtime scoping (#451)', () => {
  beforeEach(() => {
    channelHandlers.clear();
    subscriptionConfigs = [];
    rpcResult = { data: [], error: null };
    logErrorMock.mockReset();
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: 'me' } } as unknown as ReturnType<typeof useAuthStore>);
  });

  it('does not subscribe unfiltered to baseball_messages platform-wide', async () => {
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const unfilteredMessagesSub = subscriptionConfigs.find(
      (c) => c.table === 'baseball_messages' && !c.filter
    );
    expect(unfilteredMessagesSub).toBeUndefined();
  });

  it('subscribes to baseball_conversation_participants filtered by the viewer\'s user_id', async () => {
    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const participantsSub = subscriptionConfigs.find(
      (c) => c.table === 'baseball_conversation_participants'
    );
    expect(participantsSub).toBeDefined();
    expect(participantsSub?.filter).toBe('user_id=eq.me');
  });

  it('normalizes Postgrest errors into a readable message and structured context (#886)', async () => {
    rpcResult = {
      data: [],
      error: {
        message: 'permission denied for relation baseball_conversations',
        code: '42501',
        details: 'RLS policy rejected the read',
        hint: 'Check team membership',
      },
    };
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result } = renderHook(() => useConversations());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(consoleSpy).toHaveBeenCalledWith(
      'Error fetching conversations:',
      'code=42501 msg=permission denied for relation baseball_conversations details=RLS policy rejected the read hint=Check team membership',
    );
    expect(logErrorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        message:
          'code=42501 msg=permission denied for relation baseball_conversations details=RLS policy rejected the read hint=Check team membership',
      }),
      expect.objectContaining({
        component: 'useMessages',
        action: 'fetchConversations',
        sport: 'baseball',
        supabaseError: {
          code: '42501',
          details: 'RLS policy rejected the read',
          hint: 'Check team membership',
        },
      }),
      'medium',
    );

    expect(JSON.stringify(consoleSpy.mock.calls)).not.toContain('[object Object]');
    expect(JSON.stringify(logErrorMock.mock.calls)).not.toContain('[object Object]');
  });
});
