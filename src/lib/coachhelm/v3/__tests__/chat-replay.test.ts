import { describe, it, expect } from 'vitest';
import { Chat } from '@ai-sdk/react';
import { createUIMessageStream, createUIMessageStreamResponse, DefaultChatTransport } from 'ai';
import { storedTurnChunks } from '@/lib/coachhelm/v3/chat/restore';
import type { ChatMessage } from '@/lib/coachhelm/v3/chat/types';

/**
 * A retry of a turn that already has an answer.
 *
 * The stream route replays the stored answer instead of running the paid agent
 * again. It used to send `{ replayed: true, messages }` as JSON with a 200; the
 * chat client reads a UI message stream, parsed that as an empty one, and Try
 * again finished with no answer and no error. These tests drive the real
 * `Chat` and `DefaultChatTransport` against what the route now sends.
 */

const row = (over: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'row-1',
  conversation_id: 'conv-1',
  role: 'assistant',
  content: 'Putting is steady this month.',
  tool_calls: null,
  tool_results: null,
  cost_usd: null,
  created_at: '2026-09-30T12:00:00.000Z',
  client_turn_id: 'turn-1',
  status: 'complete',
  ui_parts: null,
  ...over,
});

/** The browser's chat, talking to a stub `fetch` that answers as the route does. */
function chatAnswering(response: () => Response) {
  const transport = new DefaultChatTransport({ api: '/api/coachhelm/v3/chat/stream', fetch: async () => response() });
  return new (Chat as unknown as new (options: unknown) => {
    sendMessage: (message: unknown) => Promise<void>;
    status: string;
    error: unknown;
    messages: Array<{ role: string; parts: Array<{ type: string; text?: string; data?: unknown }> }>;
  })({ transport });
}

/** What `route.ts` returns for a replayed turn. */
function replayResponse(stored: ChatMessage): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: ({ writer }) => {
        for (const chunk of storedTurnChunks(stored)) writer.write(chunk as Parameters<typeof writer.write>[0]);
      },
    }),
    headers: { 'x-conversation-id': stored.conversation_id },
  });
}

describe('storedTurnChunks', () => {
  it('turns a legacy row (content only) into a start, one text part and a finish', () => {
    expect(storedTurnChunks(row())).toEqual([
      { type: 'start' },
      { type: 'text-start', id: 'replay-text-0' },
      { type: 'text-delta', id: 'replay-text-0', delta: 'Putting is steady this month.' },
      { type: 'text-end', id: 'replay-text-0' },
      { type: 'finish' },
    ]);
  });

  it('keeps what a reload would show — prose and data parts — and nothing else', () => {
    const chunks = storedTurnChunks(
      row({
        ui_parts: [
          { type: 'step-start' },
          { type: 'text', text: 'Here is the trend.' },
          { type: 'data-evidence', id: 'ev-1', data: { tool: 'get_recent_rounds' } },
          { type: 'tool-create_focus_area', toolCallId: 'call_1', state: 'approval-requested' },
          { type: 'reasoning', text: 'private' },
        ],
      }),
    );

    expect(chunks.map((c) => c.type)).toEqual(['start', 'text-start', 'text-delta', 'text-end', 'data-evidence', 'finish']);
    expect(chunks.find((c) => c.type === 'data-evidence')).toEqual({
      type: 'data-evidence',
      id: 'ev-1',
      data: { tool: 'get_recent_rounds' },
    });
  });
});

describe('a retry that lands on an already-answered turn, through the real chat client', () => {
  it('shows the stored answer, with no error', async () => {
    const chat = chatAnswering(() =>
      replayResponse(
        row({
          ui_parts: [
            { type: 'text', text: 'Putting is steady this month.' },
            { type: 'data-evidence', id: 'ev-1', data: { tool: 'get_recent_rounds' } },
          ],
        }),
      ),
    );

    await chat.sendMessage({ text: 'How is the team putting?' });

    expect(chat.error).toBeUndefined();
    expect(chat.status).toBe('ready');
    expect(chat.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    const parts = chat.messages[1]!.parts;
    expect(parts.find((p) => p.type === 'text')?.text).toBe('Putting is steady this month.');
    expect(parts.find((p) => p.type === 'data-evidence')?.data).toEqual({ tool: 'get_recent_rounds' });
  });

  it('why this changed: the old JSON reply left the thread with a question and no answer, and no error', async () => {
    const chat = chatAnswering(
      () =>
        new Response(JSON.stringify({ conversation_id: 'conv-1', replayed: true, messages: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    await chat.sendMessage({ text: 'How is the team putting?' });

    expect(chat.error).toBeUndefined();
    expect(chat.messages.map((m) => m.role)).toEqual(['user']);
  });
});
