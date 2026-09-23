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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mock the AI gateway. Each test queues the text(s) it wants back. ---
const generateTextMock = vi.fn();
vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
}));

// --- Sentry AI observability. ---
const recordAiMock = vi.fn();
vi.mock('@/lib/observability/metrics', () => ({
  recordAi: (...args: unknown[]) => recordAiMock(...args),
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

// --- Direct-Anthropic provider. Returns a marker object so the provider-
//     selection tests below can tell which branch built the model argument.
//     Mocked at @ai-sdk/anthropic rather than at resolveModelProvider so the
//     real account-selection logic still runs — mocking the resolver itself
//     would leave the branch these tests exist to pin completely untested. ---
const anthropicMock = vi.fn((modelName: string) => ({ __direct: modelName }));
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: (modelName: string) => anthropicMock(modelName),
}));

import { compose } from './compose';
import { checkBudget } from './budget';
import type { ComposeRequest } from './types';
import type { EvidencePacket } from './claim-validator';

const FALLBACK = 'Deterministic fallback summary.';
const ALLOW_BUDGET = {
  allowed: true,
  remaining_usd: 10,
  budget_usd: 10,
  spent_usd: 0,
  source: 'coach_configured',
} as const;
const WINDOW = { window_start: '2026-09-01T00:00:00.000Z', window_end: '2026-09-08T00:00:00.000Z' };
const PACKET: EvidencePacket = {
  player_id: 'player-1',
  ...WINDOW,
  entries: [
    { metric_id: 'total_putts', value: 28, sample_n: 18 },
    { metric_id: 'gir_pct', value: 55.6, sample_n: 18 },
  ],
};

function claimsBlock(claims: unknown[]): string {
  return `\n\n<<<CLAIMS>>>\n${JSON.stringify(claims)}\n<<<END_CLAIMS>>>`;
}

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
  anthropicMock.mockClear();
  recordAiMock.mockClear();
  loggedRows.length = 0;
  // Reset rather than clear: some tests queue `mockResolvedValueOnce`
  // overrides that may go unconsumed (e.g. a denied retry gate means the
  // second queued value is never read) — reset drops any leftover queue
  // entries so they can't bleed into the next test's first call.
  vi.mocked(checkBudget).mockReset();
  vi.mocked(checkBudget).mockResolvedValue(ALLOW_BUDGET);
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

    // …and what it was checked AGAINST. A discard row that records only the
    // rejected token cannot distinguish a fabricated number from a real one
    // whose claim was missing — that ambiguity made 19 production discards
    // undiagnosable on 2026-08-16.
    const offered = (verRow?.citations as {
      evidence_offered?: Array<{ field: string; value: string | number }>;
    }).evidence_offered;
    expect(offered).toBeTruthy();
    expect(offered).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: expect.any(String) })]),
    );
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

/**
 * Provider selection.
 *
 * compose() used to pass the bare 'anthropic/…' gateway string unconditionally,
 * which routes on the Vercel project's OIDC token and bills the VERCEL AI
 * Gateway balance — a different account from ANTHROPIC_API_KEY. That account
 * was free-tier, so from 2026-07-29 every round review served its template
 * while coach chat (which has always had this branch) kept working on the
 * direct key and made the platform look healthy.
 */
describe('compose() provider selection', () => {
  const groundedDraft = { text: 'You took 28 putts today.', usage: { inputTokens: 10, outputTokens: 8 } };

  /** The `model` generateText was handed on the first call. Throws rather than
   *  returning undefined, so a never-called mock fails loudly instead of
   *  quietly comparing undefined to undefined. */
  function firstModelArg(): unknown {
    const call = generateTextMock.mock.calls[0];
    if (!call) throw new Error('generateText was never called');
    return (call as [{ model: unknown }])[0].model;
  }

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the direct Anthropic provider when ANTHROPIC_API_KEY is set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    generateTextMock.mockResolvedValueOnce(groundedDraft);

    await compose(baseReq(), FALLBACK);

    // Prefix stripped: the direct provider names the model without 'anthropic/'.
    expect(anthropicMock).toHaveBeenCalledWith('claude-haiku-4-5');
    expect(firstModelArg()).toEqual({ __direct: 'claude-haiku-4-5' });
  });

  it('falls back to the bare gateway string when no Anthropic key is configured', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    generateTextMock.mockResolvedValueOnce(groundedDraft);

    await compose(baseReq(), FALLBACK);

    expect(anthropicMock).not.toHaveBeenCalled();
    expect(firstModelArg()).toBe('anthropic/claude-haiku-4-5');
  });

  /**
   * The logged model_id must stay gateway-prefixed on BOTH paths.
   * MODEL_COST_USD_PER_MTOK, checkBudget and golf_coachhelm_llm_calls are all
   * keyed by that id, and an unrecognised key bills at the Opus
   * UNKNOWN_MODEL_RATE — so rewriting model_id alongside the provider would
   * silently overcharge every round review by 15×.
   */
  it('logs the gateway-prefixed model_id regardless of which provider served the call', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-test');
    generateTextMock.mockResolvedValueOnce(groundedDraft);

    await compose(baseReq(), FALLBACK);

    expect(loggedRows[0]).toBeDefined();
    expect(loggedRows[0]?.model_id).toBe('anthropic/claude-haiku-4-5');
  });
});

