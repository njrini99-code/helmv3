import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { applyChatEvent, type ChatEvent, type ChatUIMessage } from '@/lib/coachhelm/v3/chat/engine/protocol';
import { buildAssistantTurn, type AskStep } from '../../../../../data/coachhelm-chat-thread';
import { askScript } from '../../../../../preview/ask-script';
import { elapsedWords, islandModel, islandSteps, tally } from '../model';

const step = (id: string, over: Partial<AskStep> = {}): AskStep => ({ id, label: `Reading ${id}`, ...over });

/** Fold a script's first turn one event at a time, as the hook does, and say what the island would show after each. */
function replay(name: string) {
  let message: ChatUIMessage = { id: 'a-1', role: 'assistant', parts: [] } as unknown as ChatUIMessage;
  const frames: Array<{ event: ChatEvent['type']; head: string; more: number; states: string; faces: number; open: boolean }> = [];
  for (const timed of askScript(name, 'fast').turn.events) {
    const event = typeof timed.event === 'function' ? timed.event() : timed.event;
    message = applyChatEvent(message, event);
    const live = event.type !== 'done';
    const turn = buildAssistantTurn(message as unknown as UIMessage, { isLast: true, busy: live });
    const hasText = turn.blocks.some((b) => b.kind === 'text');
    const m = islandModel(turn, { live, hasText, waitingForCoach: false, seconds: 3, ended: false });
    frames.push({ event: event.type, head: m.head, more: m.more, states: m.steps.map((s) => `${s.id}:${s.state}`).join(' '), faces: m.steps.reduce((n, s) => n + s.subjects.length, 0), open: m.live && m.wide && !hasText });
  }
  return frames;
}

describe('the activity island: its model', () => {
  it('a step is waiting, running, done, failed or cut short, and says so in its own tense', () => {
    const live = islandSteps([step('a', { state: 'done', detail: '8 rounds' }), step('b'), step('c', { state: 'next' }), step('d', { state: 'failed' })], true);
    expect(live.map((s) => s.state)).toEqual(['done', 'active', 'waiting', 'failed']);
    expect(live.map((s) => s.label)).toEqual(['Read a', 'Reading b', 'Reading c', 'Couldn’t read d']);
    // Every read that has started and not finished is running, not only the newest: three reads at once are three rings.
    expect(islandSteps([step('a'), step('b'), step('c')], true).map((s) => s.state)).toEqual(['active', 'active', 'active']);
    // The turn ended under a running step (Stop, a lost connection): it never earned its check.
    expect(islandSteps([step('a', { state: 'done' }), step('b')], false).map((s) => s.state)).toEqual(['done', 'stopped']);
    // A turn stored before steps recorded how they ended is history, not an interruption.
    expect(islandSteps([step('a'), step('b')], false).map((s) => s.state)).toEqual(['done', 'done']);
  });

  it('says what a step found, and counts in words', () => {
    expect(tally({ n: 12, unit: 'rounds', more: true })).toBe('12 rounds and counting');
    expect(tally({ n: 1, unit: 'rounds', more: false })).toBe('1 round');
    expect(tally({ n: 1412, unit: 'putts', more: false })).toBe('1,412 putts');
    const [running, done, calc] = islandSteps([step('a', { count: { n: 5, unit: 'rounds', more: true } }), step('b', { state: 'done', count: { n: 7, unit: 'rounds', more: false }, ref: 'e2' }), step('c', { state: 'done', covers: { n: 12, of: 12, unit: 'players' } })], true);
    expect(running?.detail).toBe('5 rounds and counting');
    expect(done?.detail).toBe('7 rounds');
    expect(calc?.detail).toBe('12 of 12 players');
    // Only a finished step opens what it found.
    expect([running?.ref, done?.ref]).toEqual([null, 'e2']);
    expect(elapsedWords(0.2)).toBe('1s');
    expect(elapsedWords(72)).toBe('1m 12s');
  });

  it('the head never says a bare "Thinking": it names the work, then the writing, then how it ended', () => {
    const turn = (steps: AskStep[]) => ({ ...buildAssistantTurn({ id: 't', role: 'assistant', parts: [] } as unknown as UIMessage, { isLast: true, busy: true }), steps });
    const o = { live: true, hasText: false, waitingForCoach: false, seconds: null, ended: false };
    expect(islandModel(turn([]), o).head).toBe('Reading your question');
    const two = islandModel(turn([step('a'), step('b')]), o);
    expect([two.head, two.more]).toEqual(['Reading a', 1]);
    expect(islandModel(turn([step('a', { state: 'done' })]), o).head).toBe('Putting it together');
    expect(islandModel(turn([step('a', { state: 'done' })]), { ...o, hasText: true }).head).toBe('Writing the answer');
    expect(islandModel(turn([step('a', { state: 'done' })]), { ...o, live: false, waitingForCoach: true }).head).toBe('Waiting for you');
    const done = islandModel(turn([step('a', { state: 'done' }), step('b', { state: 'done' })]), { ...o, live: false, seconds: 6.2 });
    expect([done.head, done.settled, done.stopped]).toEqual(['Done · 2 steps · 6s', true, false]);
    const cut = islandModel(turn([step('a', { state: 'done' }), step('b')]), { ...o, live: false, ended: true });
    expect([cut.head, cut.stopped]).toEqual(['Stopped · 1 of 2 steps', true]);
    for (const m of [two, done, cut]) expect(m.head).not.toMatch(/thinking/i);
  });

  it('a calculation is named by the read it is running, and opens the island by itself', () => {
    const turn = { ...buildAssistantTurn({ id: 't', role: 'assistant', parts: [] } as unknown as UIMessage, { isLast: true, busy: true }), steps: [step('calc', { label: 'Working it out', kind: 'calculate' as const }), step('r1', { parentId: 'calc' })] };
    const m = islandModel(turn, { live: true, hasText: false, waitingForCoach: false, seconds: null, ended: false });
    expect([m.head, m.more, m.wide]).toEqual(['Reading r1', 0, true]);
    expect(m.steps.map((s) => s.child)).toEqual([false, true]);
  });
});

