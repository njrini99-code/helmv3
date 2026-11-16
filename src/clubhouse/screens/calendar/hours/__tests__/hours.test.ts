import { describe, expect, it } from 'vitest';
import { civicDayOf, DEFAULT_HOURS_SETTINGS, divisionFromText, limitsFor, limitsLine, segmentOf, type ChHoursSettings } from '../rules';
import { draftHours, hoursCsv, hoursWeek, weekTitle, whoCounts, type ChHoursEventIn } from '../model';

/** Launch readiness F-03: the practice-hours log, drafted from the calendar and read against the bylaws (2026-27 Manuals). */
const settings = (over: Partial<ChHoursSettings> = {}): ChHoursSettings => ({ ...DEFAULT_HOURS_SETTINGS, ...over });
const WEEK = hoursWeek('2026-11-11', 1); // Mon 9 Nov to Sun 15 Nov 2026
const PEOPLE = [
  { id: 'ava', name: 'Ava Lindqvist', year: 'Jr' },
  { id: 'theo', name: 'Theo Marchetti', year: 'So' },
];
const ev = (over: Partial<ChHoursEventIn> & { id: string; date: string }): ChHoursEventIn => ({
  type: 'practice',
  title: 'Practice',
  start: 14,
  end: 17,
  allDay: false,
  location: null,
  people: [],
  rsvp: {},
  cancelled: false,
  span: null,
  invitedList: false,
  ...over,
});
const D1 = limitsFor(settings(), WEEK[0]!);
const rowOf = (w: ReturnType<typeof draftHours>, id: string) => w.rows.find((r) => r.id === id)!;

describe('limits', () => {
  it('Division I in the playing season: 4 a day, 20 a week, one day off, a competition day 3, the practice-round exception (17.1.7.1, 17.1.7.1.1, 17.1.7.3.2, 17.1.7.4)', () => {
    expect(D1).toMatchObject({
      segment: 'championship',
      segmentAssumed: true,
      day: 4,
      week: 20,
      daysOff: 1,
      competitionDay: 3,
      practiceRoundExempt: true,
      practiceRoundDay: 5,
      practiceRoundEve: 3,
      travelDayIsOff: true,
    });
    expect(D1.cites.map((c) => c.bylaw)).toEqual(['17.1.7.1', '17.1.7.1.1', '17.1.7.3.2', '17.1.7.3.2.1', '17.1.7.4', '17.1.7.4.1', '17.1.7.6']);
    expect(limitsLine(D1)).toBe('4 a day · 20 a week · 1 day off');
    // An autonomy conference's travel day is never the day off (17.1.7.7.1).
    expect(limitsFor(settings({ autonomy: true }), WEEK[0]!).travelDayIsOff).toBe(false);
  });

  it('reads the part of the season from the declared dates: spring is the championship segment, fall the nonchampionship, the rest outside', () => {
    const s = settings({ fall: { from: '2026-09-01', to: '2026-11-08' }, spring: { from: '2027-01-20', to: '2027-05-31' } });
    expect(segmentOf(s, '2026-10-05')).toEqual({ segment: 'nonchampionship', assumed: false });
    expect(segmentOf(s, '2027-03-01')).toEqual({ segment: 'championship', assumed: false });
    const outside = limitsFor(s, WEEK[0]!);
    expect(outside).toMatchObject({ segment: 'outside', day: null, week: 8, daysOff: 2, skillWeek: 4 });
    expect(outside.cites.map((c) => c.bylaw)).toEqual(['17.1.7.2', '17.1.7.5', '17.1.7.6']);
  });

  it('Division II: two days off in the fall (nonchampionship) segment, 8 a week outside, no 5-hour practice-round day', () => {
    const s = settings({ division: 'd2', fall: { from: '2026-09-01', to: '2026-11-30' } });
    expect(limitsFor(s, WEEK[0]!)).toMatchObject({ segment: 'nonchampionship', day: 4, week: 20, daysOff: 2, practiceRoundDay: null, practiceRoundEve: 3 });
    expect(limitsFor(s, '2026-12-07')).toMatchObject({ segment: 'outside', week: 8, daysOff: 2 });
    expect(limitsFor(settings({ division: 'd2' }), WEEK[0]!).bylaws).toMatchObject({ day: '17.1.6.1', dayOff: '17.1.6.5', afterCompetition: '17.1.6.4.2.2' });
  });

  it('Division III sets a day off and no hours; NAIA claims nothing; custom limits are the team’s own', () => {
    expect(limitsFor(settings({ division: 'd3' }), WEEK[0]!)).toMatchObject({ day: null, week: null, daysOff: 1, bylaws: { dayOff: '17.1.4.1' } });
    expect(limitsFor(settings({ division: 'naia' }), WEEK[0]!)).toMatchObject({ day: null, week: null, daysOff: 0, cites: [] });
    const c = limitsFor(settings({ division: 'custom', custom: { day: 3, week: 15, daysOff: 2 } }), WEEK[0]!);
    expect(c).toMatchObject({ day: 3, week: 15, daysOff: 2, source: 'Your limits' });
  });

  it('finds the civic engagement day and reads a division as Settings writes it', () => {
    expect(civicDayOf(2026)).toBe('2026-11-03');
    expect(civicDayOf(2027)).toBe('2027-11-02');
    expect(civicDayOf(2022)).toBe('2022-11-08');
    expect(['NCAA D1', 'Division II', 'div 3', 'NAIA', 'NJCAA', null].map(divisionFromText)).toEqual(['d1', 'd2', 'd3', 'naia', null, null]);
  });
});

