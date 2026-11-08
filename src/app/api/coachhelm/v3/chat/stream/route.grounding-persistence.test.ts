/**
 * CoachHelm chat stream route — grounding-flag PERSISTENCE (real `ai` SDK).
 *
 * Prod audit (2026-09-23) found every `status='failed'` (ungrounded) row in
 * `golf_coachhelm_chat_messages` carries the UNGROUNDED_NOTE in `content` but
 * NONE carry a `data-grounding-flag` part in `ui_parts` — so reloading a
 * conversation with a previously-flagged answer silently drops the warning.
 *
 * `route.test.ts`'s grounding-audit suite mocks the whole `ai` package
 * (`vi.mock('ai', ...)`), and its fake `createUIMessageStream` hands
 * `onFinish` a completely SYNTHETIC `messages` array
 * (`mocks.onFinishAssistantParts`) that is never actually derived from what
 * `execute` wrote to the fake `writer`. That suite can prove the route WRITES
 * the flag chunk to the wire and in what order, but it structurally cannot
 * prove the flag reaches the persisted `ui_parts` — which is exactly the gap
 * the prod bug lives in.
 *
 * This file drives the REAL `ai` package end to end: a real `streamText` +
 * `createUIMessageStream` + `toUIMessageStream`, against a
 * `MockLanguageModelV4` (swapped in for the real provider via
 * `resolveModelProvider`). Only the model and Supabase-backed persistence are
 * mocked — everything the route itself does with the SDK's real
 * message-accumulation is exercised for real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';

const mocks = vi.hoisted(() => ({
  setConversationId: vi.fn(),
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
  getConversation: vi.fn(async (..._args: unknown[]): Promise<Record<string, unknown> | null> => null),
  findAssistantTurn: vi.fn(async (..._args: unknown[]): Promise<unknown | null> => null),
  createConversation: vi.fn(async () => ({ id: 'conv-opaque-uuid-1234' })),
  touchConversation: vi.fn(async () => {}),
  appendMessage: vi.fn(async (..._args: [unknown, Record<string, unknown>]) => {}),
  upsertUserTurn: vi.fn(async () => {}),
  listMessages: vi.fn(async (): Promise<Record<string, unknown>[]> => []),
  listRecentMessages: vi.fn(async (..._args: unknown[]): Promise<Record<string, unknown>[]> => []),
  buildCoachTools: vi.fn(() => ({})),
  buildInstructions: vi.fn(() => 'system prompt'),
  // Forced non-empty regardless of input text: the numeric-claim audit's own
  // behavior has its own suite (chat-provenance.test.ts) — this file only
  // needs a deterministic "ungrounded" verdict to drive the write path.
  auditNumericClaims: vi.fn(
    (..._args: unknown[]): { text: string; value: number }[] => [{ text: '76.5', value: 76.5 }],
  ),
  collectNumbers: vi.fn((..._args: unknown[]): number[] => []),
}));

vi.mock('@sentry/nextjs', () => ({
  setConversationId: mocks.setConversationId,
}));

// The seam that lets a real model be swapped in without touching the `ai`
// package itself.
vi.mock('@/lib/ai/model-provider', () => ({
  resolveModelProvider: () =>
    new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream<LanguageModelV4StreamPart>({
          chunks: [
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'His scoring average is 76.5.' },
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

vi.mock('@/lib/observability/metrics', () => ({ recordAi: mocks.recordAi }));
vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));
// CoachHelm is on for this coach unless a test switches it off (CH13-20).
const helmGate = vi.hoisted(() => ({ isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: true })) }));
vi.mock('@/lib/coachhelm/v2/gate', () => helmGate);
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
vi.mock('@/lib/coachhelm/v3/chat/instructions', () => ({ buildInstructions: mocks.buildInstructions, buildInstructionBlocks: vi.fn(() => ({ stable: 'system prompt', dynamic: 'this program' })) }));
// Keep the REAL provenance module (ToolEnvelope, collectDates, etc.) — only
// the two audit entrypoints are swapped for a deterministic verdict.
vi.mock('@/lib/coachhelm/v3/chat/provenance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/chat/provenance')>();
  return {
    ...actual,
    auditNumericClaims: mocks.auditNumericClaims,
    collectNumbers: mocks.collectNumbers,
    // route.ts reads detail numbers through `collectScopedNumbers` since
    // audit row 47b. The mock keeps returning bare numbers — a bare number is
    // still a valid (unscoped) `extraSupported` entry — so every existing
    // assertion about what reaches the audit is unchanged.
    collectScopedNumbers: (...args: unknown[]) => mocks.collectNumbers(...args),
  };
});
vi.mock('@/lib/coachhelm/v3/chat/persistence', () => ({
  appendMessage: mocks.appendMessage,
  createConversation: mocks.createConversation,
  findAssistantTurn: mocks.findAssistantTurn,
  getConversation: mocks.getConversation,
  listMessages: mocks.listMessages,
  listRecentMessages: mocks.listRecentMessages,
  touchConversation: mocks.touchConversation,
  upsertUserTurn: mocks.upsertUserTurn,
}));
// `ui-parts` is NOT mocked here — `publishableParts`/`isIncompleteToolPart`
// are exactly the real code the write path runs, and are in scope.
vi.mock('@/lib/coachhelm/v3/llm/chat-call-row', () => ({ buildChatLlmCallRow: vi.fn(() => ({})) }));

import { POST } from './route';

function makeRequest(body: Record<string, unknown>): NextRequest {
  return { json: async () => body } as unknown as NextRequest;
}

const baseBody = {
  conversation_id: null,
  messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'How is he doing?' }] }],
  client_turn_id: 'turn-1',
};

/**
 * The real SDK drives `execute`/`onFinish` by the returned stream being
 * CONSUMED, not by `POST()` resolving (same as the mocked suite's own
 * comment on this) — so read the response body to completion before
 * asserting on persistence.
 */
