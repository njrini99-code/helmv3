import { describe, expect, it } from 'vitest';
import { rulesBlock } from '../instructions';
import { restoreUIMessages } from '../restore';
import type { ChatMessage } from '../types';

/**
 * Coach audit 13 Nov 2026 (§3c Ask): an answer's headline was "Oops, I added a stray key." The model is told not to, and a
 * stored turn is restored without it, so a reloaded thread never leads with the model talking to itself.
 */
const ANSWER = 'Cole Bennett gains 0.4 strokes a round putting over his last 10 rounds. Most of it is from 3 to 5 feet.';
const row = (over: Partial<ChatMessage>): ChatMessage =>
  ({ id: 'm1', conversation_id: 'c1', role: 'assistant', content: '', tool_calls: null, tool_results: null, cost_usd: null, created_at: '2026-11-13T04:00:00Z', client_turn_id: null, status: 'complete', ui_parts: null, ...over }) as ChatMessage;
const textOf = (m: { parts: unknown[] } | undefined) => (m?.parts.find((p) => (p as { type: string }).type === 'text') as { text?: string } | undefined)?.text;

describe('the instructions', () => {
  it('ask for the answer first, with no apology or note about the model’s own work', () => {
    expect(rulesBlock('ask')).toMatch(/Never mention tools, ids, tables, how you worked or a slip you fixed \("Oops"\)/);
  });
});

describe('a restored turn', () => {
  it('drops the self-talk at the top of a stored answer’s parts', () => {
    const [m] = restoreUIMessages([row({ ui_parts: [{ type: 'text', text: `Oops, I added a stray key. ${ANSWER}` }] })]);
    expect(textOf(m)).toBe(ANSWER);
  });

  it('and of a legacy answer stored as content', () => {
    const [m] = restoreUIMessages([row({ content: `My mistake, that key was wrong. ${ANSWER}` })]);
    expect(textOf(m)).toBe(ANSWER);
  });

  it('never touches what the coach wrote', () => {
    const [m] = restoreUIMessages([row({ role: 'user', content: 'Oops, I meant Cole. How is his putting?' })]);
    expect(textOf(m)).toBe('Oops, I meant Cole. How is his putting?');
  });
});
