import { describe, expect, it } from 'vitest';
import { buildAssistantTurn, sourceLine } from '../coachhelm-chat-thread';
import { withoutSelfTalk } from '@/lib/coachhelm/v3/chat/self-talk';

/**
 * Coach audit 13 Nov 2026 (§3c Ask): the progress card printed "Couldn't build the visual" twice before the visual came;
 * an answer's headline was "Oops, I added a stray key."; and "computed Nov 13" was stamped at 11 PM Eastern on 12 Nov.
 */
const step = (id: string, tool: string, state: 'done' | 'failed' | 'active') => ({
  type: 'data-progress',
  id: `st-${id}`,
  data: { label: 'Building the visual', tool, state, done: 'Built the visual' },
});
const text = (t: string) => ({ type: 'text', text: t });
const turn = (...parts: unknown[]) => {
  const t = buildAssistantTurn({ id: 'a1', role: 'assistant', parts } as never, { isLast: false, busy: false });
  if (t.role !== 'assistant') throw new Error('assistant turn expected');
  return t;
};

describe('a visual that failed and was then drawn', () => {
  it('shows no failure: the two misses read as a retry', () => {
    const t = turn(step('1', 'show_visual', 'failed'), step('2', 'show_visual', 'failed'), step('3', 'show_visual', 'done'));
    expect(t.steps.some((s) => s.state === 'failed')).toBe(false);
    expect(t.steps.at(-1)?.done).toBe('Built the visual');
  });

  it('while the next try is running, the miss before it is not shown as a failure either', () => {
    const t = turn(step('1', 'show_visual', 'failed'), step('2', 'show_visual', 'active'));
    expect(t.steps.some((s) => s.state === 'failed')).toBe(false);
  });

  it('a miss nothing came after is still told', () => {
    const t = turn(step('1', 'show_visual', 'failed'));
    expect(t.steps[0]?.state).toBe('failed');
  });

  it('only the last of several misses is told when none succeeded', () => {
    const t = turn(step('1', 'show_visual', 'failed'), step('2', 'show_visual', 'failed'));
    expect(t.steps.filter((s) => s.state === 'failed')).toHaveLength(1);
  });
});

describe('the model talking to itself is not the headline', () => {
  const ANSWER = 'Cole Bennett gains 0.4 strokes a round putting over his last 10 rounds. Most of it is from 3 to 5 feet.';

  it('drops an opening apology or self-correction, so the answer’s first claim leads', () => {
    expect(withoutSelfTalk(`Oops, I added a stray key. ${ANSWER}`)).toBe(ANSWER);
    expect(withoutSelfTalk(`Sorry about that. Let me fix the chart. ${ANSWER}`)).toBe(ANSWER);
    expect(withoutSelfTalk(`My mistake, that key was wrong. ${ANSWER}`)).toBe(ANSWER);
  });

  it('leaves an answer that opens with its claim alone, and never empties one that is only self-talk', () => {
    expect(withoutSelfTalk(ANSWER)).toBe(ANSWER);
    expect(withoutSelfTalk('Sorry, I couldn’t draw that.')).toBe('Sorry, I couldn’t draw that.');
  });

  it('the answer’s lead block opens with the claim', () => {
    const t = turn(text(`Oops, I added a stray key. ${ANSWER}`));
    const lead = t.blocks.find((b) => b.kind === 'text');
    expect(lead && lead.kind === 'text' ? lead.text : '').toBe(ANSWER);
  });
});

describe('the computed stamp is the team’s day', () => {
  const m = { sample_size: 110, sample_unit: 'rounds' as const, window_start: null, window_end: null, as_of: '2026-11-13T04:10:00Z' };

  it('11:10 PM Eastern on 12 Nov is "computed Nov 12" for a team in New York', () => {
    expect(sourceLine(m, 'America/New_York')).toBe('110 rounds · computed Nov 12');
  });

  it('midnight UTC exactly is a date stored as a moment, and is read as written', () => {
    expect(sourceLine({ ...m, as_of: '2026-10-21T00:00:00Z' }, 'America/New_York')).toBe('110 rounds · computed Oct 21');
  });

  it('a date with no time is read as written', () => {
    expect(sourceLine({ ...m, as_of: '2026-11-13' }, 'America/Los_Angeles')).toBe('110 rounds · computed Nov 13');
  });
});
