import { describe, expect, it } from 'vitest';
import type { ChClassBlock, ChClassDayPlayer, ChMyClassDay } from '../../../data/class-day-shape';
import { coachesSee, panelNotices, panelTop } from '../panel-model';

/** Wednesday 2026-10-14 in New York is EDT (UTC-4). */
const z = (hhmm: string, day = '2026-10-14') => `${day}T${hhmm}:00.000Z`;
const at = (hhmm: string, day = '2026-10-14') => Date.parse(z(hhmm, day));
const block = (from: string, to: string, label = 'ECON 310 - Intermediate Macroeconomics', over: Partial<ChClassBlock> = {}): ChClassBlock => ({ classId: 'c-econ', label, kind: 'class', source: 'pattern', startsAt: z(from), endsAt: z(to), ...over });
const me = (over: Partial<ChClassDayPlayer> = {}): ChClassDayPlayer => ({ playerId: 'p1', firstName: 'Jonah', lastName: 'Okafor', avatarUrl: null, tracked: true, holds: true, onCourse: false, offToday: false, away: null, blocks: [], ...over });
const TERM = { id: 't', label: 'Fall 2026', classesStart: '2026-08-24', classesEnd: '2026-12-11', examsEnd: '2026-12-18', timeZone: 'America/New_York', phase: 'classes' as const };
const day = (over: Partial<ChMyClassDay> = {}, blocks: ChClassBlock[] = [block('14:10', '15:25'), block('17:25', '18:15', 'ENGL 105 - Writing')]): ChMyClassDay => ({
  on: '2026-10-14',
  teamId: 't1',
  teamTimeZone: 'America/New_York',
  classTimeZone: 'America/New_York',
  term: TERM,
  settings: { shareStatus: true, holdPushes: true },
  player: me({ blocks }),
  blocks,
  untaggedClasses: 0,
  unusableClasses: [],
  held: null,
  fetchedAt: 0,
  ...over,
});
const o = { clock: '12' as const, teamTz: 'America/New_York', classTz: 'America/New_York' };

describe('Class status panel (P-10)', () => {
  it('the top line is the player’s own state, with the class in full', () => {
    expect(panelTop(day(), at('14:30'), o)).toEqual({ kind: 'in_class', text: 'In class until 11:25 AM', detail: 'ECON 310 - Intermediate Macroeconomics' });
    expect(panelTop(day(), at('17:15'), o)).toMatchObject({ kind: 'soon', text: 'Class at 1:25 PM', detail: 'ENGL 105 - Writing' });
    expect(panelTop(day(), at('16:00'), o)).toEqual({ kind: 'none', text: 'No class right now', detail: null });
  });

  it('says so when no coach has confirmed this term’s dates', () => {
    expect(panelTop(day({ term: null }), at('14:30'), o)).toEqual({ kind: 'no_term', text: 'Class status starts when your coach sets this term’s dates', detail: null });
  });

  it('in the exam period it says when the next exam is', () => {
    const exam = block('14:00', '16:00', 'STAT 201 exam', { kind: 'exam', source: 'exam' });
    const d = day({ term: { ...TERM, phase: 'exams' } }, [{ ...exam, startsAt: z('14:00', '2026-12-15'), endsAt: z('16:00', '2026-12-15') }]);
    expect(panelTop(d, at('14:30'), o)).toEqual({ kind: 'exams', text: 'Exams · next exam Tue 9:00 AM', detail: 'STAT 201 exam' });
    expect(panelTop(day({ term: { ...TERM, phase: 'exams' } }, []), at('14:30'), o)).toMatchObject({ kind: 'exams', text: 'Exams' });
  });

  it('the top line ignores the sharing switch; "Coaches see" honours it', () => {
    const off = day({ settings: { shareStatus: false, holdPushes: true }, player: me({ tracked: false, blocks: [] }) });
    expect(panelTop(off, at('14:30'), o).text).toBe('In class until 11:25 AM');
    expect(coachesSee(off, at('14:30'), o)).toEqual({ name: 'Jonah Okafor', status: null, text: null });
  });

  it('"Coaches see" is the coach payload’s own object, in the coach’s words', () => {
    const see = coachesSee(day(), at('14:30'), o);
    expect(see.name).toBe('Jonah Okafor');
    expect(see.text).toBe('In class until 11:25 AM');
    expect(see.status?.kind).toBe('in_class');
  });

  it('"Coaches see" shows nothing for a player the coaches do not track, and for one on the course', () => {
    expect(coachesSee(day({ player: me({ tracked: false }) }), at('14:30'), o).text).toBeNull();
    expect(coachesSee(day({ player: me({ onCourse: true, blocks: [block('14:10', '15:25')] }) }), at('14:30'), o).text).toBeNull();
    expect(coachesSee(day({ player: null }), at('14:30'), o).name).toBe('You');
  });

  it('lists the quiet notices: untagged classes, unusable classes, calendar times that disagree', () => {
    const classes = [
      { id: 'c-econ', code: 'ECON 310', name: 'Intermediate Macroeconomics' },
      { id: 'c-stat', code: 'STAT 201', name: 'Probability' },
      { id: 'c-eng', code: '', name: 'Writing seminar' },
    ];
    const n = panelNotices(
      day({ untaggedClasses: 4, unusableClasses: [{ classId: 'c-econ', reason: 'calendar_mismatch' }, { classId: 'c-stat', reason: 'times' }, { classId: 'c-eng', reason: 'days' }] }),
      classes,
    );
    expect(n.map((x) => [x.kind, x.text, x.action])).toEqual([
      ['untagged', '4 classes aren’t tagged with a term', 'Tag as Fall 2026'],
      ['calendar_mismatch', 'ECON 310’s calendar times don’t match', 'Re-sync'],
      ['times', 'STAT 201 isn’t used for class status', 'Fix times'],
      ['days', 'Writing seminar isn’t used for class status', 'Fix days'],
    ]);
    expect(panelNotices(day({ untaggedClasses: 1 }), classes)[0]!.text).toBe('1 class isn’t tagged with a term');
    expect(panelNotices(day({ untaggedClasses: 3, term: null }), classes)).toEqual([]);
  });
});
