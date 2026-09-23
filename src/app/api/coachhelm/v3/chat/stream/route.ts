/**
 * ============================================================================
 * CoachHelm chat — streaming endpoint (AI SDK 7 UI message stream)
 * ----------------------------------------------------------------------------
 * Replaces the blocking POST that returned a finished JSON body. The client now
 * renders text, progress, charts, approval cards and receipts as they arrive.
 *
 * Everything load-bearing from the previous route is preserved and, where it
 * was weak, strengthened:
 *
 *   auth + ownership   the coach is resolved from the session; the conversation
 *                      must belong to them; RLS backs both.
 *   idempotency        an unchanged `client_turn_id` returns the stored turn
 *                      instead of re-running the (paid) model.
 *   budget             the pre-flight gate runs BEFORE both the conversation
 *                      row is created and the user turn is appended, so an
 *                      exhausted budget leaves no orphan of either.
 *   cost logging       token usage lands in `golf_coachhelm_llm_calls` and the
 *                      day's running spend, from the stream's finish callback.
 *   gateway            provider selection stays behind one abstraction.
 *   grounding          upgraded from "did a tool run" to auditing the finished
 *                      text against the measurements the turn actually produced.
 *   durability         UI parts are persisted, so a reload reproduces the
 *                      charts and receipts rather than only the prose.
 * ========================================================================== */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  type LanguageModelUsage,
  type UIMessage,
} from 'ai';
import { resolveModelProvider } from '@/lib/ai/model-provider';
import { recordAi } from '@/lib/observability/metrics';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { classifyProviderFault, providerFaultSeverity } from '@/lib/admin/provider-fault';
import { drainCollapsedCount, shouldEmit } from '@/lib/admin/emit-throttle';
import {
  estimateCachedCostUsd,
  estimateCostUsd,
  MODEL_FOR_TASK,
} from '@/lib/coachhelm/v3/llm/types';
import { checkBudget, recordSpend } from '@/lib/coachhelm/v3/llm/budget';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import {
  CoachContextError,
  resolveCoachChatContext,
  type CoachChatContext,
} from '@/lib/coachhelm/v3/chat/context';
import { buildCoachTools, isConfirmRequired } from '@/lib/coachhelm/v3/chat/agent-tools';
import { buildInstructions } from '@/lib/coachhelm/v3/chat/instructions';
import {
  collectDates,
  collectNumbers,
  // Imported as a value, not `type`-only: `priorTurnEvidence` runs it as a
  // zod schema (`ToolEnvelope.safeParse`) to validate a stored `ui_parts`
  // blob before trusting its shape. The inferred type of the same name is
  // still available for annotations below — zod schema + `z.infer` sharing
  // one exported identifier is the standard pattern.
  ToolEnvelope,
  type Measurement,
  type MeasurementSeries,
} from '@/lib/coachhelm/v3/chat/provenance';
import {
  computeTurnVerdict,
  STREAM_INCOMPLETE_NOTE,
  verdictPartType,
  type TurnVerdict,
} from '@/lib/coachhelm/v3/chat/verdict';
import { buildSinglePlayerPacket } from '@/lib/coachhelm/v3/chat/claims-packet';
import { CLAIMS_OPEN, extractAndValidateClaimsSafe } from '@/lib/coachhelm/v3/llm/claims-block';
import type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';
import {
  appendMessage,
  createConversation,
  findAssistantTurn,
  getConversation,
  listMessages,
  listRecentMessages,
  touchConversation,
  upsertUserTurn,
} from '@/lib/coachhelm/v3/chat/persistence';
// `publishableParts` also drops dangling tool calls: storing one poisons the
// conversation permanently, because a reload rehydrates the thread from
// `ui_parts` and sends the orphaned `tool_use` back with no matching
// `tool_result`. Production shows the signature — one tool id rejected three
// times in ninety seconds as the coach retried.
import {
  hasPersistableAssistantContent,
  isIncompleteToolPart,
  publishableParts,
} from '@/lib/coachhelm/v3/chat/ui-parts';
import { describeError } from '@/lib/utils/describe-error';
import { buildChatLlmCallRow } from '@/lib/coachhelm/v3/llm/chat-call-row';

export const maxDuration = 120;

/** Worst-case one-turn spend, for the pre-flight gate only. */
const CHAT_TURN_COST_ESTIMATE_USD = estimateCostUsd(MODEL_FOR_TASK.coach_chat, 12000, 2500);

const Body = z.object({
  conversation_id: z.string().uuid().nullable().optional(),
  /** Full UI message list from `useChat`. */
  messages: z.array(z.unknown()).min(1),
  client_turn_id: z.string().min(1).max(128),
});

/**
 * What the coach is allowed to see when a turn fails.
 *
 * An upstream error can carry provider internals or echo prompt text, neither
 * of which belongs in a browser — but "An error occurred" is not a safer
 * alternative, it is just a less useful one. Name the cause when it is a class
 * the coach can act on.
 */
function sanitiseStreamError(error: unknown): string {
  // One shared classifier decides this, so the coach's wording, the schedule
  // importer's wording and the Bridge's severity cannot drift apart the way
  // three separate regexes let them.
  const fault = classifyProviderFault(error);
  if (fault) return fault.summary;
  return 'Something went wrong while answering. Please try again.';
}

/**
 * Log one failed turn.
 *
 * A provider/account fault is normalised before it is written: the raw text
 * carries the provider's own billing URL and, for the incomplete-tool-call
 * class, an opaque `toolu_…` id. Neither survives
 * `normalizeIncidentMessagePrefix` (mixed-case base62 is not a UUID and not
 * long hex), so every retry of one outage was landing in the Bridge as its own
 * incident. Naming a stable `errorCode` and an id-free message is what makes
 * them one row, and the emit throttle attaches how many were collapsed.
 */
