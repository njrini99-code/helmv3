/**
 * CoachHelm chat stream route.
 *
 * Two suites live here:
 *
 *  - Sentry AI observability wiring (original scope): every dependency is
 *    mocked to its simplest passing shape, proving telemetry opt-in and
 *    helm.ai.* metrics, not business logic.
 *  - The grounding-audit rework (review of PR #1975, 2026-09-22): these
 *    mocks stream REAL text-delta/error/finish chunks through a fake
 *    `writer`, because the bug class under test — auditing only the final
 *    agent step, a provider error being stored as a complete answer, a
 *    dropped connection reading as a clean finish — is invisible to a suite
 *    that only ever hands the route an empty stream. `auditNumericClaims` is
 *    still mocked (its own behaviour has a dedicated suite in
 *    chat-provenance.test.ts), but `ToolEnvelope` and the rest of the
 *    provenance module are the REAL zod schema, so `priorTurnEvidence`'s
 *    `ToolEnvelope.safeParse` validates test fixtures exactly as it would
 *    validate production data.
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
  // Explicit arg/return types below aren't decoration: `vi.fn(impl)` infers
  // its call signature from the INITIAL implementation, so a later
  // `.mockResolvedValue({...})`/`.mockImplementation(...)` with a different
  // arity or a non-`null` shape does not widen it — it silently fails to
  // typecheck at the CALL SITE instead (`tsc` catches this; `vitest` does
  // not, since it strips types). Every mock a test later reconfigures gets a
  // signature wide enough for that reconfiguration up front.
  getConversation: vi.fn(
    async (..._args: unknown[]): Promise<Record<string, unknown> | null> => null,
  ),
  findAssistantTurn: vi.fn(async (..._args: unknown[]): Promise<unknown | null> => null),
  createConversation: vi.fn(async () => ({ id: 'conv-opaque-uuid-1234' })),
  touchConversation: vi.fn(async () => {}),
  appendMessage: vi.fn(async (..._args: [unknown, Record<string, unknown>]) => {}),
  upsertUserTurn: vi.fn(async () => {}),
  listMessages: vi.fn(async (): Promise<Record<string, unknown>[]> => []),
  listRecentMessages: vi.fn(async (..._args: unknown[]): Promise<Record<string, unknown>[]> => []),
  buildCoachTools: vi.fn((_args: { collect: (envelope: unknown) => void }) => ({})),
  buildInstructions: vi.fn(() => 'system prompt'),
  auditNumericClaims: vi.fn(
    (
      ..._args: [string, Record<string, unknown>[], Record<string, unknown>[]?, number[]?]
    ): { text: string; value: number }[] => [],
  ),
  collectNumbers: vi.fn((..._args: unknown[]): number[] => []),
  // Set by `createUIMessageStream`'s mock implementation on every `execute`
  // call, so tests can assert on what was written to the wire.
  lastWriter: null as { write: ReturnType<typeof vi.fn>; merge: ReturnType<typeof vi.fn> } | null,
  // Overridable per test — the assistant `UIMessage` handed to `onFinish`.
  // Defaults to a plain grounded-looking answer for the pre-existing
  // observability suite, which does not care about its exact shape.
  onFinishAssistantParts: null as unknown[] | null,
}));

vi.mock('@sentry/nextjs', () => ({
  setConversationId: mocks.setConversationId,
}));

// The route drives its whole turn through `ai`'s createUIMessageStream —
// this fake immediately runs `execute` (capturing the streamText call) then
// `onFinish`, simulating a turn that streams and completes.
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
    mocks.lastWriter = fakeWriter;
    await opts.execute({ writer: fakeWriter });
    if (opts.onFinish) {
      await opts.onFinish({
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            parts: mocks.onFinishAssistantParts ?? [{ type: 'text', text: 'Here is your answer.' }],
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
// The real `ToolEnvelope` zod schema (and everything else in the module) is
// kept: `priorTurnEvidence` (route.ts) validates stored evidence with it, and
// a test asserting that a malformed envelope is dropped rather than crashing
// the turn needs that validation to actually run. Only the two audit
// functions — whose own behaviour belongs to chat-provenance.test.ts — are
// swapped for controllable mocks.
vi.mock('@/lib/coachhelm/v3/chat/provenance', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/coachhelm/v3/chat/provenance')>();
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
vi.mock('@/lib/coachhelm/v3/chat/ui-parts', () => ({
  hasPersistableAssistantContent: () => true,
  publishableParts: (parts: unknown[]) => parts,
  isIncompleteToolPart: (part: { type?: string; state?: unknown }) =>
    typeof part?.type === 'string' &&
    part.type.startsWith('tool-') &&
    (part.state === 'input-streaming' || part.state === 'input-available'),
}));
vi.mock('@/lib/coachhelm/v3/llm/chat-call-row', () => ({ buildChatLlmCallRow: vi.fn(() => ({})) }));

import { POST } from './route';

type FakeChunk = Record<string, unknown>;

/** A `toUIMessageStream()` stand-in that yields exactly the given chunks. */
function fakeUiMessageStream(chunks: FakeChunk[]): AsyncIterable<FakeChunk> {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
}

