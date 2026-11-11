/**
 * CoachHelm chat stream route: an approval continuation through the OUTER stream (real `ai` SDK).
 *
 * Production, 2026-11-10: `AI_UIMessageStreamError: No tool invocation found for tool call ID "toolu_…"`. On Confirm
 * the SDK runs the approved tool before any model call and emits `tool-output-available` for a call whose
 * `tool-input-available` was in the PREVIOUS response. `createUIMessageStream` builds its own message state for
 * `onFinish`; without `originalMessages` that state starts empty, the reducer throws on the unknown call id, the
 * response is torn down and the completed task is stored as a failed turn. Cancel (`tool-output-denied`) dies the
 * same way.
 *
 * `chat-approval-server.test.ts` drives `streamText` alone, so it never reached that reducer. This file sends the
 * continuation through the route's own `createUIMessageStream` + `onFinish`. Only the model, the tool set and the
 * Supabase-backed persistence are stubs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { tool } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { z } from 'zod';

const CONVERSATION_ID = '7b0c8c5e-5d0e-4d58-9d0b-0d2d1f1f4a11';
const WRITE_TOOL = 'create_focus_area';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(async (_input: { title: string }) => ({ status: 'created' })),
  appendMessage: vi.fn(async (..._args: [unknown, Record<string, unknown>]) => ({ id: 'msg-2' })),
  upsertUserTurn: vi.fn(async () => {}),
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));

vi.mock('@sentry/nextjs', () => ({ setConversationId: vi.fn() }));
vi.mock('@/lib/ai/model-provider', () => ({
  resolveModelProvider: () =>
    new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream<LanguageModelV4StreamPart>({
          chunks: [
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'Done.' },
            { type: 'text-end', id: 't1' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: undefined },
              usage: {
                inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 10, text: 10, reasoning: undefined },
              },
            },
          ],
        }),
      }),
    }),
}));
vi.mock('@/lib/observability/metrics', () => ({ recordAi: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: true })) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError, logServerEvent: mocks.logServerEvent }));
vi.mock('@/lib/coachhelm/v3/llm/budget', () => ({
  checkBudget: vi.fn(async () => ({ allowed: true, remaining_usd: 1, budget_usd: 3, spent_usd: 0, source: 'platform_default' as const })),
  recordSpend: vi.fn(async () => {}),
}));
vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10, resetAt: Date.now() + 1000 })),
  RATE_LIMITS: { API_GENERAL: { maxAttempts: 100, windowMs: 60_000 } },
}));
vi.mock('@/lib/coachhelm/v3/chat/context', () => ({
  CoachContextError: class CoachContextError extends Error {
    status = 401;
  },
  resolveCoachChatContext: vi.fn(async () => ({
    coach_id: 'coach-1',
    user_id: 'user-1',
    team_id: 'team-1',
    team_name: 'Test Team',
    timezone: 'America/New_York',
    roster: [],
  })),
}));
// The gated write is a real SDK tool, so the SDK's own approval protocol runs it; only its body is a spy.
vi.mock('@/lib/coachhelm/v3/chat/agent-tools', () => ({
  buildCoachTools: () => ({
    [WRITE_TOOL]: tool({
      description: 'Create a focus area',
      inputSchema: z.object({ title: z.string() }),
      execute: mocks.execute,
    } as never),
  }),
  isConfirmRequired: (name: string) => name === WRITE_TOOL,
}));
vi.mock('@/lib/coachhelm/v3/chat/instructions', () => ({
  buildInstructions: vi.fn(() => 'system prompt'),
  buildInstructionBlocks: vi.fn(() => ({ stable: 'system prompt', dynamic: 'this program' })),
}));
vi.mock('@/lib/coachhelm/v3/chat/persistence', () => ({
  appendMessage: mocks.appendMessage,
  createConversation: vi.fn(async () => ({ id: CONVERSATION_ID })),
  findAssistantTurn: vi.fn(async () => null),
  getConversation: vi.fn(async () => ({ id: CONVERSATION_ID, coach_id: 'coach-1' })),
  listMessages: vi.fn(async () => []),
  listRecentMessages: vi.fn(async () => []),
  touchConversation: vi.fn(async () => {}),
  upsertUserTurn: mocks.upsertUserTurn,
}));
vi.mock('@/lib/coachhelm/v3/chat/action-runs', () => ({
  linkProposalsToMessage: vi.fn(async () => {}),
  proposalKeysFromParts: vi.fn(() => []),
}));
vi.mock('@/lib/coachhelm/v3/llm/chat-call-row', () => ({ buildChatLlmCallRow: vi.fn(() => ({})) }));

import { POST } from '../route';

const proposalPart = { type: 'data-action-proposal', id: 'proposal-1', data: { idempotency_key: 'key-1', title: 'Putting from 6 feet' } };

/** The thread the browser resubmits once the coach answers the card: no new user message, the answer rides on the tool part. */
function continuationBody(approved: boolean) {
  return {
    conversation_id: CONVERSATION_ID,
    client_turn_id: 'turn-2',
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Make a putting focus area' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          proposalPart,
          {
            type: `tool-${WRITE_TOOL}`,
            toolCallId: 'call_1',
            state: 'approval-responded',
            input: { title: 'Putting from 6 feet' },
            approval: { id: 'appr_1', approved },
          },
        ],
      },
    ],
  };
}

