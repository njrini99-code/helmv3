import 'server-only';
import { after, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2/gate';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { CoachContextError } from './context';
import { turnContext } from './context/screen-context';
import { anthropicModelClient, CHAT_MODEL_LEDGER_ID, chatFeatures, PLAYER_MAX_STEPS, promptTokens, turnCostUsd } from './engine/model';
import { CHAT_STREAM_CONTENT_TYPE, encodeChatEvent, type ChatErrorAction, type ChatEvent } from './engine/protocol';
import { chatTurnResponse, type TurnSummary } from './engine/turn';
import type { PlayerChatContext, ScreenLoaders } from './engine/tool';
import { checkGrounding } from './grounding';
import { instructionBlocks } from './instructions';
import { readBucket, recordPlayerSpend } from './player-allowance';
import { resolvePlayerChatContext } from './player-context';
import { toolsFor } from './registry';

const describePlayerError = (): { message: string; action: ChatErrorAction } => ({ message: 'CoachHelm couldn’t finish that answer. Please try again.', action: 'retry' });

/**
 * A player's turn, on the same runner as a coach's (the role comes from the session, never the request). Reads only:
 * the registry gives a player no task, and the runner is given no ledger, so a task call could not be planned even if
 * one were offered. The allowance is read before the model and written after: no bucket, no ask.
 *
 * Nothing is stored yet: player-owned conversations are the held migration 20261101090200. Until it is applied each
 * question is answered on its own; the browser's copy of the thread is never replayed to the model.
 */
export async function runPlayerTurn(
  sb: SupabaseClient<Database>,
  body: { text: string; clientTurnId: string; screen?: unknown },
  signal: AbortSignal,
  loadersFor: (who: PlayerChatContext) => ScreenLoaders,
): Promise<Response> {
  let ctx: PlayerChatContext;
  try {
    ctx = await resolvePlayerChatContext(sb);
  } catch (err) {
    const status = err instanceof CoachContextError ? err.status : 500;
    return NextResponse.json({ error: 'Ask could not load.' }, { status });
  }
  // CoachHelm switched off for the player or their team answers nothing here, as for a coach. The gate fails closed on a lookup error.
  const helmGate = await isCoachHelmEnabledForPlayer(ctx.player_id);
  if (!helmGate.effectivelyEnabled) return NextResponse.json({ error: 'CoachHelm is off for your team.' }, { status: 403 });
  const [rl, bucket] = await Promise.all([checkRateLimit(`coachhelm:chat:player:${ctx.player_id}`, RATE_LIMITS.API_GENERAL), readBucket(ctx.player_id, ctx.timezone)]);
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  if (!bucket) return NextResponse.json({ error: 'Ask is off for your team.' }, { status: 403 });
  const conversationId = `player-${ctx.player_id}`;
  if (bucket === 'out') {
    const events: ChatEvent[] = [
      { type: 'message_start', conversation_id: conversationId, message_id: crypto.randomUUID(), resumed: false },
      { type: 'part', part: { type: 'data-allowance', id: 'allowance', data: { state: 'out' } } },
      { type: 'done', status: 'complete' },
    ];
    return new Response(events.map(encodeChatEvent).join(''), { headers: { 'content-type': CHAT_STREAM_CONTENT_TYPE } });
  }

  const blocks = instructionBlocks('player', ctx);
  // Today's date and the screen the player is on: a system message after their own, never in the prompt.
  const context = await turnContext(sb, ctx, body.screen ?? null);
  const onFinished = (summary: TurnSummary) => {
    if (summary.usage.calls.length === 0) return;
    // The allowance and the ledger row run after the response is sent: the player was not waiting on a counter.
    const bookkeeping = async () => {
      const usd = turnCostUsd(summary.usage);
      await recordPlayerSpend({ playerId: ctx.player_id, teamId: ctx.team_id, zone: ctx.timezone, usd }).catch(() => undefined);
      try {
        const { error } = await createAdminClient()
          .from('golf_coachhelm_llm_calls')
          .insert({
            task: 'coach_chat',
            player_id: ctx.player_id,
            coach_id: null,
            model_id: CHAT_MODEL_LEDGER_ID,
            prompt_tokens: promptTokens(summary.usage),
            completion_tokens: summary.usage.output,
            cost_usd: usd,
            grounded: summary.grounded,
          } as never);
        if (error) throw new Error(error.message);
      } catch (err) {
        void logServerError(`player ask: llm ledger failed: ${err instanceof Error ? err.message : 'unknown'}`, { action: 'coachhelm.ask.player' }, 'warning');
      }
    };
    try {
      after(bookkeeping);
    } catch {
      void bookkeeping();
    }
  };

  return chatTurnResponse(
    {
      model: anthropicModelClient,
      tools: toolsFor('player', ctx),
      system: { stable: blocks.policy, team: blocks.team },
      toolContext: { sb, who: ctx, conversationId, surface: 'player', loaders: loadersFor(ctx) },
      tasks: null,
      maxSteps: PLAYER_MAX_STEPS,
      features: chatFeatures(),
      turnNote: context.line,
      requestSignal: signal,
      store: null,
      clientTurnId: body.clientTurnId,
      describeError: describePlayerError,
      checkGrounding: ({ text, reads }) => checkGrounding(text, reads),
      onFinished,
    },
    { kind: 'message', text: body.text },
  );
}
