/**
 * Orphaned `tool_use` blocks poisoning a coach-chat conversation.
 *
 * Production symptom, from admin_events:
 *
 *   00:29:43  chat/stream: model error — Tool result is missing for tool call toolu_015fQ…
 *   00:29:52  chat/stream: model error — Tool result is missing for tool call toolu_015fQ…
 *   00:31:03  chat/stream: model error — Tool result is missing for tool call toolu_015fQ…
 *   00:34:45  chat/stream: model error — Tool result is missing for tool call toolu_011Ue…
 *
 * The SAME tool id three times in ninety seconds: not a transient upstream
 * blip, but a thread carrying an assistant tool call that never produced a
 * result. Every retry re-sent it, the provider found no matching
 * `tool_result` block, and the turn was rejected before the model ran. The
 * coach could not recover except by starting a new conversation.
 *
 * A call can be left unresolved by the agent's step ceiling
 * (`stepCountIs(8)`) landing on a tool call, by an aborted stream, or by a
 * tool that threw. Two defences, because they cover different halves:
 *
 *   1. The request thread is the CLIENT's `useChat` state, so the route asks
 *      the SDK to drop incomplete calls at conversion time
 *      (`ignoreIncompleteToolCalls`). Tested here against the real SDK,
 *      because the whole fix rests on what that flag does and does not strip.
 *   2. Nothing incomplete is persisted to `ui_parts`, so a reload cannot
 *      reintroduce one. Tested here via `publishableParts`.
 *
 * Both must leave approval-suspended calls alone — those are also
 * output-less, and they are the entire Confirm flow.
 */
import { describe, it, expect } from 'vitest';
import { convertToModelMessages, type UIMessage } from 'ai';
import { isIncompleteToolPart, publishableParts } from '@/lib/coachhelm/v3/chat/ui-parts';

const TOOL_ID = 'toolu_015fQRtPyJQaFz9CAE9nn2Zi';

function assistantWith(parts: unknown[]): UIMessage {
  return { id: 'm2', role: 'assistant', parts } as unknown as UIMessage;
}

const userTurn = {
  id: 'm1',
  role: 'user',
  parts: [{ type: 'text', text: 'How is Avery putting?' }],
} as unknown as UIMessage;

describe('isIncompleteToolPart', () => {
  it.each(['input-streaming', 'input-available'])(
    'treats a tool call in %s as incomplete',
    (state) => {
      expect(isIncompleteToolPart({ type: 'tool-get_player_context', state })).toBe(true);
    },
  );

  it.each(['approval-requested', 'approval-responded'])(
    'does NOT treat %s as incomplete — that is a call suspended on the coach, not a dangling one',
    (state) => {
      expect(isIncompleteToolPart({ type: 'tool-create_goal_for_player', state })).toBe(false);
    },
  );

  it.each(['output-available', 'output-error'])('leaves a resolved call (%s) alone', (state) => {
    expect(isIncompleteToolPart({ type: 'tool-get_player_context', state })).toBe(false);
  });

  it('ignores non-tool parts whatever their state', () => {
    expect(isIncompleteToolPart({ type: 'text', state: 'input-available' })).toBe(false);
    expect(isIncompleteToolPart({ type: 'data-chart', state: 'input-streaming' })).toBe(false);
  });
});

describe('publishableParts — a poisoned turn is never written to ui_parts', () => {
  it('drops a dangling tool call while keeping the prose beside it', () => {
    const kept = publishableParts([
      { type: 'step-start' },
      { type: 'text', text: 'Let me pull that up.' },
      { type: 'tool-get_player_context', state: 'input-available' },
    ]) as Array<{ type: string }>;

    expect(kept.map((p) => p.type)).toEqual(['step-start', 'text']);
  });

  it('keeps an approval-suspended call, so a reload can still show the Confirm card', () => {
    const kept = publishableParts([
      { type: 'text', text: 'This will create a goal.' },
      { type: 'tool-create_goal_for_player', state: 'approval-requested' },
    ]) as Array<{ type: string }>;

    expect(kept.map((p) => p.type)).toEqual(['text', 'tool-create_goal_for_player']);
  });

  it('still strips reasoning', () => {
    const kept = publishableParts([
      { type: 'reasoning', text: 'internal' },
      { type: 'text', text: 'visible' },
    ]) as Array<{ type: string }>;

    expect(kept.map((p) => p.type)).toEqual(['text']);
  });
});

describe('convertToModelMessages with ignoreIncompleteToolCalls (real SDK)', () => {
  /** Every content block the conversion produced, flattened across messages. */
  async function blocks(messages: UIMessage[], ignoreIncompleteToolCalls: boolean) {
    const converted = await convertToModelMessages(messages, { ignoreIncompleteToolCalls });
    return converted.flatMap((m) =>
      Array.isArray(m.content) ? m.content : [{ type: 'text', text: m.content }],
    ) as Array<{ type: string; toolCallId?: string }>;
  }

  const danglingThread = [
    userTurn,
    assistantWith([
      { type: 'text', text: 'Let me pull that up.' },
      {
        type: 'tool-get_player_context',
        toolCallId: TOOL_ID,
        state: 'input-available',
        input: { player_id: 'p1' },
      },
    ]),
  ];

  it('reproduces the bug when the flag is off: a tool-call block with no tool-result', async () => {
    const emitted = await blocks(danglingThread, false);

    const calls = emitted.filter((b) => b.type === 'tool-call');
    const results = emitted.filter((b) => b.type === 'tool-result');
    expect(calls.map((c) => c.toolCallId)).toEqual([TOOL_ID]);
    // This unmatched pair is exactly what the provider rejects with
    // "Tool result is missing for tool call toolu_…".
    expect(results).toHaveLength(0);
  });

  it('drops the dangling call when the flag is on, leaving no unmatched tool-call block', async () => {
    const emitted = await blocks(danglingThread, true);

    expect(emitted.filter((b) => b.type === 'tool-call')).toHaveLength(0);
    // The rest of the turn survives — this is a repair, not a truncation.
    expect(emitted.some((b) => b.type === 'text')).toBe(true);
  });

  it('leaves a completed call/result pair intact', async () => {
    const emitted = await blocks(
      [
        userTurn,
        assistantWith([
          {
            type: 'tool-get_player_context',
            toolCallId: TOOL_ID,
            state: 'output-available',
            input: { player_id: 'p1' },
            output: { putting_sg: -0.4 },
          },
        ]),
      ],
      true,
    );

    expect(emitted.filter((b) => b.type === 'tool-call').map((c) => c.toolCallId)).toEqual([
      TOOL_ID,
    ]);
    expect(emitted.filter((b) => b.type === 'tool-result').map((c) => c.toolCallId)).toEqual([
      TOOL_ID,
    ]);
  });

  it('does not strip an approval-suspended call — the Confirm flow survives the flag', async () => {
    const emitted = await blocks(
      [
        userTurn,
        assistantWith([
          {
            type: 'tool-create_goal_for_player',
            toolCallId: TOOL_ID,
            state: 'approval-requested',
            input: { player_id: 'p1', metric_id: 'putting_sg' },
            approval: { id: 'appr_1' },
          },
        ]),
      ],
      true,
    );

    expect(emitted.filter((b) => b.type === 'tool-call').map((c) => c.toolCallId)).toEqual([
      TOOL_ID,
    ]);
  });
});
