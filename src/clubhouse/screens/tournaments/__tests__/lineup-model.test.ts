import { describe, expect, it } from 'vitest';
import {
  CHANCE_GATE,
  MAX_ENTRIES,
  candidateStats,
  chanceOf,
  draftOf,
  entriesOf,
  isEditable,
  nextOpen,
  notesOf,
  place,
  publishBlock,
  sameDraft,
  setCount,
  whereIs,
  whereWords,
  type LineupDraft,
} from '../lineup-model';
import type { ChTourEvent, ChTourPlayer, ChTourPlayerRound } from '../types';

const draft = (over: Partial<LineupDraft> = {}): LineupDraft => ({ slots: ['a', 'b', null, null, null], alternate: null, individuals: [], ...over });

describe('draftOf', () => {
  it('puts each player in the spot the event has them in, and leaves the rest empty', () => {
    const d = draftOf({ slots: [1, 2, 3].map((slot) => ({ slot, playerId: slot === 2 ? null : `p${slot}`, reason: null, squad: 'A' as const })), alternate: 'x', individuals: ['i'] });
    expect(d).toEqual({ slots: ['p1', null, 'p3'], alternate: 'x', individuals: ['i'] });
  });
});

describe('place (one role each, a spot holds one player)', () => {
  it('moves a player out of where they were', () => {
    const d = place(draft({ alternate: 'c' }), 'c', { kind: 'slot', slot: 3 });
    expect(d.slots).toEqual(['a', 'b', 'c', null, null]);
    expect(d.alternate).toBeNull();
  });

  it('swaps two players moving between spots, so a reorder loses nobody', () => {
    expect(place(draft(), 'a', { kind: 'slot', slot: 2 }).slots).toEqual(['b', 'a', null, null, null]);
  });

  it('sends a player who is replaced in a spot to the bench', () => {
    const d = place(draft(), 'z', { kind: 'slot', slot: 1 });
    expect(d.slots).toEqual(['z', 'b', null, null, null]);
    expect(whereIs(d, 'a')).toBeNull();
  });

  it('keeps one alternate: a second sends the first to the bench', () => {
    const d = place(draft({ alternate: 'c' }), 'd', { kind: 'alternate' });
    expect(d.alternate).toBe('d');
    expect(whereIs(d, 'c')).toBeNull();
  });

  it('makes someone an individual and not also a spot', () => {
    const d = place(draft(), 'a', { kind: 'individual' });
    expect(d.individuals).toEqual(['a']);
    expect(d.slots[0]).toBeNull();
  });

  it('puts a player back on the bench from anywhere', () => {
    const d = place(place(draft(), 'x', { kind: 'individual' }), 'x', { kind: 'bench' });
    expect(d.individuals).toEqual([]);
  });

  it('refuses a spot that does not exist and returns the same draft', () => {
    const d = draft();
    expect(place(d, 'z', { kind: 'slot', slot: 6 })).toBe(d);
    expect(place(d, 'a', { kind: 'slot', slot: 1 })).toBe(d);
  });

  it('stops at the entry cap', () => {
    const many = draft({ slots: ['a', null, null, null, null], individuals: Array.from({ length: MAX_ENTRIES - 1 }, (_, i) => `i${i}`) });
    expect(place(many, 'new', { kind: 'individual' })).toBe(many);
  });
});

describe('the draft’s numbers and payload', () => {
  it('counts the spots set and finds the next open one', () => {
    expect(setCount(draft())).toEqual({ set: 2, of: 5 });
    expect(nextOpen(draft())).toEqual({ kind: 'slot', slot: 3 });
    const full = draft({ slots: ['a', 'b', 'c', 'd', 'e'] });
    expect(nextOpen(full)).toEqual({ kind: 'alternate' });
    expect(nextOpen({ ...full, alternate: 'f' })).toBeNull();
  });

  it('writes lineup spots with their numbers, the alternate and the individuals, in that order', () => {
    expect(entriesOf(draft({ alternate: 'c', individuals: ['i'] }))).toEqual([
      { playerId: 'a', role: 'lineup', slot: 1 },
      { playerId: 'b', role: 'lineup', slot: 2 },
      { playerId: 'c', role: 'alternate', slot: null },
      { playerId: 'i', role: 'individual', slot: null },
    ]);
  });

  it('compares drafts by who and where', () => {
    expect(sameDraft(draft(), draft())).toBe(true);
    expect(sameDraft(draft(), place(draft(), 'a', { kind: 'bench' }))).toBe(false);
  });

  it('names where a player is', () => {
    expect(whereWords(whereIs(draft({ alternate: 'c' }), 'b'))).toBe('Spot 2');
    expect(whereWords(whereIs(draft({ alternate: 'c' }), 'c'))).toBe('Alternate');
    expect(whereWords(null)).toBe('');
  });

  it('is editable until it locks', () => {
    expect(isEditable('draft')).toBe(true);
    expect(isEditable('published')).toBe(true);
    expect(isEditable('locked')).toBe(false);
  });
});

