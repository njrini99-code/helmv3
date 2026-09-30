import { describe, it, expect, vi } from 'vitest';
import { convertToModelMessages, stepCountIs, streamText, tool } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { z } from 'zod';
import { isIncompleteToolPart } from '@/lib/coachhelm/v3/chat/ui-parts';

/**
 * The SERVER half of Confirm, through the real `streamText`.
 *
 * `chat-approval-delivery.test.ts` proves the browser resubmits the thread once
 * a card is answered. `chat-action-idempotency.test.ts` proves the claim and the
 * receipt. Nothing proved the step in between: that the SDK, handed the
 * resubmitted thread the way `chat/stream/route.ts` prepares it (pre-filter with
 * `isIncompleteToolPart`, `convertToModelMessages` with the tools, `toolApproval`
 * gating the write), actually RUNS the approved tool. Production has never
 * recorded a confirmed action (all four `golf_coachhelm_action_runs` rows are
 * still `proposed`), so this is the link that was missing.
 *
 * Only the model is a stub. The SDK's approval protocol is the real one.
 */

const WRITE_TOOL = 'create_focus_area';

function stubModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 't1' },
          { type: 'text-delta', id: 't1', delta: 'Done.' },
          { type: 'text-end', id: 't1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
          },
        ],
      }),
    }),
  } as never);
}

const userTurn = (id: string, text: string) => ({
  id,
  role: 'user' as const,
  parts: [{ type: 'text' as const, text }],
});

/** The assistant message carrying the write's Confirm card, in the given state. */
const proposalTurn = (state: 'approval-requested' | 'approval-responded', approval: Record<string, unknown>) => ({
  id: 'a1',
  role: 'assistant' as const,
  parts: [{ type: `tool-${WRITE_TOOL}`, toolCallId: 'call_1', state, input: { title: 'Putting from 6 feet' }, approval }],
});

/** Run a thread exactly as the route prepares it, returning the write's calls and the stream's chunks. */
async function runThread(messages: Array<{ parts: Array<{ type: string; state?: unknown }> }>) {
  const execute = vi.fn(async (_input: { title: string }) => ({ status: 'created' }));
  const tools = {
    [WRITE_TOOL]: tool({
      description: 'Create a focus area',
      inputSchema: z.object({ title: z.string() }),
      execute,
    } as never),
  };

  const modelMessages = await convertToModelMessages(
    messages.map((m) => ({ ...m, parts: m.parts.filter((p) => !isIncompleteToolPart(p)) })) as never,
    { tools } as never,
  );
  const result = streamText({
    model: stubModel() as never,
    messages: modelMessages,
    tools,
    // The route's own gate: every write suspends for the coach.
    toolApproval: ({ toolCall }: { toolCall: { toolName: string } }) =>
      toolCall.toolName === WRITE_TOOL ? 'user-approval' : 'not-applicable',
    stopWhen: stepCountIs(4),
  } as never);

  const chunks: Array<{ type: string; error?: unknown }> = [];
  for await (const chunk of (result as unknown as { fullStream: AsyncIterable<{ type: string; error?: unknown }> })
    .fullStream) {
    chunks.push(chunk);
  }
  return { execute, chunks };
}

describe('CoachHelm chat — Confirm, server side, through the real streamText', () => {
  it('runs the gated write once when the resubmitted thread carries an approval', async () => {
    const { execute, chunks } = await runThread([
      userTurn('u1', 'Make a putting focus area'),
      proposalTurn('approval-responded', { id: 'appr_1', approved: true }),
    ]);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]![0]).toEqual({ title: 'Putting from 6 feet' });
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
  });

  it('does not run the write when the coach declined', async () => {
    const { execute, chunks } = await runThread([
      userTurn('u1', 'Make a putting focus area'),
      proposalTurn('approval-responded', { id: 'appr_1', approved: false }),
    ]);

    expect(execute).not.toHaveBeenCalled();
    expect(chunks.some((c) => c.type === 'error')).toBe(false);
  });

  it('DOCUMENTS A GAP: a new question asked under an unanswered Confirm card fails the whole request', async () => {
    // Not desired; pinned so whoever fixes it sees this flip. The card is an
    // awaiting-coach call, so the route deliberately keeps it (`isIncompleteToolPart`
    // does not drop `approval-requested`), but a later user message means the
    // coach moved on and the SDK is left with a tool call that has no result.
    // Production, 2026-08-26 18:54:06: the second question after a rejected turn
    // that carried an announcement proposal died with exactly this message, and
    // the thread stays stuck until the card is answered. Fix candidates: drop, or
    // treat as denied, any `approval-requested` part followed by a newer user
    // message, before converting.
    const { execute, chunks } = await runThread([
      userTurn('u1', 'Make a putting focus area'),
      proposalTurn('approval-requested', { id: 'appr_1' }),
      userTurn('u2', 'Actually, how is the team putting?'),
    ]);

    const failure = chunks.find((c) => c.type === 'error');
    expect(String((failure?.error as { message?: string } | undefined)?.message)).toMatch(/Tool result is missing/);
    expect(execute).not.toHaveBeenCalled();
  });
});
