import { describe, expect, it } from 'vitest';
import type { ChClassBlock, ChClassDay, ChClassDayPlayer } from '../../../data/class-day-shape';
import { DENSITY_ABOVE_LANES, sheetModel, termRow } from '../in-class-model';

const z = (hhmm: string) => `2026-10-26T${hhmm}:00.000Z`;
const at = (hhmm: string) => Date.parse(z(hhmm));
const block = (from: string, to: string, label = 'STAT 201 - Probability', over: Partial<ChClassBlock> = {}): ChClassBlock => ({ classId: label, label, kind: 'class', source: 'pattern', startsAt: z(from), endsAt: z(to), ...over });
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
  term: { id: 't', label: 'Fall 2026', classesStart: '2026-08-24', classesEnd: '2026-12-11', examsEnd: '2026-12-18', timeZone: 'America/New_York', phase: 'classes' },
  nextTerm: null,
  players,
  fetchedAt: 0,
});
const o = { clock: '12' as const, teamTz: 'America/New_York', classTz: 'America/New_York' };

describe('In class now sheet model (P-10)', () => {
  const players = [
    player('theo', 'Theo', { blocks: [block('13:30', '15:50')] }),
    player('avery', 'Avery', { blocks: [block('14:00', '14:50', 'CHEM 101 - Chemistry'), block('15:00', '16:15', 'BIO 110 - Biology')] }),
    player('jordan', 'Jordan', { blocks: [block('17:00', '18:15', 'ECON 210 - Microeconomics')] }),
    player('sam', 'Sam', { away: { destination: 'Pinehurst', returnDate: '2026-10-29', confirmed: true } }),
    player('riley', 'Riley', { tracked: false, holds: false }),
    player('casey', 'Casey', { tracked: false, holds: false }),
  ];

  it('lists who is in class by end time, the next class, trips and untracked players', () => {
    const m = sheetModel(day(players), at('14:30'), o);
    expect(m.title).toBe('In class now');
    expect(m.sub).toBe('2 of 6 · Class names show to coaches only.');
    expect(m.inClass.map((r) => r.name)).toEqual(['Theo Test', 'Avery Test']);
    expect(m.inClass[0]).toMatchObject({ time: 'until 11:50 AM', meta: 'STAT 201' });
    // Avery's island runs to 12:15 PM and holds a second class.
    expect(m.inClass[1]).toMatchObject({ time: 'until 12:15 PM', meta: 'CHEM 101 · then BIO 110 until 12:15 PM' });
    expect(m.next.map((r) => [r.name, r.time, r.meta])).toEqual([['Jordan Test', '1:00 to 2:15 PM', 'ECON 210']]);
    expect(m.travelling).toEqual([{ playerId: 'sam', name: 'Sam Test', time: null, meta: 'Pinehurst · back Thu', label: 'Sam Test, travelling, Pinehurst · back Thu' }]);
    expect(m.none).toEqual(['Riley Test', 'Casey Test']);
    expect(m.empty).toBe(false);
  });

  it('reads each row as one sentence for assistive tech', () => {
    const m = sheetModel(day(players), at('14:30'), o);
    expect(m.inClass[0]!.label).toBe('Theo Test, in class until 11:50 AM, STAT 201');
    expect(m.next[0]!.label).toBe('Jordan Test, next class 1:00 to 2:15 PM, ECON 210');
  });

  it('draws one lane per tracked player with a block, an exam ringed, the now line and the shared free window', () => {
    const m = sheetModel(day(players), at('14:30'), o);
    expect(m.strip!.lanes.map((l) => l.playerId)).toEqual(['theo', 'avery', 'jordan']);
    expect(m.strip!.density).toBeNull();
    expect(m.strip!.now).toBeGreaterThan(0);
    expect(m.strip!.ticks[0]).toMatchObject({ label: '8 AM' });
    expect(m.strip!.free).toMatchObject({ label: 'Everyone out from 2:15 PM' });
  });

  it('marks an exam block', () => {
    const m = sheetModel(day([player('a', 'A', { blocks: [block('13:30', '15:50', 'STAT 201 - Probability', { kind: 'exam', source: 'exam' })] })]), at('14:30'), o);
    expect(m.strip!.lanes[0]!.blocks[0]!.exam).toBe(true);
    expect(m.inClass[0]!.label).toContain('in an exam');
  });

  it('above 12 lanes it is one density bar whose heights step with the share in class', () => {
    const many = Array.from({ length: DENSITY_ABOVE_LANES + 1 }, (_, i) => player(`p${i}`, `P${i}`, { blocks: [block('13:30', '15:50')] }));
    const m = sheetModel(day(many), at('14:30'), o);
    expect(m.strip!.density).not.toBeNull();
    expect(m.strip!.density!.teamSize).toBe(13);
    expect(new Set(m.strip!.density!.slots.map((s) => s.height))).toEqual(new Set([0, 12]));
  });

  it('with no block today it is "No classes today", with no strip, and travelling and untracked still list', () => {
    const m = sheetModel(day([player('sam', 'Sam', { away: { destination: null, returnDate: null, confirmed: true } }), player('riley', 'Riley', { tracked: false })]), at('14:30'), o);
    expect(m).toMatchObject({ title: 'No classes today', sub: '2 players · Class names show to coaches only.', strip: null, empty: true, none: ['Riley Test'] });
    expect(m.travelling[0]!.meta).toBe('Travelling');
  });

  it('draws the term footer row, or nothing without a term', () => {
    expect(termRow(day(players))).toBe('Fall 2026 · Aug 24 to Dec 11 · exams to Dec 18');
    expect(termRow({ ...day(players), term: null })).toBeNull();
  });

  it('leaves a player on the course out of the lists', () => {
    const m = sheetModel(day([player('a', 'A', { onCourse: true, blocks: [block('13:30', '15:50')] })]), at('14:30'), o);
    expect(m.inClass).toEqual([]);
    expect(m.next).toEqual([]);
  });
});
