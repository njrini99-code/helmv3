// @vitest-environment jsdom
/**
 * 2026-09-23 security-review finding on the golf messages warm-start cache:
 * the "keep the warm copy current as realtime inserts/updates/edits land"
 * effect wrote to the client resource cache with an epoch guard that read
 * `getCacheEpoch()` on the line immediately before its own write, with no
 * `await` between the two — a realtime `setMessages` runs synchronously, so
 * nothing could ever make that read stale by the time the write ran. The
 * guard therefore always passed, and a realtime event landing AFTER a
 * sign-out's `clearAllCachedResources()` (the hook can still be mounted for a
 * beat while unmount is in flight) would resurrect the signed-out viewer's
 * messages straight back into the cache it was just cleared from.
 *
 * A source-text assertion — "does the write go through
 * writeCachedResourceIfCurrent with a getCacheEpoch() nearby" — could not
 * catch this: the broken code already matched that shape. Only a behavioral
 * test that actually clears the cache between two realtime events can tell
 * a real guard from a decorative one, so that is what this file does instead.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface OnCall {
  event: string;
  config: { event?: string; table?: string };
  cb: (payload: unknown) => void;
}

const state = vi.hoisted(() => ({
  onCalls: [] as OnCall[],
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
    from: () => {
      const result = { data: [], error: null, count: 0 };
      const chain: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'in', 'neq', 'not', 'gt', 'order', 'limit', 'single', 'maybeSingle']) {
        chain[method] = () => chain;
      }
      chain.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
      return chain;
    },
    channel: () => {
      const channel = {
        on: (event: string, config: { event?: string; table?: string }, cb: (payload: unknown) => void) => {
          state.onCalls.push({ event, config, cb });
          return channel;
        },
        send: () => channel,
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: vi.fn(),
  }),
}));
vi.mock('@/app/golf/actions/messages', () => ({
  sendGolfMessage: vi.fn(),
  markGolfMessagesAsRead: vi.fn(async () => ({ success: true })),
  updateGolfMessage: vi.fn(),
  deleteGolfMessage: vi.fn(),
  getGolfActiveTeamConversationIds: async () => null,
  getGolfConversationParticipantIdentities: async () => ({ participants: [] }),
}));
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: (channel: unknown) => channel }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { messagesCacheKey, useGolfMessages } from '../use-golf-messages';
import {
  __resetCachedResourcesForTests,
  clearAllCachedResources,
  readCachedResource,
} from '@/lib/golf/client-resource-cache';

const CONVERSATION_ID = 'conv-1';
const VIEWER_ID = 'viewer';

function insertPayload(id: string, createdAt: string) {
  return {
    new: {
      id,
      conversation_id: CONVERSATION_ID,
      sender_id: VIEWER_ID, // same as viewer: skips the mark-read-on-arrival timer, irrelevant here
      content: `message ${id}`,
      read: false,
      has_attachments: false,
      created_at: createdAt,
      is_deleted: false,
      edited_at: null,
    },
  };
}

beforeEach(() => {
  __resetCachedResourcesForTests();
  clearAllCachedResources();
  state.onCalls = [];
});

describe('useGolfMessages — the realtime warm-copy cache write is epoch-guarded', () => {
  it('stops writing to the cache once a clear happens after mount, even though the hook is still mounted', async () => {
    const { result } = renderHook(() => useGolfMessages(CONVERSATION_ID, VIEWER_ID));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const insertCall = state.onCalls.find(
      (c) => c.event === 'postgres_changes' && c.config.event === 'INSERT' && c.config.table === 'golf_messages',
    );
    expect(insertCall).toBeDefined();

    // First realtime insert, BEFORE any sign-out: the cache should warm as
    // designed.
    await act(async () => {
      insertCall!.cb(insertPayload('m1', '2026-09-23T12:00:00.000Z'));
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    await waitFor(() => {
      const cached = readCachedResource(messagesCacheKey(CONVERSATION_ID, VIEWER_ID));
      expect(cached?.data).toHaveLength(1);
    });

    // A sign-out on a shared device clears the cache while this hook is still
    // mounted (the real unmount from a navigation/redirect lags a beat behind
    // the auth.signOut() call and its clearAllCachedResources()).
    act(() => {
      clearAllCachedResources();
    });
    expect(readCachedResource(messagesCacheKey(CONVERSATION_ID, VIEWER_ID))).toBeNull();

    // A second realtime insert lands after the clear, still on this same,
    // still-mounted hook instance. It must not resurrect the cleared cache
    // with the signed-out viewer's messages.
    await act(async () => {
      insertCall!.cb(insertPayload('m2', '2026-09-23T12:00:01.000Z'));
    });
    await waitFor(() => expect(result.current.messages).toHaveLength(2));

    expect(readCachedResource(messagesCacheKey(CONVERSATION_ID, VIEWER_ID))).toBeNull();
  });
});