/** A well-formed single-step turn: one text part, then a clean finish. */
function minimalUiMessageStream(text = 'Hello.'): AsyncIterable<FakeChunk> {
  return fakeUiMessageStream([
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: text },
    { type: 'text-end', id: 't1' },
    { type: 'finish' },
  ]);
}

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

/** All required fields of a `Measurement` (provenance.ts), minus overrides. */
function makeMeasurement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    metric_id: 'putts_per_round',
    metric_label: 'Putts per round',
    unit: 'count',
    value: 30,
    entity: { kind: 'player', id: 'player-1', label: 'Test Player' },
    window_start: '2026-01-01',
    window_end: '2026-01-31',
    sample_size: 10,
    sample_unit: 'rounds',
    as_of: '2026-02-01T00:00:00.000Z',
    coverage: 'complete',
    coverage_note: null,
    source: 'rounds',
    method: 'avg',
    denominator: null,
    benchmark: null,
    direction: null,
    ...overrides,
  };
}

/** All required fields of a `ToolEnvelope` (provenance.ts), minus overrides. */
function makeEnvelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    summary: 'test evidence',
    measurements: [makeMeasurement()],
    series: [],
    coverage: 'complete',
    coverage_note: null,
    as_of: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

function priorAssistantRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'prior-1',
    conversation_id: '11111111-1111-4111-8111-111111111111',
    role: 'assistant',
    content: 'Earlier answer.',
    tool_calls: null,
    tool_results: null,
    cost_usd: null,
    created_at: '2026-02-01T00:00:00.000Z',
    client_turn_id: 'turn-0',
    status: 'complete',
    ui_parts: [
      {
        type: 'data-evidence',
        id: 'ev-1',
        data: { tool: 'get_recent_rounds', envelope: makeEnvelope() },
      },
    ],
    ...overrides,
  };
}