/**
 * Sentry AI observability opt-in (Phase A finding §(a)). compose() is the
 * ONE choke point every v3 LLM call in this codebase routes through — round
 * review, hero narrative, coach chat's own composers. `req.prompt` can carry
 * a player's first name (Phase A's own example, hero-narrative.ts) and
 * evidence values pulled from the round/player's own data — no prompt or
 * completion belongs in Sentry from any of them.
 */
describe('compose() Sentry AI observability', () => {
  const groundedDraft = { text: 'You took 28 putts today.', usage: { inputTokens: 10, outputTokens: 8 } };

  it('opts generateText into telemetry with recordInputs/recordOutputs explicitly false, functionId keyed by task', async () => {
    generateTextMock.mockResolvedValueOnce(groundedDraft);

    await compose(baseReq({ task: 'round_review' }), FALLBACK);

    const call = generateTextMock.mock.calls[0]?.[0] as { experimental_telemetry?: unknown };
    expect(call.experimental_telemetry).toEqual({
      isEnabled: true,
      functionId: 'coachhelm.compose.round_review',
      recordInputs: false,
      recordOutputs: false,
    });
  });

  it('records helm.ai.* success with real token counts once the call completes', async () => {
    generateTextMock.mockResolvedValueOnce(groundedDraft);

    await compose(baseReq(), FALLBACK);

    expect(recordAiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'coachhelm_compose',
        action: 'v3.llm.compose.round_review',
        outcome: 'success',
        inputTokens: 10,
        outputTokens: 8,
      }),
    );
  });

  it('records helm.ai.* success for EACH attempt, including the citation retry', async () => {
    generateTextMock
      .mockResolvedValueOnce({ text: 'You took 42 putts today.', usage: { inputTokens: 10, outputTokens: 8 } })
      .mockResolvedValueOnce({ text: 'You took 28 putts today.', usage: { inputTokens: 12, outputTokens: 9 } });

    await compose(baseReq(), FALLBACK);

    const successCalls = recordAiMock.mock.calls.filter((c) => (c[0] as { outcome?: string })?.outcome === 'success');
    expect(successCalls).toHaveLength(2);
  });

  it('records helm.ai.* failure and still returns the deterministic fallback when the model call throws', async () => {
    generateTextMock.mockRejectedValueOnce(new Error('provider unavailable'));

    const result = await compose(baseReq(), FALLBACK);

    // The existing safety net (compose()'s own doc comment): generateText
    // error -> fallback text, used_llm=false. Not previously pinned by a
    // test in this file.
    expect(result.text).toBe(FALLBACK);
    expect(result.used_llm).toBe(false);

    expect(recordAiMock).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'coachhelm_compose',
        action: 'v3.llm.compose.round_review',
        outcome: 'failure',
      }),
    );
  });
});

/**
 * Typed claim gate (Package 8 slice 1, repair plan 14.10). `evidence_packet`
 * is opt-in — these tests all pass it explicitly; every test above this
 * point omits it and is unaffected (the gate simply isn't evaluated).
 */
