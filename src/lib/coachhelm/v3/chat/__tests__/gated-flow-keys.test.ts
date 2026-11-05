import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

const runs = vi.hoisted(() => ({ recorded: [] as string[], claimed: [] as string[] }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));
vi.mock('../action-runs', async (orig) => ({
  ...(await orig<typeof import('../action-runs')>()),
  recordProposal: async (_sb: unknown, a: { idempotency_key: string }) => {
    runs.recorded.push(a.idempotency_key);
    return { run_id: 'run-1' };
  },
  claimForExecution: async (_sb: unknown, a: { idempotency_key: string }) => {
    runs.claimed.push(a.idempotency_key);
    return { kind: 'in_flight' as const };
  },
}));

import { buildCoachTools } from '../agent-tools';
import { flowCommit, type FlowDef } from '../create-tools';

const PLAYER = '00000000-0000-4000-8000-000000000001';
const ROUND = '00000000-0000-4000-8000-000000000002';
const ctx = {
  coach_id: 'c1',
  user_id: 'u1',
  team_id: 'team-1',
  team_name: 'Rini University',
  timezone: 'America/New_York',
  roster: [{ player_id: PLAYER, id: PLAYER, name: 'Eli Brandt' }],
} as unknown as CoachChatContext;

/** Answers every read with the round's current note. */
function sbWithNote(note: string | null) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: note === null ? null : { coach_notes: note }, error: null }),
  };
  return { from: () => chain } as never;
}

function noteTool(sb: never) {
  const tools = buildCoachTools({ sb, ctx, conversationId: 'conv-1', writer: { write: vi.fn() } as never, collect: vi.fn(), askV2: true });
  return tools.add_round_note as unknown as {
    onInputAvailable: (o: { input: unknown }) => Promise<void>;
    execute: (input: unknown, o: unknown) => Promise<{ status: string }>;
  };
}

describe('a prepared card and its Confirm', () => {
  beforeEach(() => {
    runs.recorded.length = 0;
    runs.claimed.length = 0;
  });
  const input = { player_id: PLAYER, round_id: ROUND, note: 'Good wedge numbers' };

  it.each([[''], ['An earlier note']])('claims the proposal the coach saw when the earlier note is %j', async (note) => {
    const t = noteTool(sbWithNote(note));
    await t.onInputAvailable({ input });
    await t.execute(input, {});
    expect(runs.recorded).toHaveLength(1);
    expect(runs.claimed).toEqual(runs.recorded);
  });

  it('claims a different key when the note changed after the card, so the stale card writes nothing', async () => {
    await noteTool(sbWithNote('Before')).onInputAvailable({ input });
    await noteTool(sbWithNote('Changed since')).execute(input, {});
    expect(runs.claimed[0]).not.toBe(runs.recorded[0]);
  });
});

describe('a flow write takes its request id from the scoped ledger key', () => {
  const seen: string[] = [];
  const flow = {
    name: 'demo',
    plan: () => ({ key: ['same', 'intent'], action: 'A', summary: 'S', facts: [] }),
    run: async (_c: unknown, _i: unknown, a: { requestId: string }) => {
      seen.push(a.requestId);
      return { ok: true, summary: 'Done', kind: 'event' };
    },
  } as unknown as FlowDef<object>;
  const run = (key: string, coach = ctx) => flowCommit(flow, {} as never, coach, {}, key).run();

  beforeEach(() => {
    seen.length = 0;
  });

  it('gives two cards with the same intent two different ids', async () => {
    await run('intent:aaa');
    await run('intent:bbb');
    expect(seen[0]).not.toBe(seen[1]);
  });

  it('gives a retry of one card the same id', async () => {
    await run('intent:aaa');
    await run('intent:aaa');
    expect(seen[0]).toBe(seen[1]);
  });

  it('keeps two coaches apart on the same key', async () => {
    await run('intent:aaa');
    await run('intent:aaa', { ...ctx, coach_id: 'c2' });
    expect(seen[0]).not.toBe(seen[1]);
  });
});
