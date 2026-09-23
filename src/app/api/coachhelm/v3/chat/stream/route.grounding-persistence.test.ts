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
// Keep the REAL provenance module (ToolEnvelope, collectDates, etc.) — only
// the two audit entrypoints are swapped for a deterministic verdict.
vi.mock('@/lib/coachhelm/v3/chat/provenance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coachhelm/v3/chat/provenance')>();
  return {
    ...actual,
    auditNumericClaims: mocks.auditNumericClaims,
    collectNumbers: mocks.collectNumbers,
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
});
