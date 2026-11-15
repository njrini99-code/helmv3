// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMemo } from 'react';
import { summarizeReactions, useMessageReactions, type MessageReaction } from '@/hooks/golf/use-message-reactions';
import { KEY_BY_EMOJI, useOverlayApi } from '../api/use-overlay-api';
import type { MessagesApiCtx } from '../api/ctx';
import type { ChReaction, ChReactionKey } from '../model';

const state = vi.hoisted(() => ({ rows: [] as MessageReaction[], events: [] as (() => void)[] }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({
  from: () => {
    let mode = 'read';
    let ids: string[] = [];
    const filters: Record<string, string> = {};
    let inserted: Record<string, string> = {};
    const query = {
      select: () => query,
      in: (_: string, values: string[]) => { ids = values; return query; },
      order: () => query,
      range: () => query,
      insert: (value: Record<string, string>) => { mode = 'insert'; inserted = value; return query; },
      delete: () => { mode = 'delete'; return query; },
      eq: (key: string, value: string) => { filters[key] = value; return query; },
      then: (resolve: (result: unknown) => void) => {
        if (mode === 'read') return resolve({ data: state.rows.filter((row) => ids.includes(row.message_id)), error: null });
        if (mode === 'insert') state.rows.push({ id: `r${state.rows.length}`, ...inserted } as MessageReaction);
        if (mode === 'delete') state.rows = state.rows.filter((row) => !Object.entries(filters).every(([key, value]) => row[key as keyof MessageReaction] === value));
        state.events.forEach((cb) => cb());
        return resolve({ error: null });
      },
    };
    return query;
  },
  channel: () => {
    const channel = { on: (_: string, _filter: unknown, cb: () => void) => { state.events.push(cb); return channel; }, subscribe: () => channel };
    return channel;
  },
  removeChannel: vi.fn(),
  auth: {
    getSession: async () => ({ data: { session: { access_token: 'jwt', user: { id: 'me' } } }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
}) }));
vi.mock('@/lib/supabase/fetch-all-rows', () => ({ fetchAllRowsResult: (query: (from: number, to: number) => unknown) => query(0, 999) }));

beforeEach(() => {
  state.rows = [];
  state.events = [];
});

/** Messages.tsx's wiring of the three: the hook, the container's map, and the overlay slice that layers taps on it. */
function useWired() {
  const liveIds = useMemo(() => ['m1'], []);
  const reactions = useMessageReactions('c1', liveIds, 'me');
  const reactionMap = useMemo(() => {
    const out = new Map<string, ChReaction[]>();
    for (const id of liveIds) {
      const groups = summarizeReactions(reactions.rows, id, 'me')
        .map((g) => ({ key: KEY_BY_EMOJI[g.emoji], count: g.count, mine: g.active, userIds: [...new Set(reactions.rows.filter((r) => r.message_id === id && r.emoji === g.emoji).map((r) => r.user_id))] }))
        .filter((g): g is { key: ChReactionKey; count: number; mine: boolean; userIds: string[] } => !!g.key);
      if (groups.length) out.set(id, groups);
    }
    return out;
  }, [liveIds, reactions.rows]);
  const ctx = {
    attempt: async (_s: string, _c: unknown, fn: () => Promise<boolean | void>) => { try { return (await fn()) !== false; } catch { return false; } },
    msgs: {}, reactionMap, reactions, refetch: async () => {}, toast: () => {}, data: { viewerUserId: 'me' },
  } as unknown as MessagesApiCtx;
  return useOverlayApi(ctx);
}

describe('reactions, wired as Messages wires them', () => {
  it('a tap shows at once and stays after the server answers, add and remove', async () => {
    const { result } = renderHook(() => useWired());
    await act(async () => {});
    act(() => result.current.react('m1', 'Love', true));
    expect(result.current.reactions.get('m1')?.map((r) => r.key)).toEqual(['Love']);
    await waitFor(() => expect(state.rows).toHaveLength(1));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(result.current.reactions.get('m1')?.map((r) => [r.key, r.mine])).toEqual([['Love', true]]);
    act(() => result.current.react('m1', 'Love', false));
    expect(result.current.reactions.get('m1')).toBeUndefined();
    await waitFor(() => expect(state.rows).toHaveLength(0));
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(result.current.reactions.get('m1')).toBeUndefined();
  });
});