describe('POST /coachhelm/v3/chat/stream — Sentry AI observability', () => {
  beforeEach(() => {
    mocks.setConversationId.mockClear();
    mocks.recordAi.mockClear();
    mocks.streamText.mockReset();
    mocks.createUIMessageStream.mockClear();
    mocks.auditNumericClaims.mockReset().mockReturnValue([]);
    mocks.collectNumbers.mockReset().mockReturnValue([]);
    mocks.appendMessage.mockClear();
    mocks.logServerEvent.mockClear();
    mocks.getConversation.mockReset().mockResolvedValue(null);
    mocks.findAssistantTurn.mockReset().mockResolvedValue(null);
    mocks.listRecentMessages.mockReset().mockResolvedValue([]);
    mocks.buildCoachTools.mockReset().mockReturnValue({});
    mocks.onFinishAssistantParts = null;
    mocks.lastWriter = null;
  });

  it('opts streamText into telemetry with recordInputs/recordOutputs explicitly false', async () => {
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 500, outputTokens: 120 }),
      toUIMessageStream: () => minimalUiMessageStream(),
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
      toUIMessageStream: () => minimalUiMessageStream(),
    }));

    await runPostAndSettle(baseBody);

    expect(mocks.setConversationId).toHaveBeenCalledWith('conv-opaque-uuid-1234');
  });

  it('records helm.ai.* success once the turn completes', async () => {
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 500, outputTokens: 120 }),
      toUIMessageStream: () => minimalUiMessageStream(),
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
        toUIMessageStream: () => minimalUiMessageStream(),
      };
    });

    await runPostAndSettle(baseBody);

    const failureCall = mocks.recordAi.mock.calls.find((c) => c[0]?.outcome === 'failure');
    expect(failureCall).toBeDefined();
    expect(failureCall![0]).toMatchObject({ feature: 'coachhelm_chat', outcome: 'failure' });
  });
});

/**
 * Review of PR #1975 (2026-09-22) MUST-FIX #1 & #2. Before this suite existed
 * the route's own tests stubbed `toUIMessageStream()` with an empty
 * generator (see git history), so none of `execute`'s grounding-audit logic
 * — the code these bugs actually lived in — ran under test at all.
 */
