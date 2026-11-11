import { describe, expect, it } from 'vitest';
import { applyChatEvent, createChatEventParser, encodeChatEvent, eventsForStoredParts, pendingDecisionKeys, textOfParts, type ChatEvent, type ChatUIMessage } from '../protocol';

const empty = (): ChatUIMessage => ({ id: 'a1', role: 'assistant', parts: [] });
const fold = (events: ChatEvent[], from: ChatUIMessage = empty()) => events.reduce(applyChatEvent, from);

describe('the chat wire protocol', () => {
  it('survives any chunking of the response body', () => {
    const events: ChatEvent[] = [
      { type: 'message_start', conversation_id: 'c', message_id: 'a1', resumed: false },
      { type: 'text_delta', delta: 'Putting from 6 feet:\n\n71% — "good"' },
      { type: 'done', status: 'complete' },
    ];
    const wire = events.map(encodeChatEvent).join('');
    for (const size of [1, 2, 7, 64, wire.length]) {
      const parse = createChatEventParser();
      const out: ChatEvent[] = [];
      for (let i = 0; i < wire.length; i += size) out.push(...parse(wire.slice(i, i + size)));
      expect(out).toEqual(events);
    }
  });

  it('skips a frame that is not one of ours and never emits a torn one', () => {
    const parse = createChatEventParser();
    expect(parse(': keep-alive\n\ndata: not json\n\ndata: {"type":"text_delta","delta":"a"}\n\ndata: {"type":"text_de')).toEqual([{ type: 'text_delta', delta: 'a' }]);
  });
});

describe('the reducer both ends fold the stream with', () => {
  it('builds the stored part shapes: text joins, a progress row updates in place, a card carries its decision', () => {
    const message = fold([
      { type: 'text_delta', delta: 'Let me ' },
      { type: 'text_delta', delta: 'look.' },
      { type: 'read_started', id: 'progress-1', label: 'Reading Avery’s rounds', tool: 'get_rounds' },
      { type: 'read_finished', id: 'progress-1', label: 'Reading Avery’s rounds', tool: 'get_rounds', state: 'done', detail: '38 rounds' },
      { type: 'evidence', part: { type: 'data-evidence', id: 'evidence-e1', data: { ref: 'e1' } } },
      { type: 'text_delta', delta: 'Here it is.' },
      { type: 'proposal', part: { type: 'data-action-proposal', id: 'proposal-k', data: { idempotency_key: 'k', tool: 'create_task' } } },
      { type: 'decision_needed', key: 'k', tool: 'create_task', tool_use_id: 'tu_1' },
    ]);
    expect(message.parts).toEqual([
      { type: 'text', text: 'Let me look.' },
      { type: 'data-progress', id: 'progress-1', data: { label: 'Reading Avery’s rounds', tool: 'get_rounds', state: 'done', done: 'Reading Avery’s rounds', detail: '38 rounds' } },
      { type: 'data-evidence', id: 'evidence-e1', data: { ref: 'e1' } },
      { type: 'text', text: 'Here it is.' },
      { type: 'data-action-proposal', id: 'proposal-k', data: { idempotency_key: 'k', tool: 'create_task' } },
      { type: 'tool-create_task', toolCallId: 'tu_1', state: 'approval-requested', input: {}, approval: { id: 'k' } },
    ]);
    expect(pendingDecisionKeys(message)).toEqual(['k']);
    expect(textOfParts(message.parts)).toBe('Let me look.\n\nHere it is.');

    const confirmed = fold([{ type: 'decision', key: 'k', approved: true }, { type: 'receipt', part: { type: 'data-action-receipt', id: 'receipt-k', data: { status: 'held' } } }, { type: 'receipt', part: { type: 'data-action-receipt', id: 'receipt-k', data: { status: 'completed' } } }], message);
    expect(pendingDecisionKeys(confirmed)).toEqual([]);
    expect(confirmed.parts.at(-2)).toMatchObject({ state: 'approval-responded', approval: { id: 'k', approved: true } });
    // A later receipt for the same card replaces the earlier one: one card, one receipt.
    expect(confirmed.parts.filter((p) => p.type === 'data-action-receipt')).toEqual([{ type: 'data-action-receipt', id: 'receipt-k', data: { status: 'completed' } }]);

    const cancelled = fold([{ type: 'decision', key: 'k', approved: false }], message);
    expect(cancelled.parts.at(-1)).toMatchObject({ state: 'output-denied', approval: { id: 'k', approved: false } });
  });

  it('a progress note from the model is a finished progress row between the words; an empty one draws nothing', () => {
    const message = fold([
      { type: 'text_delta', delta: 'Checking.' },
      { type: 'note', id: 'note-1', text: '  Comparing the last five rounds with the season  ' },
      { type: 'note', id: 'note-2', text: '   ' },
      { type: 'text_delta', delta: 'Done.' },
    ]);
    expect(message.parts).toEqual([
      { type: 'text', text: 'Checking.' },
      { type: 'data-progress', id: 'note-1', data: { label: 'Comparing the last five rounds with the season', tool: 'note', state: 'done', done: 'Comparing the last five rounds with the season' } },
      { type: 'text', text: 'Done.' },
    ]);
  });

  it('returns the same message when an event changes nothing, and withdraws only the words of the step in progress', () => {
    const message = fold([{ type: 'text_delta', delta: 'First answer.' }, { type: 'read_started', id: 'p1', label: 'Reading', tool: 't' }, { type: 'text_delta', delta: 'I can' }]);
    expect(applyChatEvent(message, { type: 'usage', input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0 })).toBe(message);
    expect(applyChatEvent(message, { type: 'decision', key: 'nope', approved: true })).toBe(message);
    expect(textOfParts(applyChatEvent(message, { type: 'text_discard' }).parts)).toBe('First answer.');
  });

  it('a stored turn replays as the events that rebuild it, without its progress rows', () => {
    const stored = fold([
      { type: 'read_started', id: 'progress-1', label: 'Reading', tool: 'get_rounds' },
      { type: 'evidence', part: { type: 'data-evidence', id: 'evidence-e1', data: { ref: 'e1' } } },
      { type: 'text_delta', delta: 'Done.' },
      { type: 'proposal', part: { type: 'data-action-proposal', id: 'proposal-k', data: { idempotency_key: 'k' } } },
      { type: 'decision_needed', key: 'k', tool: 'create_task', tool_use_id: 'tu_1' },
      { type: 'decision', key: 'k', approved: true },
    ]);
    const rebuilt = fold(eventsForStoredParts(stored.parts));
    expect(rebuilt.parts).toEqual(stored.parts.filter((p) => p.type !== 'data-progress'));
  });
});
