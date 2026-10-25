import { describe, expect, it } from 'vitest';
import {
  addRound,
  countingNumbers,
  defaultSecondTee,
  formatToColumns,
  initialTourState,
  inRoundOrder,
  lockAt,
  lockLine,
  rangeText,
  receiptSentence,
  removeLastRound,
  roundOrderBreak,
  roundOrderOk,
  roundsFromRange,
  roundStartAt,
  roundTitle,
  roundTitleParts,
  seasonLabelOf,
  sortRounds,
  thirtySixHoleStarts,
  toCreatePayload,
  validate,
  type ChRoundDraft,
  type ChTourFormatKind,
  type ChTourState,
} from '../rounds-model';

const NY = 'America/New_York';
const r = (date: string, tee: string | null, over: Partial<ChRoundDraft> = {}): ChRoundDraft => ({ id: `${date}-${tee}`, date, tee, startType: 'tee_times', ...over });
const course = { id: 'c-pinehurst', label: 'Pinehurst No. 2', teeId: 't-blue', teeLine: 'Blue tees · 7,214 yds' };
const state = (over: Partial<ChTourState> = {}): ChTourState => ({ ...initialTourState('2026-11-05', '2026-11-07'), name: 'Pinehurst Invitational', course, ...over });

describe('roundsFromRange', () => {
  it('makes one round a day for 1, 3 and 6 days', () => {
    expect(roundsFromRange('2026-11-05', '2026-11-05', []).map((x) => x.date)).toEqual(['2026-11-05']);
    expect(roundsFromRange('2026-11-05', '2026-11-07', []).map((x) => x.date)).toEqual(['2026-11-05', '2026-11-06', '2026-11-07']);
    expect(roundsFromRange('2026-11-01', '2026-11-06', [])).toHaveLength(6);
  });
  it('keeps the times of rows that remain when the range grows or shrinks', () => {
    const three = roundsFromRange('2026-11-05', '2026-11-07', [r('2026-11-05', '08:42'), r('2026-11-06', '08:00')]);
    expect(three.map((x) => x.tee)).toEqual(['08:42', '08:00', null]);
    const one = roundsFromRange('2026-11-05', '2026-11-05', three);
    expect(one).toHaveLength(1);
    expect(one[0]!.tee).toBe('08:42');
    expect(one[0]!.id).toBe(three[0]!.id);
  });
  it('7 days draw 7 rows, and validate refuses them with CH-6142', () => {
    const s = state({ firstDay: '2026-11-01', lastDay: '2026-11-07', rounds: roundsFromRange('2026-11-01', '2026-11-07', []) });
    expect(s.rounds).toHaveLength(7);
    expect(validate(s).rounds?.code).toBe('CH-6142');
    expect(validate({ ...s, mode: 'custom', rounds: s.rounds.slice(0, 6) }).rounds).toBeUndefined();
  });
});

describe('addRound and removeLastRound', () => {
  it('adds on the last round’s day, 5:30 after its tee, numbered next', () => {
    const list = addRound([r('2026-11-05', '07:30')]);
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ date: '2026-11-05', tee: '13:00' });
    expect(addRound([r('2026-11-05', null)])[1]!.tee).toBeNull();
    expect(defaultSecondTee('19:00')).toBeNull();
  });
  it('stops at six, removes only the last, and always keeps one', () => {
    let list = [r('2026-11-05', '08:00')];
    for (let i = 0; i < 8; i++) list = addRound(list);
    expect(list).toHaveLength(6);
    const less = removeLastRound(list);
    expect(less).toEqual(list.slice(0, 5));
    expect(removeLastRound([r('2026-11-05', null)])).toHaveLength(1);
  });
});