function logStreamModelError(error: unknown): void {
  const fault = classifyProviderFault(error);
  const raw = describeError(error);

  // A failed call before the AI SDK returns usage carries no token counts —
  // recordAi's own doc comment: those distributions are only emitted when
  // supplied. helm.ai.request/failure still land either way.
  recordAi({
    feature: 'coachhelm_chat',
    action: 'v3.chat.stream.model',
    model: MODEL_FOR_TASK.coach_chat,
    provider: fault?.provider,
    outcome: 'failure',
    errorCode: fault?.code,
    runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
  });

  if (!fault) {
    void logServerError(`chat/stream: model error — ${raw}`, { action: 'v3.chat.stream.model' }, 'warning');
    return;
  }

  const throttleKey = `chat-stream-provider:${fault.code}`;
  if (!shouldEmit(throttleKey)) return;
  const collapsed = drainCollapsedCount(throttleKey);
  const { severity, skipSentry } = providerFaultSeverity(fault);

  void logServerError(
    `chat/stream: ${fault.summary}`,
    {
      action: 'v3.chat.stream.model',
      errorCode: fault.code,
      skipSentry,
      feature: 'coachhelm_chat',
      // The provider's verbatim text stays available for whoever has to act on
      // it — it just does not decide the grouping any more.
      extra: {
        providerFaultKind: fault.kind,
        provider: fault.provider,
        providerMessage: raw.slice(0, 500),
        ...(collapsed > 0 ? { collapsed_count: collapsed } : {}),
      },
    },
    severity,
  );
}

/**
 * How many of the conversation's most recent ASSISTANT turns
 * {@link priorTurnEvidence} draws carried-over evidence from — not messages.
 * A "turn" can span more than one stored row (an approval round-trip inserts
 * a second assistant message for the same exchange), so counting turns
 * rather than raw rows is what "the last few things the coach was told"
 * actually means; a flat row count skews toward whichever conversation
 * happens to have chattier tool/approval loops in its recent history.
 */
const PRIOR_EVIDENCE_ASSISTANT_TURN_LIMIT = 5;

/**
 * Row budget for the query backing {@link priorTurnEvidence}. Comfortably
 * covers `PRIOR_EVIDENCE_ASSISTANT_TURN_LIMIT` turns even with a user message
 * and an approval round-trip between each one, and stays far under
 * PostgREST's 1,000-row cap (`.claude/rules/database.md`) regardless of how
 * long the conversation has grown — see `listRecentMessages`.
 */
const PRIOR_EVIDENCE_ROW_LIMIT = 40;

/**
 * Evidence already shown to the coach earlier in THIS conversation.
 *
 * The claim audit used to see only the current request's fresh tool calls
 * (`collect`, below). A model does not always re-call a tool for data it
 * already has in its own context — production, 2026-09-10: a coach asked two
 * questions about the same player 22 seconds apart; the second answer
 * restated the first answer's round-by-round table verbatim (77, 35, -3.38…)
 * with NO tool call of its own. Every number in it was real and had already
 * been shown to the coach, but that request's audit had never seen any of it
 * and discarded the whole answer as fabricated.
 *
 * Read from THIS SERVER'S OWN persisted `ui_parts` (`listRecentMessages`),
 * never from the client-sent `uiMessages` thread: a `data-evidence` part is
 * written server-side, after this route itself ran the tool (see
 * `evidence()` in `buildCoachTools`), and nothing else ever produces one.
 * Seeding the supported set from the client's replayed payload instead would
 * let a tampered request forge "evidence" for whatever number it wanted.
 *
 * Two more things a NUMBER passing through here does not automatically
 * earn:
 *
 *  - A believable shape. This is JSON that round-tripped through the
 *    database, not something `execute` just built and validated a moment
 *    ago — a legacy row predating a schema field, or a forged `ui_parts`
 *    payload (the coach can edit their own via RLS — `chat_messages_coach_
 *    only` is FOR ALL, a known, accepted, self-only risk; see the PR
 *    description), could otherwise 500 the whole turn the moment the audit
 *    tries to iterate a `series[].points` that isn't an array. Every
 *    envelope is re-validated with `ToolEnvelope.safeParse` and dropped,
 *    not thrown on, when it fails.
 *  - The right player. A number that measured player A is not support for a
 *    claim about player B just because both appeared in the same
 *    conversation. Two things follow, and neither is decidable from the
 *    prior messages alone — both are resolved by the caller (`POST`, below)
 *    once THIS turn's own fresh evidence is also known:
 *      1. Evidence with a `Measurement`/`MeasurementSeries` entity that is
 *         NOT a player (team/round) carries no attribution risk at all and
 *         is returned as `shared`, unconditionally safe to use.
 *      2. Everything else — evidence tied to a specific player, AND
 *         evidence with no entity at all (`get_player_insights` puts
 *         everything in free-form `detail` with no `Measurement` wrapper,
 *         so its own shape cannot say who it is about) — is returned as
 *         `deferred`, alongside every distinct player id actually seen.
 *         The caller only folds `deferred` in once it can check that
 *         id set against the player(s) THIS turn's own fresh tool calls are
 *         actually about; a number about a player never mentioned this turn
 *         must not silently support a claim about whichever player IS being
 *         asked about now.
 */
function priorTurnEvidence(messages: readonly ChatMessage[], timezone: string): {
  shared: { measurements: Measurement[]; series: MeasurementSeries[]; detailNumbers: number[]; detailDates: string[] };
  deferred: {
    measurements: Measurement[];
    series: MeasurementSeries[];
    detailNumbers: number[];
    detailDates: string[];
    playerIds: Set<string>;
  };
} {
  const shared = {
    measurements: [] as Measurement[],
    series: [] as MeasurementSeries[],
    detailNumbers: [] as number[],
    detailDates: [] as string[],
  };
  const deferred = {
    measurements: [] as Measurement[],
    series: [] as MeasurementSeries[],
    detailNumbers: [] as number[],
    detailDates: [] as string[],
    playerIds: new Set<string>(),
  };

  const assistantTurns = messages
    .filter((m) => m.role === 'assistant')
    .slice(-PRIOR_EVIDENCE_ASSISTANT_TURN_LIMIT);

  for (const message of assistantTurns) {
    if (!Array.isArray(message.ui_parts)) continue;
    for (const part of message.ui_parts) {
      if (!part || typeof part !== 'object') continue;
      const { type, data } = part as { type?: unknown; data?: { envelope?: unknown } };
      if (type !== 'data-evidence' || !data?.envelope) continue;
      const parsed = ToolEnvelope.safeParse(data.envelope);
      if (!parsed.success) continue;
      const envelope = parsed.data;

      const entities = [...envelope.measurements, ...envelope.series].map((m) => m.entity);
      const playerIdsHere = entities.filter((e) => e.kind === 'player').map((e) => e.id);
      // No entity anywhere in the envelope is treated the same as a player
      // entity, not the same as team/round: its scope is genuinely unknown,
      // not positively team-level.
      const target = playerIdsHere.length > 0 || entities.length === 0 ? deferred : shared;

      target.measurements.push(...envelope.measurements);
      target.series.push(...envelope.series);
      if (envelope.detail !== undefined) {
        target.detailNumbers.push(...collectNumbers(envelope.detail));
        target.detailDates.push(...collectDates(envelope.detail, timezone));
      }
      for (const id of playerIdsHere) deferred.playerIds.add(id);
    }
  }

  return { shared, deferred };
}

