import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

/**
 * FID-ASK-5 (TASK_FIELDS 3, 5.4): only Quick chat's card is the coach's Send. In the Ask tab no tool can send a message
 * the coach never typed into Messages; a message is words handed to the composer, and the coach presses Send there.
 */

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => false }));

import { buildCoachTools } from '../agent-tools';

const ELI = '11111111-1111-4111-8111-111111111111';
const THREAD = '22222222-2222-4222-8222-222222222222';

const ctx: CoachChatContext = {
  coach_id: 'c1',
  user_id: 'u1',
  team_id: 'team-1',
  team_name: 'Rini University',
  timezone: 'America/New_York',
  roster: [{ id: ELI, name: 'Eli Brooks' }],
} as never;

const write = vi.fn();
function tools(surface?: 'ask' | 'quick_chat', row: unknown = { id: THREAD, title: 'Travel squad' }) {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: row, error: null }) };
  return buildCoachTools({
    sb: { from: () => chain } as never,
    ctx,
    conversationId: null,
    writer: { write } as never,
    collect: vi.fn(),
    askV2: true,
    ...(surface ? { surface } : {}),
  }) as Record<string, { execute?: (input: unknown, opts: never) => Promise<{ status: string }> }>;
}

describe('which chat can send a message', () => {
  beforeEach(() => write.mockClear());

  it('the Ask tab cannot send, with or without naming itself', () => {
    expect(Object.keys(tools())).not.toContain('send_message');
    expect(Object.keys(tools('ask'))).not.toContain('send_message');
    expect(Object.keys(tools('ask'))).toContain('draft_message');
  });

  it('Quick chat keeps its card and has no second way to write', () => {
    const names = Object.keys(tools('quick_chat'));
    expect(names).toContain('send_message');
    expect(names).not.toContain('draft_message');
  });

  it('a draft for players hands their words to Messages', async () => {
    const out = await tools('ask').draft_message!.execute!({ player_ids: [ELI], content: 'How is the wrist?' }, {} as never);
    expect(out.status).toBe('shown');
    expect(write.mock.calls[0]?.[0]).toMatchObject({ type: 'data-handoff', data: { kind: 'message', players: [ELI], title: 'Draft for Eli Brooks', draft: 'How is the wrist?' } });
  });

  it('a draft for a thread names the thread and nobody else', async () => {
    await tools('ask').draft_message!.execute!({ conversation_id: THREAD, content: 'Vans at 7.' }, {} as never);
    expect(write.mock.calls[0]?.[0]).toMatchObject({ data: { kind: 'message', players: [], conversationId: THREAD, title: 'Draft for Travel squad' } });
  });

  it('refuses a player off the roster or a thread off the team, and shows nothing', async () => {
    const stranger = '33333333-3333-4333-8333-333333333333';
    expect((await tools('ask').draft_message!.execute!({ player_ids: [ELI, stranger], content: 'x' }, {} as never)).status).toBe('refused');
    expect((await tools('ask', null).draft_message!.execute!({ conversation_id: THREAD, content: 'x' }, {} as never)).status).toBe('refused');
    expect(write).not.toHaveBeenCalled();
  });
});