describe('compose() typed claim gate (evidence_packet)', () => {
  it('accepts a verified typed claim and strips the claims block from the returned text', async () => {
    generateTextMock.mockResolvedValueOnce({
      text:
        'You took 28 putts today.' +
        claimsBlock([
          { claim_id: 'c1', metric_id: 'total_putts', value: 28, player_id: 'player-1', ...WINDOW },
        ]),
      usage: { inputTokens: 10, outputTokens: 8 },
    });

    const result = await compose(baseReq({ evidence_packet: PACKET }), FALLBACK);

    expect(result.text).toBe('You took 28 putts today.');
    expect(result.text).not.toContain('<<<CLAIMS>>>');
    expect(result.used_llm).toBe(true);
    expect(result.citations_verified).toBe(true);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it('a numeric-scan failure on attempt 1 and a typed wrong_field failure on the retry still total exactly two calls, then fall back', async () => {
    // Attempt 1: legacy scan fails — "42" is not in `req.evidence` and not
    // covered by any cited claim either.
    generateTextMock.mockResolvedValueOnce({
      text: 'You took 42 putts today.' + claimsBlock([]),
      usage: { inputTokens: 10, outputTokens: 8 },
    });
    // Retry: numerically clean prose (legacy scan passes), but the claim
    // cites 55.6 (gir_pct's real value) under total_putts — wrong_field.
    generateTextMock.mockResolvedValueOnce({
      text:
        'Great improvement across the board this round.' +
        claimsBlock([
          { claim_id: 'c1', metric_id: 'total_putts', value: 55.6, player_id: 'player-1', ...WINDOW },
        ]),
      usage: { inputTokens: 12, outputTokens: 9 },
    });

    const result = await compose(baseReq({ evidence_packet: PACKET }), FALLBACK);

    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(result.text).toBe(FALLBACK);
    expect(result.used_llm).toBe(false);
    expect(result.citations_verified).toBe(false);

    const row = loggedRows.find(
      (r) => (r.citations as { reason?: string })?.reason === 'claim_validation_failed',
    );
    expect(row).toBeTruthy();
    const claimValidation = (row?.citations as {
      claim_validation?: { malformed: boolean; rejected: Array<{ metric_id: string; reason: string }> };
    }).claim_validation;
    expect(claimValidation?.malformed).toBe(false);
    expect(claimValidation?.rejected).toEqual(
      expect.arrayContaining([expect.objectContaining({ metric_id: 'total_putts', reason: 'wrong_field' })]),
    );
  });

  it('a typed rejection on attempt 1 with the retry denied by budget makes exactly one call and bills only attempt 1', async () => {
    vi.mocked(checkBudget)
      .mockResolvedValueOnce(ALLOW_BUDGET) // initial gate
      .mockResolvedValueOnce({
        allowed: false,
        remaining_usd: 0,
        budget_usd: 10,
        spent_usd: 10,
        source: 'coach_configured',
        fallback_reason: 'budget_exhausted',
      }); // retry re-gate: denied

    generateTextMock.mockResolvedValueOnce({
      text:
        'Great improvement across the board this round.' +
        claimsBlock([
          { claim_id: 'c1', metric_id: 'total_putts', value: 55.6, player_id: 'player-1', ...WINDOW },
        ]),
      usage: { inputTokens: 10, outputTokens: 8 },
    });

    const result = await compose(baseReq({ evidence_packet: PACKET }), FALLBACK);

    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(result.text).toBe(FALLBACK);
    expect(result.used_llm).toBe(false);
    // Only attempt-1's (wasted) tokens were billed — the denied retry never ran.
    expect(recordSpendMock).toHaveBeenCalledTimes(1);
    expect(recordSpendMock.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ coach_id: 'coach-1' }),
    );
  });

  it('a missing/malformed claims block is rejected, retried once, then falls back if still malformed', async () => {
    // Neither attempt includes a claims block at all.
    generateTextMock
      .mockResolvedValueOnce({ text: 'Solid ball-striking round overall.', usage: { inputTokens: 10, outputTokens: 8 } })
      .mockResolvedValueOnce({ text: 'Solid ball-striking round overall.', usage: { inputTokens: 10, outputTokens: 8 } });

    const result = await compose(baseReq({ evidence_packet: PACKET }), FALLBACK);

    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(result.text).toBe(FALLBACK);
    const row = loggedRows.find(
      (r) => (r.citations as { reason?: string })?.reason === 'claim_validation_failed',
    );
    expect((row?.citations as { claim_validation?: { malformed: boolean } })?.claim_validation?.malformed).toBe(true);
  });

  it('provider failure on the FIRST call never blocks the deterministic fallback', async () => {
    generateTextMock.mockRejectedValueOnce(new Error('provider unavailable'));

    const result = await compose(baseReq({ evidence_packet: PACKET }), FALLBACK);

    expect(result.text).toBe(FALLBACK);
    expect(result.used_llm).toBe(false);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
  });

  it('provider failure on the RETRY call never blocks the deterministic fallback', async () => {
    // Attempt 1 fails the typed gate (no claims block) -> triggers a retry.
    generateTextMock
      .mockResolvedValueOnce({ text: 'Solid ball-striking round overall.', usage: { inputTokens: 10, outputTokens: 8 } })
      .mockRejectedValueOnce(new Error('provider unavailable'));

    const result = await compose(baseReq({ evidence_packet: PACKET }), FALLBACK);

    expect(result.text).toBe(FALLBACK);
    expect(result.used_llm).toBe(false);
    expect(generateTextMock).toHaveBeenCalledTimes(2);
  });

  it('a budget of zero makes no LLM call even with an evidence_packet supplied', async () => {
    vi.mocked(checkBudget).mockResolvedValue({
      allowed: false,
      remaining_usd: 0,
      budget_usd: 0,
      spent_usd: 0,
      source: 'disabled',
      fallback_reason: 'budget_disabled',
    });

    const result = await compose(baseReq({ evidence_packet: PACKET }), FALLBACK);

    expect(generateTextMock).not.toHaveBeenCalled();
    expect(result.text).toBe(FALLBACK);
    expect(result.used_llm).toBe(false);
  });
});
