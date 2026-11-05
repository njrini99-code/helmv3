import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

const h = vi.hoisted(() => ({ hold: { kind: 'error' } as { kind: string; run_at?: string }, outcomes: [] as Array<{ status: string; summary: string }> }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));
vi.mock('../undo-hold', async (orig) => ({
  ...(await orig<typeof import('../undo-hold')>()),
  holdForExecution: async () => h.hold,
  sweepHeld: async () => undefined,
}));
vi.mock('../action-runs', async (orig) => ({
  ...(await orig<typeof import('../action-runs')>()),
  recordProposal: async () => ({ run_id: 'run-1' }),
  claimForExecution: async () => ({ kind: 'claimed' as const, run_id: 'run-1' }),
  recordOutcome: async (_sb: unknown, a: { receipt: { status: string; summary: string } }) => {
    h.outcomes.push(a.receipt);
  },
}));

import { buildCoachTools } from '../agent-tools';

const PLAYER = '00000000-0000-4000-8000-000000000001';
const ROUND = '00000000-0000-4000-8000-000000000002';
const ctx = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'T', timezone: 'America/New_York', roster: [{ player_id: PLAYER, id: PLAYER, name: 'Eli Brandt' }] } as unknown as CoachChatContext;

function setup() {
  // `prepare` reads the note once; the write reads it again, so a second read means the write ran.
  const reads = { n: 0 };
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => {
      reads.n += 1;
      return { data: { coach_notes: '' }, error: null };
    },
  };
  const tools = buildCoachTools({ sb: { from: () => chain } as never, ctx, conversationId: 'c', writer: { write: vi.fn() } as never, collect: vi.fn(), askV2: true, defer: vi.fn() } as never);
  return { reads, tool: tools.add_round_note as unknown as { execute: (i: unknown, o: unknown) => Promise<{ status: string; message: string }> } };
}
const input = { player_id: PLAYER, round_id: ROUND, note: 'Good wedge numbers' };

describe('a write promised 8 seconds of Undo', () => {
  beforeEach(() => {
    h.outcomes.length = 0;
  });

  it('writes nothing when the hold itself fails', async () => {
    h.hold = { kind: 'error' };
    const { tool, reads } = setup();
    const r = await tool.execute(input, {});
    expect(r.status).toBe('failed');
    expect(reads.n).toBe(1);
    expect(h.outcomes[0]?.summary).toContain('Nothing was saved');
  });

  it('still runs on a stack with no hold column, and never offers a fake Undo', async () => {
    h.hold = { kind: 'no_column' };
    const { tool, reads } = setup();
    await tool.execute(input, {}).catch(() => undefined);
    expect(reads.n).toBeGreaterThan(1);
    const out = h.outcomes[0];
    if (out?.status === 'completed') expect(out.summary).toContain('Undo isn’t on here yet.');
  });
});
