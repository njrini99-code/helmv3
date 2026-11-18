/**
 * A tool call stored without its result poisons a conversation: the API rejects every later request of it (400,
 * "`tool_use` ids were found without `tool_result` blocks immediately after"). Production, 2026-11-16 (7286de9e): a turn
 * that used all 12 steps got a tool call back on the answer-only step, the loop kept it, the turn was stored complete,
 * and the coach's next two messages failed. These pin both halves: the loop never keeps a call it will not run, and the
 * history never replays one that has no result.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}), logServerEvent: vi.fn(async () => {}) }));

import { fakeModel, text, thinking, toolUse } from '@/app/api/coachhelm/v3/chat/stream/__tests__/helpers';
import { runModelLoop, type LoopState } from '../loop';
import { emptyUsage, profileFor, type ModelMessage } from '../model';
import { answeredCallsOnly, buildHistory, type TurnRow } from '../store';

const row = (over: Partial<TurnRow>): TurnRow => ({
  id: 'r',
  role: 'assistant',
  content: null,
  created_at: '2026-11-16T14:36:25Z',
  client_turn_id: 't1',
  status: 'complete',
  ui_parts: [],
  model_messages: null,
  pending_decision: null,
  ...over,
});

const call = (id: string) => ({ type: 'tool_use', id, name: 'get_team_stats', input: {} });
const result = (id: string) => ({ type: 'tool_result', tool_use_id: id, content: 'ok' });

const dangling: ModelMessage[] = [
  { role: 'user', content: 'How did we putt?' },
  { role: 'assistant', content: [call('tu_1')] } as ModelMessage,
  { role: 'user', content: [result('tu_1')] } as ModelMessage,
  { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 's' }, call('tu_2')] } as ModelMessage,
];

describe('answeredCallsOnly', () => {
  it('drops a trailing call that has no result, and the thinking-only message it leaves', () => {
    expect(answeredCallsOnly(dangling)).toEqual(dangling.slice(0, 3));
  });

  it('keeps the words of a message whose call had no result', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'q' },
      { role: 'assistant', content: [{ type: 'text', text: 'Here is what I found.' }, call('tu_9')] } as ModelMessage,
    ];
    expect(answeredCallsOnly(messages)[1]).toEqual({ role: 'assistant', content: [{ type: 'text', text: 'Here is what I found.' }] });
  });

  it('returns a well-formed turn unchanged', () => {
    expect(answeredCallsOnly(dangling.slice(0, 3))).toEqual(dangling.slice(0, 3));
  });
});

describe('buildHistory', () => {
  it('never replays a stored call without its result', () => {
    const history = buildHistory({ mode: 'columns', rows: [row({ role: 'user', client_turn_id: 't1', content: 'How did we putt?' }), row({ model_messages: dangling })] });
    const calls = history.flatMap((m) => (Array.isArray(m.content) ? (m.content as Array<{ type: string; id?: string }>) : [])).filter((b) => b.type === 'tool_use').map((b) => b.id);
    expect(calls).toEqual(['tu_1']);
  });

  it('keeps the asking call of a turn still waiting on a card: the next message answers it', () => {
    const waiting = row({ model_messages: dangling, pending_decision: { order: ['tu_2'], results: {}, tasks: [{ key: 'k', tool: 'create_focus_area', tool_use_id: 'tu_2' }], steps: 2 } as never });
    expect(buildHistory({ mode: 'columns', rows: [waiting] })).toEqual(dangling);
  });
});

describe('the answer-only step', () => {
  const run = async (content: Parameters<typeof fakeModel>[0][number]) => {
    const profile = profileFor('ask');
    const state: LoopState = { messages: [{ role: 'user', content: 'q' }], appended: [], steps: 0, usage: emptyUsage(), reads: new Map(), nextRef: 0, nextProgress: 0, profile, features: profile.features, dropped: [], container: null };
    const stop = await runModelLoop({ model: fakeModel([content]), system: { policy: 'P', team: 'T' } as never, tools: [], toolContext: {} as never, tasks: null, maxSteps: 0, signal: new AbortController().signal, emit: () => {} }, state);
    return { stop, state };
  };

  it('keeps the words and not the call the model returned anyway', async () => {
    const { stop, state } = await run({ content: [text('Putting cost you 1.2 a round.'), toolUse('tu_late', 'get_team_stats', {})], stop_reason: 'tool_use' });
    expect(stop.kind).toBe('complete');
    const kept = state.appended.flatMap((m) => (Array.isArray(m.content) ? (m.content as Array<{ type: string }>) : []));
    expect(kept.some((b) => b.type === 'tool_use')).toBe(false);
    expect(kept.some((b) => b.type === 'text')).toBe(true);
  });

  it('keeps nothing when the model returned only a call', async () => {
    const { stop, state } = await run({ content: [thinking('sig'), toolUse('tu_late', 'get_team_stats', {})], stop_reason: 'tool_use' });
    expect(stop.kind).toBe('complete');
    expect(state.appended).toEqual([]);
  });
});
