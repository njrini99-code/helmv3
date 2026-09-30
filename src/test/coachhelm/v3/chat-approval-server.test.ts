import { describe, it, expect, vi } from 'vitest';
import { convertToModelMessages, stepCountIs, streamText, tool } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { z } from 'zod';
import { ABANDONED_APPROVAL_REASON, denyAbandonedApprovals } from '@/lib/coachhelm/v3/chat/abandoned-approvals';
import { isIncompleteToolPart } from '@/lib/coachhelm/v3/chat/ui-parts';

/**
 * The SERVER half of Confirm, through the real `streamText`.
 *
 * `chat-approval-delivery.test.ts` proves the browser resubmits the thread once
 * a card is answered. `chat-action-idempotency.test.ts` proves the claim and the
 * receipt. Nothing proved the step in between: that the SDK, handed the
 * resubmitted thread the way `chat/stream/route.ts` prepares it (deny abandoned
 * cards, pre-filter with `isIncompleteToolPart`, `convertToModelMessages` with
 * the tools, `toolApproval` gating the write), actually RUNS the approved tool.
 * Production has never recorded a confirmed action (all four
 * `golf_coachhelm_action_runs` rows are still `proposed`), so this is the link
 * that was missing.
 *
 * Only the model is a stub. The SDK's approval protocol is the real one.
 */

const WRITE_TOOL = 'create_focus_area';

/** Records every prompt the model is asked to answer, so a test can see what it was told. */
function stubModel(prompts: unknown[]) {
  return new MockLanguageModelV4({
    doStream: async (options: { prompt: unknown }) => {
      prompts.push(options.prompt);
      return {
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
      };
    },
  } as never);
}

type Thread = Array<{ role: string; parts: Array<{ type: string; state?: unknown }> }>;

const userTurn = (id: string, text: string) => ({
  id,
  role: 'user' as const,
  parts: [{ type: 'text' as const, text }],
});

const assistantText = (id: string, text: string) => ({
  id,
  role: 'assistant' as const,
  parts: [{ type: 'text' as const, text }],
});

/** An assistant message carrying the write's Confirm card, in the given state. */
const proposalTurn = (
  state: 'approval-requested' | 'approval-responded',
  approval: Record<string, unknown>,
  id = 'a1',
  toolCallId = 'call_1',
) => ({
  id,
  role: 'assistant' as const,
  parts: [{ type: `tool-${WRITE_TOOL}`, toolCallId, state, input: { title: 'Putting from 6 feet' }, approval }],
});

/**
 * Run a thread exactly as the route prepares it. `denyAbandoned: false` skips
 * the one step this file exists to justify, to show what the SDK does without it.
 */
async function runThread(messages: Thread, { denyAbandoned = true } = {}) {
  const execute = vi.fn(async (_input: { title: string }) => ({ status: 'created' }));
  const prompts: unknown[] = [];
  const tools = {
    [WRITE_TOOL]: tool({
      description: 'Create a focus area',
      inputSchema: z.object({ title: z.string() }),
      execute,
    } as never),
  };

  const prepared = denyAbandoned ? denyAbandonedApprovals(messages) : messages;
  const modelMessages = await convertToModelMessages(
    prepared.map((m) => ({ ...m, parts: m.parts.filter((p) => !isIncompleteToolPart(p)) })) as never,
    { tools } as never,
  );
  const result = streamText({
    model: stubModel(prompts) as never,
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
  return { execute, chunks, prompts };
}

const errorOf = (chunks: Array<{ type: string; error?: unknown }>) =>
  String((chunks.find((c) => c.type === 'error')?.error as { message?: string } | undefined)?.message);

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
});

describe('CoachHelm chat — a Confirm card the coach never answered', () => {
  const abandoned = (): Thread => [
    userTurn('u1', 'Make a putting focus area'),
    proposalTurn('approval-requested', { id: 'appr_1' }),
    userTurn('u2', 'Actually, how is the team putting?'),
  ];

  it('why the guard exists: the SDK rejects the thread outright, before the model is reached', async () => {
    // Production, 2026-08-26 18:54:06: the second question after a turn that
    // carried an announcement proposal died with exactly this message, and the
    // thread stayed stuck until the card was answered.
    const { execute, chunks, prompts } = await runThread(abandoned(), { denyAbandoned: false });

    expect(errorOf(chunks)).toMatch(/Tool result is missing/);
    expect(prompts).toHaveLength(0);
    expect(execute).not.toHaveBeenCalled();
  });

  it('a new question under it is answered, nothing is created, and the model is told it was declined', async () => {
    const { execute, chunks, prompts } = await runThread(abandoned());

    expect(chunks.some((c) => c.type === 'error')).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    expect(prompts).toHaveLength(1);
    expect(JSON.stringify(prompts[0])).toContain(ABANDONED_APPROVAL_REASON);
  });

  it('keeps working on every later question in the thread', async () => {
    const { chunks, prompts } = await runThread([
      ...abandoned(),
      assistantText('a2', 'Putting is steady.'),
      userTurn('u3', 'And approach play?'),
    ]);

    expect(chunks.some((c) => c.type === 'error')).toBe(false);
    expect(prompts).toHaveLength(1);
  });
});

describe('denyAbandonedApprovals', () => {
  const part = (message: { parts: unknown[] }) => message.parts[0] as { state: string; approval: Record<string, unknown> };

  it('turns a pending card with a newer user message after it into a denial, keeping its approval id', () => {
    const [, card] = denyAbandonedApprovals([
      userTurn('u1', 'Make a putting focus area'),
      proposalTurn('approval-requested', { id: 'appr_1' }),
      userTurn('u2', 'Something else'),
    ]);

    expect(part(card!).state).toBe('approval-responded');
    expect(part(card!).approval).toEqual({ id: 'appr_1', approved: false, reason: ABANDONED_APPROVAL_REASON });
  });

  it('leaves a live card alone: nothing has been said since it was proposed', () => {
    const thread = [userTurn('u1', 'Make a putting focus area'), proposalTurn('approval-requested', { id: 'appr_1' })];

    expect(denyAbandonedApprovals(thread)).toEqual(thread);
  });

  it('leaves an answered card alone, approved or declined', () => {
    for (const approved of [true, false]) {
      const thread = [
        userTurn('u1', 'Make a putting focus area'),
        proposalTurn('approval-responded', { id: 'appr_1', approved }),
        userTurn('u2', 'Something else'),
      ];

      expect(denyAbandonedApprovals(thread)).toEqual(thread);
    }
  });

  it('denies only the cards that were left behind, and does not mutate its input', () => {
    const older = proposalTurn('approval-requested', { id: 'appr_1' }, 'a1', 'call_1');
    const live = proposalTurn('approval-requested', { id: 'appr_2' }, 'a2', 'call_2');
    const thread = [userTurn('u1', 'First'), older, userTurn('u2', 'Second'), live];

    const [, first, , second] = denyAbandonedApprovals(thread);

    expect(part(first!).state).toBe('approval-responded');
    expect(part(second!).state).toBe('approval-requested');
    expect(part(older).state).toBe('approval-requested');
  });
});