describe('draftHours', () => {
  it('60180 counts each player’s practice, a day over 4 and a week over 20, and the day off', () => {
    const events = WEEK.slice(0, 6).map((d, i) => ev({ id: `p${i}`, date: d, start: 13, end: i === 1 ? 18 : 16.5 }));
    const w = draftHours({ days: WEEK, events, people: PEOPLE, limits: D1 });
    const ava = rowOf(w, 'ava');
    expect(ava.days.map((d) => d.hours)).toEqual([3.5, 5, 3.5, 3.5, 3.5, 3.5, 0]);
    expect(ava.total).toBe(22.5);
    expect(ava.off).toBe(1);
    expect(ava.flags.map((f) => [f.kind, f.text, f.bylaw])).toEqual([
      ['day', 'Tue 10 Nov: 5 hours, over the 4-hour day', '17.1.7.1'],
      ['week', '22.5 hours this week, over 20', '17.1.7.1'],
    ]);
    expect(w.flagged).toBe(2);
  });

  it('a practice round may pass 4 hours, but with other activity the day stays at 5 (DI 17.1.7.1.1)', () => {
    const round = ev({ id: 'q', type: 'qualifier', title: 'Qualifier R1', date: WEEK[2]!, start: 8, end: 13 });
    const lift = ev({ id: 'lift', type: 'meeting', title: 'Lift', date: WEEK[2]!, start: 15, end: 16, invitedList: true, people: ['ava'] });
    const w = draftHours({ days: WEEK, events: [round, lift], people: PEOPLE, limits: D1 });
    expect(rowOf(w, 'theo').flags).toEqual([]);
    expect(rowOf(w, 'ava').flags).toEqual([
      { kind: 'roundDay', date: WEEK[2], text: 'Wed 11 Nov: 6 hours with a practice round and other activity, over 5', bylaw: '17.1.7.1.1' },
    ]);
  });

  it('a tournament day counts 3 with what came before it, a practice round there the day before counts 3, and practice after the last round is flagged', () => {
    const t = { from: WEEK[4]!, to: WEEK[5]!, start: 8, end: 16 };
    const events = [
      ev({ id: 'eve', title: 'Practice round', date: WEEK[3]!, start: 9, end: 14.5 }),
      ev({ id: 't', type: 'tournament', title: 'Fall Invitational', date: WEEK[4]!, start: 8, end: 24, span: t, invitedList: true, people: ['ava', 'theo'] }),
      ev({ id: 't', type: 'tournament', title: 'Fall Invitational', date: WEEK[5]!, start: 0, end: 16, span: t, invitedList: true, people: ['ava', 'theo'] }),
      ev({ id: 'warm', title: 'Range warm-up', date: WEEK[5]!, start: 7, end: 7.75 }),
      ev({ id: 'late', title: 'Short game', date: WEEK[5]!, start: 17, end: 18 }),
    ];
    const w = draftHours({ days: WEEK, events, people: PEOPLE, limits: D1 });
    const ava = rowOf(w, 'ava');
    expect(ava.days.map((d) => d.hours)).toEqual([0, 0, 0, 3, 3, 4, 0]);
    expect(ava.days[5]!.items.map((i) => [i.eventId, i.rule])).toEqual([
      ['t', 'competition'],
      ['warm', 'absorbed'],
      ['late', 'length'],
    ]);
    expect(ava.flags.map((f) => [f.kind, f.text, f.bylaw])).toEqual([
      ['afterCompetition', 'Sat 14 Nov: Short game came after the tournament’s last round', '17.1.7.3.2.1'],
    ]);
    expect(w.lines.find((l) => l.eventId === 'eve')!.why).toBe('Practice round at the tournament site the day before: counts 3');
  });

  it('counts an event only for the players on it: invitees, less a decline or a no-show, plus anyone marked present', () => {
    const e = ev({ id: 'p', date: WEEK[0]!, invitedList: true, people: ['ava', 'theo'], rsvp: { theo: 'declined' } });
    expect(whoCounts(e, ['ava', 'theo', 'max'], undefined)).toEqual(['ava']);
    expect(whoCounts(e, ['ava', 'theo', 'max'], { ava: 'no_show', max: 'late' })).toEqual(['max']);
    // With no invitees a practice is the team’s; a meeting is the coach’s own, and a tournament asks who went.
    expect(whoCounts(ev({ id: 'x', date: WEEK[0]! }), ['ava', 'theo'], undefined)).toEqual(['ava', 'theo']);
    expect(whoCounts(ev({ id: 'm', type: 'meeting', date: WEEK[0]! }), ['ava', 'theo'], undefined)).toEqual([]);
    expect(whoCounts(ev({ id: 't', type: 'tournament', date: WEEK[0]! }), ['ava', 'theo'], undefined)).toEqual([]);
  });

  it('leaves out travel, cancelled and other events, says why, and lists a counted event with no times', () => {
    const events = [
      ev({ id: 'tr', type: 'travel', title: 'Bus to Pinehurst', date: WEEK[0]! }),
      ev({ id: 'c', date: WEEK[1]!, cancelled: true }),
      ev({ id: 'o', type: 'other', title: 'Team dinner', date: WEEK[2]! }),
      ev({ id: 'nt', title: 'Fitness', date: WEEK[3]!, allDay: true, start: null, end: null }),
    ];
    const w = draftHours({ days: WEEK, events, people: PEOPLE, limits: limitsFor(settings({ autonomy: true }), WEEK[0]!) });
    expect(w.lines.map((l) => [l.eventId, l.counted, l.why])).toEqual([
      ['tr', false, 'Travel isn’t countable'],
      ['c', false, 'Cancelled'],
      ['o', false, 'Not a practice, round or meeting'],
      ['nt', true, 'No times on the calendar, so no hours counted'],
    ]);
    expect(w.noTimes.map((l) => l.eventId)).toEqual(['nt']);
    const ava = rowOf(w, 'ava');
    // Autonomy: the travel day is not a day off; the day with untimed fitness isn't either.
    expect(ava.days.map((d) => d.off)).toEqual([false, true, true, false, true, true, true]);
    expect(ava.days[3]!.unknown).toBe(true);
  });

  it('a coach’s adjustment changes how an event counts, or stops it counting', () => {
    const events = [ev({ id: 'm', type: 'meeting', title: 'Academic check-in', date: WEEK[0]! }), ev({ id: 'p', date: WEEK[1]!, start: 13, end: 18 })];
    const w = draftHours({
      days: WEEK,
      events: events.map((e) => (e.id === 'm' ? { ...e, invitedList: true, people: ['ava'] } : e)),
      people: PEOPLE,
      limits: D1,
      adjustments: { m: { counted: false, hours: null, note: 'Academic, not countable' }, p: { counted: true, hours: 3.5, note: null } },
    });
    expect(w.lines.map((l) => [l.eventId, l.counted, l.hours, l.why])).toEqual([
      ['m', false, null, 'Doesn’t count: Academic, not countable'],
      ['p', true, 3.5, 'Counts 3.5 (your change)'],
    ]);
    expect(rowOf(w, 'ava').total).toBe(3.5);
    expect(rowOf(w, 'ava').flags).toEqual([]);
  });

  it('flags activity on the civic engagement day, and too few days off', () => {
    const week = hoursWeek('2026-11-03', 1);
    const events = week.map((d, i) => ev({ id: `p${i}`, date: d, start: 14, end: 15 }));
    const w = draftHours({ days: week, events, people: PEOPLE.slice(0, 1), limits: limitsFor(settings(), week[0]!) });
    expect(rowOf(w, 'ava').flags.map((f) => [f.kind, f.text, f.bylaw])).toEqual([
      ['civic', 'Tue 3 Nov: activity on the civic engagement day, which is a required day off', '17.1.7.6'],
      ['dayOff', 'No day off this week', '17.1.7.4'],
    ]);
  });
});

