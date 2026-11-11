/**
 * CoachHelm chat: the streaming endpoint.
 *
 * The browser sends ONE thing: a new message, or the coach's decision on a waiting card, with the conversation id, a
 * per-turn idempotency key and the surface. The server owns the conversation: it loads the stored model messages,
 * appends, runs the turn (engine/turn.ts) and stores the exact result. Nothing the browser holds is replayed to the
 * model.
 *
 * What this file keeps from the route it replaces:
 *   auth + ownership   the coach comes from the session; the conversation must be theirs; RLS backs both.
 *   gates              CoachHelm on for the coach, the rate limit, and the daily budget before anything is created.
 *   idempotency        a retried `client_turn_id` that already has an answer is sent that answer, not a second run.
 *   cost               reported tokens go to `golf_coachhelm_llm_calls` and the day's spend, after the response.
 *   errors             the coach reads a sentence they can act on; provider text never reaches the browser.
 *
 * What is gone: held text, the withheld card, the repair pass, the claims and cites blocks, the client-held thread and
 * everything that patched it (abandoned approvals, dangling tool calls).
 */
import type { NextRequest } from 'next/server';
import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import * as Sentry from '@sentry/nextjs';
import { filterForFigureWindow, loadPlayerPuttBands, loadPlayersFigures } from '@/clubhouse/data/player-figures';
import { loadQualifierDetail, loadQualifierList } from '@/clubhouse/data/qualifiers';
import { loadRoster } from '@/clubhouse/data/roster';
import { loadRoundReview } from '@/clubhouse/data/round-review';
import { loadPlayerProfile } from '@/clubhouse/data/stats-player';
import { loadTeamStats } from '@/clubhouse/data/stats-team';
import { loadTeamRounds } from '@/clubhouse/data/team-rounds';
import { loadTeamStrokesGained } from '@/clubhouse/data/team-sg';
import { loadTournamentsHome, tourContext } from '@/clubhouse/data/tournaments';
import { isClubhouseFor, isClubhouseForTeam } from '@/clubhouse/gate';
import { classifyProviderFault, providerFaultSeverity } from '@/lib/admin/provider-fault';
import { drainCollapsedCount, shouldEmit } from '@/lib/admin/emit-throttle';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { isCoachHelmEnabledForCoach } from '@/lib/coachhelm/v2/gate';
import { linkProposalsToMessage } from '@/lib/coachhelm/v3/chat/action-runs';
import { CoachContextError, resolveCoachChatContext, type CoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import { firstTurnNotes, readStandingNotes, toneSentence } from '@/lib/coachhelm/v3/chat/context/notes';
import { turnContext } from '@/lib/coachhelm/v3/chat/context/screen-context';
import { CHAT_MAX_STEPS, MissingModelKeyError, anthropicModelClient, callPromptTokens, chatFeatures, onLongCard, profileFor, promptTokens, turnCostUsd } from '@/lib/coachhelm/v3/chat/engine/model';
import { CHAT_STREAM_CONTENT_TYPE, encodeChatEvent, eventsForStoredParts, pendingDecisionKeys, type ChatErrorAction, type ChatErrorKind, type ChatEvent, type ChatScreenEcho } from '@/lib/coachhelm/v3/chat/engine/protocol';
import { loadConversation, type LoadedConversation, type TurnRow } from '@/lib/coachhelm/v3/chat/engine/store';
import { chatTurnResponse, type TurnInput, type TurnSummary } from '@/lib/coachhelm/v3/chat/engine/turn';
import type { ChatSurface, ScreenLoaders } from '@/lib/coachhelm/v3/chat/engine/tool';
import { checkGrounding } from '@/lib/coachhelm/v3/chat/grounding';
import { heldCommitFor } from '@/lib/coachhelm/v3/chat/held-runner';
import { instructionBlocks } from '@/lib/coachhelm/v3/chat/instructions';
import { createConversation, getConversation, touchConversation, upsertUserTurn } from '@/lib/coachhelm/v3/chat/persistence';
import { runPlayerTurn } from '@/lib/coachhelm/v3/chat/player-turn';
import { toolsFor } from '@/lib/coachhelm/v3/chat/registry';
import { sweepHeld } from '@/lib/coachhelm/v3/chat/undo-hold';
import { checkBudget, recordSpend } from '@/lib/coachhelm/v3/llm/budget';
import { buildChatLlmCallRow } from '@/lib/coachhelm/v3/llm/chat-call-row';
import { estimateCostUsd } from '@/lib/coachhelm/v3/llm/types';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { recordAi } from '@/lib/observability/metrics';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import { describeError } from '@/lib/utils/describe-error';

export const maxDuration = 120;

// ── The Clubhouse screens' loaders, bound for the chat tools ─────────────────────────────────────────────────────────
// `src/lib` may not import `src/clubhouse`, and only a route file may import a screen's loader, so this is where the
// tools' `ScreenLoaders` meet the real functions. A figure the chat states is read through the loader the screen itself
// calls, for the same window: one number, one source. Each binding resolves to null when its loader throws, so a failed
// read is reported as failed and never as "no data".

type Sb = SupabaseClient<Database>;

const orNull = <A extends unknown[], R>(load: (...args: A) => Promise<R>) => async (...args: A): Promise<R | null> => {
  try {
    return await load(...args);
  } catch {
    return null;
  }
};

/** A coach's loaders: every screen of their team. */
function coachScreenLoaders(sb: Sb, who: { team_id: string; coach_id: string; timezone: string; roster: ReadonlyArray<{ id: string }> }): ScreenLoaders {
  const teamId = who.team_id;
  const timezone = who.timezone;
  return {
    playerFigures: orNull((ids, window) => loadPlayersFigures(sb, { timezone }, ids, window)),
    puttBands: orNull((id, window) => loadPlayerPuttBands(sb, { timezone }, id, window)),
    teamStrokesGained: orNull((window) => loadTeamStrokesGained(sb, { timezone, playerIds: who.roster.map((p) => p.id) }, window)),
    playerStats: orNull((playerId, w) => loadPlayerProfile({ viewer: 'coach', teamId, playerId, window: w === 'season' ? 'season' : 'last10', filter: filterForFigureWindow(w) })),
    teamStats: orNull((w) => loadTeamStats({ teamId, window: w === 'season' ? 'season' : 'last10', filter: filterForFigureWindow(w) })),
    roster: orNull(() => loadRoster({ teamId, coachId: who.coach_id })),
    teamRounds: orNull(() => loadTeamRounds({ teamId })),
    qualifierList: orNull(() => loadQualifierList({ role: 'coach', teamId, playerId: null, mode: 'all' })),
    qualifierBoard: orNull((qualifierId) => loadQualifierDetail({ role: 'coach', teamId, playerId: null, qualifierId })),
    roundReview: orNull((roundId) => loadRoundReview(roundId, { role: 'coach', teamId })),
    // Tournaments are behind golf_tournaments_v1: with the flag off the loader is not bound at all, and a read through it answers
    // "could not be read", never an empty season.
    ...(isFlagEnabled('golf_tournaments_v1') ? { tournaments: orNull(async () => loadTournamentsHome(await tourContext({ role: 'coach', teamId }))) } : {}),
  };
}

/**
 * A player's loaders: their own figures, and the pages a player sees. No team page, no roster and no team rounds are
 * bound at all, so no tool can reach a teammate's figure through one; the screens' own player views carry their own
 * privacy rule (a player's Stats page has no team column).
 */
function playerScreenLoaders(sb: Sb, who: { team_id: string; player_id: string; timezone: string }): ScreenLoaders {
  const teamId = who.team_id;
  const timezone = who.timezone;
  const own = (id: string) => id === who.player_id;
  return {
    playerFigures: orNull((ids, window) => loadPlayersFigures(sb, { timezone }, ids.filter(own), window)),
    puttBands: orNull(async (id, window) => (own(id) ? loadPlayerPuttBands(sb, { timezone }, id, window) : null)),
    playerStats: orNull(async (playerId, w) => (own(playerId) ? loadPlayerProfile({ viewer: 'player', teamId, playerId, window: w === 'season' ? 'season' : 'last10', filter: filterForFigureWindow(w) }) : null)),
    qualifierList: orNull(() => loadQualifierList({ role: 'player', teamId, playerId: who.player_id, mode: 'all' })),
    qualifierBoard: orNull((qualifierId) => loadQualifierDetail({ role: 'player', teamId, playerId: who.player_id, qualifierId })),
    // The Round page judges the round against the viewer; the tool has already checked the round is the player's own.
    roundReview: orNull((roundId) => loadRoundReview(roundId, { role: 'player', playerId: who.player_id, teamId })),
  };
}


/** Worst-case one-turn spend at the rates of the model the surface runs on, for the pre-flight gate only. What is billed is what the API reports. */
const turnCostEstimateUsd = (ledgerId: string): number => estimateCostUsd(ledgerId, 12000, 2500);

const Body = z
  .object({
    conversation_id: z.string().uuid().nullable().optional(),
    client_turn_id: z.string().min(1).max(128),
    surface: z.enum(['ask', 'quick_chat', 'practice_helper']).optional(),
    /** The coach's new message. */
    message: z.string().trim().min(1).max(8000).optional(),
    /**
     * About a waiting card, by its ledger key. With `approved`: the coach's answer to it. With `edits`: the coach changed fields on
     * it (`{ [field key]: value }`, the fields the card's `editable` lists), which plans the card again and calls no model.
     * `revision`: the revision of the card on the coach's screen, as its proposal part carries it.
     */
    decision: z
      .object({
        key: z.string().min(1).max(200),
        approved: z.boolean().optional(),
        edits: z.record(z.string().min(1).max(100), z.unknown()).optional(),
        revision: z.number().int().min(0).max(100_000).optional(),
      })
      .refine((d) => (d.approved === undefined) !== (d.edits === undefined), 'Send approved or edits, not both.')
      .refine((d) => d.edits === undefined || (Object.keys(d.edits).length <= 40 && JSON.stringify(d.edits).length <= 20_000), 'Too many edits.')
      .optional(),
    /** A tab still running the previous client sends its whole thread. Only its last user message is read, as the new message. */
    messages: z.array(z.unknown()).optional(),
    /**
     * Where the chat was opened from and what is selected there. Read only by the screen-context resolver, which checks every id against
     * the caller's own team before a word of it reaches the model; anything it cannot use is dropped, never an error.
     */
    screen: z.unknown().optional(),
  })
  .transform((body, ctx): { conversation_id: string | null; client_turn_id: string; surface: ChatSurface; input: TurnInput; screen: unknown } => {
    const base = { conversation_id: body.conversation_id ?? null, client_turn_id: body.client_turn_id, surface: (body.surface ?? 'ask') as ChatSurface, screen: body.screen ?? null };
    if (body.decision && !body.message) {
      const { key, approved, edits, revision } = body.decision;
      const seen = revision === undefined ? {} : { revision };
      return { ...base, input: edits !== undefined ? { kind: 'revise', key, edits, ...seen } : { kind: 'decision', key, approved: approved === true, ...seen } };
    }
    const text = body.message ?? lastUserText(body.messages);
    if (!text || body.decision) {
      ctx.addIssue({ code: 'custom', message: 'Send a message or a decision.' });
      return z.NEVER;
    }
    return { ...base, input: { kind: 'message', text } };
  });

/** The last user message of a previous-client thread, if that is what the thread ends in. A thread ending in the assistant was that client's approval resubmit, which this server no longer takes. */
function lastUserText(messages: unknown[] | undefined): string | null {
  const last = messages?.[messages.length - 1] as { role?: unknown; parts?: unknown } | undefined;
  if (!last || last.role !== 'user' || !Array.isArray(last.parts)) return null;
  const text = last.parts
    .filter((p): p is { type: 'text'; text: string } => Boolean(p) && typeof p === 'object' && (p as { type?: unknown }).type === 'text' && typeof (p as { text?: unknown }).text === 'string')
    .map((p) => p.text)
    .join('')
    .trim();
  return text ? text.slice(0, 8000) : null;
}

const GENERIC_FAILURE = 'Something went wrong while answering. Please try again.';
const MISSING_KEY = 'CoachHelm is not set up on this server yet. Please tell support: the AI key is missing.';

/**
 * What the coach is told when a turn fails. An upstream error can carry provider internals or echo prompt text, neither
 * of which belongs in a browser, so the sentence comes from one shared classifier (the schedule importer and the Bridge
 * use the same one) or is the generic line.
 */
function describeTurnError(error: unknown): { message: string; action: ChatErrorAction; kind: ChatErrorKind } {
  if (error instanceof MissingModelKeyError) return { message: MISSING_KEY, action: 'none', kind: 'model' };
  const fault = classifyProviderFault(error);
  if (fault) return { message: fault.summary, action: 'retry', kind: 'model' };
  return { message: GENERIC_FAILURE, action: 'retry', kind: 'model' };
}

/** A refused request: a sentence, and the kind the screen picks its notice by (`ChatErrorKind`). */
const refuse = (status: number, error: string, kind: ChatErrorKind | null, extra: Record<string, unknown> = {}) => NextResponse.json({ error, ...(kind ? { kind } : {}), ...extra }, { status });
/** 401 is a session that ended; 403 and "no active team" are an account that may not use this. */
const kindForStatus = (status: number): ChatErrorKind | null => (status === 401 ? 'signed_out' : status === 403 || status === 404 ? 'off' : null);

/** Log one failed model call. A provider or account fault is logged under a stable code so every retry of one outage is one incident. */
function logModelError(error: unknown, ledgerId: string): void {
  const fault = classifyProviderFault(error);
  const raw = describeError(error);
  recordAi({ feature: 'coachhelm_chat', action: 'v3.chat.stream.model', model: ledgerId, provider: fault?.provider, outcome: 'failure', errorCode: fault?.code, runtime: process.env.NEXT_RUNTIME ?? 'nodejs' });
  if (error instanceof MissingModelKeyError) {
    void logServerError('chat/stream: ANTHROPIC_API_KEY is not set; chat cannot answer', { action: 'v3.chat.stream.model', errorCode: 'missing_model_key', feature: 'coachhelm_chat' });
    return;
  }
  if (!fault) {
    void logServerError(`chat/stream: model error: ${raw}`, { action: 'v3.chat.stream.model' }, 'warning');
    return;
  }
  const throttleKey = `chat-stream-provider:${fault.code}`;
  if (!shouldEmit(throttleKey)) return;
  const collapsed = drainCollapsedCount(throttleKey);
  const { severity, skipSentry } = providerFaultSeverity(fault);
  void logServerError(
    `chat/stream: ${fault.summary}`,
    { action: 'v3.chat.stream.model', errorCode: fault.code, skipSentry, feature: 'coachhelm_chat', extra: { providerFaultKind: fault.kind, provider: fault.provider, providerMessage: raw.slice(0, 500), ...(collapsed > 0 ? { collapsed_count: collapsed } : {}) } },
    severity,
  );
}

/** Run work after the response is sent. `after` only exists inside a request; anywhere else (a test) it runs now. */
function later(work: () => Promise<unknown>): void {
  const run = () => work().catch(() => undefined);
  try {
    after(run);
  } catch {
    void run();
  }
}

/** A turn that already has an answer, sent again: the stored parts as the events that rebuild them. No model call. */
function storedTurnResponse(row: TurnRow, conversationId: string): Response {
  const parts = row.ui_parts ?? (row.content ? [{ type: 'text', text: row.content }] : []);
  const waiting = pendingDecisionKeys({ id: row.id, role: 'assistant', parts }).length > 0;
  const events: ChatEvent[] = [
    { type: 'message_start', conversation_id: conversationId, message_id: row.id, resumed: false },
    ...eventsForStoredParts(parts),
    { type: 'done', status: waiting ? 'awaiting_decision' : 'complete' },
  ];
  return new Response(events.map(encodeChatEvent).join(''), { headers: { 'content-type': CHAT_STREAM_CONTENT_TYPE, 'cache-control': 'no-cache, no-transform', 'x-conversation-id': conversationId } });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  let ctx: CoachChatContext;
  try {
    ctx = await resolveCoachChatContext(supabase);
  } catch (err) {
    // A player has no coach row: their own read-only Ask, on this route, with the role from the session. Only that denial comes here,
    // and the player turn confirms a player row and runs the team gate itself.
    if (err instanceof CoachContextError && err.reason === 'not_a_coach' && (await isClubhouseFor('player'))) {
      const body = Body.safeParse(await req.json().catch(() => null));
      if (!body.success || body.data.input.kind !== 'message') return refuse(400, 'Bad request', null);
      return runPlayerTurn(supabase, { text: body.data.input.text, clientTurnId: body.data.client_turn_id, screen: body.data.screen }, req.signal, (who) => playerScreenLoaders(supabase, who));
    }
    if (err instanceof CoachContextError) return refuse(err.status, err.message, kindForStatus(err.status));
    await logServerError('chat/stream: context resolution failed', { action: 'v3.chat.stream.ctx' });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }

  // One wave of independent reads: the gate, the rate limit, the conversation and its rows, the budget. They are reads (the rate limit's own
  // counter aside), so a request any of them turns away has changed nothing. The verdicts are applied in a fixed order, so a coach is told
  // the same thing for the same fault.
  const parsed = Body.safeParse(await req.json().catch(() => null));
  const earlyConversationId = parsed.success ? parsed.data.conversation_id : null;
  const admin = createAdminClient();
  const [helmGate, rl, existing, loadedOrError, earlyGate] = await Promise.all([
    isCoachHelmEnabledForCoach(ctx.coach_id),
    checkRateLimit(`coachhelm:chat:${ctx.coach_id}`, RATE_LIMITS.API_GENERAL),
    earlyConversationId ? getConversation(supabase, earlyConversationId) : null,
    earlyConversationId ? loadConversation(supabase, earlyConversationId).catch((err: unknown) => (err instanceof Error ? err : new Error('history'))) : null,
    earlyConversationId ? null : checkBudget(admin, ctx.coach_id, turnCostEstimateUsd(profileFor(parsed.success ? parsed.data.surface : 'ask').ledgerId)),
  ]);
  // CoachHelm switched off (globally, for the coach or for the team) answers nothing here either; the gate fails closed on a lookup error.
  if (!helmGate.effectivelyEnabled) return refuse(403, 'CoachHelm is off for your team.', 'off');
  if (!parsed.success) return refuse(400, 'Bad request', null);
  if (!rl.allowed) return refuse(429, 'Too many requests. Please slow down.', 'rate');

  const { input, client_turn_id: clientTurnId, surface } = parsed.data;
  let conversationId = parsed.data.conversation_id;
  // A conversation with no rows yet is assumed to have the model-message columns; the first write finds out and falls back if not.
  let loaded: LoadedConversation = { mode: 'columns', rows: [] };
  if (conversationId) {
    if (!existing || existing.coach_id !== ctx.coach_id) return refuse(404, 'Conversation not found', 'gone');
    if (loadedOrError instanceof Error || !loadedOrError) {
      // Without the stored turns the model would answer with no memory of the conversation, and a Confirm could not find its card.
      await logServerError(`chat/stream: history could not be read: ${loadedOrError instanceof Error ? loadedOrError.message : 'none'}`, { action: 'v3.chat.stream.history' });
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
    loaded = loadedOrError;
    // Idempotency: a turn that already has an answer is sent that answer again, as the same kind of stream a fresh one is.
    if (input.kind === 'message') {
      const answered = loaded.rows.find((r) => r.role === 'assistant' && r.client_turn_id === clientTurnId && r.status !== 'failed');
      if (answered) return storedTurnResponse(answered, conversationId);
    }
  } else if (input.kind !== 'message') {
    return refuse(404, 'Conversation not found', 'gone');
  }

  // The budget gate runs before anything is created, so an exhausted budget leaves no orphan conversation or user turn. A decision is not
  // gated: the card was offered under the budget, and refusing its Confirm would strand an action the coach has already been shown.
  if (input.kind === 'message') {
    const gate = earlyGate ?? (await checkBudget(admin, ctx.coach_id, turnCostEstimateUsd(profileFor(surface).ledgerId)));
    if (!gate.allowed) {
      const message =
        gate.fallback_reason === 'budget_unresolved'
          ? 'CoachHelm could not verify your program’s analysis settings. Contact support — this is not something waiting will fix.'
          : gate.fallback_reason === 'budget_disabled'
            ? 'AI analysis is switched off for your program. An administrator can turn it on in coaching settings.'
            : 'You have reached today’s analysis limit for your program. It resets tomorrow.';
      // Switched off for the program is "off"; a limit reached (or settings that could not be checked) is "budget".
      return refuse(429, message, gate.fallback_reason === 'budget_disabled' ? 'off' : 'budget', { reason: gate.fallback_reason ?? 'budget_gated' });
    }
  }

  const isNewConversation = !conversationId;
  try {
    if (!conversationId && input.kind === 'message') {
      conversationId = (await createConversation(supabase, { coach_id: ctx.coach_id, title: input.text.slice(0, 60) || 'New conversation', surface: surface === 'player' ? null : surface })).id;
    }
    if (!conversationId) throw new Error('conversation id unresolved');
    if (input.kind === 'message') await upsertUserTurn(supabase, { conversation_id: conversationId, content: input.text, client_turn_id: clientTurnId });
  } catch (err) {
    await logServerError(`chat/stream: the question could not be stored: ${describeError(err)}`, { action: 'v3.chat.stream.conv' });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
  const convId = conversationId;

  // Nothing that changes during a conversation's life is in the prompt: the policy block is the same for every team, the team block changes
  // only with the roster. Today's date, the screen the chat was opened from, the conversation's tone and (on a conversation's first
  // answered turn) the coach's standing notes go to the model as a system message after the coach's own, and are stored with the turn.
  // A decision request sends none: its turn already has its line.
  const blocks = instructionBlocks(surface, ctx);
  // Clubhouse for this coach's team, by the check its pages use. It decides two things here, both because the names are Clubhouse's:
  // whether the screen the browser names is told to the model, and whether `find_in_app` (which answers with Clubhouse addresses) is offered.
  const clubhouseOn = isClubhouseForTeam(ctx.team_id);
  let turnNote: string | null = null;
  let screenEcho: ChatScreenEcho | null = null;
  if (input.kind === 'message') {
    // Neither read throws; without the notes migration there are simply no notes and no tone.
    const [where, knows] = await Promise.all([turnContext(supabase, ctx, clubhouseOn ? parsed.data.screen : null), readStandingNotes(supabase, ctx, isNewConversation ? null : convId)]);
    screenEcho = where.screen?.place ? { screen: where.screen.screen, label: where.screen.place.name } : null;
    // "First" is the first turn that stays in the stored history: a failed first attempt leaves only its question behind, so its retry
    // still carries the notes.
    const firstTurn = !loaded.rows.some((r) => r.role === 'assistant' && r.status !== 'failed');
    const line = [where.line, toneSentence(knows)].filter(Boolean).join(' ');
    turnNote = [firstTurn ? firstTurnNotes(knows) : null, line].filter(Boolean).join('\n\n');
  }
  // The model this surface runs on. A coach's three surfaces share one, so a conversation never changes model between them.
  const profile = profileFor(surface);
  // The registry registers `find_in_app` for everyone; a team without Clubhouse is not offered it. That is two tool lists per surface,
  // each the same bytes on every request, so each is cached on its own.
  const tools = toolsFor(surface, ctx).filter((tool) => clubhouseOn || tool.name !== 'find_in_app');

  // Opaque and server-generated, never derived from who the coach or their players are: safe as Sentry's conversation key.
  Sentry.setConversationId(convId);
  // The next chat request finishes what a cut-off function left held. It has to be a request: the writes read the coach from the session.
  later(() => sweepHeld(supabase, { coach_id: ctx.coach_id, team_id: ctx.team_id, resolve: (row) => heldCommitFor(supabase, ctx, row, tools) }));

  const onFinished = (summary: TurnSummary) => {
    later(async () => {
      await touchConversation(supabase, convId).catch(() => undefined);
      if (summary.messageId && summary.proposalKeys.length > 0) {
        await linkProposalsToMessage(supabase, { coach_id: ctx.coach_id, message_id: summary.messageId, idempotency_keys: summary.proposalKeys }).catch(() => undefined);
      }
      if (summary.error) logModelError(summary.error, profile.ledgerId);
      await recordTurn({ admin, ctx, conversationId: convId, summary, ledgerId: profile.ledgerId });
    });
  };

  return chatTurnResponse(
    {
      model: anthropicModelClient,
      tools,
      system: { stable: blocks.policy, team: blocks.team },
      toolContext: { sb: supabase, who: ctx, conversationId: convId, surface, loaders: coachScreenLoaders(supabase, ctx) },
      tasks: { coachId: ctx.coach_id, teamId: ctx.team_id, timezone: ctx.timezone, defer: later },
      maxSteps: CHAT_MAX_STEPS,
      profile,
      features: chatFeatures(surface),
      turnNote,
      screen: screenEcho,
      requestSignal: req.signal,
      store: { loaded, coachId: ctx.coach_id },
      clientTurnId,
      describeError: describeTurnError,
      checkGrounding: ({ text, reads }) => checkGrounding(text, reads),
      onFinished,
    },
    input,
    { 'x-conversation-id': convId },
  );
}

/**
 * Record what the turn cost and how it went. Billed from REPORTED token counts: the pre-flight estimate charges a short
 * answer several times over. Carries model, latency, cost, cache use and the grounding check's result; no player name,
 * no prompt text, no database value.
 */
async function recordTurn(args: { admin: ReturnType<typeof createAdminClient>; ctx: CoachChatContext; conversationId: string; summary: TurnSummary; ledgerId: string }): Promise<void> {
  const { admin, ctx, conversationId, summary, ledgerId } = args;
  const { usage } = summary;
  if (usage.calls.length === 0) return;
  const input = promptTokens(usage);
  try {
    const cost = input + usage.output > 0 ? turnCostUsd(usage) : turnCostEstimateUsd(ledgerId);
    await admin.from('golf_coachhelm_llm_calls').insert(
      buildChatLlmCallRow({ coachId: ctx.coach_id, conversationId, modelId: ledgerId, promptTokens: input, completionTokens: usage.output, costUsd: cost, grounded: summary.grounded, unmatchedTokens: summary.unmatched }),
    );
    await recordSpend(admin, { coach_id: ctx.coach_id, task: 'coach_chat', cost_usd: cost });
  } catch {
    // Never fail a coach's answer because accounting hiccuped.
  }
  if (summary.status !== 'failed') {
    recordAi({ feature: 'coachhelm_chat', action: 'v3.chat.stream.model', model: ledgerId, outcome: 'success', durationMs: summary.totalMs, inputTokens: input, outputTokens: usage.output, runtime: process.env.NEXT_RUNTIME ?? 'nodejs' });
  }
  // A prompt past 100K tokens is billed at five times the rate: it should not happen, so it is said when it does.
  // (Only a model with a second rate card can be on it: Claude Haiku 5.5 past 100K prompt tokens.)
  const longest = Math.max(0, ...usage.calls.filter(onLongCard).map(callPromptTokens));
  if (longest > 0) {
    void logServerError('chat/stream: a request went over 100K prompt tokens and was billed on the long-prompt rate card', { action: 'v3.chat.stream.long_prompt', feature: 'coachhelm_chat', handled: true, skipSentry: true, extra: { conversationId, promptTokens: longest } }, 'warning');
  }
  // One line per turn for the eval: how long the coach waited for the first word, what the cache saved on each call, whether the figures matched the reads.
  await logServerEvent(
    'chat/stream: turn',
    {
      action: 'v3.chat.stream.turn',
      featureArea: 'coachhelm',
      skipSentry: true,
      extra: { conversationId, coachId: ctx.coach_id, status: summary.status, stop: summary.stop, firstTextMs: summary.firstTextMs, totalMs: summary.totalMs, calls: usage.calls, grounded: summary.grounded, unmatchedCount: summary.unmatched.length, refusalCategory: summary.refusalCategory, degraded: summary.degraded, model: ledgerId, fallbackModel: summary.fallbackModel },
    },
    'info',
  ).catch(() => undefined);
}
