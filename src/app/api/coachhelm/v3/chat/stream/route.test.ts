/**
 * CoachHelm chat stream route — Sentry AI observability wiring.
 *
 * Phase A finding (docs/observability/SENTRY_PHASE_A_FINDINGS.md §(a)):
 * vercelAIIntegration instruments NOTHING for a call unless the call itself
 * sets experimental_telemetry.isEnabled — this route's streamText() call
 * never did, so today NO Sentry span/trace/prompt/output is emitted here at
 * all, despite the global integration carrying recordInputs/recordOutputs:
 * true. This suite pins the fix: telemetry opts in with recordInputs/
 * recordOutputs explicitly false (a coach chat prompt can carry a player's
 * first name — hero-narrative.ts's own pattern, same Phase A finding), the
 * conversation gets tagged via Sentry.setConversationId (an opaque,
 * server-generated UUID — verified against the golf_coachhelm_chat_
 * conversations.id column default, gen_random_uuid(), never derived from
 * coach/player identity), and helm.ai.* metrics fire on both the success and
 * failure paths.
 *
 * Every dependency is mocked to its simplest passing shape — this suite
 * exists to prove the OBSERVABILITY wiring, not to re-verify the route's
 * business logic (auth, budget, persistence), which have no dedicated test
 * of their own yet and are out of this deliverable's scope.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  setConversationId: vi.fn(),
  streamText: vi.fn(),
  createUIMessageStream: vi.fn(),
  recordAi: vi.fn(),
  createClient: vi.fn(async () => ({})),
  createAdminClient: vi.fn(() => ({})),
  logServerError: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
  checkBudget: vi.fn(async () => ({
    allowed: true,
    remaining_usd: 1,
    budget_usd: 3,
    spent_usd: 0,
    source: 'platform_default' as const,
  })),
  recordSpend: vi.fn(async () => {}),
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 10, resetAt: Date.now() + 1000 })),
  resolveCoachChatContext: vi.fn(async () => ({
    coach_id: 'coach-1',
    user_id: 'user-1',
    team_id: 'team-1',
    team_name: 'Test Team',
    timezone: 'America/New_York',
    roster: [],
  })),
  getConversation: vi.fn(async () => null),
  findAssistantTurn: vi.fn(async () => null),
  createConversation: vi.fn(async () => ({ id: 'conv-opaque-uuid-1234' })),
  touchConversation: vi.fn(async () => {}),
  appendMessage: vi.fn(async () => {}),
  upsertUserTurn: vi.fn(async () => {}),
  listMessages: vi.fn(async () => []),
  buildCoachTools: vi.fn(() => ({})),
  buildInstructions: vi.fn(() => 'system prompt'),
}));

vi.mock('@sentry/nextjs', () => ({
  setConversationId: mocks.setConversationId,
}));

// The route drives its whole turn through `ai`'s createUIMessageStream —
// this fake immediately runs `execute` (capturing the streamText call) then
// `onFinish`, simulating a turn that streams and completes successfully.
//
// THE ROUTE DOES NOT AWAIT `createUIMessageStream(...)` — it hands the
// pending promise straight to createUIMessageStreamResponse and returns
// (the real SDK drives completion by the stream being CONSUMED, not by
// POST()'s own return). So `await POST(...)` alone does not prove `execute`/
// `onFinish` finished — tests that assert on their side effects also await
// this mock's OWN returned promise (`mocks.createUIMessageStream.mock.
// results[0].value`) to let that background chain settle first.
vi.mock('ai', () => ({
  streamText: mocks.streamText,
  createUIMessageStream: mocks.createUIMessageStream,
  createUIMessageStreamResponse: vi.fn((opts: { headers?: Record<string, string> }) => ({
    headers: new Headers(opts.headers),
  })),
  convertToModelMessages: vi.fn(async () => []),
  stepCountIs: vi.fn(() => undefined),
}));

mocks.createUIMessageStream.mockImplementation(
  async (opts: {
    execute: (a: { writer: unknown }) => Promise<void>;
    onFinish?: (a: { messages: unknown[] }) => Promise<void>;
  }) => {
    const fakeWriter = { write: vi.fn(), merge: vi.fn() };
    await opts.execute({ writer: fakeWriter });
    if (opts.onFinish) {
      await opts.onFinish({
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Here is your answer.' }],
          },
        ],
      });
    }
    return { __fakeStream: true };
  },
);

vi.mock('@/lib/ai/model-provider', () => ({ resolveModelProvider: (m: string) => m }));
vi.mock('@/lib/observability/metrics', () => ({ recordAi: mocks.recordAi }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: mocks.logServerError,
  logServerEvent: mocks.logServerEvent,
}));
vi.mock('@/lib/coachhelm/v3/llm/budget', () => ({
  checkBudget: mocks.checkBudget,
  recordSpend: mocks.recordSpend,
}));
vi.mock('@/lib/auth/rate-limit', () => ({
  checkRateLimit: mocks.checkRateLimit,
  RATE_LIMITS: { API_GENERAL: { maxAttempts: 100, windowMs: 60_000 } },
}));
vi.mock('@/lib/coachhelm/v3/chat/context', () => ({
  CoachContextError: class CoachContextError extends Error {
    status = 401;
  },
  resolveCoachChatContext: mocks.resolveCoachChatContext,
}));
vi.mock('@/lib/coachhelm/v3/chat/agent-tools', () => ({
  buildCoachTools: mocks.buildCoachTools,
  isConfirmRequired: () => false,
}));
vi.mock('@/lib/coachhelm/v3/chat/instructions', () => ({ buildInstructions: mocks.buildInstructions }));
vi.mock('@/lib/coachhelm/v3/chat/provenance', () => ({
  auditNumericClaims: () => [],
  collectNumbers: () => [],
}));
vi.mock('@/lib/coachhelm/v3/chat/persistence', () => ({
  appendMessage: mocks.appendMessage,
  createConversation: mocks.createConversation,
  findAssistantTurn: mocks.findAssistantTurn,
  getConversation: mocks.getConversation,
  listMessages: mocks.listMessages,
  touchConversation: mocks.touchConversation,
  upsertUserTurn: mocks.upsertUserTurn,
}));
vi.mock('@/lib/coachhelm/v3/chat/ui-parts', () => ({
  hasPersistableAssistantContent: () => true,
  publishableParts: (parts: unknown[]) => parts,
}));
vi.mock('@/lib/coachhelm/v3/llm/chat-call-row', () => ({ buildChatLlmCallRow: vi.fn(() => ({})) }));

import { POST } from './route';

function makeRequest(body: Record<string, unknown>): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

const baseBody = {
  conversation_id: null,
  messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'How is the team doing?' }] }],
  client_turn_id: 'turn-1',
};

/**
 * Calls POST and then waits for the background stream chain
 * (execute -> onFinish) to settle — see the vi.mock('ai', ...) comment above
 * for why `await POST(...)` alone is not enough.
 */