/**
 * The shapes a real team's calendar takes: Guilford College men's golf (NCAA Division III), staging's copy of production,
 * read 15 Nov 2026 (titles, types and times as saved; players anonymised). Practice is saved all day, a day off is an "OFF"
 * entry (sometimes typed as practice), "OYO" is practice on your own, and a B-team tournament is saved with nobody on it.
 */
describe('a real team’s calendar (Guilford College, fall 2026)', () => {
  const roster = Array.from({ length: 12 }, (_, i) => ({ id: `p${i + 1}`, name: `Player ${i + 1}`, year: null }));
  const all = roster.map((p) => p.id);
  const allDay = (id: string, type: ChHoursEventIn['type'], title: string, date: string, span: ChHoursEventIn['span'] = null) =>
    ev({ id, type, title, date, allDay: true, start: null, end: null, invitedList: true, people: all, span });
  const D3 = limitsFor(settings({ division: divisionFromText('D3')! }), '2026-10-05');

  it('Oct 5 – 11: practice, an "OFF" saved as practice, "OYO" before travel, then a four-day tournament', () => {
    const days = hoursWeek('2026-10-05', 1);
    const laurel = { from: '2026-10-09', to: '2026-10-12' };
    const events = [
      allDay('bp', 'practice', 'Practice @ Bryan Park', '2026-10-05'),
      allDay('car', 'practice', 'Practice @ Cardinal', '2026-10-06'),
      allDay('off', 'practice', 'OFF', '2026-10-07'),
      allDay('oyo', 'practice', 'OYO for Laurel Travel', '2026-10-08'),
      ...['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'].map((d) => allDay('lv', 'tournament', 'Laurel Valley', d, laurel)),
    ];
    const w = draftHours({ days, events, people: roster, limits: D3 });
    expect(w.lines.map((l) => [l.date, l.title, l.counted, l.why])).toEqual([
      ['2026-10-05', 'Practice @ Bryan Park', true, 'No times on the calendar, so no hours counted'],
      ['2026-10-06', 'Practice @ Cardinal', true, 'No times on the calendar, so no hours counted'],
      ['2026-10-07', 'OFF', false, 'A day off on the calendar'],
      ['2026-10-08', 'OYO for Laurel Travel', false, 'On your own: voluntary, so not countable'],
      ['2026-10-09', 'Laurel Valley', true, 'Competition day: counts 3'],
      ['2026-10-10', 'Laurel Valley', true, 'Competition day: counts 3'],
      ['2026-10-11', 'Laurel Valley', true, 'Competition day: counts 3'],
    ]);
    const p1 = w.rows[0]!;
    expect(p1.days.map((d) => d.off)).toEqual([false, false, true, true, false, false, false]);
    // Division III: a day off a week, no hours; the untimed practices can't be summed, and say so.
    expect(p1.flags).toEqual([]);
    expect(w.noTimes.map((l) => l.eventId)).toEqual(['bp', 'car']);
    // With the team's standard for an untimed practice (3 hours), the week sums.
    const std = draftHours({ days, events, people: roster, limits: D3, untimedHours: 3 });
    expect(std.rows[0]!.total).toBe(15);
    expect(std.lines[0]!.why).toBe('No times: counts your 3-hour standard');
  });

  it('a B-team tournament saved with nobody on it counts for no one until the coach says who went', () => {
    const days = hoursWeek('2026-09-14', 1);
    const b = ev({
      id: 'b',
      type: 'tournament',
      title: 'B Team (Pinehurst)',
      date: '2026-09-19',
      allDay: true,
      start: null,
      end: null,
      span: { from: '2026-09-19', to: '2026-09-21' },
    });
    const w = draftHours({ days, events: [b, allDay('oyo', 'other', 'OYO “B Team” - Other guys OFF', '2026-09-18')], people: roster, limits: D3, marks: {} });
    expect(w.lines.map((l) => [l.title, l.counted, l.why])).toEqual([
      ['OYO “B Team” - Other guys OFF', false, 'On your own: voluntary, so not countable'],
      ['B Team (Pinehurst)', false, 'No players on it: invite the players who went, or mark them on the event'],
    ]);
    const marked = draftHours({ days, events: [b], people: roster, limits: D3, marks: { b: { p3: 'present', p4: 'present' } } });
    expect(marked.rows.filter((r) => r.days[5]!.competition).map((r) => r.id)).toEqual(['p3', 'p4']);
  });
});