describe('POST /coachhelm/v3/chat/stream — grounding audit over the full stream', () => {
  beforeEach(() => {
    mocks.setConversationId.mockClear();
    mocks.recordAi.mockClear();
    mocks.streamText.mockReset();
    mocks.createUIMessageStream.mockClear();
    mocks.auditNumericClaims.mockReset().mockReturnValue([]);
    mocks.collectNumbers.mockReset().mockReturnValue([]);
    mocks.appendMessage.mockClear();
    mocks.logServerEvent.mockClear();
    mocks.getConversation.mockReset().mockResolvedValue(null);
    mocks.findAssistantTurn.mockReset().mockResolvedValue(null);
    mocks.listRecentMessages.mockReset().mockResolvedValue([]);
    mocks.buildCoachTools.mockReset().mockReturnValue({});
    mocks.onFinishAssistantParts = null;
    mocks.lastWriter = null;
  });

  it('audits the FULL multi-step text, not just the final step (MUST-FIX #1)', async () => {
    // Step 1 writes a number; step 2's own text carries none of it. The old
    // code audited `result.text` — the AI SDK's final-step-only getter — so
    // a fabrication planted in an EARLIER step was invisible to it.
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 100, outputTokens: 50 }),
      toUIMessageStream: () =>
        fakeUiMessageStream([
          { type: 'text-start', id: 's1' },
          { type: 'text-delta', id: 's1', delta: "Step one says his make rate is 71%. " },
          { type: 'text-end', id: 's1' },
          { type: 'text-start', id: 's2' },
          { type: 'text-delta', id: 's2', delta: 'Final step text mentions nothing numeric.' },
          { type: 'text-end', id: 's2' },
          { type: 'finish' },
        ]),
    }));
    mocks.auditNumericClaims.mockImplementation((text: string) =>
      text.includes('71%') ? [{ text: '71%', value: 71 }] : [],
    );

    await runPostAndSettle(baseBody);

    // The audited string must contain BOTH steps' text.
    const auditedText = mocks.auditNumericClaims.mock.calls[0]![0];
    expect(auditedText).toContain('71%');
    expect(auditedText).toContain('Final step text mentions nothing numeric.');

    // The flagged fabrication is stored, not silently passed through.
    const persisted = mocks.appendMessage.mock.calls[0]![1];
    expect(persisted.status).toBe('failed');
    expect(persisted.content as string).toContain(
      "could not be traced back to your program's data",
    );

    // The flag was written to the wire live, not only discovered on reload.
    const flagWrite = mocks.lastWriter!.write.mock.calls.find(
      (call) => (call[0] as FakeChunk).type === 'data-grounding-flag',
    );
    expect(flagWrite).toBeDefined();
  });

  it('never stores a turn complete when a provider error interrupted the stream (MUST-FIX #2)', async () => {
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 100, outputTokens: 10 }),
      toUIMessageStream: () =>
        fakeUiMessageStream([
          { type: 'text-start', id: 's1' },
          { type: 'text-delta', id: 's1', delta: 'Partial answer before it broke.' },
          { type: 'error', errorText: 'The model quota is exhausted.' },
          { type: 'finish' },
        ]),
    }));
    // No fabricated numbers at all — proves the failure is attributed to the
    // stream error, not to the (passing) numeric audit.
    mocks.auditNumericClaims.mockReturnValue([]);

    await runPostAndSettle(baseBody);

    const persisted = mocks.appendMessage.mock.calls[0]![1];
    expect(persisted.status).toBe('failed');
    expect(persisted.content as string).toContain('Partial answer before it broke.');
    // Not the numeric-fabrication note — a stream error is a different story.
    expect(persisted.content as string).not.toContain(
      "could not be traced back to your program's data",
    );
    // The inline error chunk itself was still forwarded to the client.
    const errorWrite = mocks.lastWriter!.write.mock.calls.find(
      (call) => (call[0] as FakeChunk).type === 'error',
    );
    expect(errorWrite).toBeDefined();
    // The ungrounded-numbers flag must NOT fire on top of a stream error.
    const flagWrite = mocks.lastWriter!.write.mock.calls.find(
      (call) => (call[0] as FakeChunk).type === 'data-grounding-flag',
    );
    expect(flagWrite).toBeUndefined();
  });

  it('never stores a turn complete when the connection drops before a finish chunk (abort)', async () => {
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 50, outputTokens: 5 }),
      toUIMessageStream: () =>
        fakeUiMessageStream([
          { type: 'text-start', id: 's1' },
          { type: 'text-delta', id: 's1', delta: 'Still thinking about the answer' },
          // No `finish` chunk — the stream simply ends, as it would if the
          // client disconnected mid-generation.
        ]),
    }));
    mocks.auditNumericClaims.mockReturnValue([]);

    await runPostAndSettle(baseBody);

    const persisted = mocks.appendMessage.mock.calls[0]![1];
    expect(persisted.status).toBe('failed');
    expect(persisted.content as string).toContain('Still thinking about the answer');
  });

  it('orders the wire: the grounding flag is written before the finish chunk, which is written last', async () => {
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 10 }),
      toUIMessageStream: () =>
        fakeUiMessageStream([
          { type: 'text-start', id: 's1' },
          { type: 'text-delta', id: 's1', delta: 'His make rate is 71%.' },
          { type: 'text-end', id: 's1' },
          { type: 'finish' },
        ]),
    }));
    mocks.auditNumericClaims.mockReturnValue([{ text: '71%', value: 71 }]);

    await runPostAndSettle(baseBody);

    const calls = mocks.lastWriter!.write.mock.calls.map((call) => (call[0] as FakeChunk).type);
    const flagIndex = calls.indexOf('data-grounding-flag');
    const finishIndex = calls.indexOf('finish');
    expect(flagIndex).toBeGreaterThanOrEqual(0);
    expect(finishIndex).toBe(calls.length - 1);
    expect(flagIndex).toBeLessThan(finishIndex);
  });

  it('seeds the audit with team-scoped evidence already shown to the coach, even on a zero-tool-call turn', async () => {
    // Team/round-level ("shared") evidence carries no cross-player risk, so
    // it must carry over unconditionally — including on a turn where the
    // model makes no fresh tool call at all (`buildCoachTools` below returns
    // `{}`, so `collect` is never invoked). This is the shared-evidence
    // counterpart to the player-scoped Alice/Bob test below: same zero-tool
    // shape, but nothing here depends on knowing which player is in play.
    mocks.getConversation.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      coach_id: 'coach-1',
      title: 'Existing',
      pinned: false,
      archived_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    mocks.listRecentMessages.mockResolvedValue([
      priorAssistantRow({
        ui_parts: [
          {
            type: 'data-evidence',
            id: 'ev-1',
            data: {
              tool: 'get_team_stats',
              envelope: makeEnvelope({
                measurements: [
                  makeMeasurement({ entity: { kind: 'team', id: 'team-1', label: 'Test Team' } }),
                ],
              }),
            },
          },
        ],
      }),
      // A malformed / legacy envelope alongside a valid one — must be
      // dropped, not crash the turn (review point 5).
      priorAssistantRow({
        id: 'prior-2',
        ui_parts: [
          { type: 'data-evidence', id: 'ev-2', data: { tool: 'legacy', envelope: { summary: 'bad' } } },
        ],
      }),
    ]);
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 10 }),
      toUIMessageStream: () => minimalUiMessageStream('You had 30 putts per round.'),
    }));
    mocks.auditNumericClaims.mockReturnValue([]);

    await expect(
      runPostAndSettle({
        conversation_id: '11111111-1111-4111-8111-111111111111',
        messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'And now?' }] }],
        client_turn_id: 'turn-2',
      }),
    ).resolves.toBeUndefined();

    const seededMeasurements = mocks.auditNumericClaims.mock.calls[0]![1];
    expect(seededMeasurements).toEqual(
      expect.arrayContaining([expect.objectContaining({ metric_id: 'putts_per_round', value: 30 })]),
    );
  });

  it('does NOT seed player-scoped prior evidence on a zero-tool-call turn about a different player (Alice/Bob)', async () => {
    // Production shape this guards against: turn 1 fetches Alice's putts
    // (30/round); turn 2 asks about Bob and the model answers entirely from
    // memory — no fresh tool call this turn, so `currentTurnPlayerIds` is
    // empty. The old code's `allPlayerIds.size <= 1` check collapsed to just
    // `deferred`'s one tracked player (Alice) and folded her number in
    // unconditionally, so a claim of "Bob's putts per round is 30" audited
    // as grounded — Alice's number silently "supported" a claim about Bob.
    // With zero fresh player ids this turn, deferred must be dropped
    // entirely, not folded in just because it happens to name only one
    // player.
    mocks.getConversation.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      coach_id: 'coach-1',
      title: 'Existing',
      pinned: false,
      archived_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    mocks.listRecentMessages.mockResolvedValue([
      priorAssistantRow({
        ui_parts: [
          {
            type: 'data-evidence',
            id: 'ev-alice',
            data: {
              tool: 'get_recent_rounds',
              envelope: makeEnvelope({
                measurements: [
                  makeMeasurement({
                    value: 30,
                    entity: { kind: 'player', id: 'alice', label: 'Alice' },
                  }),
                ],
              }),
            },
          },
        ],
      }),
    ]);
    // This turn makes no fresh tool call at all — the model answers from
    // memory, exactly like the production repro.
    mocks.buildCoachTools.mockReturnValue({});
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 10 }),
      toUIMessageStream: () => minimalUiMessageStream("Bob's putts per round is 30."),
    }));
    // The real auditNumericClaims would flag "30" as unsupported once Alice's
    // measurement is correctly excluded; asserting on what was SEEDED (not
    // relying on the mocked audit's own verdict) is what actually pins the
    // fix — but also flip the mock to prove the flag comes out the other end.
    mocks.auditNumericClaims.mockImplementation((_text: string, measurements: unknown[]) =>
      (measurements as { value: number }[]).some((m) => m.value === 30)
        ? []
        : [{ text: '30', value: 30 }],
    );

    await runPostAndSettle({
      conversation_id: '11111111-1111-4111-8111-111111111111',
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: "How's Bob doing?" }] }],
      client_turn_id: 'turn-2',
    });

    const seededMeasurements = mocks.auditNumericClaims.mock.calls[0]![1] as { value: number }[];
    expect(seededMeasurements.some((m) => m.value === 30)).toBe(false);

    const persisted = mocks.appendMessage.mock.calls[0]![1];
    expect(persisted.status).toBe('failed');
  });

  it('drops player-scoped prior evidence when the recent window covers more than one player', async () => {
    mocks.getConversation.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      coach_id: 'coach-1',
      title: 'Existing',
      pinned: false,
      archived_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    mocks.listRecentMessages.mockResolvedValue([
      priorAssistantRow({
        id: 'prior-a',
        ui_parts: [
          {
            type: 'data-evidence',
            id: 'ev-a',
            data: {
              tool: 'get_recent_rounds',
              envelope: makeEnvelope({
                measurements: [
                  makeMeasurement({
                    value: 30,
                    entity: { kind: 'player', id: 'player-1', label: 'Player One' },
                  }),
                ],
              }),
            },
          },
        ],
      }),
      priorAssistantRow({
        id: 'prior-b',
        ui_parts: [
          {
            type: 'data-evidence',
            id: 'ev-b',
            data: {
              tool: 'get_recent_rounds',
              envelope: makeEnvelope({
                measurements: [
                  makeMeasurement({
                    value: 99,
                    entity: { kind: 'player', id: 'player-2', label: 'Player Two' },
                  }),
                ],
              }),
            },
          },
        ],
      }),
    ]);
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 10 }),
      toUIMessageStream: () => minimalUiMessageStream('Comparing the two.'),
    }));
    mocks.auditNumericClaims.mockReturnValue([]);

    await runPostAndSettle({
      conversation_id: '11111111-1111-4111-8111-111111111111',
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Compare them.' }] }],
      client_turn_id: 'turn-2',
    });

    const seededMeasurements = mocks.auditNumericClaims.mock.calls[0]![1];
    // Neither player's number should have been carried over: this route
    // cannot tell which one the current question is about, so a claim about
    // player B must not be waved through by a real number about player A.
    expect(seededMeasurements.some((m) => m.value === 30)).toBe(false);
    expect(seededMeasurements.some((m) => m.value === 99)).toBe(false);
  });

  it('drops single-player prior evidence when THIS turn is about a different player', async () => {
    // A stricter version of the test above: the prior-turn WINDOW itself only
    // ever saw one player (player-1), which the window-only check would have
    // waved through. The current turn's own fresh tool call is about a
    // DIFFERENT player (player-2) — the combined player set is what actually
    // decides safety, and it must still drop the carried-over number.
    mocks.getConversation.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      coach_id: 'coach-1',
      title: 'Existing',
      pinned: false,
      archived_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    mocks.listRecentMessages.mockResolvedValue([
      priorAssistantRow({
        id: 'prior-a',
        ui_parts: [
          {
            type: 'data-evidence',
            id: 'ev-a',
            data: {
              tool: 'get_recent_rounds',
              envelope: makeEnvelope({
                measurements: [
                  makeMeasurement({
                    value: 30,
                    entity: { kind: 'player', id: 'player-1', label: 'Player One' },
                  }),
                ],
              }),
            },
          },
        ],
      }),
    ]);
    // Simulate this turn's own tool call (normally invoked from inside
    // `execute`, mid-agent-loop) landing evidence about a DIFFERENT player
    // via the same `collect` closure the route wires into `buildCoachTools`.
    mocks.buildCoachTools.mockImplementation(({ collect }) => {
      collect(
        makeEnvelope({
          measurements: [
            makeMeasurement({
              value: 45,
              entity: { kind: 'player', id: 'player-2', label: 'Player Two' },
            }),
          ],
        }),
      );
      return {};
    });
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 10 }),
      toUIMessageStream: () => minimalUiMessageStream('How is player two doing?'),
    }));
    mocks.auditNumericClaims.mockReturnValue([]);

    await runPostAndSettle({
      conversation_id: '11111111-1111-4111-8111-111111111111',
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'How is player two?' }] }],
      client_turn_id: 'turn-2',
    });

    const seededMeasurements = mocks.auditNumericClaims.mock.calls[0]![1];
    // player-1's carried-over 30 must not be present: this turn is about
    // player-2. player-2's own fresh 45 (this turn's own tool call) IS
    // expected to be present — only the CROSS-player carryover is dropped.
    expect(seededMeasurements.some((m) => m.value === 30)).toBe(false);
    expect(seededMeasurements.some((m) => m.value === 45)).toBe(true);
  });

  it('drops an entity-less (detail-only) prior envelope alongside player-scoped ones when the window covers more than one player', async () => {
    // `get_player_insights` returns `measurements: []`/`series: []` with
    // every figure inside free-form `detail` — the envelope's own shape has
    // no `Measurement`/`MeasurementSeries` entity at all, so it cannot say
    // which player it is about. Treating that as "safe, like team-level
    // evidence" (the pre-fix behaviour) would let it ride along unconditionally
    // even once the window shows more than one player is genuinely in play.
    //
    // Note the limit of what "count the TAGGED players" can catch: if this
    // insight were the ONLY other envelope in the window (no second tagged
    // player), nothing here could tell it apart from one about the single
    // player already in scope. This test exercises the case the fix DOES
    // cover — at least two distinct tagged players present — not that
    // narrower, undetectable one.
    mocks.getConversation.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      coach_id: 'coach-1',
      title: 'Existing',
      pinned: false,
      archived_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    mocks.listRecentMessages.mockResolvedValue([
      priorAssistantRow({
        id: 'prior-insight',
        ui_parts: [
          {
            type: 'data-evidence',
            id: 'ev-insight',
            data: {
              tool: 'get_player_insights',
              envelope: makeEnvelope({
                measurements: [],
                series: [],
                detail: { insights: [{ content: "you're making 62% of putts from 5 ft" }] },
              }),
            },
          },
        ],
      }),
      priorAssistantRow({
        id: 'prior-player-1',
        ui_parts: [
          {
            type: 'data-evidence',
            id: 'ev-p1',
            data: {
              tool: 'get_recent_rounds',
              envelope: makeEnvelope({
                measurements: [
                  makeMeasurement({
                    value: 30,
                    entity: { kind: 'player', id: 'player-1', label: 'Player One' },
                  }),
                ],
              }),
            },
          },
        ],
      }),
      priorAssistantRow({
        id: 'prior-player-2',
        ui_parts: [
          {
            type: 'data-evidence',
            id: 'ev-p2',
            data: {
              tool: 'get_recent_rounds',
              envelope: makeEnvelope({
                measurements: [
                  makeMeasurement({
                    value: 99,
                    entity: { kind: 'player', id: 'player-2', label: 'Player Two' },
                  }),
                ],
              }),
            },
          },
        ],
      }),
    ]);
    mocks.collectNumbers.mockReturnValue([62, 5]);
    mocks.streamText.mockImplementation(() => ({
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 10 }),
      toUIMessageStream: () => minimalUiMessageStream('Comparing insight and rounds.'),
    }));
    mocks.auditNumericClaims.mockReturnValue([]);

    await runPostAndSettle({
      conversation_id: '11111111-1111-4111-8111-111111111111',
      messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Compare them.' }] }],
      client_turn_id: 'turn-2',
    });

    const seededMeasurements = mocks.auditNumericClaims.mock.calls[0]![1];
    const seededDetailNumbers = mocks.auditNumericClaims.mock.calls[0]![3] ?? [];
    expect(seededMeasurements.some((m) => m.value === 30 || m.value === 99)).toBe(false);
    expect(seededDetailNumbers).not.toEqual(expect.arrayContaining([62]));
  });
});
