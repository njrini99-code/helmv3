/**
 * compose() grounding invariant (P0-03).
 *
 * The verifier already detects unsupported numeric claims; these tests
 * prove the compose() pipeline now ACTS on that signal — it retries
 * once, and if the model still emits a number absent from the supplied
 * evidence, it DISCARDS the LLM text and returns the deterministic
 * fallback (used_llm=false, citations_verified=false) while logging the
 * unmatched-token evidence with reason='verification_failed'.
 *
 * Without these guarantees a fabricated number could render to a player
 * as fact.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock the AI gateway. Each test queues the text(s) it wants back. ---
const generateTextMock = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

// --- Mock budget so we exercise the LLM path (allowed) without DB. ---
const recordSpendMock = vi.fn().mockResolvedValue(undefined);
vi.mock('./budget', () => ({
  checkBudget: vi.fn().mockResolvedValue({
    allowed: true,
    remaining_usd: 10,
    budget_usd: 10,
    spent_usd: 0,
  }),
  recordSpend: (...args: unknown[]) => recordSpendMock(...args),
}));

// --- Capture rows written to golf_coachhelm_llm_calls. ---
const loggedRows: Array<Record<string, unknown>> = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        loggedRows.push(row);
        return {
          select: () => ({
            maybeSingle: () => Promise.resolve({ data: { id: 'log-1' }, error: null }),
          }),
        };
      },
    }),
  }),
}));

// --- Silence server logging. ---
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));

import { compose } from './compose';
import type { ComposeRequest } from './types';

const FALLBACK = 'Deterministic fallback summary.';

function baseReq(overrides: Partial<ComposeRequest> = {}): ComposeRequest {
  return {
    task: 'round_review',
    coach_id: 'coach-1',
    player_id: 'player-1',
    prompt: 'Write a round review.',
    // The only number the model is allowed to mention is 28.
    evidence: [{ field: 'total_putts', value: 28 }],
    max_completion_tokens: 200,
    ...overrides,
  };
}

beforeEach(() => {
  generateTextMock.mockReset();
  recordSpendMock.mockClear();
  loggedRows.length = 0;
});

describe('compose() citation grounding (P0-03)', () => {
  it('discards LLM text and returns fallback when an unmatched number survives the retry', async () => {
    // Both the first attempt and the retry fabricate "42" — never in evidence.
    generateTextMock
      .mockResolvedValueOnce({ text: 'You took 42 putts today.', usage: { inputTokens: 10, outputTokens: 8 } })
      .mockResolvedValueOnce({ text: 'You took 42 putts today.', usage: { inputTokens: 12, outputTokens: 8 } });

    const result = await compose(baseReq(), FALLBACK);

    // Invariant: the unsupported claim must NOT be surfaced.
    expect(result.text).toBe(FALLBACK);
    expect(result.used_llm).toBe(false);
    expect(result.citations_verified).toBe(false);

    // It retried exactly once (two model calls total).
    expect(generateTextMock).toHaveBeenCalledTimes(2);

    // The call log keeps the fabricated-cite evidence.
    const verRow = loggedRows.find((r) => (r.citations as { reason?: string })?.reason === 'verification_failed');
    expect(verRow).toBeTruthy();
    expect(verRow?.fallback_to_template).toBe(true);
    expect(verRow?.verified).toBe(false);
    expect((verRow?.citations as { unmatched_tokens?: string[] }).unmatched_tokens).toContain('42');
  });

  it('recovers via retry: a grounded second draft is surfaced as verified LLM text', async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: 'You took 42 putts today.', usage: { inputTokens: 10, outputTokens: 8 } })
      .mockResolvedValueOnce({ text: 'You took 28 putts today.', usage: { inputTokens: 12, outputTokens: 8 } });

    const result = await compose(baseReq(), FALLBACK);

    expect(result.text).toBe('You took 28 putts today.');
    expect(result.used_llm).toBe(true);
    expect(result.citations_verified).toBe(true);
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces a grounded first draft without retrying', async () => {
    generateTextMock.mockResolvedValueOnce({
      text: 'You took 28 putts today.',
      usage: { inputTokens: 10, outputTokens: 8 },
    });

    const result = await compose(baseReq(), FALLBACK);

    expect(result.text).toBe('You took 28 putts today.');
    expect(result.used_llm).toBe(true);
    expect(result.citations_verified).toBe(true);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });
});
