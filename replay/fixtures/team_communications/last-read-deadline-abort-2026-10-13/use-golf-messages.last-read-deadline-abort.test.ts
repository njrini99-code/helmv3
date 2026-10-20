/**
 * Bridge 44137d5f — "Client error: AbortError: Fetch is aborted" from
 * `fetch-per-viewer-last-read` on /golf/dashboard/calendar (2026-10-13). Same
 * class as af4c2c9d: the browser Supabase client's own request deadline
 * (src/lib/supabase/client.ts) aborted the viewer's last_read_at lookup for a
 * group conversation. The badge already degrades to the RPC count when this
 * read fails; only the report was wrong. Other failures are still reported.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const logError = vi.fn();
vi.mock('@/lib/error-logging', () => ({ logError: (...a: unknown[]) => logError(...a) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }));
vi.mock('@/app/golf/actions/messages', () => ({
  sendGolfMessage: vi.fn(),
  markGolfMessagesAsRead: vi.fn(),
  updateGolfMessage: vi.fn(),
  deleteGolfMessage: vi.fn(),
  getGolfActiveTeamConversationIds: vi.fn(async () => null),
  getGolfConversationParticipantIdentities: vi.fn(async () => ({})),
}));

/** Every chain awaits to `result(table)`; any method returns the chain. */
function makeSupabase(participantsResult: { data: unknown; error: unknown }, rpcRows: unknown[]) {
  const chainFor = (table: string) => {
    const result = table === 'golf_conversation_participants' ? participantsResult : { data: [], error: null };
    const chain: Record<string, unknown> = {};
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_t, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(result).then(resolve, reject);
        }
        return () => proxy;
      },
    };
    const proxy = new Proxy(chain, handler);
    return proxy;
  };
  return {
    rpc: vi.fn(async () => ({ data: rpcRows, error: null })),
    from: vi.fn((table: string) => chainFor(table)),
  };
}

const callsFor = (action: string) =>
  logError.mock.calls.filter((c) => (c[1] as { action?: string } | undefined)?.action === action);

const GROUP_ROW = { id: 'conv-group-1', is_group: true, unread_count: 2 };

describe('loadGolfConversationRail — the per-viewer last-read lookup', () => {
  beforeEach(() => logError.mockReset());

  it('does not report the browser client aborting the read at its deadline (WebKit)', async () => {
    const { loadGolfConversationRail } = await import('@/hooks/golf/use-golf-messages');
    const supabase = makeSupabase(
      {
        data: null,
        error: {
          message: 'AbortError: Fetch is aborted',
          details: '',
          hint: 'Request was aborted (timeout or manual cancellation)',
          code: '',
        },
      },
      [GROUP_ROW],
    );
    await loadGolfConversationRail(supabase as never, 'user-1');
    expect(callsFor('fetch-per-viewer-last-read')).toHaveLength(0);
  });

  it('still reports any other failure of the same read', async () => {
    const { loadGolfConversationRail } = await import('@/hooks/golf/use-golf-messages');
    const supabase = makeSupabase(
      { data: null, error: { message: 'permission denied for table golf_conversation_participants', details: '', hint: '', code: '42501' } },
      [GROUP_ROW],
    );
    await loadGolfConversationRail(supabase as never, 'user-1');
    expect(callsFor('fetch-per-viewer-last-read')).toHaveLength(1);
  });
});