async function runPostAndSettle(body: Record<string, unknown>): Promise<void> {
  const response = await POST(makeRequest(body));
  const reader = (response as unknown as Response).body?.getReader();
  if (reader) {
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
  }
  // onFinish's own async work (recordTurnCost, logServerEvent, etc.) continues
  // a tick or two after the stream closes.
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe('POST /coachhelm/v3/chat/stream — grounding-flag persistence (real ai SDK)', () => {
  beforeEach(() => {
    mocks.appendMessage.mockClear();
    mocks.auditNumericClaims.mockClear();
    mocks.auditNumericClaims.mockReturnValue([{ text: '76.5', value: 76.5 }]);
  });

  it('persists status=failed AND a data-grounding-flag ui_part for an ungrounded answer', async () => {
    await runPostAndSettle(baseBody);

    const assistantCall = mocks.appendMessage.mock.calls.find(
      (call) => (call[1] as { role?: string })?.role === 'assistant',
    );
    expect(assistantCall).toBeDefined();
    const persisted = assistantCall![1] as {
      status?: string;
      content?: string;
      ui_parts?: unknown[];
    };

    expect(persisted.status).toBe('failed');
    // #1997: `content` stays the raw model text (never the note, which would
    // leak into the next turn's model context); the note lives only in the
    // grounding-flag ui_part that restore.ts/ChatThread.tsx display.
    expect(persisted.content).toBe('His scoring average is 76.5.');
    expect(Array.isArray(persisted.ui_parts)).toBe(true);
    expect(persisted.ui_parts).toContainEqual(
      expect.objectContaining({
        type: 'data-grounding-flag',
        data: expect.objectContaining({
          note: expect.stringContaining("could not be traced back to your program's data"),
        }),
      }),
    );
  });

  /**
   * Audit row 47(c): a failed turn stored `status: 'failed'` and nothing else
   * durable about WHY. The verdict part now carries the reason kind and the
   * unmatched tokens, and the ledger row gets the same reason.
   */
  it('records the reject reason and unmatched tokens on the message and on the ledger row', async () => {
    mocks.auditNumericClaims.mockReturnValue([
      { text: '76.5', value: 76.5, misattributed: true },
      { text: '81', value: 81 },
    ] as { text: string; value: number }[]);
    // The ledger insert needs a client with `.from().insert()`; the default
    // `{}` admin double makes recordTurnCost bail out before building the row.
    mocks.createAdminClient.mockReturnValue({ from: () => ({ insert: async () => ({ error: null }) }) } as ReturnType<typeof mocks.createAdminClient>);
    try {
      await runPostAndSettle(baseBody);
    } finally {
      mocks.createAdminClient.mockReturnValue({});
    }

    const assistantCall = mocks.appendMessage.mock.calls.find(
      (call) => (call[1] as { role?: string })?.role === 'assistant',
    );
    const persisted = assistantCall![1] as { ui_parts?: unknown[] };
    expect(persisted.ui_parts).toContainEqual(
      expect.objectContaining({
        type: 'data-grounding-flag',
        data: expect.objectContaining({
          reason: 'ungrounded_claims',
          unmatched_tokens: ['76.5', '81'],
          misattributed_tokens: ['76.5'],
        }),
      }),
    );

    const { buildChatLlmCallRow } = await import('@/lib/coachhelm/v3/llm/chat-call-row');
    expect(vi.mocked(buildChatLlmCallRow)).toHaveBeenCalledWith(
      expect.objectContaining({
        grounded: false,
        unmatchedTokens: ['76.5', '81'],
        verdictReason: 'ungrounded_claims',
      }),
    );
  });
});

/**
 * An approval continuation: the coach pressed Confirm, so the browser resubmits the thread whose last message is the ASSISTANT's, carrying the
 * approved tool call. The new stream starts with that call's RESULT, for a call this stream never opened. Without `originalMessages` the SDK's
 * own message builder (the one behind `onFinish`) throws "No tool invocation found for tool call ID", the response dies with a 500 ("failed to
 * pipe response") and the turn is stored as failed.
 */
describe('POST /coachhelm/v3/chat/stream — an approval continuation (real ai SDK)', () => {
  const execute = vi.fn(async (_input: { title: string }) => ({ status: 'created' }));

  beforeEach(async () => {
    const { tool } = await import('ai');
    const { z } = await import('zod');
    execute.mockClear();
    mocks.appendMessage.mockClear();
    mocks.auditNumericClaims.mockReset().mockReturnValue([]);
    mocks.buildCoachTools.mockReturnValue({
      create_event: tool({ description: 'Create an event', inputSchema: z.object({ title: z.string() }), execute } as never),
    } as never);
  });

  const thread = {
    conversation_id: null,
    client_turn_id: 'turn-2',
    messages: [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Add a practice Tuesday' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          { type: 'text', text: 'Here is the practice for you to confirm.' },
          { type: 'tool-create_event', toolCallId: 'toolu_1', state: 'approval-responded', input: { title: 'Practice' }, approval: { id: 'ap1', approved: true } },
        ],
      },
    ],
  };

  it('streams to the end, runs the approved action once, and stores only what this stream added', async () => {
    const response = (await POST(makeRequest(thread))) as unknown as Response;
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain('No tool invocation');
    expect(text).toContain('tool-output-available');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(execute).toHaveBeenCalledTimes(1);
    const stored = mocks.appendMessage.mock.calls.find((call) => (call[1] as { role?: string })?.role === 'assistant');
    expect(stored).toBeDefined();
    const row = stored![1] as { status?: string; ui_parts?: Array<{ type: string; text?: string }> };
    expect(row.status).toBe('complete');
    // The first leg's text and card were stored with the first leg; this row holds the continuation only.
    const parts = row.ui_parts ?? [];
    expect(parts.some((p) => p.text === 'Here is the practice for you to confirm.')).toBe(false);
    expect(parts.some((p) => p.type === 'text' && /76\.5/.test(p.text ?? ''))).toBe(true);
  });
});
