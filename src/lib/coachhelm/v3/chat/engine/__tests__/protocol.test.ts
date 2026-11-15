import { describe, expect, it } from 'vitest';
import { applyChatEvent, CHAT_ERROR_KINDS, createChatEventParser, encodeChatEvent, eventsForStoredParts, isChatErrorKind, pendingDecisionKeys, suggestionsOf, textOfParts, turnMetaOf, type ChatEvent, type ChatUIMessage } from '../protocol';

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

  it('a card withdrawn by a new question says so on the stored part, and replays so; a Cancel the coach pressed does not', () => {
    const waiting = fold([{ type: 'decision_needed', key: 'k', tool: 'create_task', tool_use_id: 'tu_1' }]);
    const withdrawn = fold([{ type: 'decision', key: 'k', approved: false, reason: 'superseded', message_id: 'm1' }], waiting);
    expect(withdrawn.parts[0]).toMatchObject({ state: 'output-denied', approval: { id: 'k', approved: false, reason: 'superseded' } });
    expect(eventsForStoredParts(withdrawn.parts).at(-1)).toEqual({ type: 'decision', key: 'k', approved: false, reason: 'superseded' });

    const cancelled = fold([{ type: 'decision', key: 'k', approved: false }], waiting);
    expect(cancelled.parts[0]).toMatchObject({ approval: { id: 'k', approved: false } });
    expect((cancelled.parts[0] as unknown as { approval: object }).approval).not.toHaveProperty('reason');
    // A Confirm is never "superseded", whatever an event claims.
    const confirmed = fold([{ type: 'decision', key: 'k', approved: true, reason: 'superseded' }], waiting);
    expect((confirmed.parts[0] as unknown as { approval: object }).approval).toEqual({ id: 'k', approved: true });
  });

  it('a card reopened because an earlier one in its batch failed waits again, without its held receipt, and replays as waiting', () => {
    const held: ChatEvent[] = [
      { type: 'decision_needed', key: 'k1', tool: 'create_task', tool_use_id: 'tu_1' },
      { type: 'decision_needed', key: 'k2', tool: 'create_event', tool_use_id: 'tu_2' },
      { type: 'decision', key: 'k1', approved: true },
      { type: 'receipt', part: { type: 'data-action-receipt', id: 'receipt-k1', data: { status: 'failed' } } },
      { type: 'decision', key: 'k2', approved: true },
      { type: 'receipt', part: { type: 'data-action-receipt', id: 'receipt-k2', data: { status: 'held' } } },
    ];
    const before = fold(held);
    expect(pendingDecisionKeys(before)).toEqual([]);
    const after = applyChatEvent(before, { type: 'decision_reopened', key: 'k2', reason: 'batch_stopped' });
    expect(pendingDecisionKeys(after)).toEqual(['k2']);
    expect(after.parts.find((p) => p.type === 'tool-create_event')).toEqual({ type: 'tool-create_event', toolCallId: 'tu_2', state: 'approval-requested', input: {}, approval: { id: 'k2' } });
    // The other card and its receipt are untouched.
    expect(after.parts.filter((p) => p.type === 'data-action-receipt').map((p) => p.id)).toEqual(['receipt-k1']);
    expect(after.parts.find((p) => p.type === 'tool-create_task')).toMatchObject({ state: 'approval-responded' });
    // Stored that way, it replays as a card that waits: no decision for it.
    expect(eventsForStoredParts(after.parts).filter((e) => e.type === 'decision').map((e) => (e as { key: string }).key)).toEqual(['k1']);
    // For a card the message does not hold it changes nothing.
    expect(applyChatEvent(before, { type: 'decision_reopened', key: 'other', reason: 'batch_stopped' })).toBe(before);
  });

  it('a draft fills in field by field in one part, gives way when it is accepted, and stays as failed when it is not', () => {
    const writing = fold([
      { type: 'text_delta', delta: 'Here is Tuesday.' },
      { type: 'draft_delta', id: 'tu_1', tool: 'create_practice', fields: { title: 'Tuesday' }, open: 'blocks' },
      { type: 'draft_delta', id: 'tu_1', tool: 'create_practice', fields: { blocks: [{ name: 'Lag putting' }] }, open: 'blocks' },
      { type: 'draft_delta', id: 'tu_1', tool: 'create_practice', fields: { blocks: [{ name: 'Lag putting' }, { name: 'Wedges' }], note: 'Bring a' }, open: 'note' },
    ]);
    expect(writing.parts).toEqual([
      { type: 'text', text: 'Here is Tuesday.' },
      { type: 'data-draft', id: 'draft-tu_1', data: { tool: 'create_practice', fields: { title: 'Tuesday', blocks: [{ name: 'Lag putting' }, { name: 'Wedges' }], note: 'Bring a' }, open: 'note', state: 'writing' } },
    ]);
    expect(applyChatEvent(writing, { type: 'draft_done', id: 'tu_1', state: 'done' }).parts).toEqual([{ type: 'text', text: 'Here is Tuesday.' }]);
    expect(applyChatEvent(writing, { type: 'draft_done', id: 'tu_1', state: 'failed' }).parts[1]).toMatchObject({ type: 'data-draft', data: { open: null, state: 'failed', fields: { title: 'Tuesday' } } });
    expect(applyChatEvent(writing, { type: 'draft_done', id: 'other', state: 'done' })).toBe(writing);
  });

  it('a finished read keeps its detail and its picture on the progress row; the thinking phase is never a part', () => {
    const picture = { kind: 'sg', rows: [] };
    const message = fold([
      { type: 'phase', phase: 'thinking' },
      { type: 'read_started', id: 'progress-1', label: 'Reading the team', tool: 'get_team_stats' },
      { type: 'read_finished', id: 'progress-1', label: 'Reading the team', tool: 'get_team_stats', state: 'done', detail: '38 rounds', picture },
    ]);
    expect(message.parts).toEqual([{ type: 'data-progress', id: 'progress-1', data: { label: 'Reading the team', tool: 'get_team_stats', state: 'done', done: 'Reading the team', detail: '38 rounds', picture } }]);
  });

  it('a turn’s stored facts are read back from its meta part; a thread stored before it had one reads as none', () => {
    const meta = { started_at: '2026-11-10T12:00:00.000Z', duration_ms: 2100, reads: 3 };
    const message = fold([{ type: 'text_delta', delta: 'Hi.' }, { type: 'part', part: { type: 'data-turn-meta', id: 'turn-meta', data: { ...meta, duration_ms: 900 } } }, { type: 'part', part: { type: 'data-turn-meta', id: 'turn-meta', data: meta } }]);
    // Written again in place each time the turn is stored: one part, the latest facts.
    expect(message.parts.filter((p) => p.type === 'data-turn-meta')).toHaveLength(1);
    expect(turnMetaOf(message.parts)).toEqual(meta);
    expect(turnMetaOf([{ type: 'text', text: 'An answer stored in October.' }])).toBeNull();
    expect(turnMetaOf([{ type: 'data-turn-meta', id: 'turn-meta', data: { started_at: 5 } }])).toBeNull();
  });

  it('the kinds of failure are a closed set', () => {
    expect([...CHAT_ERROR_KINDS].sort()).toEqual(['budget', 'card_gone', 'card_retry', 'declined', 'gone', 'lost', 'model', 'off', 'offline', 'rate', 'signed_out', 'truncated']);
    expect(isChatErrorKind('truncated')).toBe(true);
    expect(isChatErrorKind('something_else')).toBe(false);
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

describe('what to ask next, as a part of the message', () => {
  const A = { label: 'Avery from 6 to 10 feet', prompt: 'How does Avery putt from 6 to 10 feet?', kind: 'read' as const };
  const B = { label: 'Against the team', prompt: 'How does that compare with the team?', kind: 'compare' as const };
  const C = { label: 'Set a putting focus area', prompt: 'Set up a putting focus area for Avery.', kind: 'action' as const };

  it('is one part after the answer, replaced whole when sent again and withdrawn by an empty list', () => {
    const answered = fold([{ type: 'text_delta', delta: 'Avery loses 0.4.' }, { type: 'done', status: 'complete' }]);
    const once = applyChatEvent(answered, { type: 'suggestions', items: [A, B] });
    expect(once.parts).toEqual([{ type: 'text', text: 'Avery loses 0.4.' }, { type: 'data-suggestions', id: 'suggestions', data: { items: [A, B] } }]);
    expect(suggestionsOf(once.parts)).toEqual([A, B]);
    const twice = applyChatEvent(once, { type: 'suggestions', items: [C, A] });
    expect(twice.parts.filter((p) => p.type === 'data-suggestions')).toEqual([{ type: 'data-suggestions', id: 'suggestions', data: { items: [C, A] } }]);
    expect(applyChatEvent(twice, { type: 'suggestions', items: [] }).parts).toEqual([{ type: 'text', text: 'Avery loses 0.4.' }]);
    // Withdrawing what is not there changes nothing, by identity.
    expect(applyChatEvent(answered, { type: 'suggestions', items: [] })).toBe(answered);
    // They are not words of the answer.
    expect(textOfParts(once.parts)).toBe('Avery loses 0.4.');
  });

  it('only a suggestion in the shape is kept, from the wire or from what was stored', () => {
    const odd = [A, { label: 'No prompt', kind: 'read' }, { label: 'x', prompt: 'y', kind: 'chat' }, null, 'words', B] as never;
    expect(suggestionsOf(applyChatEvent(empty(), { type: 'suggestions', items: odd }).parts)).toEqual([A, B]);
    expect(suggestionsOf([{ type: 'data-suggestions', id: 'suggestions', data: { items: odd } }])).toEqual([A, B]);
    expect(suggestionsOf([{ type: 'data-suggestions', id: 'suggestions', data: { items: 'none' } }])).toEqual([]);
    expect(suggestionsOf([{ type: 'data-suggestions', id: 'suggestions' }])).toEqual([]);
    expect(suggestionsOf([{ type: 'text', text: 'An answer.' }])).toEqual([]);
  });

  it('a stored message with them is rebuilt with them, by the event that carried them', () => {
    const stored = fold([{ type: 'text_delta', delta: 'Avery loses 0.4.' }, { type: 'suggestions', items: [A, B] }]);
    const events = eventsForStoredParts(stored.parts);
    expect(events).toEqual([{ type: 'text_delta', delta: 'Avery loses 0.4.' }, { type: 'suggestions', items: [A, B] }]);
    expect(fold(events).parts).toEqual(stored.parts);
    // A stored part that holds nothing usable is not replayed at all.
    expect(eventsForStoredParts([{ type: 'data-suggestions', id: 'suggestions', data: { items: [] } }])).toEqual([]);
  });

  it('a thread stored before suggestions existed is untouched', () => {
    const old = { id: 'a0', role: 'assistant' as const, parts: [{ type: 'text', text: 'An older answer.' }, { type: 'data-evidence', id: 'evidence-e1', data: { ref: 'e1' } }] };
    expect(suggestionsOf(old.parts)).toEqual([]);
    expect(fold(eventsForStoredParts(old.parts)).parts).toEqual(old.parts);
  });
});