describe('week and export', () => {
  it('builds the team’s week from its first day and titles it', () => {
    expect(hoursWeek('2026-11-15', 1)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(hoursWeek('2026-11-15', 0)[0]).toBe('2026-11-15');
    expect(weekTitle(hoursWeek('2026-11-01', 1))).toBe('Oct 26 – Nov 1');
  });

  it('writes one row a player a day, then the week, with bare numbers and the warnings in words', () => {
    const events = [ev({ id: 'p', title: 'Practice', date: WEEK[1]!, start: 13, end: 18 })];
    const f = hoursCsv(draftHours({ days: WEEK, events, people: PEOPLE.slice(0, 1), limits: D1 }), 'Demo University');
    expect(f.name).toBe('demo-university-practice-hours-2026-11-09.csv');
    expect(f.head).toEqual(['Week of', 'Player', 'Class', 'Date', 'Day', 'Hours', 'What counted', 'Day off', 'Warnings']);
    expect(f.rows).toHaveLength(8);
    expect(f.rows[1]).toEqual(['2026-11-09', 'Ava Lindqvist', 'Jr', '2026-11-10', 'Tue', 5, 'Practice (5)', false, 'Tue 10 Nov: 5 hours, over the 4-hour day']);
    expect(f.rows[7]).toEqual(['2026-11-09', 'Ava Lindqvist', 'Jr', null, 'Week', 5, null, 6, null]);
  });
});
