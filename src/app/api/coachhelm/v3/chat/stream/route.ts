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
  auditNumericClaims,
  collectNumbers,
  type Measurement,
  type MeasurementSeries,
  type ToolEnvelope,
} from '@/lib/coachhelm/v3/chat/provenance';
import {
  appendMessage,
  createConversation,
  findAssistantTurn,
  getConversation,
  listMessages,
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
  publishableParts,
} from '@/lib/coachhelm/v3/chat/ui-parts';
import { describeError } from '@/lib/utils/describe-error';

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

const UNGROUNDED_NOTE =
  "\n\n_Some figures in this answer could not be traced back to your program's data, so I've flagged it rather than presenting them as fact. Please ask again._";

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
  const collect = (envelope: ToolEnvelope) => {
    measurements.push(...envelope.measurements);
    seriesAll.push(...envelope.series);
    if (envelope.detail !== undefined) detailNumbers.push(...collectNumbers(envelope.detail));
  };

  const convId = conversationId;
  // Captured in `execute` so `onFinish` can bill ACTUAL tokens, not the gate's
  // worst-case estimate. See recordTurnCost below.
  let usagePromise: Promise<{ inputTokens?: number; outputTokens?: number }> | null = null;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const tools = buildCoachTools({ sb: supabase, ctx, conversationId: convId, writer, collect });

      const result = streamText({
        model,
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
        // `ignoreIncompleteToolCalls` drops any tool call left in
        // `input-streaming`/`input-available` (see isIncompleteToolPart). The
        // thread here is the CLIENT's `useChat` state, not the database, so a
        // server-side persistence guard alone cannot save this request: the
        // browser resends whatever it is holding. Without the flag, one
        // unresolved call makes every subsequent turn in that thread fail
        // upstream with "Tool result is missing for tool call toolu_…" —
        // there is no matching `tool_result` block to pair it with, and the
        // coach cannot recover except by starting a new conversation.
        //
        // Approval-suspended calls are untouched: the SDK filters on the two
        // input states only, and an awaiting-coach call is
        // `approval-requested`/`approval-responded`.
        messages: await convertToModelMessages(uiMessages, {
          tools,
          ignoreIncompleteToolCalls: true,
        }),
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
      });

      usagePromise = result.usage;
      // `sendReasoning: false` keeps the model's private deliberation off the
      // wire entirely. It renders nowhere today, but "not rendered" is not the
      // requirement — the requirement is that it never reaches the browser,
      // where it sits in network responses and React state either way.
      // `onError` HAS to be passed here too.
      //
      // A model failure happens INSIDE this merged stream, not inside the
      // outer `execute`, so the outer `createUIMessageStream.onError` never
      // sees it — `toUIMessageStream` falls back to the SDK default, and the
      // coach is shown the literal string "An error occurred."
      //
      // That is what a coach saw in production while the account's model
      // credit was exhausted: six identical retries, each answered with four
      // words that named neither the cause nor anything they could do. The
      // sanitised message below already said "the model quota is exhausted";
      // it was just never reaching the browser.
      writer.merge(
        result.toUIMessageStream({
          sendStart: true,
          sendFinish: true,
          sendReasoning: false,
          onError: sanitiseStreamError,
        }),
      );
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

        const text = textOf(assistant);

        // A turn that produced NOTHING must not be stored as an answer.
        //
        // `onFinish` fires on a failed turn too. With no guard it wrote a row
        // with empty content and `status: 'complete'` — the audit finds zero
        // claims, so `grounded` is true and a total failure is recorded as a
        // finished answer. Production has six of them, one per retry, and each
        // renders on reload as a blank assistant turn.
        //
        // A turn with no prose is not necessarily empty: an action proposal is
        // a card with no text. So the test is text OR a real data part —
        // `step-start` alone does not count as an answer.
        const hasContent = hasPersistableAssistantContent(assistant, textOf(assistant));
        if (!hasContent) return;
        const unsupported = auditNumericClaims(text, measurements, seriesAll, detailNumbers);
        const grounded = unsupported.length === 0;

        if (!grounded) {
          // A designed guardrail FIRING is not an incident: the claim was
          // caught and the turn was annotated + stored as 'failed' below,
          // which is the system working. Logged at 'info' with skipSentry so
          // it stays queryable as a hallucination-rate metric without sitting
          // in the incident feed's default view or minting a Sentry issue —
          // the convention stated in lib/admin/observe-action-result.ts.
          //
          // Count-stable message (see the staleBacklog emitter for the same
          // rule): interpolating `unsupported.length` minted one fingerprint
          // per distinct count, so "1 claim" and "2 claims" arrived as two
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
                unsupportedCount: unsupported.length,
                claims: unsupported.slice(0, 10).map((c) => c.text),
                conversationId: convId,
                coachId: ctx.coach_id,
              },
            },
            'info',
          );
        }

        await appendMessage(supabase, {
          conversation_id: convId,
          role: 'assistant',
          content: grounded ? text : text + UNGROUNDED_NOTE,
          status: grounded ? 'complete' : 'failed',
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
        await recordTurnCost({ admin, ctx, conversationId: convId, usagePromise });
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
}): Promise<void> {
  const { admin, ctx, conversationId, usagePromise } = args;
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

    await admin.from('golf_coachhelm_llm_calls').insert({
      task: 'coach_chat',
      coach_id: ctx.coach_id,
      player_id: null,
      prompt_hash: conversationId.slice(0, 16),
      model_id: MODEL_FOR_TASK.coach_chat,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      cost_usd: cost,
      citations: null,
      verified: false,
      fallback_to_template: false,
    });
    await recordSpend(admin, { coach_id: ctx.coach_id, task: 'coach_chat', cost_usd: cost });
  } catch {
    // Never fail a coach's answer because accounting hiccuped.
  }
}
