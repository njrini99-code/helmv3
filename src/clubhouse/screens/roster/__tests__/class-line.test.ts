import { describe, expect, it } from 'vitest';
import type { ChClassBlock, ChClassDay, ChClassDayPlayer } from '../../../data/class-day-shape';
import { classLinesSignature, classNoteFor, NO_CLASS_LINES, possessive, rosterClassLines } from '../class-line';

const z = (hhmm: string) => `2026-10-26T${hhmm}:00.000Z`;
const at = (hhmm: string) => Date.parse(z(hhmm));
const block = (from: string, to: string, label = 'STAT 201 - Probability'): ChClassBlock => ({ classId: 'c', label, kind: 'class', source: 'pattern', startsAt: z(from), endsAt: z(to) });
const player = (id: string, first: string, over: Partial<ChClassDayPlayer> = {}): ChClassDayPlayer => ({
  playerId: id,
  firstName: first,
  lastName: 'Test',
  avatarUrl: null,
  tracked: true,
  holds: true,
  onCourse: false,
  offToday: false,
  away: null,
  blocks: [],
  ...over,
});
const day = (players: ChClassDayPlayer[]): ChClassDay => ({
  on: '2026-10-26',
  teamTimeZone: 'America/New_York',
  classTimeZone: 'America/New_York',
  term: null,
  nextTerm: null,
  players,
  fetchedAt: 0,
});
const text = (s: { kind: string }) => (s.kind === 'in_class' ? 'In class until 11:50 AM' : s.kind === 'soon' ? 'Class at 1:00 PM' : s.kind === 'travelling' ? 'Travelling · Pinehurst' : null);
const roster = (ids: string[], status: 'active' | 'inactive' = 'active') => ids.map((id) => ({ id, status }));

describe('Roster class lines (P-10)', () => {
  it('builds a line and its source for each active player in class', () => {
    const lines = rosterClassLines(day([player('theo', 'Theo', { blocks: [block('13:30', '15:50')] })]), at('14:30'), text, roster(['theo']));
    expect(lines.get('theo')).toEqual({ kind: 'in_class', text: 'In class until 11:50 AM', source: 'From Theo’s class schedule · STAT 201' });
  });

  it('leaves out inactive players, players not on the roster, and anyone with nothing to say', () => {
    const d = day([player('a', 'A', { blocks: [block('13:30', '15:50')] }), player('b', 'B', { blocks: [block('13:30', '15:50')] }), player('c', 'C', { blocks: [] })]);
    const lines = rosterClassLines(d, at('14:30'), text, [...roster(['a', 'c']), ...roster(['x'], 'inactive')]);
    expect([...lines.keys()]).toEqual(['a']);
  });

  it('is empty without a payload or a clock (fail open)', () => {
    expect(rosterClassLines(null, at('14:30'), text, roster(['a']))).toBe(NO_CLASS_LINES);
    expect(rosterClassLines(day([]), null, text, roster(['a']))).toBe(NO_CLASS_LINES);
  });

  it('a trip outranks availability; availability outranks a class', () => {
    const trip = { kind: 'travelling' as const, text: 'Travelling · Pinehurst', source: null };
    const cls = { kind: 'in_class' as const, text: 'In class until 11:50 AM', source: null };
    expect(classNoteFor({ availability: 'injured' }, trip)).toBe(trip);
    expect(classNoteFor({ availability: 'injured' }, cls)).toBeNull();
    expect(classNoteFor({ availability: 'away' }, cls)).toBeNull();
    expect(classNoteFor({ availability: 'available' }, cls)).toBe(cls);
    expect(classNoteFor({ availability: 'available' }, undefined)).toBeNull();
  });

  it('two lines with the same words have the same signature, so a minute tick that changes nothing changes nothing', () => {
    const d = day([player('a', 'A', { blocks: [block('13:30', '15:50')] })]);
    const one = rosterClassLines(d, at('14:30'), text, roster(['a']));
    const two = rosterClassLines(d, at('14:31'), text, roster(['a']));
    expect(one).not.toBe(two);
    expect(classLinesSignature(one)).toBe(classLinesSignature(two));
    expect(classLinesSignature(NO_CLASS_LINES)).toBe('');
  });

  it('writes a possessive', () => {
    expect(possessive('Theo')).toBe('Theo’s');
    expect(possessive('James')).toBe('James’');
  });
});
