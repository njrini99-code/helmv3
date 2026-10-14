/**
 * Bridge af4c2c9d — "Client error: AbortError: Fetch is aborted" from
 * `fetch-team-chat-conversations` on /golf/dashboard/messages, reopened as
 * REGRESSED 4x (2026-09-25 → 2026-10-07). The browser Supabase client's own
 * request deadline (src/lib/supabase/client.ts) aborted the participants read
 * on a slow connection; supabase-js resolved that as an error object and the
 * rail logged it. The same wording is already treated as benign for reactions
 * (9b8ad988) and presence. Any other failure of this read is still reported.
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
function makeSupabase(participantsResult: { data: unknown; error: unknown }) {
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
    rpc: vi.fn(async () => ({ data: [], error: null })),
    from: vi.fn((table: string) => chainFor(table)),
  };
}

const callsFor = (action: string) =>
  logError.mock.calls.filter((c) => (c[1] as { action?: string } | undefined)?.action === action);

describe('loadGolfConversationRail — the participants read', () => {
  beforeEach(() => logError.mockReset());

  it('does not report the browser client aborting the read at its deadline (WebKit)', async () => {
    const { loadGolfConversationRail } = await import('@/hooks/golf/use-golf-messages');
    const supabase = makeSupabase({
      data: null,
      error: {
        message: 'AbortError: Fetch is aborted',
        details: '',
        hint: 'Request was aborted (timeout or manual cancellation)',
        code: '',
      },
    });
    await loadGolfConversationRail(supabase as never, 'user-1');
    expect(callsFor('fetch-team-chat-conversations')).toHaveLength(0);
  });

  it('still reports any other failure of the same read', async () => {
    const { loadGolfConversationRail } = await import('@/hooks/golf/use-golf-messages');
    const supabase = makeSupabase({
      data: null,
      error: { message: 'column golf_conversations.title does not exist', details: '', hint: '', code: '42703' },
    });
    await loadGolfConversationRail(supabase as never, 'user-1');
    expect(callsFor('fetch-team-chat-conversations')).toHaveLength(1);
  });
});