export async function POST(req: NextRequest) {
  let ctx: CoachChatContext;
  const supabase = await createClient();

  try {
    ctx = await resolveCoachChatContext(supabase);
  } catch (err) {
    if (err instanceof CoachContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    await logServerError(`chat/stream: context resolution failed`, { action: 'v3.chat.stream.ctx' });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const uiMessages = parsed.data.messages as UIMessage[];
  const clientTurnId = parsed.data.client_turn_id;
  const lastUser = [...uiMessages].reverse().find((m) => m.role === 'user');
  const userText = textOf(lastUser);

  // Is this a new question, or the continuation of one the coach already asked?
  //
  // When an action is approved, the client resubmits the SAME thread so the
  // suspended tool call can run. There is no new user message in it — the
  // approval rides on the assistant message as a tool-approval-response part, so
  // the last entry is the assistant, not the coach.
  //
  // `lastUser` still resolves to the original question in that case, which is
  // correct for the model (it needs the full thread) and wrong for persistence:
  // the resubmit carries a fresh `client_turn_id`, so the upsert's
  // (conversation_id, role, client_turn_id) conflict target does not match the
  // stored turn and it would INSERT the coach's question a second time. Every
  // approved action would leave a duplicate of the question above it.
  const isApprovalContinuation = uiMessages[uiMessages.length - 1]?.role !== 'user';

  // Bound request concurrency at the door, independent of the dollar gate
  // below — this is what actually shrinks the check-then-act race window on
  // the daily budget (checkBudget/recordSpend are a read-then-upsert pair,
  // not an atomic reservation; see budget.ts).
  const rl = await checkRateLimit(`coachhelm:chat:${ctx.coach_id}`, RATE_LIMITS.API_GENERAL);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  }

  // ── Conversation: load (and verify ownership), or resolve the id to create ──
  let conversationId = parsed.data.conversation_id ?? null;
  let needsNewConversation = false;
  if (conversationId) {
    const existing = await getConversation(supabase, conversationId);
    if (!existing || existing.coach_id !== ctx.coach_id) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }
    // Idempotency: an already-answered turn is returned, not re-run.
    const done = await findAssistantTurn(supabase, conversationId, clientTurnId);
    if (done) {
      const messages = await listMessages(supabase, conversationId);
      return NextResponse.json({ conversation_id: conversationId, replayed: true, messages });
    }
  } else {
    needsNewConversation = true;
  }

  // ── Budget gate BEFORE anything externally visible happens ──────────────
  // The conversation row itself must not be created before this passes —
  // creating it first left an orphaned `golf_coachhelm_chat_conversations`
  // row (no messages) on every gated request.
  const admin = createAdminClient();
  const gate = await checkBudget(admin, ctx.coach_id, CHAT_TURN_COST_ESTIMATE_USD);
  if (!gate.allowed) {
    // "Reached your daily limit" is the wrong sentence for a coach whose team
    // was switched off, and both are the wrong sentence for an account we
    // could not resolve at all. A coach who is told the wrong thing waits for
    // tomorrow instead of asking the one person who can fix it.
    const message =
      gate.fallback_reason === 'budget_unresolved'
        ? 'CoachHelm could not verify your program’s analysis settings. Contact support — this is not something waiting will fix.'
        : gate.fallback_reason === 'budget_disabled'
          ? 'AI analysis is switched off for your program. An administrator can turn it on in coaching settings.'
          : 'You have reached today’s analysis limit for your program. It resets tomorrow.';
    return NextResponse.json(
      { error: message, reason: gate.fallback_reason ?? 'budget_gated' },
      { status: 429 },
    );
  }

  if (needsNewConversation) {
    const created = await createConversation(supabase, {
      coach_id: ctx.coach_id,
      title: userText.slice(0, 60) || 'New conversation',
    });
    conversationId = created.id;
  }
  if (!conversationId) {
    await logServerError('chat/stream: conversation id unresolved after gate', {
      action: 'v3.chat.stream.conv',
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  if (userText && !isApprovalContinuation) {
    await upsertUserTurn(supabase, {
      conversation_id: conversationId,
      content: userText,
      client_turn_id: clientTurnId,
    });
  }

  // Provider selection stays behind one abstraction: the coach's own Anthropic
  // key when present, else the gateway model string. No provider name appears
  // in tool or UI code.
  //
  // Derived from MODEL_FOR_TASK rather than naming the model again. The two
  // used to be written out separately — 'anthropic/claude-sonnet-5' here and
  // 'claude-sonnet-5' there — so changing MODEL_FOR_TASK.coach_chat would have
  // moved the gateway path and left the direct path on the old model, with
  // nothing to catch the split. Everything downstream (cost estimate, telemetry,
  // the slow-first-token log) already keys off MODEL_FOR_TASK.coach_chat.
  const model = resolveModelProvider(MODEL_FOR_TASK.coach_chat);

  const startedAt = Date.now();
  let firstTokenMs: number | null = null;

  // Everything the turn measured, for the post-generation claim audit.
  const measurements: Measurement[] = [];
  const seriesAll: MeasurementSeries[] = [];
  // Numbers a tool returned in its structured `detail` — team averages, round
  // rows, RSVP counts. The model may legitimately cite these, so they count as
  // supported. See auditNumericClaims' `extraSupported`.
  const detailNumbers: number[] = [];
  // ISO dates reachable inside a tool's `detail` (an event's `starts_at`, a
  // round's `date`) — the model may restate one in non-ISO prose ("Aug 16",
  // "9/6/26"); see auditNumericClaims' `extraSupportedDates`.
  const detailDates: string[] = [];
  const collect = (envelope: ToolEnvelope) => {
    measurements.push(...envelope.measurements);
    seriesAll.push(...envelope.series);
    if (envelope.detail !== undefined) {
      detailNumbers.push(...collectNumbers(envelope.detail));
      detailDates.push(...collectDates(envelope.detail, ctx.timezone));
    }
  };

  // Seed the audit with evidence THIS conversation already produced (see
  // priorTurnEvidence's doc comment) — a fresh conversation has none to load.
  // `shared` (team/round-level) evidence is unconditionally safe and seeded
  // immediately; `deferred` (player-scoped, or of unknown scope) is held
  // back and only folded in from inside `execute`, once this turn's OWN
  // fresh evidence says which player(s) are actually in play — see the
  // `allPlayerIds` check below.
  let priorDeferred: {
    measurements: Measurement[];
    series: MeasurementSeries[];
    detailNumbers: number[];
    detailDates: string[];
    playerIds: Set<string>;
  } = { measurements: [], series: [], detailNumbers: [], detailDates: [], playerIds: new Set() };
  if (!needsNewConversation) {
    const priorMessages = await listRecentMessages(
      supabase,
      conversationId,
      PRIOR_EVIDENCE_ROW_LIMIT,
    );
    const prior = priorTurnEvidence(priorMessages, ctx.timezone);
    measurements.push(...prior.shared.measurements);
    seriesAll.push(...prior.shared.series);
    detailNumbers.push(...prior.shared.detailNumbers);
    detailDates.push(...prior.shared.detailDates);
    priorDeferred = prior.deferred;
  }

  const convId = conversationId;
  // Opaque, server-generated (gen_random_uuid() — golf_coachhelm_chat_conversations.id
  // default, prod_public_baseline.sql), never derived from coach_id/player
  // identity — safe to hand to Sentry as the AI conversation grouping key.
  // Ties every span/error/AI-observability event this turn produces back to
  // the same thread without exposing who the coach or their players are.
  Sentry.setConversationId(convId);
  // Captured in `execute` so `onFinish` can bill ACTUAL tokens, not the gate's
  // worst-case estimate. See recordTurnCost below.
  let usagePromise: Promise<{ inputTokens?: number; outputTokens?: number }> | null = null;
  // Computed in `execute`, once the full text is known — see the manual
  // stream-forwarding loop below — and reused by `onFinish` so the verdict
  // runs exactly once per turn and both places agree on it. `text` travels
  // alongside the verdict, not just the outcome: `onFinish` persists this
  // EXACT string rather than re-deriving its own from `assistant.parts`, so
  // the live affordance and the stored status/content can never quietly
  // diverge.
  //
  // Staying `null` past `execute` (never assigned) is itself meaningful, not
  // just "not computed yet": it means the client disconnected, or the
  // platform tore the function down, before generation ever reached a
  // verdict. `onFinish` treats a still-`null` verdict as rejected —
  // unconditionally, never re-running the numeric audit on whatever partial
  // text happened to accumulate — because "no verdict was ever computed" is
  // not the same claim as "the audit found nothing wrong." See
  // `computeTurnVerdict`'s doc comment.
  let turnVerdict: TurnVerdict | null = null;
  let turnText = '';

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const tools = buildCoachTools({ sb: supabase, ctx, conversationId: convId, writer, collect });

      const result = streamText({
        model,
        // A client disconnect should stop generation and spend, not just the
        // write side: the answer is discarded anyway once `onFinish` marks
        // the row `'failed'` (no verdict was ever computed — see
        // `turnVerdict`'s doc comment below), so paying the provider for
        // tokens nobody will read is pure waste (#1997 review, SHOULD-4).
        abortSignal: req.signal,
        // ── Prompt caching on the static prefix ─────────────────────────
        //
        // One turn is several model calls: the agent loop re-sends the system
        // prompt AND every tool definition on each step, and the ledger shows
        // what that costs — a turn's median input is 19,120 tokens while the
        // smallest single-step turn is 3,363. Most of the difference is the
        // same prefix, paid for again and again.
        //
        // A cache breakpoint on the system block covers the tool definitions
        // too (Anthropic orders the payload tools → system → messages and
        // caches everything before the breakpoint), so steps 2..N of a turn
        // read the whole prefix at a tenth of the input rate.
        //
        // This only works because `buildInstructions` is stable: it formats the
        // date to the DAY, not to an ISO timestamp. A prefix carrying
        // `new Date().toISOString()` would change on every request and could
        // never produce a cache hit — worth preserving deliberately if that
        // string is ever edited.
        instructions: {
          role: 'system',
          content: buildInstructions(ctx, new Date().toISOString()),
          providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } },
        },
        // Pass the tool set so tool parts from earlier turns convert correctly —
        // without it, a resumed approval loses the call it belongs to.
        //
        // We drop dangling tool calls (`input-streaming`/`input-available` —
        // see isIncompleteToolPart) OURSELVES, with the same predicate
        // `publishableParts` uses for persistence, rather than delegating to
        // the SDK's `ignoreIncompleteToolCalls` flag. The thread here is the
        // CLIENT's `useChat` state, not the database, so a server-side
        // persistence guard alone cannot save this request: the browser
        // resends whatever it is holding. Without filtering, one unresolved
        // call makes every subsequent turn in that thread fail upstream with
        // "Tool result is missing for tool call toolu_…" — there is no
        // matching `tool_result` block to pair it with, and the coach cannot
        // recover except by starting a new conversation.
        //
        // This used to rely on `ignoreIncompleteToolCalls: true` instead, on
        // the assumption the SDK's own filter left `approval-requested` (an
        // awaiting-coach call, not an abandoned one — the entire Confirm
        // flow) untouched. `ai` 7.0.79 changed that: its filter now keeps
        // only `approval-responded`/`output-available`/`output-error`/
        // `output-denied`, silently stripping `approval-requested` too and
        // reintroducing exactly the bug this file exists to fix, just for a
        // different state. Filtering with our own predicate first — already
        // proven correct and covered by chat-incomplete-tool-calls.test.ts —
        // makes this correctness independent of the SDK's internal state
        // list, which just changed under us once already.
        //
        // One state our predicate does NOT drop, unlike the SDK's retired
        // filter: an `output-available` part with `preliminary: true` — a
        // tool result from a still-streaming step, before the final value
        // lands. The SDK's own `convertToModelMessages` (index.js, the
        // `case "output-error": case "output-available":` branch) does not
        // special-case it either — a preliminary part converts to a full
        // `tool-result` content block same as a final one. That is safe here
        // ONLY because nothing in `buildCoachTools` (agent-tools.ts) can ever
        // produce one: every `execute` is a plain `async` function returning
        // a single value, never an async generator / multi-yield tool, which
        // is the only shape the SDK uses to emit `preliminary: true`. If a
        // future tool streams partial output this way, add
        // `(part.state === 'output-available' && part.preliminary === true)`
        // to `isIncompleteToolPart`'s drop condition before shipping it —
        // otherwise a preliminary result can precede the final one for the
        // same `toolCallId` and reintroduce this exact bug class.
        messages: await convertToModelMessages(
          uiMessages.map((m) => ({
            ...m,
            parts: m.parts.filter((p) => !isIncompleteToolPart(p)),
          })),
          { tools },
        ),
        tools,
        // Every mutating tool suspends for an explicit coach decision. This is
        // the gate the whole action framework rests on — a model cannot reach
        // a write, only an approval request.
        toolApproval: ({ toolCall }) => (isConfirmRequired(toolCall.toolName) ? 'user-approval' : 'not-applicable'),
        stopWhen: stepCountIs(8),
        onChunk: () => {
          if (firstTokenMs === null) firstTokenMs = Date.now() - startedAt;
        },
        onError: ({ error }) => {
          logStreamModelError(error);
        },
        // Sentry AI observability opt-in (vercelAIIntegration instruments
        // NOTHING for a call unless it itself sets isEnabled — Phase A
        // finding, docs/observability/SENTRY_PHASE_A_FINDINGS.md §(a)).
        // recordInputs/recordOutputs:false explicitly overrides the
        // integration's own global recordInputs/recordOutputs:true
        // (instrumentation.ts) at this specific call site — a coach chat
        // prompt/message can carry a player's first name (see
        // hero-narrative.ts's own pattern in the same Phase A finding) and
        // this app's own numeric-grounding tool-call payloads, neither of
        // which belongs in Sentry.
        experimental_telemetry: {
          isEnabled: true,
          functionId: 'coachhelm.chat',
          recordInputs: false,
          recordOutputs: false,
        },
      });

      usagePromise = result.usage;
      // `sendReasoning: false` keeps the model's private deliberation off the
      // wire entirely. It renders nowhere today, but "not rendered" is not the
      // requirement — the requirement is that it never reaches the browser,
      // where it sits in network responses and React state either way.
      // `onError` HAS to be passed here too — see why below.
      //
      // Forwarded chunk-by-chunk ourselves — accumulating every `text-delta`
      // as it passes through — rather than handed to `writer.merge` (see its
      // implementation: a `.getReader()` loop kicked off as a fire-and-forget
      // background promise). Two things follow from doing it this way that
      // `writer.merge` cannot give us: `execute` does not resolve, and the
      // response does not close, until every chunk has actually been sent;
      // and we get one deterministic point — after the loop, before
      // `execute` returns — to run the grounding audit on the text that was
      // ACTUALLY streamed and still speak into this same connection. N15:
      // the audit used to run only in `onFinish`, which cannot happen until
      // the stream has already finished sending — a coach watching the
      // answer stream in never saw the flag live, only on a later reload of
      // the thread.
      //
      // That text is NOT `result.text`. In `ai` 7.0.79, `StreamTextResult`'s
      // `text` getter resolves to `finalStep.text` — the LAST agent step's
      // text only (`node_modules/ai/dist/index.js`, the `StreamTextResult`
      // class). A tool-using turn is routinely more than one step (tool call
      // → tool result → more text → …, up to `stepCountIs(8)`), and the
      // coach sees every step's text concatenated, not just the last one.
      // Auditing `result.text` would silently exempt a fabricated number
      // written in an earlier step from ever being checked. Accumulating
      // `text-delta.delta` ourselves as each chunk is forwarded is exactly
      // the string the browser received, in the order it received it — and
      // it is the SAME string `onFinish` persists as `content` (see
      // `turnVerdict` above), so the live affordance and the stored status
      // can never audit two different things and disagree.
      //
      // A model failure happens INSIDE this merged stream, not inside the
      // outer `execute`, so the outer `createUIMessageStream.onError` never
      // sees it — `toUIMessageStream` falls back to the SDK default, and the
      // coach is shown the literal string "An error occurred." That is what
      // a coach saw in production while the account's model credit was
      // exhausted: six identical retries, each answered with four words that
      // named neither the cause nor anything they could do. The sanitised
      // message below already said "the model quota is exhausted"; it was
      // just never reaching the browser. `toUIMessageStream`'s own `onError`
      // (passed below) turns that failure into an inline `{type:'error'}`
      // chunk carrying the sanitised text, which this loop still forwards
      // like any other chunk — but a turn that produced one must never be
      // stored as a finished, verified answer just because the partial text
      // it managed to stream happened to pass the numeric audit. Likewise, a
      // dropped connection can end this stream with no `finish` chunk at
      // all; either signal marks the turn as never having completed.
      //
      // The `finish` chunk itself is held back and re-emitted last so a
      // rejected turn's verdict part still arrives before the message is
      // marked done, per the UI message stream protocol.
      //
      // `toUIMessageStream`'s deprecated method overload does not carry a
      // precise element type through to a `for await` loop; the SDK's own
      // `writer.write` parameter type is the source of truth for what a
      // chunk may be, so chunks are typed against THAT rather than
      // duplicating the SDK's chunk union here.
      type StreamChunk = Parameters<typeof writer.write>[0];
      const uiStream = result.toUIMessageStream({
        sendStart: true,
        sendFinish: true,
        sendReasoning: false,
        onError: sanitiseStreamError,
      }) as AsyncIterable<StreamChunk>;
      let finishChunk: StreamChunk | null = null;
      // The COMPLETE text the model streamed, claims block included — never
      // forwarded to the client as-is; only `extractAndValidateClaims`
      // (after this loop) reads it. `turnText`/the persisted `content` come
      // from ITS stripped output, not from this variable directly.
      let rawText = '';
      let streamErrored = false;
      // Addendum A7 slice 1: the model appends a `<<<CLAIMS>>>...` block
      // after its prose (instructions.ts's "Claims block" section) — a raw
      // JSON fragment a coach must never see live, in the persisted
      // `content`, or in a saved `ui_parts` text part. Withholding it here,
      // not just stripping it after the fact, is what keeps all three
      // honest: `execute` is the only place text ever reaches the writer.
      //
      // `pendingText` holds back up to `CLAIMS_OPEN.length - 1` trailing
      // characters of every otherwise-forwardable delta, in case the
      // opener is split across two chunks (a provider can flush a delta at
      // any byte boundary) — without this, forwarding a delta the instant
      // it arrives could send half of `<<<CLAIMS` before ever seeing the
      // rest. Once the opener is found, EVERYTHING from there on for this
      // text part is withheld, not just the matched substring.
      let pendingText = '';
      let claimsBlockStarted = false;
      let lastTextDeltaChunk: StreamChunk | null = null;
      for await (const chunk of uiStream) {
        const c = chunk as { type?: string; delta?: unknown };
        if (c.type === 'text-delta' && typeof c.delta === 'string') {
          rawText += c.delta;
          lastTextDeltaChunk = chunk;
          if (claimsBlockStarted) continue; // never forward more of the block
          pendingText += c.delta;
          const openIdx = pendingText.indexOf(CLAIMS_OPEN);
          if (openIdx !== -1) {
            claimsBlockStarted = true;
            const toForward = pendingText.slice(0, openIdx);
            if (toForward) writer.write({ ...chunk, delta: toForward } as StreamChunk);
            pendingText = '';
            continue;
          }
          const safeLen = Math.max(0, pendingText.length - (CLAIMS_OPEN.length - 1));
          if (safeLen > 0) {
            writer.write({ ...chunk, delta: pendingText.slice(0, safeLen) } as StreamChunk);
            pendingText = pendingText.slice(safeLen);
          }
          continue;
        }
        if (c.type === 'error') {
          streamErrored = true;
        }
        if (c.type === 'finish') {
          finishChunk = chunk;
          continue;
        }
        writer.write(chunk);
      }
      // No claims block ever started — the withheld tail was ordinary text
      // (the common case: most turns end after "…" with nothing to hold
      // back at all), so flush it now that we know it was never the start
      // of a delimiter.
      if (!claimsBlockStarted && pendingText && lastTextDeltaChunk) {
        writer.write({ ...lastTextDeltaChunk, delta: pendingText } as StreamChunk);
      }
      // The stream ended without ever emitting a `finish` chunk — the
      // connection was aborted mid-generation rather than completing
      // normally. Whatever text made it through is a fragment, not an
      // answer, however clean it audits.
      if (!finishChunk) streamErrored = true;

      // Fold in `priorDeferred` (player-scoped, or of unknown scope, prior
      // evidence) only now — `measurements`/`seriesAll` already carry every
      // fresh `Measurement`/`MeasurementSeries` THIS turn's own tool calls
      // produced (via `collect`, which has already run: tool execution
      // happens inside the `streamText` agent loop the forwarding loop above
      // just finished draining), so this is the first point where "which
      // player(s) is this turn actually about" is knowable. A prior turn's
      // number about a player never mentioned this turn must not be allowed
      // to "support" a claim about whichever player IS being discussed now.
      const currentTurnPlayerIds = new Set(
        [...measurements, ...seriesAll]
          .map((m) => m.entity)
          .filter((e) => e.kind === 'player')
          .map((e) => e.id),
      );
      // A turn with zero fresh player-scoped tool calls this turn (the model
      // answering entirely from memory, no new tool call) must not fold in
      // `deferred` at all — not even when exactly one player is on record
      // there. With `currentTurnPlayerIds` empty, `allPlayerIds` would
      // otherwise collapse to whichever single player `deferred` happens to
      // carry, and that player's number would silently "support" a claim
      // about a DIFFERENT player this turn never fetched anything for (e.g.
      // turn 1 fetches Alice's putts; turn 2 asks about Bob and answers from
      // memory — Alice's number must not ground a claim about Bob). Requiring
      // at least one fresh player id this turn is what lets us confirm the
      // deferred player is actually who's being discussed now.
      const allPlayerIds = new Set([...currentTurnPlayerIds, ...priorDeferred.playerIds]);
      if (currentTurnPlayerIds.size > 0 && allPlayerIds.size <= 1) {
        measurements.push(...priorDeferred.measurements);
        seriesAll.push(...priorDeferred.series);
        detailNumbers.push(...priorDeferred.detailNumbers);
        detailDates.push(...priorDeferred.detailDates);
      }

      // Addendum A7 slice 1: parse+validate the claims block against a
      // packet only when this turn's fresh measurements resolve to exactly
      // one player and one window (`buildSinglePlayerPacket` returns `null`
      // otherwise — a team/multi-player turn is judged by the checks above
      // only, same as before this gate existed). Either way `strippedText`
      // is the text with any claims block removed — see
      // `extractAndValidateClaims`'s own doc comment for why that holds
      // even when no packet is engaged.
      const claimsPacket = buildSinglePlayerPacket(measurements);
      const { strippedText, claims } = extractAndValidateClaimsSafe(rawText, claimsPacket);
      turnText = strippedText.trim();
      turnVerdict = computeTurnVerdict({
        streamComplete: !streamErrored,
        text: turnText,
        measurements,
        series: seriesAll,
        detailNumbers,
        // Rebase reconciliation (#1997 vs. a since-merged main commit): main
        // grew `auditNumericClaims` two more params (date-claim checking and
        // timezone-correct WINDOW/SERIES-POINT conversion) after this
        // module was written against the 4-arg shape. Threaded through here
        // so `computeTurnVerdict` gets the same accuracy the inline
        // pre-#1997 call on main had, instead of silently degrading to the
        // old UTC-only, no-date-check behavior (both are backward-
        // compatible optional params on `auditNumericClaims` itself — see
        // its own doc comment — so this is strictly additive, not a fix to
        // a broken call).
        detailDates,
        timezone: ctx.timezone,
        claims,
      });
      // A rejected verdict's note replaces the streamed text — not a note
      // appended alongside it — so ChatThread (live) and restoreUIMessages
      // (reload) both hide the text parts whenever this part is present. See
      // ChatThread.tsx's `MessageTurn` and restore.ts's per-row filter.
      if (turnVerdict.outcome === 'rejected') {
        writer.write({
          type: verdictPartType(turnVerdict.reason),
          id: 'turn-verdict',
          data: { note: turnVerdict.note },
        });
      }
      if (finishChunk) writer.write(finishChunk);
    },

    /**
     * Persist the finished turn.
     *
     * Both halves matter: `content` keeps the conversation replayable to the
     * model, and `ui_parts` keeps it reproducible for the coach. Storing only
     * the first is what made a reload throw away every chart.
     */
    onFinish: async ({ messages }) => {
      try {
        const assistant = [...messages].reverse().find((m) => m.role === 'assistant');
        if (!assistant) return;

        // Prefer the exact string `execute` streamed and verified — see
        // `turnVerdict`'s declaration above — over independently
        // reconstructing one from `assistant.parts` here, so the live
        // affordance and the persisted content/status can never disagree.
        // The `textOf(assistant)` fallback only matters when `turnVerdict`
        // is still null below.
        const text = turnVerdict ? turnText : textOf(assistant);

        // A turn that produced NOTHING must not be stored as an answer.
        //
        // `onFinish` fires on a failed turn too. With no guard it wrote a row
        // with empty content and `status: 'complete'` — a total failure was
        // recorded as a finished answer. Production has six of them, one per
        // retry, and each renders on reload as a blank assistant turn.
        //
        // A turn with no prose is not necessarily empty: an action proposal is
        // a card with no text. So the test is text OR a real data part —
        // `step-start` alone does not count as an answer.
        const hasContent = hasPersistableAssistantContent(assistant, text);
        if (!hasContent) return;

        // `execute` never reached its own verdict — the client disconnected,
        // or the platform tore the function down, before the stream
        // finished (see `handleUIMessageStreamFinish`'s TransformStream
        // `cancel()`, which calls `onFinish` early with whatever fragment of
        // `assistant.parts` made it into the OUTER stream by then). This is
        // NOT "the audit found nothing wrong" — there is no complete answer
        // to audit — so a still-null verdict here is unconditionally
        // rejected as `stream_incomplete`, the same first check
        // `computeTurnVerdict` itself runs, rather than re-running the
        // numeric audit on a fragment the model never finished. Re-running
        // that audit on a truncated fragment was the actual defect: a short
        // partial answer with no numbers in it passed the audit trivially
        // and was stored as `'complete'`.
        // `note` is never read below in this function — this branch only
        // ever inspects `.outcome`/`.reason`/`.unsupported` — but the empty
        // string this used to carry was also simply wrong: `stream_incomplete`
        // ALWAYS means `STREAM_INCOMPLETE_NOTE`, the same value
        // `computeTurnVerdict` itself returns for this exact reason above
        // (#1997 review, NICE). Populating it correctly costs nothing and
        // removes a landmine for the next caller that reads `.note`.
        const verdict: TurnVerdict =
          turnVerdict ?? { outcome: 'rejected', reason: 'stream_incomplete', note: STREAM_INCOMPLETE_NOTE, unsupported: [] };

        if (verdict.outcome === 'rejected' && verdict.reason === 'ungrounded_claims') {
          // A designed guardrail FIRING is not an incident: the claim was
          // caught and the turn was annotated + stored as 'failed' below,
          // which is the system working. Logged at 'info' with skipSentry so
          // it stays queryable as a hallucination-rate metric without sitting
          // in the incident feed's default view or minting a Sentry issue —
          // the convention stated in lib/admin/observe-action-result.ts.
          //
          // Count-stable message (see the staleBacklog emitter for the same
          // rule): interpolating the claim count minted one fingerprint per
          // distinct count, so "1 claim" and "2 claims" arrived as two
          // unrelated warnings that could never dedupe.
          //
          // The claim TEXTS matter more than the count and were not recorded
          // at all, which made the false-positive rate unmeasurable:
          // auditNumericClaims exempts only ISO dates, clock times and
          // integers <= 12, so "18 holes", "par 72", "2025" and "150 yards"
          // all read as unsupported. Do NOT widen those exemptions without
          // this telemetry first — a fabricated "72%" next to the word "par"
          // is exactly what the check exists to catch.
          await logServerEvent(
            'chat/stream: assistant turn contained numeric claims not traceable to tool evidence',
            {
              action: 'v3.chat.stream.ungrounded',
              featureArea: 'coachhelm',
              skipSentry: true,
              extra: {
                unsupportedCount: verdict.unsupported.length,
                claims: verdict.unsupported.slice(0, 10).map((c) => c.text),
                conversationId: convId,
                coachId: ctx.coach_id,
              },
            },
            'info',
          );
        } else if (verdict.outcome === 'rejected' && verdict.reason === 'claim_validation_failed') {
          // Addendum A7 slice 1: the typed claim gate (claim-validator.ts,
          // #1991) caught a claim that cited a real value under the wrong
          // metric/player/window/unit/denominator, or lacked causal backing
          // for a stated cause — a MISATTRIBUTED number, not a fabricated
          // one, which the flat numeric scan above cannot see (the value
          // really is in the packet). Same 'info'/skipSentry convention as
          // the ungrounded-claims branch: the guardrail firing is the system
          // working, not an incident. `{claim_id, metric_id, reason}` only —
          // no prose — mirrors compose.ts's own `claim_validation` log shape.
          await logServerEvent(
            'chat/stream: assistant turn contained a typed claim that failed validation against its evidence packet',
            {
              action: 'v3.chat.stream.claim_validation',
              featureArea: 'coachhelm',
              skipSentry: true,
              extra: {
                rejected: (verdict.rejectedClaims ?? []).map((r) => ({
                  claim_id: r.claim.claim_id,
                  metric_id: r.claim.metric_id,
                  reason: r.reason,
                })),
                conversationId: convId,
                coachId: ctx.coach_id,
              },
            },
            'info',
          );
        } else if (verdict.outcome === 'rejected' && verdict.reason === 'stream_incomplete') {
          // Distinct from the guardrail above: nothing was fabricated, the
          // turn simply never finished (an inline error chunk, the stream
          // ending with no `finish` chunk, or `onFinish` firing before
          // `execute` ever computed a verdict at all — see `turnVerdict`'s
          // declaration). Logging it separately keeps "the model made
          // something up" and "the turn broke" as two different, both-
          // queryable signals instead of one count that conflates them.
          await logServerEvent(
            'chat/stream: assistant turn ended without completing; stored as failed rather than complete',
            {
              action: 'v3.chat.stream.incomplete',
              featureArea: 'coachhelm',
              skipSentry: true,
              extra: { conversationId: convId, coachId: ctx.coach_id },
            },
            'info',
          );
        }

        // `content` is the raw text the model produced — never the failure
        // note, which lives only in `ui_parts`/`status`. Baking the note into
        // `content` too would leak it into the next turn's model context via
        // `convertToModelMessages` on the client's own replayed thread. This
        // is about what `content` is SENT to the model as, not what a coach
        // can see: `restore.ts`/`ChatThread.tsx` govern display and, on a
        // rejected turn, show only the note — but an in-session `uiMessages`
        // array (this same request, before any reload) can still carry the
        // raw rejected text in a `text` part alongside it (#1997 review,
        // NICE) — this comment used to overclaim that display, not just the
        // model-context payload, was undecorated everywhere.
        await appendMessage(supabase, {
          conversation_id: convId,
          role: 'assistant',
          content: text,
          status: verdict.outcome === 'accepted' ? 'complete' : 'failed',
          client_turn_id: clientTurnId,
          ui_parts: publishableParts(assistant.parts) as unknown,
        });
        await touchConversation(supabase, convId);

        // Latency telemetry: first token and total. No player name, prompt
        // text or database value — only timings and the model tier.
        if (firstTokenMs !== null && firstTokenMs > 8000) {
          await logServerError(
            `chat/stream: slow first token ${firstTokenMs}ms (total ${Date.now() - startedAt}ms) model=${MODEL_FOR_TASK.coach_chat}`,
            { action: 'v3.chat.stream.latency' },
            'warning',
          );
        }

        // Bill the turn from REPORTED token counts. Recording the gate's
        // worst-case estimate instead (which an earlier revision of this route
        // did) over-charges every short answer several times over and
        // exhausts a coach's daily budget long before they have spent it.
        await recordTurnCost({
          admin,
          ctx,
          conversationId: convId,
          usagePromise,
          grounded: verdict.outcome === 'accepted',
          unmatchedTokens:
            verdict.outcome === 'rejected'
              ? verdict.reason === 'claim_validation_failed'
                ? (verdict.rejectedClaims ?? []).map((r) => `${r.claim.metric_id || '(none)'}:${r.reason}`)
                : verdict.unsupported.map((c) => c.text)
              : [],
        });

        // helm.ai.* — the call reached this point, so the model responded and
        // was billed; an ungrounded/failed-audit turn is still a successful
        // AI SDK call (recordAi's outcome is about the call itself, not
        // content quality — that has its own logServerEvent above).
        // usagePromise is already settled by recordTurnCost's own await.
        const usage = usagePromise ? await usagePromise.catch(() => null) : null;
        recordAi({
          feature: 'coachhelm_chat',
          action: 'v3.chat.stream.model',
          model: MODEL_FOR_TASK.coach_chat,
          outcome: 'success',
          durationMs: Date.now() - startedAt,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          runtime: process.env.NEXT_RUNTIME ?? 'nodejs',
        });
      } catch (err) {
        await logServerError(
          `chat/stream: persistence failed — ${describeError(err)}`,
          { action: 'v3.chat.stream.persist' },
        );
      }
    },

    /**
     * Sanitised for the wire. An upstream error message can carry provider
     * internals or echo prompt text, neither of which belongs in a browser.
     */
    onError: sanitiseStreamError,
  });

  return createUIMessageStreamResponse({
    stream,
    headers: { 'x-conversation-id': convId },
  });
}

