/**
 * A signed-out viewer must not reach the conversation RPC.
 *
 * With no session the browser client runs every request as `anon`. anon has no
 * EXECUTE on get_golf_conversations_with_details or user_conversation_ids (the
 * conversation policies call it), so each call comes back as 42501 and Sentry
 * records it as an incident (JAVASCRIPT-NEXTJS-17M, -17N). The rail loader now
 * answers an empty list without calling anything.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/golf/actions/messages', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, getGolfActiveTeamConversationIds: vi.fn(async () => null) };
});

import { hasActiveSession, loadGolfConversationRail } from '@/hooks/golf/use-golf-messages';

type Client = Parameters<typeof loadGolfConversationRail>[0];

function clientWith(session: unknown) {
  const rpc = vi.fn();
  const from = vi.fn();
  const getSession = vi.fn(async () => ({ data: { session } }));
  const client = { auth: { getSession }, rpc, from } as unknown as Client;
  return { client, rpc, from, getSession };
}

describe('loadGolfConversationRail without a session', () => {
  it('returns an empty rail and makes no RPC or table call', async () => {
    const { client, rpc, from, getSession } = clientWith(null);
    const result = await loadGolfConversationRail(client, '00000000-0000-0000-0000-000000000001');
    expect(result).toEqual({ ok: true, rows: [] });
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('still calls the RPC when there is a session', async () => {
    const { client, rpc, from } = clientWith({ access_token: 'token' });
    rpc.mockResolvedValue({ data: [], error: null });
    from.mockReturnValue({
      select: () => ({ eq: async () => ({ data: [], error: null }) }),
    });
    const result = await loadGolfConversationRail(client, '00000000-0000-0000-0000-000000000001');
    expect(rpc).toHaveBeenCalledWith('get_golf_conversations_with_details', {
      p_user_id: '00000000-0000-0000-0000-000000000001',
    });
    expect(result).toEqual({ ok: true, rows: [] });
  });
});

describe('hasActiveSession', () => {
  it('is false only when the client positively reports no session', async () => {
    expect(await hasActiveSession(clientWith(null).client)).toBe(false);
    expect(await hasActiveSession(clientWith({ access_token: 't' }).client)).toBe(true);
  });

  it('stays permissive when it cannot tell', async () => {
    expect(await hasActiveSession({} as unknown as Client)).toBe(true);
    const rejecting = { auth: { getSession: async () => { throw new Error('storage blocked'); } } } as unknown as Client;
    expect(await hasActiveSession(rejecting)).toBe(true);
  });
});