const player = (id: string, over: Partial<ChTourPlayer> = {}): ChTourPlayer => ({ id, name: `${id} Name`, first: id, initials: id[0]!.toUpperCase(), year: 'Junior', avatarUrl: null, alumni: false, availability: 'available', ...over });

describe('warnings and the Publish block', () => {
  it('warns about an injured player but leaves the call to the coach', () => {
    const notes = notesOf(draft(), [player('a', { availability: 'injured' }), player('b')], new Map());
    expect(notes).toEqual([{ playerId: 'a', tone: 'warn', text: 'a is marked injured.' }]);
  });

  it('blocks a player who has left the team', () => {
    const notes = notesOf(draft(), [player('a', { alumni: true })], new Map());
    expect(notes[0]).toMatchObject({ tone: 'block' });
    expect(publishBlock(draft({ slots: ['a', 'b', 'c', 'd', 'e'] }), notes)).toContain('left the team');
  });

  it('wants every spot filled before it publishes', () => {
    expect(publishBlock(draft(), [])).toBe('Fill every spot to publish (2 of 5 set).');
    expect(publishBlock(draft({ slots: ['a', 'b', 'c', 'd', 'e'] }), [])).toBeNull();
  });
});

describe('count chance (D-93: a word, and only from six rounds)', () => {
  it('shows nothing below the gate and bands above it', () => {
    expect(chanceOf(0.9, CHANCE_GATE - 1)).toBeNull();
    expect(chanceOf(null, 10)).toBeNull();
    expect(chanceOf(0.8, CHANCE_GATE)).toBe('usually');
    expect(chanceOf(0.5, CHANCE_GATE)).toBe('often');
    expect(chanceOf(0.49, CHANCE_GATE)).toBe('sometimes');
  });
});

describe('candidateStats', () => {
  const round = (n: number, count: ChTourPlayerRound['count'], toPar: number): ChTourPlayerRound =>
    ({ eventId: 'e1', roundEventId: `r${n}`, roundNumber: n, playerId: 'a', role: 'lineup', slot: 1, squad: 'A', total: 72 + toPar, toPar, status: 'ok', source: 'card', trust: 'official', roundId: null, holesKnown: false, shotData: false, officialTotal: null, count }) as ChTourPlayerRound;
  const event = (id: string, start: string, rounds: ChTourPlayerRound[], status: ChTourEvent['status'] = 'complete', courseIds = ['c1']): ChTourEvent =>
    ({ id, startDate: start, endDate: start, status, courseIds, playerRounds: rounds, rounds: rounds.map((r) => ({ roundEventId: r.roundEventId, number: r.roundNumber, date: start })) }) as unknown as ChTourEvent;

  it('reads form, count rate and course record from other finished events, never the one being built', () => {
    const past = event('p1', '2026-09-01', [round(1, 'counted', -1), round(2, 'dropped', 3), round(3, 'counted', 0), round(4, 'counted', 2), round(5, 'dropped', 4), round(6, 'counted', 1)]);
    const building = event('b', '2026-11-01', [round(1, 'counted', -5)], 'upcoming');
    const s = candidateStats('a', [past, building], 'b', ['c1']);
    expect(s.form).toHaveLength(5);
    expect(s.form[0]!.toPar).toBe(3);
    expect(s.countRounds).toBe(6);
    expect(s.countRate).toBeCloseTo(4 / 6);
    expect(s.chance).toBe('often');
    expect(s.course).toEqual({ rounds: 6, avgToPar: 1.5 });
  });

  it('has no chance band and no form for a player with no team rounds', () => {
    const s = candidateStats('nobody', [event('p1', '2026-09-01', [round(1, 'counted', 0)])], 'b', ['c1']);
    expect(s).toMatchObject({ form: [], countRate: null, countRounds: 0, chance: null, course: { rounds: 0, avgToPar: null } });
  });
});
