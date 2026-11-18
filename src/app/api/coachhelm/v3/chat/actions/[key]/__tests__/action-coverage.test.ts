import { beforeEach, describe, expect, it, vi } from 'vitest';
import { streamText, type ToolSet } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { buildCoachTools, isConfirmRequired } from '@/lib/coachhelm/v3/chat/agent-tools';
import { CREATE_FLOWS, LINEUP_FLOWS, drillFlow, lockFlow } from '@/lib/coachhelm/v3/chat/create-tools';
import { publishFlow } from '@/lib/coachhelm/v3/chat/practice-draft';
import { heldCommitFor } from '@/lib/coachhelm/v3/chat/held-runner';
import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import type { HeldRow } from '@/lib/coachhelm/v3/chat/undo-hold';

const hooks = vi.hoisted(() => ({ commit: vi.fn() }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => true }));
vi.mock('@/lib/coachhelm/v3/chat/create-tools', async (original) => ({
  ...(await original<typeof import('@/lib/coachhelm/v3/chat/create-tools')>()),
  flowCommit: hooks.commit,
}));

const P = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const ctx = { coach_id: 'c', user_id: 'u', team_id: 't', team_name: 'Team', timezone: 'America/New_York', roster: [{ id: P, name: 'Eli', first_name: 'Eli', last_name: null, graduation_year: null }] } satisfies CoachChatContext;
const inputs: Record<string, Record<string, unknown>> = {
  create_event: { title: 'Practice', event_type: 'practice', date: '2026-11-10', start: '15:00', end: '17:00' },
  create_trip: { event_name: 'Away', destination: 'College', transportation_type: 'bus', departure_date: '2026-11-10' },
  create_qualifier: { name: 'Qualifier', start_date: '2026-11-10', num_rounds: 2, selection_slots_total: 5, selection_slots_coach_pick: 1, player_ids: [P] },
  create_goal: { player_id: P, metric_id: 'sg_total', label: 'SG', window_days: 30, target_value: 1, mode: 'suggested' },
  add_round_note: { round_id: ID, player_id: P, note: 'Nice work' },
  set_lineup: { tournament_id: ID, version: 1, entries: [{ player_id: P, role: 'lineup', slot: 1 }] },
  lock_lineup: { tournament_id: ID },
  add_blocked_time: { title: 'Unavailable', date: '2026-11-10' },
  add_team_break: { first_day: '2026-11-10', last_day: '2026-11-11', label: 'Break' },
  save_team_term: { name: 'Fall', classes_start: '2026-08-01', classes_end: '2026-12-01', exams_end: '2026-12-10' },
  set_availability_note: { player_id: P, note: 'Away' },
  create_recruit: { first_name: 'Alex' },
  create_drill: { name: 'Gate putting', area: 'putting', minutes: 10 },
  publish_artifact: { title: 'Report', body: 'Recorded observations', players: 1 },
  publish_practice_plan: { plan_id: ID, version: 1, title: 'Practice', people: 1, when: 'Tuesday', first_player_line: 'Practice ready' },
  send_message: { conversation_id: ID, thread: 'Team', member_count: 3, content: 'See you Tuesday' },
  create_focus_area: { player_id: P, title: 'Putting', area_type: 'putting' },
  create_task: { title: 'Waiver', assign_to_player_ids: [P] },
  create_team_announcement: { title: 'Meeting', body: 'Meet Tuesday' },
  create_recurring_practice: { title: 'Practice', weekdays: [2], start_time: '15:00', occurrence_count: 2 },
};

function tools(surface: 'ask' | 'quick_chat' = 'ask', sb = {} as never, writer = { write: vi.fn() }) {
  return buildCoachTools({ sb, ctx, conversationId: 'conversation', writer: writer as never, collect: vi.fn(), askV2: true, practicePlans: true, teamTools: true, surface });
}

beforeEach(() => hooks.commit.mockReset().mockReturnValue({ run: vi.fn(async () => ({ status: 'completed' })) }));

