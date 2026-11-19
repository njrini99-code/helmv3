/**
 * Audit 2026-11-18 (P2): leaving a message thread cancelled its requests in flight, and WebKit's "Load failed" was
 * logged as "[useGolfMessages] Failed to mark messages as read" and sent to error logging. A request the browser cut off
 * because the reader left is not a failure; the same failure while the reader is still on the thread stays visible.
 */
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  markRead: vi.fn(),
  getUser: vi.fn(),
  logError: vi.fn(),
}));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  auth: { getUser: mock.getUser },
  rpc: vi.fn(async () => ({ data: [], error: null })),
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
  markGolfMessagesAsRead: mock.markRead,
  sendGolfMessage: vi.fn(),
  updateGolfMessage: vi.fn(),
  deleteGolfMessage: vi.fn(),
}));
vi.mock('@/lib/observability/supabase/realtime', () => ({ observeRealtimeChannel: (channel: unknown) => channel }));
vi.mock('@/lib/error-logging', () => ({ logError: mock.logError }));

import { cutOffByLeaving, useGolfMessages } from '../use-golf-messages';
import { __resetCachedResourcesForTests } from '@/lib/golf/client-resource-cache';

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  __resetCachedResourcesForTests();
  mock.markRead.mockReset();
  mock.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'viewer' } } });
  mock.logError.mockReset();
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

const markReadLogs = () => mock.logError.mock.calls.filter((c) => (c[1] as { action?: string })?.action === 'mark-messages-as-read');

describe('cutOffByLeaving', () => {
  it('is a cut-off only once the reader has left, and only for a cancelled or dropped request', () => {
    expect(cutOffByLeaving(new TypeError('Load failed'), true)).toBe(true);
    expect(cutOffByLeaving(new DOMException('The operation was aborted.', 'AbortError'), true)).toBe(true);
    expect(cutOffByLeaving({ message: 'AbortError: Fetch is aborted' }, true)).toBe(true);
    expect(cutOffByLeaving(new TypeError('Load failed'), false)).toBe(false);
    expect(cutOffByLeaving(new Error('permission denied for table golf_messages'), true)).toBe(false);
  });
});

describe('useGolfMessages — leaving a thread mid-request', () => {
  it('a mark-read the browser cut off as the reader left is not logged', async () => {
    let fail: (e: unknown) => void = () => {};
    mock.markRead.mockImplementation(() => new Promise((_, reject) => (fail = reject)));
    const { unmount } = renderHook(() => useGolfMessages('c1', 'viewer'));
    await waitFor(() => expect(mock.markRead).toHaveBeenCalledWith('c1'));
    unmount();
    fail(new TypeError('Load failed'));
    await new Promise((r) => setTimeout(r, 0));
    expect(markReadLogs()).toHaveLength(0);
    expect(consoleError.mock.calls.some((c) => String(c[0]).includes('Failed to mark messages as read'))).toBe(false);
  });

  it('the same failure while the reader is still on the thread is still logged', async () => {
    mock.markRead.mockRejectedValue(new TypeError('Load failed'));
    renderHook(() => useGolfMessages('c1', 'viewer'));
    await waitFor(() => expect(markReadLogs()).toHaveLength(1));
    expect(consoleError.mock.calls.some((c) => String(c[0]).includes('Failed to mark messages as read'))).toBe(true);
  });
});
