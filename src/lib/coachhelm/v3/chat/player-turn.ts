import 'server-only';
import { after, NextResponse } from 'next/server';
import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, stepCountIs, streamText, type UIMessage, type UIMessageStreamWriter } from 'ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2/gate';
import { resolveModelProvider } from '@/lib/ai/model-provider';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { estimateCachedCostUsd, MODEL_FOR_TASK } from '@/lib/coachhelm/v3/llm/types';
import { resolvePlayerChatContext } from './player-context';
import { CoachContextError } from './context';
import { buildPlayerTools, PLAYER_INSTRUCTIONS } from './player-tools';
import { readBucket, recordPlayerSpend } from './player-allowance';
import { auditPlayerAnswerCited, playerLedgerRow } from './player-audit';
import { CITES_CLOSE, CITES_OPEN, extractCites } from './cites';
import { withholdBlocks } from './stream-blocks';
import type { ToolEnvelope } from './provenance';
import type { PlayerFiguresSource, PuttBandsSource } from './read-tools';
import { stripReadMarkers } from './read-markers';
import { isIncompleteToolPart } from './ui-parts';
import { systemCached, withTailBreakpoint } from './prompt-cache';

/**
 * A player's turn on the same stream route (02 §13.1: the role comes from the session, never the request). No conversation is saved until HM3; the allowance is read before the model and written after, so no bucket means no ask (02 §16: no cap, no ship).
 */
export async function runPlayerTurn(sb: SupabaseClient<Database>, body: { messages: unknown[] }, signal: AbortSignal, playerFigures?: (timezone: string) => PlayerFiguresSource, puttBands?: (timezone: string) => PuttBandsSource): Promise<Response> {
  let ctx: Awaited<ReturnType<typeof resolvePlayerChatContext>>;
  try {
    ctx = await resolvePlayerChatContext(sb);
  } catch (err) {
    const status = err instanceof CoachContextError ? err.status : 500;
    return NextResponse.json({ error: 'Ask could not load.' }, { status });
  }
  // CoachHelm switched off for the player or their team answers nothing here, as for a coach (CH13-20). The gate fails closed on a lookup error.
  const helmGate = await isCoachHelmEnabledForPlayer(ctx.player_id);
  if (!helmGate.effectivelyEnabled) return NextResponse.json({ error: 'CoachHelm is off for your team.' }, { status: 403 });
  // The rate limit and the allowance do not depend on each other: one wait, not two (and still nothing is read for a team that is off).
  const [rl, bucket] = await Promise.all([checkRateLimit(`coachhelm:chat:player:${ctx.player_id}`, RATE_LIMITS.API_GENERAL), readBucket(ctx.player_id, ctx.timezone)]);
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  if (!bucket) return NextResponse.json({ error: 'Ask is off for your team.' }, { status: 403 });
  if (bucket === 'out') {
    return createUIMessageStreamResponse({
      stream: createUIMessageStream({ execute: ({ writer }) => writer.write({ type: 'data-allowance', id: 'allowance', data: { state: 'out' } }) }),
    });
  }
  const uiMessages = body.messages as UIMessage[];
  const first = ctx.roster[0]?.name.split(' ')[0] ?? 'there';
  const envelopes: ToolEnvelope[] = [];
  const evidenceRefs = new Map<string, ToolEnvelope>();
  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const tools = buildPlayerTools({ sb, ctx, playerId: ctx.player_id, writer, collect: (e) => envelopes.push(e), playerFigures: playerFigures?.(ctx.timezone), puttBands: puttBands?.(ctx.timezone), evidenceRefs });
      const result = streamText({
        model: resolveModelProvider(MODEL_FOR_TASK.coach_chat),
        abortSignal: signal,
        // The prompt and the conversation so far are cached (prompt-cache.ts): a step pays only for what the step before it added.
        instructions: systemCached(PLAYER_INSTRUCTIONS(first, ctx.team_name, ctx.timezone)),
        prepareStep: ({ messages }) => ({ messages: withTailBreakpoint(messages) }),
        messages: await convertToModelMessages(uiMessages.map((m) => ({ ...m, parts: m.parts.filter((p) => !isIncompleteToolPart(p)) })), { tools }),
        tools,
        stopWhen: stepCountIs(6),
        experimental_telemetry: { isEnabled: true, functionId: 'coachhelm.chat.player', recordInputs: false, recordOutputs: false },
      });
      // The citations block the model appends is machine-readable: the player never sees it, live or in a saved part.
      // The SDK's overload does not carry the chunk type through (the coach route casts it the same way); the writer's own parameter type is the source of truth.
      type Chunk = Parameters<UIMessageStreamWriter['write']>[0];
      const uiStream = result.toUIMessageStream({ sendReasoning: false, onError: () => 'CoachHelm couldn’t finish that answer.' }) as unknown as ReadableStream<Chunk>;
      writer.merge(uiStream.pipeThrough(withholdBlocks<Chunk>([[CITES_OPEN, CITES_CLOSE]])));
      const extracted = extractCites(await result.text);
      const text = stripReadMarkers(extracted.text);
      const { unsupported, citations } = auditPlayerAnswerCited({ text, envelopes, messages: uiMessages, timezone: ctx.timezone, roster: ctx.roster, cites: { cites: extracted.cites, evidence: evidenceRefs, blocks: extracted.blocks, invalid: extracted.invalid } });
      const usage = await result.usage;
      const input = usage.inputTokens ?? 0;
      const output = usage.outputTokens ?? 0;
      const usd = estimateCachedCostUsd(MODEL_FOR_TASK.coach_chat, input, output, usage.inputTokenDetails);
      // The allowance, the ledger row and the log line run after the response is sent: the stream stays open until `execute` returns, and the
      // player was waiting on bookkeeping that is theirs only in the sense of a counter.
      const bookkeeping = async () => {
        if (citations) await logServerEvent('player ask: citation coverage', { action: 'v3.chat.stream.citations', featureArea: 'coachhelm', skipSentry: true, extra: { ...citations, surface: 'player', outcome: unsupported.length === 0 ? 'accepted' : 'flagged' } }, 'info').catch(() => undefined);
        await recordPlayerSpend({ playerId: ctx.player_id, teamId: ctx.team_id, zone: ctx.timezone, usd }).catch(() => undefined);
        try {
          const { error } = await createAdminClient().from('golf_coachhelm_llm_calls').insert(playerLedgerRow({ playerId: ctx.player_id, promptTokens: input, completionTokens: output, costUsd: usd, unsupported, citations }));
          if (error) throw new Error(error.message);
        } catch (err) {
          void logServerError(`player ask: llm ledger failed: ${err instanceof Error ? err.message : 'unknown'}`, { action: 'coachhelm.ask.player' }, 'warning');
        }
      };
      // `after` only exists inside a request; anywhere else (a script, a test) the work is simply awaited, as it was before.
      try {
        after(bookkeeping);
      } catch {
        await bookkeeping();
      }
    },
  });
  return createUIMessageStreamResponse({ stream });
}