/** Read the response to its end, the way a browser does. A torn-down stream rejects the read: that is the failure, not a test error. */
async function runPost(body: Record<string, unknown>): Promise<{ wire: string; streamError: unknown }> {
  const response = (await POST({ json: async () => body } as unknown as NextRequest)) as unknown as Response;
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let wire = '';
  let streamError: unknown = null;
  try {
    for (;;) {
      const { done, value } = await reader!.read();
      if (done) break;
      wire += decoder.decode(value, { stream: true });
    }
  } catch (err) {
    streamError = err;
  }
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { wire, streamError };
}

const storedRow = () => mocks.appendMessage.mock.calls.at(-1)?.[1] as { status: string; content: string; ui_parts: Array<{ type: string }> } | undefined;

describe('POST /coachhelm/v3/chat/stream: an approval continuation through the outer stream', () => {
  beforeEach(() => {
    mocks.execute.mockClear();
    mocks.appendMessage.mockClear();
    mocks.upsertUserTurn.mockClear();
  });

  it('Confirm runs the write once, streams the closing words and stores the turn as complete', async () => {
    const { wire, streamError } = await runPost(continuationBody(true));

    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(streamError).toBeNull();
    expect(wire).not.toContain('"type":"error"');
    expect(wire).toContain('Done.');

    expect(mocks.appendMessage).toHaveBeenCalledTimes(1);
    const row = storedRow()!;
    expect(row.status).toBe('complete');
    expect(row.content).toBe('Done.');
    expect(row.ui_parts.some((p) => p.type === 'data-turn-incomplete')).toBe(false);
  });

  it('Cancel does not run the write, and the turn still completes', async () => {
    const { wire, streamError } = await runPost(continuationBody(false));

    expect(mocks.execute).not.toHaveBeenCalled();
    expect(streamError).toBeNull();
    expect(wire).not.toContain('"type":"error"');

    expect(mocks.appendMessage).toHaveBeenCalledTimes(1);
    const row = storedRow()!;
    expect(row.status).toBe('complete');
    expect(row.ui_parts.some((p) => p.type === 'data-turn-incomplete')).toBe(false);
  });

  it('stores only what the continuation added: the card of the first response is not saved a second time', async () => {
    await runPost(continuationBody(true));

    const row = storedRow()!;
    // The first response's row already holds the proposal card. A second copy would draw it twice after a reload.
    expect(row.ui_parts.some((p) => p.type === 'data-action-proposal')).toBe(false);
    expect(row.ui_parts.some((p) => p.type === 'text')).toBe(true);
    // A continuation is not a new question: no user row is written for it.
    expect(mocks.upsertUserTurn).not.toHaveBeenCalled();
  });
});