describe('sortRounds and the order rule', () => {
  it('re-sorts R2 set before R1, so the plates renumber', () => {
    const list = [r('2026-11-06', '08:00', { id: 'a' }), r('2026-11-05', '09:00', { id: 'b' })];
    expect(inRoundOrder(list)).toBe(false);
    expect(sortRounds(list).map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('an untimed round keys at the end of its day: after that day’s timed round', () => {
    expect(sortRounds([r('2026-11-05', null, { id: 'u' }), r('2026-11-05', '13:00', { id: 't' })]).map((x) => x.id)).toEqual(['t', 'u']);
    // Clearing R2's time on a 36-hole day keeps it R2.
    expect(roundOrderOk([r('2026-11-05', '07:30'), r('2026-11-05', null)])).toBe(true);
    expect(roundOrderOk([r('2026-11-05', null), r('2026-11-05', '13:00')])).toBe(false);
  });
  it('two untimed rounds may share a day; two timed rounds may not share a minute', () => {
    expect(roundOrderOk([r('2026-11-05', null), r('2026-11-05', null)])).toBe(true);
    expect(roundOrderBreak([r('2026-11-05', '08:00'), r('2026-11-05', '08:00')])).toEqual({ before: 1, after: 2 });
  });
  it('ignores cancelled rounds', () => {
    expect(roundOrderOk([r('2026-11-05', '08:00'), r('2026-11-07', '08:00', { cancelled: true }), r('2026-11-06', '08:00')])).toBe(true);
    expect(roundOrderBreak([r('2026-11-06', '08:00'), r('2026-11-07', '08:00', { cancelled: true }), r('2026-11-05', '08:00')])).toEqual({ before: 1, after: 3 });
  });
  it('labels each 36-hole day once', () => {
    expect([...thirtySixHoleStarts([r('2026-11-05', '07:30'), r('2026-11-05', '13:00'), r('2026-11-06', null)])]).toEqual([0]);
  });
});

describe('lockAt', () => {
  it('is R1’s first tee less the lock minutes, in the team’s zone', () => {
    const l = lockAt([r('2026-11-05', '08:42'), r('2026-11-06', null)], 10, NY);
    expect(l).toMatchObject({ date: '2026-11-05', minutes: 8 * 60 + 32, r1Cancelled: false });
    expect(l.at).toBe('2026-11-05T08:32:00-05:00');
    expect(lockLine([r('2026-11-05', '08:42')], 10, NY)).toBe('Lineup locks Thu 5 Nov at 8:32 AM, 10 minutes before the first tee.');
  });
  it('gives no lock while R1 is all-day', () => {
    expect(lockAt([r('2026-11-05', null), r('2026-11-06', '08:00')], 10, NY).at).toBeNull();
    expect(lockLine([r('2026-11-05', null)], 10, NY)).toBe('Lineup lock is set once R1 has a tee time.');
  });
  it('a shotgun locks from its start, as a tee time does', () => {
    expect(lockAt([r('2026-11-05', '08:00', { startType: 'shotgun' })], 10, NY).minutes).toBe(7 * 60 + 50);
  });
  it('stays on R1 when R1 is cancelled (4.33’s rule), and says so', () => {
    const rounds = [r('2026-11-05', '08:42', { cancelled: true }), r('2026-11-06', '09:00')];
    expect(lockAt(rounds, 10, NY)).toMatchObject({ date: '2026-11-05', minutes: 8 * 60 + 32, r1Cancelled: true });
    expect(lockLine(rounds, 10, NY)).toMatch(/^R1 is cancelled\. The lineup still locks Thu 5 Nov at 8:32 AM/);
  });
  it('crosses midnight backwards when the lock is before the day starts', () => {
    expect(lockAt([r('2026-11-05', '00:05')], 10, NY)).toMatchObject({ date: '2026-11-04', minutes: 23 * 60 + 55 });
  });
});

describe('toCreatePayload', () => {
  it('gives each round its own date’s offset across the clock change', () => {
    expect(roundStartAt(r('2026-10-31', '08:00'), NY)).toBe('2026-10-31T08:00:00-04:00');
    expect(new Date(roundStartAt(r('2026-10-31', '08:00'), NY)).toISOString()).toBe('2026-10-31T12:00:00.000Z');
    expect(new Date(roundStartAt(r('2026-11-01', '08:00'), NY)).toISOString()).toBe('2026-11-01T13:00:00.000Z');
  });
  it('sends an all-day round as UTC midnight of its date, never a made-up 08:00', () => {
    const p = toCreatePayload(state(), NY, { teamId: 'team', requestId: 'req', requiresRsvp: false, attendeeIds: [] });
    expect(p.rounds.map((x) => [x.startAt, x.allDay])).toEqual([
      ['2026-11-05T00:00:00+00:00', true],
      ['2026-11-06T00:00:00+00:00', true],
      ['2026-11-07T00:00:00+00:00', true],
    ]);
  });
  it('maps the counting and format pickers onto the one format column', () => {
    expect(formatToColumns('stroke', '5c4')).toEqual({ format: '5c4' });
    expect(formatToColumns('stroke', 'custom', 7, 5)).toEqual({ format: 'custom', playersPerTeam: 7, counting: 5 });
    expect(formatToColumns('match', '6c5')).toEqual({ format: 'match', playersPerTeam: 6, counting: 5 });
    expect(formatToColumns('medal_match', 'custom', 4, 3)).toEqual({ format: 'medal_match', playersPerTeam: 4, counting: 3 });
    expect(formatToColumns('individual', '6c4')).toEqual({ format: 'individual' });
  });
  it('counting numbers follow PR 2354’s formatOf: the presets fix players and counting', () => {
    expect(countingNumbers('5c4', 9, 9)).toEqual({ play: 5, count: 4 });
    expect(countingNumbers('6c5', 1, 1)).toEqual({ play: 6, count: 5 });
    expect(countingNumbers('6c4', 1, 1)).toEqual({ play: 6, count: 4 });
    expect(countingNumbers('custom', 3, 5)).toEqual({ play: 3, count: 3 });
    const kinds: ChTourFormatKind[] = ['5c4', '6c5', '6c4', 'custom', 'match', 'medal_match', 'individual'];
    expect(kinds).toHaveLength(7);
  });
  it('sends a library course by id and a typed one as a label', () => {
    const base = { teamId: 'team', requestId: 'req', requiresRsvp: true, attendeeIds: ['p1'] };
    const byId = toCreatePayload(state(), NY, base);
    expect(byId).toMatchObject({ courseId: 'c-pinehurst', name: 'Pinehurst Invitational', format: '5c4', holesPerRound: 18, requiresRsvp: true, attendeeIds: ['p1'] });
    expect(byId).not.toHaveProperty('courseLabel');
    expect(byId.rounds[0]).toMatchObject({ teeId: 't-blue' });
    const typed = toCreatePayload(state({ course: { id: null, label: ' Southern Pines GC ' } }), NY, base);
    expect(typed).toMatchObject({ courseLabel: 'Southern Pines GC' });
    expect(typed).not.toHaveProperty('courseId');
  });
  it('a convert adopts the event as R1', () => {
    const p = toCreatePayload(state(), NY, { teamId: 'team', requestId: 'req', fromEventId: 'e1', requiresRsvp: false, attendeeIds: [] });
    expect(p.fromEventId).toBe('e1');
    expect(p.rounds[0]!.eventId).toBe('e1');
    expect(p.rounds[1]).not.toHaveProperty('eventId');
  });
  it('a timed R1 sends its tee in the zone', () => {
    const s = state();
    s.rounds[0] = { ...s.rounds[0]!, tee: '08:42' };
    expect(toCreatePayload(s, NY, { teamId: 'team', requestId: 'req', requiresRsvp: false, attendeeIds: [] }).rounds[0]).toMatchObject({ startAt: '2026-11-05T08:42:00-05:00', allDay: false, startType: 'tee_times' });
  });
});

describe('receiptSentence (4.1.9)', () => {
  const s = state();
  it('new, one course', () => {
    expect(receiptSentence({ state: s, convert: false, rsvp: false })).toBe('Creates Pinehurst Invitational in Tournaments with 3 rounds, Thu 5 to Sat 7 Nov at Pinehurst No. 2. Players see the rounds now and the lineup when you publish it.');
  });
  it('new, one round', () => {
    expect(receiptSentence({ state: { ...s, rounds: s.rounds.slice(0, 1) }, convert: false, rsvp: false })).toMatch(/^Creates Pinehurst Invitational in Tournaments with 1 round on Thu 5 Nov at Pinehurst No\. 2\./);
  });
  it('several courses', () => {
    const rounds = s.rounds.map((x, i) => ({ ...x, courseLabel: i === 2 ? 'Mid Pines' : 'Pinehurst No. 2' }));
    expect(receiptSentence({ state: { ...s, sameCourse: false, rounds }, convert: false, rsvp: false })).toMatch(/with 3 rounds, Thu 5 to Sat 7 Nov on 2 courses\./);
  });
  it('convert', () => {
    expect(receiptSentence({ state: s, convert: true, rsvp: false })).toMatch(/^Sets up Pinehurst Invitational in Tournaments\. This event becomes R1 and keeps its replies and files; R2 and R3 are added\./);
  });
  it('RSVP on: one copy, reply for each round', () => {
    expect(receiptSentence({ state: s, convert: false, rsvp: true })).toMatch(/Players are asked to reply for each round\.$/);
  });
  it('qualifier linked', () => {
    expect(receiptSentence({ state: s, convert: false, rsvp: false, qualifierName: 'Fall qualifier' })).toMatch(/Fall qualifier counts toward it\.$/);
  });
  it('no name yet', () => {
    expect(receiptSentence({ state: { ...s, name: '' }, convert: false, rsvp: false })).toMatch(/^Creates the tournament in Tournaments/);
  });
});

describe('roundTitleParts', () => {
  it('splits a round title only when the event has a round ref', () => {
    expect(roundTitleParts('Pinehurst Invitational · R2', { roundNo: 2 })).toEqual({ name: 'Pinehurst Invitational', round: 2 });
    expect(roundTitleParts('Pinehurst Invitational · R2', null)).toEqual({ name: 'Pinehurst Invitational · R2', round: null });
    expect(roundTitleParts('Fall Classic', { roundNo: 1 })).toEqual({ name: 'Fall Classic', round: 1 });
    expect(roundTitle('Fall Classic', 3)).toBe('Fall Classic · R3');
  });
});

describe('validate (CH-614x)', () => {
  it('a full form has no errors', () => {
    expect(validate(state())).toEqual({});
  });
  it('names each problem with its code', () => {
    expect(validate(state({ name: ' ' })).name?.code).toBe('CH-6147');
    expect(validate(state({ course: null })).course?.code).toBe('CH-6140');
    expect(validate(state({ lastDay: '2026-11-04' })).days?.code).toBe('CH-6141');
    expect(validate(state({ counting: 'custom', play: 3, count: 4 })).counting?.code).toBe('CH-6145');
    expect(validate(state({ resultsUrl: 'http://golfstat.com' })).resultsUrl?.code).toBe('CH-6146');
  });
});

describe('dates', () => {
  it('reads ranges and seasons as the plan writes them', () => {
    expect(rangeText('2026-11-05', '2026-11-07')).toBe('Thu 5 to Sat 7 Nov');
    expect(rangeText('2026-10-31', '2026-11-02')).toBe('Sat 31 Oct to Mon 2 Nov');
    expect(seasonLabelOf('2026-07-31')).toBe('2025–26');
    expect(seasonLabelOf('2026-08-01')).toBe('2026–27');
  });
});
