import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { encodeChatEvent, type ChatEvent, type ChatUIMessage } from '@/lib/coachhelm/v3/chat/engine/protocol';
import { describeChatError } from '@/lib/coachhelm/v3/chat/error-message';
import { useCoachHelmChat } from '../useCoachHelmChat';

/**
 * The hook against the wire protocol. The failure these guard against is the old one: the browser owned the thread and
 * re-sent it, and a Confirm was a local state change that had to be turned into a resubmit of everything. Now a request
 * carries one new message or one decision, and nothing else.
 */

const CONVERSATION = '7b0c8c5e-5d0e-4d58-9d0b-0d2d1f1f4a11';
const KEY = 'focus:team-1:Putting:abc';

const sse = (events: ChatEvent[], init: ResponseInit = {}) =>
  new Response(events.map(encodeChatEvent).join(''), { ...init, headers: { 'content-type': 'text/event-stream', 'x-conversation-id': CONVERSATION, ...(init.headers ?? {}) } });

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const bodyOf = (call: number): Record<string, unknown> => JSON.parse(String(fetchMock.mock.calls[call]![1]!.body)) as Record<string, unknown>;

const answer = (text: string): ChatEvent[] => [
  { type: 'message_start', conversation_id: CONVERSATION, message_id: 'a1', resumed: false },
  { type: 'read_started', id: 'progress-1', label: 'Reading Avery’s rounds', tool: 'get_player_stats' },
  { type: 'read_finished', id: 'progress-1', label: 'Reading Avery’s rounds', tool: 'get_player_stats', state: 'done' },
  { type: 'text_delta', delta: text.slice(0, 4) },
  { type: 'text_delta', delta: text.slice(4) },
  { type: 'usage', input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
  { type: 'done', status: 'complete' },
];

const waitingCard: ChatUIMessage = {
  id: 'a-card',
  role: 'assistant',
  parts: [
    { type: 'text', text: 'Here is the focus area.' },
    { type: 'data-action-proposal', id: `proposal-${KEY}`, data: { idempotency_key: KEY, tool: 'create_focus_area', summary: 'Create it.' } },
    { type: 'tool-create_focus_area', toolCallId: 'tu_1', state: 'approval-requested', input: {}, approval: { id: KEY } },
  ],
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('useCoachHelmChat', () => {
  it('sends only the new message, never the thread, and folds the stream into the answer', async () => {
    fetchMock.mockResolvedValueOnce(sse(answer('Avery is at 71.4.')));
    const onConversationId = vi.fn();
    const { result } = renderHook(() => useCoachHelmChat({ surface: 'quick_chat', onConversationId, initialMessages: [{ id: 'old', role: 'assistant', parts: [{ type: 'text', text: 'Earlier.' }] }] }));

    act(() => result.current.send('  How is Avery scoring?  '));
    expect(result.current.busy).toBe(true);
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const body = bodyOf(0);
    expect(body).toMatchObject({ conversation_id: null, surface: 'quick_chat', message: 'How is Avery scoring?' });
    expect(typeof body.client_turn_id).toBe('string');
    expect(body).not.toHaveProperty('messages');

    expect(result.current.conversationId).toBe(CONVERSATION);
    expect(onConversationId).toHaveBeenCalledWith(CONVERSATION);
    expect(result.current.messages.map((m) => m.role)).toEqual(['assistant', 'user', 'assistant']);
    expect(result.current.messages.at(-1)!.parts).toEqual([
      { type: 'data-progress', id: 'progress-1', data: { label: 'Reading Avery’s rounds', tool: 'get_player_stats', state: 'done', done: 'Reading Avery’s rounds' } },
      { type: 'text', text: 'Avery is at 71.4.' },
    ]);
    expect(result.current.error).toBeUndefined();
  });

  it('the next question carries the conversation id the server minted', async () => {
    fetchMock.mockResolvedValueOnce(sse(answer('One.'))).mockResolvedValueOnce(sse(answer('Two.').map((e) => (e.type === 'message_start' ? { ...e, message_id: 'a2' } : e))));
    const { result } = renderHook(() => useCoachHelmChat());
    act(() => result.current.send('First'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => result.current.send('Second'));
    await waitFor(() => expect(result.current.messages).toHaveLength(4));
    expect(bodyOf(1)).toMatchObject({ conversation_id: CONVERSATION, message: 'Second' });
    expect(bodyOf(1).client_turn_id).not.toBe(bodyOf(0).client_turn_id);
  });

  it('passes on where the chat was opened from with each new message, as it is at that moment, and never with a decision', async () => {
    fetchMock
      .mockResolvedValueOnce(sse(answer('One.')))
      .mockResolvedValueOnce(sse(answer('Two.').map((e) => (e.type === 'message_start' ? { ...e, message_id: 'a2' } : e))))
      .mockResolvedValueOnce(sse([{ type: 'message_start', conversation_id: CONVERSATION, message_id: 'a-card', resumed: true }, { type: 'decision', key: KEY, approved: false }, { type: 'done', status: 'complete' }]));
    const { result, rerender } = renderHook(({ screen }: { screen: Record<string, unknown> | null }) => useCoachHelmChat({ screen, initialMessages: [waitingCard], conversationId: CONVERSATION }), {
      initialProps: { screen: { screen: 'roster', player_id: 'p-1' } as Record<string, unknown> | null },
    });
    act(() => result.current.send('Who is this?'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(bodyOf(0).screen).toEqual({ screen: 'roster', player_id: 'p-1' });

    // The coach moved to another screen: the next message says so. No caller has to re-create the hook.
    rerender({ screen: { screen: 'stats' } });
    act(() => result.current.send('And here?'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(bodyOf(1).screen).toEqual({ screen: 'stats' });

    // A decision continues a turn that already has its context.
    act(() => result.current.deny(KEY));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(bodyOf(2)).not.toHaveProperty('screen');
    expect(bodyOf(2)).toMatchObject({ decision: { key: KEY, approved: false } });
  });

  it('a caller that supplies no screen sends none', async () => {
    fetchMock.mockResolvedValueOnce(sse(answer('One.')));
    const { result } = renderHook(() => useCoachHelmChat());
    act(() => result.current.send('First'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(bodyOf(0)).not.toHaveProperty('screen');
  });

  it('Confirm sends the decision by the card’s key and the receipt lands in the same message', async () => {
    fetchMock.mockResolvedValueOnce(
      sse([
        { type: 'message_start', conversation_id: CONVERSATION, message_id: 'a-card', resumed: true },
        { type: 'decision', key: KEY, approved: true },
        { type: 'receipt', part: { type: 'data-action-receipt', id: `receipt-${KEY}`, data: { status: 'held', held_until: '2026-11-10T12:00:08Z' } } },
        { type: 'text_delta', delta: ' It is held for a few seconds.' },
        { type: 'done', status: 'complete' },
      ]),
    );
    const { result } = renderHook(() => useCoachHelmChat({ conversationId: CONVERSATION, initialMessages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Make it' }] }, waitingCard] }));

    act(() => result.current.approve(KEY));
    await waitFor(() => expect(result.current.status).toBe('ready'));

    const body = bodyOf(0);
    expect(body).toMatchObject({ conversation_id: CONVERSATION, decision: { key: KEY, approved: true } });
    expect(body).not.toHaveProperty('message');
    expect(body).not.toHaveProperty('messages');

    // No second assistant message: the decision continued the turn that holds the card.
    expect(result.current.messages).toHaveLength(2);
    const parts = result.current.messages[1]!.parts;
    expect(parts.find((p) => p.type === 'tool-create_focus_area')).toMatchObject({ state: 'approval-responded', approval: { id: KEY, approved: true } });
    expect(parts.find((p) => p.type === 'data-action-receipt')).toMatchObject({ id: `receipt-${KEY}`, data: { status: 'held' } });
    expect(parts.at(-1)).toEqual({ type: 'text', text: ' It is held for a few seconds.' });
  });

  it('Cancel sends approved false for the same key', async () => {
    fetchMock.mockResolvedValueOnce(sse([{ type: 'message_start', conversation_id: CONVERSATION, message_id: 'a-card', resumed: true }, { type: 'decision', key: KEY, approved: false }, { type: 'done', status: 'complete' }]));
    const { result } = renderHook(() => useCoachHelmChat({ conversationId: CONVERSATION, initialMessages: [waitingCard] }));
    act(() => result.current.deny(KEY));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(bodyOf(0)).toMatchObject({ decision: { key: KEY, approved: false } });
    expect(result.current.messages[0]!.parts.find((p) => p.type === 'tool-create_focus_area')).toMatchObject({ state: 'output-denied' });
  });

  it('a Confirm whose response was lost can be tried again: the same decision is sent, not a new question', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(sse([{ type: 'message_start', conversation_id: CONVERSATION, message_id: 'a-card', resumed: true }, { type: 'decision', key: KEY, approved: true }, { type: 'done', status: 'complete' }]));
    const { result } = renderHook(() => useCoachHelmChat({ conversationId: CONVERSATION, initialMessages: [waitingCard] }));
    act(() => result.current.approve(KEY));
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(bodyOf(1)).toMatchObject({ decision: { key: KEY, approved: true } });
    expect(bodyOf(1)).not.toHaveProperty('message');
    expect(result.current.messages).toHaveLength(1);
  });

  it('a refused request is an error the thread can explain', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'You have reached today’s analysis limit for your program. It resets tomorrow.', reason: 'budget_gated' }), { status: 429 }));
    const { result } = renderHook(() => useCoachHelmChat());
    act(() => result.current.send('Hello'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(describeChatError(result.current.error)).toEqual({ message: 'You have reached today’s analysis limit for your program. It resets tomorrow.', recovery: 'none' });
  });

  it('a server error event is shown in the coach’s words, and Try again asks under the same key', async () => {
    fetchMock
      .mockResolvedValueOnce(sse([{ type: 'message_start', conversation_id: CONVERSATION, message_id: 'a1', resumed: false }, { type: 'text_delta', delta: 'Avery is' }, { type: 'error', message: 'The model quota is exhausted.', action: 'retry' }, { type: 'done', status: 'failed' }]))
      .mockResolvedValueOnce(sse(answer('Avery is at 71.4.').map((e) => (e.type === 'message_start' ? { ...e, message_id: 'a2' } : e))));
    const { result } = renderHook(() => useCoachHelmChat());
    act(() => result.current.send('How is Avery scoring?'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(describeChatError(result.current.error).message).toBe('The model quota is exhausted.');

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(bodyOf(1).client_turn_id).toBe(bodyOf(0).client_turn_id);
    expect(bodyOf(1).message).toBe('How is Avery scoring?');
    // One question, one answer: the failed fragment is replaced, not kept beside the new answer.
    expect(result.current.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(result.current.messages[1]!.parts.at(-1)).toEqual({ type: 'text', text: 'Avery is at 71.4.' });
    expect(result.current.error).toBeUndefined();
  });

  it('a stream cut off before its last event is a failure, not an answer', async () => {
    fetchMock.mockResolvedValueOnce(sse([{ type: 'message_start', conversation_id: CONVERSATION, message_id: 'a1', resumed: false }, { type: 'text_delta', delta: 'Avery is' }]));
    const { result } = renderHook(() => useCoachHelmChat());
    act(() => result.current.send('How is Avery scoring?'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(describeChatError(result.current.error).recovery).toBe('retry');
  });

  it('under React StrictMode (every component mounts twice in development) a question just asked is still answered', async () => {
    fetchMock.mockResolvedValueOnce(sse(answer('Avery is at 71.4.')));
    const { result } = renderHook(() => useCoachHelmChat(), { wrapper: React.StrictMode });
    act(() => result.current.send('How is Avery scoring?'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]![1]!.signal as AbortSignal).aborted).toBe(false);
    expect(result.current.messages.at(-1)!.parts.at(-1)).toEqual({ type: 'text', text: 'Avery is at 71.4.' });
  });

  it('a new chat clears the thread, the conversation and the failure', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const { result } = renderHook(() => useCoachHelmChat({ conversationId: CONVERSATION }));
    act(() => result.current.send('Hello'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.newConversation());
    expect(result.current).toMatchObject({ messages: [], conversationId: null, status: 'ready', error: undefined });
  });
});
