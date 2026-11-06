/**
 * The wiring half of "Add a practice next Tuesday": the dates in the coach's
 * own messages reach the numeric audit. `coachRequestDates` itself, and what
 * the audit does with them, are in chat/__tests__/ask-live-refusals.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { todayIsoInZone } from '@/lib/golf/timezone';

const mocks = vi.hoisted(() => ({
  auditNumericClaims: vi.fn((..._args: unknown[]): { text: string; value: number }[] => []),
  getConversation: vi.fn(async (..._args: unknown[]): Promise<Record<string, unknown> | null> => null),
  listRecentMessages: vi.fn(async (..._args: unknown[]): Promise<Record<string, unknown>[]> => []),
}));

vi.mock('@sentry/nextjs', () => ({ setConversationId: vi.fn() }));
vi.mock('@/lib/ai/model-provider', () => ({
  resolveModelProvider: () =>
    new MockLanguageModelV4({
      doStream: async () => ({
        stream: simulateReadableStream<LanguageModelV4StreamPart>({
          chunks: [
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: 'What time should it end?' },
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
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}), logServerEvent: vi.fn(async () => {}) }));
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
  resolveCoachChatContext: vi.fn(async () => ({ coach_id: 'coach-1', user_id: 'user-1', team_id: 'team-1', team_name: 'Test Team', timezone: 'America/New_York', roster: [] })),
}));
vi.mock('@/lib/coachhelm/v3/chat/agent-tools', () => ({ buildCoachTools: vi.fn(() => ({})), isConfirmRequired: () => false }));
vi.mock('@/lib/coachhelm/v3/chat/instructions', () => ({ buildInstructions: vi.fn(() => 'system prompt') }));
vi.mock('@/lib/coachhelm/v3/chat/provenance', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/coachhelm/v3/chat/provenance')>()),
  auditNumericClaims: mocks.auditNumericClaims,
}));
vi.mock('@/lib/coachhelm/v3/chat/persistence', () => ({
  appendMessage: vi.fn(async () => {}),
  createConversation: vi.fn(async () => ({ id: 'conv-1' })),
  findAssistantTurn: vi.fn(async () => null),
  getConversation: mocks.getConversation,
  listMessages: vi.fn(async () => []),
  listRecentMessages: mocks.listRecentMessages,
  touchConversation: vi.fn(async () => {}),
  upsertUserTurn: vi.fn(async () => {}),
}));
vi.mock('@/lib/coachhelm/v3/llm/chat-call-row', () => ({ buildChatLlmCallRow: vi.fn(() => ({})) }));

import { POST } from '../route';

async function send(text: string, conversationId: string | null) {
  const body = { conversation_id: conversationId, messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text }] }], client_turn_id: 'turn-1' };
  const response = await POST({ json: async () => body } as unknown as NextRequest);
  const reader = (response as unknown as Response).body?.getReader();
  if (reader) for (;;) if ((await reader.read()).done) break;
  await new Promise((resolve) => setTimeout(resolve, 20));
}

/** The audit's `extraSupportedDates`. */
const auditedDates = () => mocks.auditNumericClaims.mock.calls[0]?.[4] as string[];

describe('POST /coachhelm/v3/chat/stream: dates the coach named reach the audit', () => {
  beforeEach(() => {
    mocks.auditNumericClaims.mockClear();
    mocks.listRecentMessages.mockResolvedValue([]);
    mocks.getConversation.mockResolvedValue(null);
  });

  it('this message', async () => {
    await send('Add a practice today at 3pm', null);
    expect(auditedDates()).toContain(todayIsoInZone('America/New_York'));
  });

  it('an earlier message, resolved from the day it was said', async () => {
    const conversationId = '11111111-1111-4111-8111-111111111111';
    mocks.getConversation.mockResolvedValue({ id: conversationId, coach_id: 'coach-1', title: 'Existing', pinned: false, archived_at: null, created_at: '2026-11-05T17:00:00.000Z', updated_at: '2026-11-05T17:00:00.000Z' });
    mocks.listRecentMessages.mockResolvedValue([
      { id: 'm1', conversation_id: conversationId, role: 'user', content: 'Add a practice next Tuesday at 3pm', created_at: '2026-11-05T17:54:56.000Z', ui_parts: null },
      { id: 'm2', conversation_id: conversationId, role: 'assistant', content: 'What time should it end?', created_at: '2026-11-05T17:55:00.000Z', ui_parts: [] },
    ]);
    await send('5pm', conversationId);
    expect(auditedDates()).toEqual(expect.arrayContaining(['2026-11-10', '2026-11-17']));
  });

  it('a message naming no day adds none', async () => {
    await send('What is his scoring average?', null);
    expect(auditedDates()).toEqual([]);
  });
});
