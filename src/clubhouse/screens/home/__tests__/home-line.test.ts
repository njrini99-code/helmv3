import { describe, expect, it } from 'vitest';
import type { ChClassBlock, ChClassDay, ChClassDayPlayer } from '../../../data/class-day-shape';
import { homeLineFor, shortDate } from '../home-line';

/** Monday 2026-10-26 in New York is EDT (UTC-4): 9:30 AM is 13:30Z. */
const z = (hhmm: string, day = '2026-10-26') => `${day}T${hhmm}:00.000Z`;
const at = (hhmm: string, day = '2026-10-26') => Date.parse(z(hhmm, day));
const block = (from: string, to: string, over: Partial<ChClassBlock> = {}): ChClassBlock => ({ classId: 'c', label: 'STAT 201 - Probability', kind: 'class', source: 'pattern', startsAt: z(from), endsAt: z(to), ...over });
const player = (id: string, over: Partial<ChClassDayPlayer> = {}): ChClassDayPlayer => ({
  playerId: id,
  firstName: id,
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
const TERM = { id: 't', label: 'Fall 2026', classesStart: '2026-08-24', classesEnd: '2026-12-11', examsEnd: '2026-12-18', timeZone: 'America/New_York', phase: 'classes' as const };
const day = (players: ChClassDayPlayer[], over: Partial<ChClassDay> = {}): ChClassDay => ({
  on: '2026-10-26',
  teamTimeZone: 'America/New_York',
  classTimeZone: 'America/New_York',
  term: TERM,
  nextTerm: null,
  players,
  fetchedAt: 0,
  ...over,
});
const opts = { clock: '12' as const, teamTz: 'America/New_York', classTz: 'America/New_York' };
const line = (d: ChClassDay | null, now: number, coverage: { players: number; label: string | null } | null = null) => homeLineFor({ day: d, now, opts, coverage });

/** Four players in class 9:30 to 11:50, five with a block at 1:00 PM. */
const nine = () => [
  ...['a', 'b', 'c', 'd'].map((id) => player(id, { blocks: [block('13:30', '15:50')] })),
  ...['e', 'f', 'g', 'h', 'i'].map((id) => player(id, { blocks: [block('17:00', '18:15')] })),
];

describe('Coach Home line (P-10 copy table)', () => {
  it('some in class now: the count, then the first stretch with everyone out', () => {
    const l = line(day(nine()), at('14:30'))!;
    expect(l.line1).toBe('4 of 9 in class now');
    expect(l.line2).toBe('Everyone out of class 11:50 AM to 1:00 PM');
    expect(l.opens).toBe('sheet');
    expect(l.label).toBe('4 of 9 in class now. Everyone out of class 11:50 AM to 1:00 PM. Opens class status');
  });

  it('before the first block: the first class, and when everyone is out', () => {
    const l = line(day(nine()), at('12:00'))!;
    expect(l.line1).toBe('First class 9:30 AM');
  });

  it('nobody in class now, more later: the next class and how many start it', () => {
    const l = line(day(nine()), at('16:00'))!;
    expect(l.line1).toBe('No one in class now');
    expect(l.line2).toBe('Next class 1:00 PM · 5 players');
  });

  it('is hidden after the last block', () => {
    expect(line(day(nine()), at('19:00'))).toBeNull();
  });

  it('is hidden outside 7 AM to 7 PM team time', () => {
    expect(line(day(nine()), at('10:30'))).toBeNull(); // 6:30 AM
    expect(line(day(nine()), at('23:30'))).toBeNull(); // 7:30 PM
  });

  it('is hidden on a weekend and on a team-wide no-class day', () => {
    expect(line(day(nine(), { on: '2026-10-25' }), at('14:30', '2026-10-25'))).toBeNull();
    expect(line(day(nine().map((p) => ({ ...p, offToday: true }))), at('14:30'))).toBeNull();
  });

  it('says there is no hour with everyone out when none fits before 7 PM', () => {
    const busy = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((id, i) => player(id, { blocks: [block(i % 2 ? '13:30' : '14:00', i % 2 ? '23:30' : '23:45')] }));
    expect(line(day(busy), at('14:30'))!.line2).toBe('No hour with everyone out of class before 7 PM');
  });

  it('below full coverage the numbers are about the tracked players, and say so', () => {
    const six = [...['a', 'b', 'c', 'd'].map((id) => player(id, { blocks: [block('13:30', '15:50')] })), ...['e', 'f'].map((id) => player(id, { blocks: [block('17:00', '18:15')] })), ...['g', 'h', 'i'].map((id) => player(id, { tracked: false, holds: false }))];
    expect(line(day(six), at('14:30'))).toMatchObject({ line1: '4 of 6 tracked in class now', line2: 'Tracked players out of class 11:50 AM to 1:00 PM' });
    expect(line(day(six), at('16:00'))).toMatchObject({ line1: 'No one tracked in class now' });
  });

  it('under half tracked: schedules shared, with the ask; with some in class, the tracked count leads', () => {
    const few = [player('a', { blocks: [block('13:30', '15:50')] }), ...['b', 'c', 'd', 'e', 'f', 'g'].map((id) => player(id, { tracked: false, holds: false }))];
    expect(line(day(few), at('12:00'))).toMatchObject({ line1: 'Class schedules shared by 1 of 7', line2: 'Ask for schedules' });
    expect(line(day(few), at('14:30'))).toMatchObject({ line1: '1 of 1 tracked in class now', line2: 'Class schedules shared by 1 of 7' });
  });

  it('an exam period counts the exams and says when they end', () => {
    const exam = ['a', 'b', 'c', 'd', 'e'].map((id) => player(id, { blocks: [block('13:30', '15:50', { kind: 'exam', source: 'exam' })] }));
    const l = line(day(exam, { term: { ...TERM, phase: 'exams' } }), at('14:30'))!;
    expect(l.line1).toBe('Exams · 5 in an exam now');
    expect(l.line2).toBe('Exams end Fri, Dec 18');
  });

  it('with no term covering today: the next term starts, else set the term when schedules exist, else nothing', () => {
    const roster = nine().map((p) => ({ ...p, tracked: false }));
    expect(line(day(roster, { term: null, nextTerm: { id: 'n', label: 'Fall 2026', classesStart: '2026-10-28' } }), at('14:30'))!.line1).toBe('Classes start Wed, Oct 28');
    const set = line(day(roster, { term: null }), at('14:30'), { players: 6, label: 'Fall 2026' })!;
    expect(set).toMatchObject({ line1: 'Set this term’s dates to show class status', line2: 'Fall 2026 · 6 of 9 have added classes', opens: 'term' });
    expect(line(day(roster, { term: null }), at('14:30'), { players: 0, label: 'Fall 2026' })).toBeNull();
    expect(line(day(roster, { term: null }), at('14:30'), null)).toBeNull();
  });

  it('shows nothing without a payload, a clock or a team', () => {
    expect(line(null, at('14:30'))).toBeNull();
    expect(homeLineFor({ day: day(nine()), now: null, opts, coverage: null })).toBeNull();
    expect(homeLineFor({ day: day(nine()), now: at('14:30'), opts: null, coverage: null })).toBeNull();
    expect(line(day([]), at('14:30'))).toBeNull();
  });

  it('draws a date as the line writes it', () => {
    expect(shortDate('2026-08-24')).toBe('Mon, Aug 24');
  });
});