async function runPostAndSettle(body: Record<string, unknown>): Promise<void> {
  await POST(makeRequest(body));
  const call = mocks.createUIMessageStream.mock.results.at(-1);
  if (call?.type === 'return') await call.value;
}

describe('POST /coachhelm/v3/chat/stream — Sentry AI observability', () => {
  beforeEach(() => {
    mocks.setConversationId.mockClear();
    mocks.recordAi.mockClear();
    mocks.streamText.mockReset();
    mocks.createUIMessageStream.mockClear();
  });

  it('opts streamText into telemetry with recordInputs/recordOutputs explicitly false', async () => {
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 500, outputTokens: 120 }),
      toUIMessageStream: () => ({ __uiStream: true }),
    }));

    await runPostAndSettle(baseBody);

    expect(mocks.streamText).toHaveBeenCalledTimes(1);
    const opts = mocks.streamText.mock.calls[0]![0];
    expect(opts.experimental_telemetry).toEqual({
      isEnabled: true,
      functionId: 'coachhelm.chat',
      recordInputs: false,
      recordOutputs: false,
    });
  });

  it('tags the turn with the opaque, server-generated conversation id', async () => {
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 500, outputTokens: 120 }),
      toUIMessageStream: () => ({ __uiStream: true }),
    }));

    await runPostAndSettle(baseBody);

    expect(mocks.setConversationId).toHaveBeenCalledWith('conv-opaque-uuid-1234');
  });

  it('records helm.ai.* success once the turn completes', async () => {
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 500, outputTokens: 120 }),
      toUIMessageStream: () => ({ __uiStream: true }),
    }));

    await runPostAndSettle(baseBody);

    const successCall = mocks.recordAi.mock.calls.find((c) => c[0]?.outcome === 'success');
    expect(successCall).toBeDefined();
    expect(successCall![0]).toMatchObject({
      feature: 'coachhelm_chat',
      outcome: 'success',
      inputTokens: 500,
      outputTokens: 120,
    });
  });

  it('records helm.ai.* failure when streamText reports a model error via onError', async () => {
    mocks.streamText.mockImplementation((opts: { onError?: (e: { error: unknown }) => void }) => {
      opts.onError?.({ error: new Error('model unreachable') });
      return {
        usage: Promise.resolve({ inputTokens: undefined, outputTokens: undefined }),
        toUIMessageStream: () => ({ __uiStream: true }),
      };
    });

    await runPostAndSettle(baseBody);

    const failureCall = mocks.recordAi.mock.calls.find((c) => c[0]?.outcome === 'failure');
    expect(failureCall).toBeDefined();
    expect(failureCall![0]).toMatchObject({ feature: 'coachhelm_chat', outcome: 'failure' });
  });
});
