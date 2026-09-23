/**
 * "It loads separately each tab I click" (2026-09-10): a return visit to
 * Messages must paint the last known rail with `loading: false` on the FIRST
 * render, then refresh silently. These pin the warm-start contract.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  rpc: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: { getUser: mock.getUser },
  rpc: mock.rpc,
  from: () => {
    const result = { data: [], error: null, count: 0 };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'neq', 'not', 'gt', 'order', 'limit', 'single', 'maybeSingle']) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
    return chain;
  },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: vi.fn(),
}) }));
vi.mock('@/app/golf/actions/messages', () => ({
  getGolfActiveTeamConversationIds: async () => null,
  getGolfConversationParticipantIdentities: async () => ({ participants: [] }),
}));
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: (channel: unknown) => channel }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { conversationsCacheKey, useGolfConversations } from '../use-golf-messages';
import { __resetCachedResourcesForTests, clearAllCachedResources, writeCachedResource } from '@/lib/golf/client-resource-cache';

const row = {
  id: 'conversation', created_at: '2026-09-08T12:00:00Z', updated_at: '2026-09-08T12:00:00Z',
  participant_ids: ['viewer', 'other'], is_group: false, unread_count: 0,
};

beforeEach(() => {
  __resetCachedResourcesForTests();
  clearAllCachedResources();
  mock.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'viewer' } } });
  mock.rpc.mockReset().mockResolvedValue({ data: [row], error: null });
});

describe('useGolfConversations — warm start', () => {
  it('paints cached rows with loading=false on the first render, then revalidates', async () => {
    writeCachedResource(conversationsCacheKey('viewer'), [
      { id: 'cached', created_at: row.created_at, updated_at: row.updated_at, last_message: null, unread_count: 0, other_participant: null, is_group: false },
    ]);
    const { result } = renderHook(() => useGolfConversations('viewer'));
    expect(result.current.loading).toBe(false);
    expect(result.current.conversations.map((c) => c.id)).toEqual(['cached']);
    await waitFor(() => expect(result.current.conversations.map((c) => c.id)).toEqual(['conversation']));
    expect(result.current.loading).toBe(false);
  });

  it('skips auth.getUser() when the viewer id is handed in', async () => {
    const { result } = renderHook(() => useGolfConversations('viewer'));
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    expect(mock.getUser).not.toHaveBeenCalled();
  });

  it('still resolves the viewer itself when no id is handed in', async () => {
    const { result } = renderHook(() => useGolfConversations());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.conversations).toHaveLength(1));
    expect(mock.getUser).toHaveBeenCalled();
  });
});
