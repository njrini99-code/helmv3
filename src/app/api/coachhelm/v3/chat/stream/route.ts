/**
 * v3 coach chat — streaming send endpoint (Fairway Ask, redesign path).
 *
 * Same auth, budget gate, idempotency, and persistence contract as
 * POST /api/coachhelm/v3/chat/send — but streams text-delta + tool events
 * over SSE while the ToolLoopAgent runs.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { buildCoachChatAgent } from '@/lib/coachhelm/v3/chat/agent';
import {
  createConversation,
  findAssistantTurn,
  getConversation,
  listMessages,
  upsertUserTurn,
} from '@/lib/coachhelm/v3/chat/persistence';
import { estimateCostUsd, MODEL_FOR_TASK } from '@/lib/coachhelm/v3/llm/types';
import { checkBudget } from '@/lib/coachhelm/v3/llm/budget';
import { isGoalProposal } from '@/lib/coachhelm/v3/chat/types';
import {
  listConversationMessages,
  persistCoachChatTurn,
  persistFailedCoachChatTurn,
} from '@/lib/coachhelm/v3/chat/persist-turn';
import { toolDisplayLabel } from '@/components/fairway/pages/coachhelm/chat/tool-labels';
import type { ModelMessage } from 'ai';

const CHAT_TURN_COST_ESTIMATE_USD = estimateCostUsd(
  MODEL_FOR_TASK.coach_chat,
  8000,
  1500,
);

const SendBody = z.object({
  conversation_id: z.string().uuid().optional(),
  user_message: z.string().min(1).max(4000),
  client_turn_id: z.string().min(1).max(128).optional(),
});

type StreamEvent =
  | { type: 'meta'; conversation_id: string }
  | { type: 'text-delta'; delta: string }
  | { type: 'tool'; name: string; label: string }
  | { type: 'proposal'; proposal: unknown }
  | { type: 'done'; conversation_id: string; messages: Awaited<ReturnType<typeof listMessages>> }
  | { type: 'error'; error: string; reason?: string };

function sseLine(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const { data: coach } = await supabase
    .from('golf_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) {
    return new Response(JSON.stringify({ error: 'Not a coach' }), { status: 403 });
  }

  let parsedBody: z.infer<typeof SendBody>;
  try {
    const json = await req.json();
    const parsed = SendBody.safeParse(json);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 });
    }
    parsedBody = parsed.data;
  } catch {
    return new Response(JSON.stringify({ error: 'Bad request' }), { status: 400 });
  }

  const clientTurnId = parsedBody.client_turn_id ?? null;
  let conversationId = parsedBody.conversation_id;

  if (conversationId) {
    const existing = await getConversation(supabase, conversationId);
    if (!existing || existing.coach_id !== coach.id) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), { status: 404 });
    }
    if (clientTurnId) {
      const existingAssistant = await findAssistantTurn(supabase, conversationId, clientTurnId);
      if (existingAssistant) {
        const messages = await listMessages(supabase, conversationId);
        const encoder = new TextEncoder();
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                sseLine({ type: 'meta', conversation_id: conversationId! }),
              ),
            );
            controller.enqueue(
              encoder.encode(
                sseLine({
                  type: 'done',
                  conversation_id: conversationId!,
                  messages,
                }),
              ),
            );
            controller.close();
          },
        });
        return new Response(body, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            Connection: 'keep-alive',
          },
        });
      }
    }
  } else {
    const created = await createConversation(supabase, {
      coach_id: coach.id,
      title: parsedBody.user_message.slice(0, 60),
    });
    conversationId = created.id;
  }

  const admin = createAdminClient();
  const gate = await checkBudget(admin, coach.id, CHAT_TURN_COST_ESTIMATE_USD);
  if (!gate.allowed) {
    return new Response(
      JSON.stringify({
        error: 'LLM budget exhausted for today',
        reason: gate.fallback_reason ?? 'budget_gated',
        remaining_usd: gate.remaining_usd,
      }),
      { status: 429 },
    );
  }

  await upsertUserTurn(supabase, {
    conversation_id: conversationId,
    content: parsedBody.user_message,
    client_turn_id: clientTurnId,
  });

  const prior = await listMessages(supabase, conversationId);
  const history: ModelMessage[] = prior
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content)
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content ?? '',
    }));

  const encoder = new TextEncoder();
  const convId = conversationId;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(sseLine(event)));
      };

      send({ type: 'meta', conversation_id: convId });

      try {
        const agent = await buildCoachChatAgent({
          sb: supabase,
          authed_user_id: user.id,
          coach_id: coach.id,
        });

        let result: Awaited<ReturnType<typeof agent.stream>>;
        try {
          result = await agent.stream({ messages: history });
        } catch (agentErr) {
          const m = agentErr instanceof Error ? agentErr.message : String(agentErr);
          const isUpstreamQuota =
            m.includes('Free tier users do not have access to this model') ||
            (m.includes('AI Gateway') && /quota|credit|tier/i.test(m));
          if (isUpstreamQuota) throw agentErr;

          await logServerError(
            `chat/stream: agent.stream failed — ${m}`,
            { action: 'v3.chat.stream.agent' },
            'warning',
          );
          await persistFailedCoachChatTurn({
            supabase,
            conversationId: convId,
            clientTurnId,
          });
          const messages = await listConversationMessages(supabase, convId);
          send({ type: 'done', conversation_id: convId, messages });
          controller.close();
          return;
        }

        const seenTools = new Set<string>();
        try {
          for await (const part of result.fullStream) {
            if (part.type === 'text-delta' && part.text) {
              send({ type: 'text-delta', delta: part.text });
            } else if (part.type === 'tool-call' && part.toolName) {
              if (!seenTools.has(part.toolName)) {
                seenTools.add(part.toolName);
                send({
                  type: 'tool',
                  name: part.toolName,
                  label: toolDisplayLabel(part.toolName),
                });
              }
            } else if (part.type === 'tool-result' && 'output' in part) {
              if (isGoalProposal(part.output)) {
                send({ type: 'proposal', proposal: part.output });
              }
            }
          }
        } catch (streamErr) {
          const m = streamErr instanceof Error ? streamErr.message : String(streamErr);
          await logServerError(
            `chat/stream: fullStream iteration failed — ${m}`,
            { action: 'v3.chat.stream.iteration' },
            'warning',
          );
          await persistFailedCoachChatTurn({
            supabase,
            conversationId: convId,
            clientTurnId,
          });
          const messages = await listConversationMessages(supabase, convId);
          send({ type: 'done', conversation_id: convId, messages });
          controller.close();
          return;
        }

        const [text, usage, toolCalls, toolResults] = await Promise.all([
          result.text,
          result.usage,
          result.toolCalls,
          result.toolResults,
        ]);

        await persistCoachChatTurn({
          supabase,
          admin,
          coachId: coach.id,
          conversationId: convId,
          clientTurnId,
          userMessage: parsedBody.user_message,
          result: {
            text,
            usage: {
              inputTokens: usage?.inputTokens,
              outputTokens: usage?.outputTokens,
            },
            toolCalls: toolCalls?.map((c) => ({
              toolCallId: c.toolCallId,
              toolName: c.toolName,
              input: 'input' in c ? c.input : undefined,
            })),
            toolResults: toolResults?.map((r) => ({
              toolCallId: r.toolCallId,
              toolName: r.toolName,
              output: 'output' in r ? r.output : undefined,
            })),
          },
        });

        const messages = await listConversationMessages(supabase, convId);
        send({ type: 'done', conversation_id: convId, messages });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isUpstreamQuota =
          message.includes('Free tier users do not have access to this model') ||
          (message.includes('AI Gateway') && /quota|credit|tier/i.test(message));
        if (isUpstreamQuota) {
          send({
            type: 'error',
            error: 'Chat is temporarily unavailable',
            reason: 'upstream_quota',
          });
        } else {
          await logServerError(`chat/stream failed: ${message}`, { action: 'v3.chat.stream' });
          send({ type: 'error', error: 'Internal error' });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
