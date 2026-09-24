/**
 * Audit HYD-01: the Messages hooks read a sessionStorage-backed cache. Doing
 * that inside a `useState` initializer during HYDRATION painted cached rows
 * over the server's empty markup and React threw #418. `renderHook` renders on
 * the client only and cannot see that, so this hydrates real server markup.
 *
 * The cache is written AFTER the server render and BEFORE hydration: the
 * server never sees the browser's sessionStorage, the browser does.
 */
import { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    for (const method of ['select', 'eq', 'in', 'neq', 'not', 'gt', 'is', 'order', 'limit', 'range', 'single', 'maybeSingle']) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve);
    return chain;
  },
  channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
  removeChannel: vi.fn(),
}) }));
vi.mock('@/app/golf/actions/messages', () => ({
  getGolfActiveTeamConversationIds: async () => null,
  getGolfConversationParticipantIdentities: async () => ({ participants: [] }),
  markGolfMessagesAsRead: async () => ({ success: true }),
  sendGolfMessage: vi.fn(),
  updateGolfMessage: vi.fn(),
  deleteGolfMessage: vi.fn(),
}));
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: (channel: unknown) => channel }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { conversationsCacheKey, useGolfConversations } from '../use-golf-messages';
import { __resetCachedResourcesForTests, clearAllCachedResources, writeCachedResource } from '@/lib/golf/client-resource-cache';

const cachedRow = {
  id: 'cached', created_at: '2026-09-08T12:00:00Z', updated_at: '2026-09-08T12:00:00Z',
  last_message: null, unread_count: 0, other_participant: null, is_group: false,
};

function Rail() {
  const { conversations, loading } = useGolfConversations('viewer');
  return (
    <div data-testid="rail" data-loading={String(loading)}>
      {conversations.map((c) => c.id).join(',')}
    </div>
  );
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  __resetCachedResourcesForTests();
  clearAllCachedResources();
  // The revalidate never resolves, so what is on screen is the cache paint.
  mock.rpc.mockReset().mockReturnValue(new Promise(() => {}));
  mock.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'viewer' } } });
});

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('useGolfConversations — hydration (HYD-01)', () => {
  it('hydrates without a mismatch and then paints the cached rail', async () => {
    const html = renderToString(<Rail />);
    expect(html).toContain('data-loading="true"');

    writeCachedResource(conversationsCacheKey('viewer'), [cachedRow]);

    container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const onRecoverableError = vi.fn();
    await act(async () => {
      root = hydrateRoot(container!, <Rail />, { onRecoverableError });
    });

    expect(onRecoverableError).not.toHaveBeenCalled();
    const rail = container.querySelector('[data-testid="rail"]');
    expect(rail?.textContent).toBe('cached');
    expect(rail?.getAttribute('data-loading')).toBe('false');
  });
});