/** Concatenate the text parts of a UI message. */
function textOf(message: UIMessage | undefined): string {
  if (!message) return '';
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('')
    .trim();
}

/**
 * Record what the turn actually cost.
 *
 * The pre-flight gate reserves a conservative worst case so a turn cannot start
 * without headroom; what gets BILLED has to be the real number. Using the
 * estimate for both means a $0.01 answer is charged like a $0.12 one, and a
 * coach hits "daily budget reached" after a handful of questions.
 *
 * Telemetry carries model, latency and cost. It carries no player name, no
 * prompt text and no database value.
 */
async function recordTurnCost(args: {
  admin: ReturnType<typeof createAdminClient>;
  ctx: CoachChatContext;
  conversationId: string;
  usagePromise: Promise<LanguageModelUsage> | null;
  /** `unsupported.length === 0` from the numeric-claim audit above. Was not
   *  passed at all, so the ledger recorded a literal `false` for every turn —
   *  0 of 37 verified in production while round_review recorded 29 of 121. */
  grounded: boolean;
  /** The claim texts the audit flagged, when `grounded` is false. */
  unmatchedTokens: string[];
}): Promise<void> {
  const { admin, ctx, conversationId, usagePromise, grounded, unmatchedTokens } = args;
  try {
    const usage = usagePromise ? await usagePromise : undefined;
    const promptTokens = usage?.inputTokens ?? 0;
    const completionTokens = usage?.outputTokens ?? 0;
    // If the provider reported nothing, fall back to the reserved estimate
    // rather than billing zero — an unmeasured turn must not be free.
    // Cache-aware: `promptTokens` INCLUDES the cached portions, and a cache
    // read costs a tenth of a fresh token. Billing the total at the full input
    // rate would spend a coach's daily budget on tokens that were never
    // freshly processed.
    const cost =
      promptTokens + completionTokens > 0
        ? estimateCachedCostUsd(
            MODEL_FOR_TASK.coach_chat,
            promptTokens,
            completionTokens,
            usage?.inputTokenDetails,
          )
        : CHAT_TURN_COST_ESTIMATE_USD;

    await admin.from('golf_coachhelm_llm_calls').insert(
      buildChatLlmCallRow({
        coachId: ctx.coach_id,
        conversationId,
        modelId: MODEL_FOR_TASK.coach_chat,
        promptTokens,
        completionTokens,
        costUsd: cost,
        grounded,
        unmatchedTokens,
      }),
    );
    await recordSpend(admin, { coach_id: ctx.coach_id, task: 'coach_chat', cost_usd: cost });
  } catch {
    // Never fail a coach's answer because accounting hiccuped.
  }
}