describe('the activity island: every change on screen is an engine event', () => {
  it('replaying a script gives the same island twice, and it only changes when a step event arrives', () => {
    for (const name of ['isl-one', 'isl-three', 'isl-team', 'isl-fail', 'isl-chart', 'isl-draft', 'isl-open', 'jonah']) {
      const a = replay(name);
      expect(replay(name), name).toEqual(a);
      a.forEach((f, i) => {
        const before = a[i - 1];
        if (!before || (before.states === f.states && before.faces === f.faces)) return;
        // A step joined, changed state or gained a face: the event that did it is a progress part or one of the engine's read events.
        expect(['part', 'read_started', 'read_finished', 'note', 'done'], `${name} #${i}`).toContain(f.event);
      });
    }
  });

  it('three reads at once: three rings, each closing on its own event, then the writing', () => {
    const f = replay('isl-three');
    const states = [...new Set(f.map((x) => x.states))];
    expect(states[0]).toBe('');
    expect(states).toContain('s1:active s2:active s3:active');
    expect(states[states.length - 1]).toBe('s1:done s2:done s3:done');
    // It opens by itself for three steps while the page is empty, and never once the answer has begun.
    expect(f.some((x) => x.open)).toBe(true);
    expect(f.filter((x) => x.head === 'Writing the answer').every((x) => !x.open)).toBe(true);
  });

  it('a whole-team calculation: twelve faces join one at a time under the calculation', () => {
    const f = replay('isl-team');
    const faces = [...new Set(f.map((x) => x.faces))];
    expect(faces).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(f.find((x) => x.states.includes('c2:active'))?.head).toBe('Reading every player’s rounds');
    expect(f[f.length - 1]?.states).toBe('c0:done c1:done c2:done c3:done');
  });

  it('steps the server knows are coming wait; one fails while the others finish', () => {
    const f = replay('isl-fail');
    const states = [...new Set(f.map((x) => x.states))];
    expect(states).toContain('q1:active q2:waiting q3:waiting');
    expect(states).toContain('q1:done q2:active q3:waiting');
    expect(states).toContain('q1:done q2:failed q3:active');
    expect(states[states.length - 1]).toBe('q1:done q2:failed q3:done');
  });

  it('one read never opens the island by itself; a draft ends with its steps done', () => {
    expect(replay('isl-one').some((x) => x.open)).toBe(false);
    expect(replay('isl-draft').pop()?.states).toBe('d1:done d2:done');
  });
});