describe('all reachable Ask action gates (real SDK; no domain writes)', () => {
  it('enumerates every registered mutation so a new action cannot silently miss coverage', () => {
    const all = { ...tools(), ...tools('quick_chat') };
    expect(Object.keys(all).filter(isConfirmRequired).sort()).toEqual(Object.keys(inputs).sort());
  });

  for (const [name, input] of Object.entries(inputs)) {
    it(`${name} suspends for approval and cannot execute when denied`, async () => {
      const registered = { ...tools(), ...tools('quick_chat') }[name]!;
      for (const decision of ['user-approval', 'denied'] as const) {
        const execute = vi.fn(async () => ({ status: 'completed' }));
        // Exercise the real registered schema and the route's exact gate.
        // Replace execution and proposal hooks so this test cannot write or notify.
        const set = { [name]: { ...registered, execute, onInputAvailable: undefined } } as ToolSet;
        const model = new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream<LanguageModelV4StreamPart>({ chunks: [
          { type: 'tool-call', toolCallId: 'call', toolName: name, input: JSON.stringify(input) },
          { type: 'finish', finishReason: { unified: 'tool-calls', raw: undefined }, usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } } },
        ] }) }) });
        const result = streamText({ model, prompt: 'Please do this', tools: set, toolApproval: ({ toolCall }) => isConfirmRequired(toolCall.toolName) ? decision : 'not-applicable' });
        const chunks = [];
        for await (const chunk of (result as unknown as { fullStream: AsyncIterable<{ type: string }> }).fullStream) chunks.push(chunk);
        expect(chunks.some((c) => c.type === (decision === 'user-approval' ? 'tool-approval-request' : 'tool-output-denied')), JSON.stringify(chunks)).toBe(true);
        expect(execute).not.toHaveBeenCalled();
      }
    });
  }
});

describe('durable held action reconstruction', () => {
  for (const flow of [...CREATE_FLOWS, ...LINEUP_FLOWS, drillFlow, publishFlow]) {
    it(`rebuilds ${flow.name} after the original request is gone without starting its write`, () => {
      const row = { id: 'run', team_id: 't', tool_name: flow.name, proposed_input: inputs[flow.name], run_at: '2026-11-01T00:00:00Z', idempotency_key: 'scoped-key' } satisfies HeldRow;
      expect(heldCommitFor({} as never, ctx, row)).not.toBeNull();
      expect(hooks.commit).toHaveBeenCalledWith(flow, {}, ctx, expect.anything(), 'scoped-key');
      expect(hooks.commit.mock.results[0]!.value.run).not.toHaveBeenCalled();
    });
  }

  it('refuses another team and turns an invalid drill into an honest failure', async () => {
    const row = { id: 'run', team_id: 'other', tool_name: 'create_drill', proposed_input: {}, run_at: '', idempotency_key: 'k' };
    expect(heldCommitFor({} as never, ctx, row)).toBeNull();
    expect(await heldCommitFor({} as never, ctx, { ...row, team_id: 't' })!.run()).toMatchObject({ status: 'failed', retryable: false });
    expect(hooks.commit).not.toHaveBeenCalled();
  });

  it('Lock is the only immediate flow and has its own no-Undo contract', () => {
    expect([...CREATE_FLOWS, ...LINEUP_FLOWS, drillFlow, publishFlow].filter((f) => f.immediate).map((f) => f.name)).toEqual(['lock_lineup']);
    expect(lockFlow.plan(ctx, { tournament_id: ID }).summary).toMatch(/at once.*undone/);
  });
});

describe('Ask drafts stay in Ask until the coach opens Messages', () => {
  it('does not register Send on Ask', () => {
    expect(tools().send_message).toBeUndefined();
    expect(tools('quick_chat').send_message).toBeDefined();
    for (const name of ['draft_message', 'draft_poll', 'draft_board']) expect(isConfirmRequired(name)).toBe(false);
  });

  it.each([
    ['draft_board', { player_id: P, note: 'Board' }, 'board'],
    ['draft_message', { player_ids: [P], content: 'Draft only' }, 'message'],
    ['draft_poll', { conversation_id: ID, question: 'When?', options: ['Tuesday', 'Wednesday'] }, 'poll'],
  ])('%s writes a handoff part and no domain row', async (name, input, kind) => {
    const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), maybeSingle: async () => ({ data: { id: ID, title: 'Team', golf_conversation_participants: [{}, {}, {}] }, error: null }) };
    const sb = { from: vi.fn((_table: string) => chain) };
    const writer = { write: vi.fn() };
    const t = tools('ask', sb as never, writer)[name as string] as { execute: (i: unknown, o: unknown) => Promise<unknown> };
    expect(await t.execute(input, {})).toMatchObject({ status: 'shown' });
    expect(writer.write).toHaveBeenCalledWith(expect.objectContaining({ type: 'data-handoff', data: expect.objectContaining({ kind }) }));
    expect(hooks.commit).not.toHaveBeenCalled();
    expect(sb.from.mock.calls.every(([table]) => table === 'golf_conversations')).toBe(true);
  });
});
