import { describe, expect, it } from 'vitest';
import {
  MARK_LIFETIME_MS,
  badgeWord,
  coachLabel,
  composeChangeCopy,
  eventEndMs,
  markIsLive,
  markKind,
  parseStoredChange,
  readPartialChange,
  snapshotOf,
  withinRowHorizon,
  type ChangeSnapshot,
  type StoredChange,
} from '../change-mark';

const TZ = 'America/New_York';
// Tuesday 14 April 2026, 5:20 PM Eastern.
const NOW = '2026-04-14T21:20:00Z';
const AT = '2026-04-14T21:14:00Z';

/** Practice on Wed 15 April, 3:00 to 5:00 PM Eastern, at Lonnie Poole. */
const base: ChangeSnapshot = {
  start_time: '2026-04-15T19:00:00Z',
  end_time: '2026-04-15T21:00:00Z',
  all_day: false,
  location: 'Lonnie Poole',
  title: 'Practice',
  event_type: 'practice',
  cancelled: false,
};

const copy = (after: Partial<ChangeSnapshot>, extra: { byNames?: string[]; byMe?: boolean; reason?: string | null; before?: Partial<ChangeSnapshot> } = {}) =>
  composeChangeCopy({ items: [{ before: { ...base, ...extra.before }, after: { ...base, ...after } }], timeZone: TZ, nowIso: NOW, byNames: extra.byNames ?? ['Maya Reyes'], byMe: extra.byMe, reason: extra.reason, at: AT });

describe('single event copy', () => {
  // [name, after, title, panel line 1, badge, kind]
  const rows: Array<[string, Partial<ChangeSnapshot>, string, string, string, string]> = [
    ['time', { start_time: '2026-04-15T20:00:00Z', end_time: '2026-04-15T22:00:00Z' }, 'Practice moved to 4:00 PM (was 3:00 PM)', 'Moved from 3:00 PM', 'Moved', 'time'],
    ['day, same clock time', { start_time: '2026-04-16T19:00:00Z', end_time: '2026-04-16T21:00:00Z' }, 'Practice moved to Thu at 3:00 PM (was tomorrow)', 'Moved from Wed 15 April', 'Moved', 'day'],
    ['day and time', { start_time: '2026-04-16T20:00:00Z', end_time: '2026-04-16T22:00:00Z' }, 'Practice moved to Thu at 4:00 PM (was tomorrow at 3:00 PM)', 'Moved from Wed 15 April at 3:00 PM', 'Moved', 'day'],
    ['end only', { end_time: '2026-04-15T22:30:00Z' }, 'Practice now ends at 6:30 PM (was 5:00 PM)', 'Now ends at 6:30 PM, was 5:00 PM', 'New time', 'retime'],
    ['retime', { start_time: '2026-04-15T20:00:00Z', end_time: '2026-04-15T22:30:00Z' }, 'Practice is now 4:00 to 6:30 PM (was 3:00 to 5:00 PM)', 'Now 4:00 to 6:30 PM, was 3:00 to 5:00 PM', 'New time', 'retime'],
    ['place', { location: 'Finley range' }, 'Practice moved to Finley range (was Lonnie Poole)', 'Now at Finley range, was Lonnie Poole', 'Moved', 'place'],
    ['place added', { location: 'Finley range' }, 'Practice is now at Finley range', 'Now at Finley range', 'Moved', 'place'],
    ['place removed', { location: null }, 'Practice has no place set (was Lonnie Poole)', 'No place set, was Lonnie Poole', 'Moved', 'place'],
    ['rename', { title: 'Short game' }, 'Practice is now called Short game', 'Renamed from Practice', 'Renamed', 'rename'],
    ['retype', { event_type: 'qualifier' }, 'Practice is now a qualifier', 'Now a qualifier, was a practice', 'Changed', 'retype'],
    ['time and place', { start_time: '2026-04-15T20:00:00Z', end_time: '2026-04-15T22:00:00Z', location: 'Finley range' }, 'Practice moved to 4:00 PM at Finley range', 'Changed', 'Moved', 'several'],
    ['day, time and place', { start_time: '2026-04-16T20:00:00Z', end_time: '2026-04-16T22:00:00Z', location: 'Finley range' }, 'Practice moved to Thu at 4:00 PM at Finley range', 'Changed', 'Moved', 'several'],
    ['rename plus time', { title: 'Short game', start_time: '2026-04-15T20:00:00Z', end_time: '2026-04-15T22:00:00Z' }, 'Short game moved to 4:00 PM', 'Changed', 'Moved', 'several'],
    ['rename plus retype', { title: 'Short game', event_type: 'other' }, 'Practice is now called Short game', 'Changed', 'Changed', 'several'],
    ['cancel', { cancelled: true }, 'Practice tomorrow at 3:00 PM is cancelled', 'Cancelled', 'Cancelled', 'cancel'],
    ['cancel beats a move', { cancelled: true, start_time: '2026-04-15T20:00:00Z', end_time: '2026-04-15T22:00:00Z' }, 'Practice tomorrow at 3:00 PM is cancelled', 'Cancelled', 'Cancelled', 'cancel'],
  ];
  it.each(rows)('%s', (name, after, title, line1, badge, kind) => {
    const before = name === 'place added' ? { location: null } : {};
    const c = copy(after, { before });
    expect(c.title).toBe(title);
    expect(c.panelLine1).toBe(line1);
    expect(c.badge).toBe(badge);
    expect(c.kind).toBe(kind);
  });

  it('restore', () => {
    const c = copy({ cancelled: false }, { before: { cancelled: true } });
    expect(c.title).toBe('Practice tomorrow at 3:00 PM is back on');
    expect(c.panelLine1).toBe('Back on');
    expect(c.badge).toBe('Back on');
  });

  it('all day to timed, and timed to all day', () => {
    const allDay: Partial<ChangeSnapshot> = { all_day: true, start_time: '2026-04-15T00:00:00Z', end_time: '2026-04-15T00:00:00Z' };
    const toTimed = copy({}, { before: allDay });
    expect(toTimed.title).toBe('Practice is now at 3:00 PM (was all day)');
    expect(toTimed.was.time).toBe('All day');
    const toAllDay = copy(allDay);
    expect(toAllDay.title).toBe('Practice is now all day (was 3:00 PM)');
    expect(toAllDay.was.time).toBe('3:00 PM');
  });

  it('an all-day event moved a day names the days, not a time', () => {
    const c = copy(
      { all_day: true, start_time: '2026-05-16T00:00:00Z', end_time: '2026-05-16T00:00:00Z', title: 'Pinehurst Invitational' },
      { before: { all_day: true, start_time: '2026-05-15T00:00:00Z', end_time: '2026-05-15T00:00:00Z', title: 'Pinehurst Invitational' } },
    );
    expect(c.title).toBe('Pinehurst Invitational moved to Sat 16 May (was Fri 15 May)');
    expect(c.was.time).toBe('Fri');
    expect(copy({ all_day: true, start_time: '2026-04-18T00:00:00Z', end_time: '2026-04-18T00:00:00Z' }, { before: { all_day: true, start_time: '2026-04-17T00:00:00Z', end_time: '2026-04-17T00:00:00Z' } }).title).toBe('Practice moved to Sat (was Fri)');
  });

  it('context lines', () => {
    expect(copy({ start_time: '2026-04-15T20:00:00Z', end_time: '2026-04-15T22:00:00Z' }).body).toBe('Wed 15 April · 4:00 to 6:00 PM · Lonnie Poole');
    expect(copy({ start_time: '2026-04-15T20:00:00Z', end_time: '2026-04-15T22:00:00Z', location: 'Finley range' }).body).toBe('Was 3:00 PM at Lonnie Poole · Wed 15 April');
    expect(copy({ title: 'Short game', start_time: '2026-04-15T20:00:00Z', end_time: '2026-04-15T22:00:00Z' }).body).toBe('Was Practice, 3:00 PM · Wed 15 April');
    expect(copy({ cancelled: true }).body).toBe('Wed 15 April · 3:00 to 5:00 PM · Lonnie Poole');
    expect(copy({ cancelled: true }, { reason: 'Course closed for aeration' }).body).toBe('Course closed for aeration');
    expect(copy({ location: null }).body).toBe('Wed 15 April · 3:00 to 5:00 PM');
  });

  it('writes a range across noon with both halves', () => {
    const c = copy({ start_time: '2026-04-15T15:00:00Z', end_time: '2026-04-15T17:00:00Z' });
    expect(c.title).toBe('Practice moved to 11:00 AM (was 3:00 PM)');
    expect(c.body).toBe('Wed 15 April · 11:00 AM to 1:00 PM · Lonnie Poole');
  });

  it('truncates a long title at 40 characters and a long place at 28', () => {
    const long = 'The Pinehurst Spring Invitational Qualifying Round';
    expect(copy({ start_time: '2026-04-15T20:00:00Z', end_time: '2026-04-15T22:00:00Z', title: long }, { before: { title: long } }).title.startsWith(`${long.slice(0, 39)}… moved`)).toBe(true);
    const c = copy({ location: 'The Pinehurst Resort & Country Club No. 2' });
    expect(c.title).toBe('Practice moved to The Pinehurst Resort & Coun… (was Lonnie Poole)');
  });

  it('the lists the panel shows for several fields', () => {
    const c = copy({ start_time: '2026-04-16T20:00:00Z', end_time: '2026-04-16T22:00:00Z', location: 'Finley range', title: 'Short game' });
    expect(c.panelRows).toEqual([
      { label: 'Time', now: '4:00 to 6:00 PM', was: '3:00 to 5:00 PM' },
      { label: 'Day', now: 'Thu 16 April', was: 'Wed 15 April' },
      { label: 'Place', now: 'Finley range', was: 'Lonnie Poole' },
      { label: 'Name', now: 'Short game', was: 'Practice' },
    ]);
  });

  it('the old values beside the new', () => {
    expect(copy({ start_time: '2026-04-15T20:00:00Z', end_time: '2026-04-15T22:00:00Z' }).was).toEqual({ time: '3:00 PM' });
    expect(copy({ end_time: '2026-04-15T22:30:00Z' }).was).toEqual({ time: '3:00 to 5:00 PM' });
    expect(copy({ start_time: '2026-04-16T19:00:00Z', end_time: '2026-04-16T21:00:00Z' }).was).toEqual({ time: 'Wed 3:00 PM' });
    expect(copy({ location: 'Finley range' }).was).toEqual({ place: 'Lonnie Poole' });
    expect(copy({ title: 'Short game' }).was).toEqual({ title: 'Practice' });
    expect(copy({ start_time: '2026-04-29T19:00:00Z', end_time: '2026-04-29T21:00:00Z' }).was).toEqual({ time: 'Wed 15 April 3:00 PM' });
    expect(copy({ cancelled: true }).was).toEqual({});
  });

  it('the live region and the feed line', () => {
    const c = copy({ start_time: '2026-04-15T20:00:00Z', end_time: '2026-04-15T22:00:00Z' });
    expect(c.liveText).toBe('Practice moved to 4:00 PM. It was 3:00 PM.');
    expect(c.feedLine).toBe('Moved from 3:00 PM by Coach Reyes on Tue 14 April.');
    expect(copy({ cancelled: true }).liveText).toBe('Practice tomorrow at 3:00 PM is cancelled.');
  });

  it('exact day math in the New York spring-forward week', () => {
    // 8 March 2026 is the day the clocks go forward: 3:00 PM Eastern is 19:00Z on the 7th and 19:00Z on the 8th (EDT).
    const c = composeChangeCopy({
      items: [{ before: { ...base, start_time: '2026-03-07T20:00:00Z', end_time: '2026-03-07T22:00:00Z' }, after: { ...base, start_time: '2026-03-08T19:00:00Z', end_time: '2026-03-08T21:00:00Z' } }],
      timeZone: TZ,
      nowIso: '2026-03-02T15:00:00Z',
      byNames: [],
      at: '2026-03-02T14:00:00Z',
    });
    expect(c.kind).toBe('day');
    expect(c.title).toBe('Practice moved to Sun at 3:00 PM (was Sat)');
  });
});

describe('who and when (panel line 2)', () => {
  const when = { start_time: '2026-04-15T20:00:00Z', end_time: '2026-04-15T22:00:00Z' };
  it('names one coach, two coaches, three', () => {
    expect(copy(when).panelLine2).toBe('By Coach Reyes · 5:14 PM');
    expect(copy(when, { byNames: ['Maya Reyes', 'Ken Ito'] }).panelLine2).toBe('By Coach Reyes and Coach Ito · 5:14 PM');
    expect(copy(when, { byNames: ['Maya Reyes', 'Ken Ito', 'Dee Lane'] }).panelLine2).toBe('By Coach Reyes, Coach Ito and Coach Lane · 5:14 PM');
  });
  it('says "you" for the changer, and no name when none is known', () => {
    expect(copy(when, { byMe: true }).panelLine2).toBe('By you · 5:14 PM');
    expect(copy(when, { byNames: [] }).panelLine2).toBe('Changed 5:14 PM');
  });
  it('writes the day of an earlier edit', () => {
    const at = (iso: string) => composeChangeCopy({ items: [{ before: base, after: { ...base, location: 'X' } }], timeZone: TZ, nowIso: NOW, byNames: ['Maya Reyes'], at: iso }).panelLine2;
    expect(at('2026-04-13T01:14:00Z')).toBe('By Coach Reyes · Yesterday 9:14 PM'.replace('Yesterday', 'Sun'));
    expect(at('2026-04-13T21:14:00Z')).toBe('By Coach Reyes · Yesterday 5:14 PM');
    expect(at('2026-03-30T21:14:00Z')).toBe('By Coach Reyes · 30 March 5:14 PM');
  });
  it('writes a coach as Coach {Last}, never Coach Coach', () => {
    expect(coachLabel('Maya Reyes')).toBe('Coach Reyes');
    expect(coachLabel('Demo Coach')).toBe('Coach Demo');
    expect(coachLabel('Coach')).toBeNull();
    expect(coachLabel('  ')).toBeNull();
    expect(coachLabel('Alexandria Featherstonehaugh-Montgomery')?.endsWith('…')).toBe(true);
  });
});

describe('a series edited together', () => {
  const dates = ['2026-04-21', '2026-04-23', '2026-04-28'];
  const items = (before: Partial<ChangeSnapshot>, after: (d: string) => Partial<ChangeSnapshot>, startH = 19) =>
    dates.map((d) => ({ before: { ...base, start_time: `${d}T${startH}:00:00Z`, end_time: `${d}T${startH + 2}:00:00Z`, ...before }, after: { ...base, start_time: `${d}T${startH}:00:00Z`, end_time: `${d}T${startH + 2}:00:00Z`, ...after(d) } }));
  const series = (its: ReturnType<typeof items>) => composeChangeCopy({ items: its, timeZone: TZ, nowIso: NOW, byNames: ['Maya Reyes'], at: AT });

  it('the same new time', () => {
    const c = series(items({}, (d) => ({ start_time: `${d}T20:00:00Z`, end_time: `${d}T22:00:00Z` })));
    expect(c.title).toBe('Practice: 3 dates moved to 4:00 PM (was 3:00 PM)');
    expect(c.body).toBe('From Tue 21 April to Tue 28 April · Lonnie Poole');
  });
  it('the same shift from different times', () => {
    const its = items({}, (d) => ({ start_time: `${d}T20:00:00Z`, end_time: `${d}T22:00:00Z` }));
    its[1]!.before.start_time = '2026-04-23T18:00:00Z';
    its[1]!.before.end_time = '2026-04-23T20:00:00Z';
    its[2]!.before.start_time = '2026-04-28T18:00:00Z';
    its[2]!.before.end_time = '2026-04-28T20:00:00Z';
    its[1]!.after.start_time = '2026-04-23T19:00:00Z';
    its[1]!.after.end_time = '2026-04-23T21:00:00Z';
    its[2]!.after.start_time = '2026-04-28T19:00:00Z';
    its[2]!.after.end_time = '2026-04-28T21:00:00Z';
    expect(series(its).title).toBe('Practice: 3 dates moved 1 hour later');
  });
  it('place, rename, cancel and anything else', () => {
    expect(series(items({}, () => ({ location: 'Finley range' }))).title).toBe('Practice: 3 dates moved to Finley range (was Lonnie Poole)');
    expect(series(items({}, () => ({ title: 'Short game' }))).title).toBe('Practice: 3 dates now called Short game');
    expect(series(items({}, () => ({ cancelled: true }))).title).toBe('Practice: 3 dates cancelled');
    const other = series(items({}, () => ({ event_type: 'meeting' })));
    expect(other.title).toBe('Practice: 3 dates changed');
    expect(other.body).toBe('From Tue 21 April to Tue 28 April · Open Calendar for the new times');
  });
});

describe('parsing a stored mark', () => {
  const good: StoredChange = { v: 1, id: 'abc', first_at: AT, at: AT, by: 'coach-1', by_names: ['Maya Reyes'], from: base, fields: ['start_time'] };
  it('reads a version 1 mark', () => {
    expect(parseStoredChange(good)).toEqual(good);
    expect(parseStoredChange({ ...good, settled_at: AT, notified: { outcome: 'pushed', count: 9, at: AT }, prior: good })?.prior).toEqual(good);
  });
  it.each([
    ['null', null],
    ['an array', []],
    ['an unknown version', { ...good, v: 2 }],
    ['no from', { ...good, from: undefined }],
    ['a bad from', { ...good, from: { ...base, all_day: 'no' } }],
    ['a bad instant', { ...good, at: 'yesterday' }],
    ['an unknown field', { ...good, fields: ['colour'] }],
    ['bad names', { ...good, by_names: [1] }],
  ])('refuses %s', (_n, raw) => {
    expect(parseStoredChange(raw)).toBeNull();
  });
  it('finds enough of an unreadable mark to show a bare badge', () => {
    expect(readPartialChange({ ...good, v: 2, from: undefined })).toEqual({ id: 'abc', at: AT });
    expect(readPartialChange({ id: 'abc' })).toBeNull();
    expect(readPartialChange(null)).toBeNull();
  });
  it('snapshots an event row as the trigger does', () => {
    expect(snapshotOf({ start_time: '2026-04-15T19:00:00.000Z', end_time: null, all_day: null, location: '  Lonnie Poole ', title: 'Practice', event_type: 'practice', status: 'cancelled' })).toEqual({
      start_time: '2026-04-15T19:00:00Z',
      end_time: null,
      all_day: false,
      location: 'Lonnie Poole',
      title: 'Practice',
      event_type: 'practice',
      cancelled: true,
    });
    expect(snapshotOf({ start_time: '2026-04-15T19:00:00Z', end_time: null, all_day: false, location: '  ', title: 'Practice', event_type: 'practice', status: null }).location).toBeNull();
  });
});

describe('kind and badge', () => {
  it('reads the kind from the stored baseline and the event now', () => {
    expect(markKind({ from: base }, { ...base, title: 'Short game' }, TZ)).toBe('rename');
    expect(markKind({ from: base }, { ...base, cancelled: true }, TZ)).toBe('cancel');
    expect(markKind({ from: base }, base, TZ)).toBe('several');
  });
  it('the badge says Moved for a move of time or place, else the plain word', () => {
    expect(badgeWord('several', { time: false, place: true })).toBe('Moved');
    expect(badgeWord('several', { time: false, place: false })).toBe('Changed');
    expect(badgeWord('retype')).toBe('Changed');
  });
});

describe('how long a mark lives', () => {
  const ev = { startIso: '2026-04-17T19:00:00Z', endIso: '2026-04-17T21:00:00Z', allDay: false };
  const edit = Date.parse('2026-04-13T00:00:00Z');
  it('72 hours after the last edit', () => {
    expect(markIsLive({ at: new Date(edit).toISOString() }, ev, TZ, edit + MARK_LIFETIME_MS - 60_000)).toBe(true);
    expect(markIsLive({ at: new Date(edit).toISOString() }, ev, TZ, edit + MARK_LIFETIME_MS + 60_000)).toBe(false);
  });
  it('or when the event ends, whichever is first', () => {
    const at = new Date(Date.parse('2026-04-17T12:00:00Z')).toISOString();
    expect(markIsLive({ at }, ev, TZ, Date.parse('2026-04-17T20:59:00Z'))).toBe(true);
    expect(markIsLive({ at }, ev, TZ, Date.parse('2026-04-17T21:01:00Z'))).toBe(false);
  });
  it('an event with no end lasts an hour', () => {
    expect(eventEndMs({ startIso: '2026-04-15T19:00:00Z', endIso: null, allDay: false }, TZ)).toBe(Date.parse('2026-04-15T20:00:00Z'));
  });
  it('an all-day event ends at midnight after its last day in the team zone, not UTC midnight', () => {
    // Stored 00:00 UTC on 17 April; the day ends at midnight Eastern (04:00Z) after the 17th.
    expect(eventEndMs({ startIso: '2026-04-17T00:00:00Z', endIso: '2026-04-17T00:00:00Z', allDay: true }, TZ)).toBe(Date.parse('2026-04-18T04:00:00Z'));
    // A span to the 19th ends after the 19th.
    expect(eventEndMs({ startIso: '2026-04-17T00:00:00Z', endIso: '2026-04-19T00:00:00Z', allDay: true }, TZ)).toBe(Date.parse('2026-04-20T04:00:00Z'));
    // 7 PM Eastern on the last day is still live under UTC reading, and so it must be here.
    const at = '2026-04-17T12:00:00Z';
    const allDay = { startIso: '2026-04-17T00:00:00Z', endIso: null, allDay: true };
    expect(markIsLive({ at }, allDay, TZ, Date.parse('2026-04-17T23:30:00Z'))).toBe(true);
    expect(markIsLive({ at }, allDay, TZ, Date.parse('2026-04-18T04:30:00Z'))).toBe(false);
  });
  it('rows show a mark within 14 days of the start', () => {
    const now = Date.parse('2026-04-14T12:00:00Z');
    expect(withinRowHorizon('2026-04-27T12:00:00Z', now)).toBe(true);
    expect(withinRowHorizon('2026-04-29T12:00:00Z', now)).toBe(false);
    expect(withinRowHorizon('2026-04-10T12:00:00Z', now)).toBe(true);
  });
});

// F-0010 (NOT FOUND, pinned): a change of place alone is kind `place`, never a time kind, and its badge says Moved by design.
describe('a place-only change (F-0010)', () => {
  it('is a move of place, not of time', () => {
    const kind = markKind({ from: base }, { ...base, location: 'Finley range' }, TZ);
    expect(kind).toBe('place');
    expect(['time', 'day', 'retime', 'allday']).not.toContain(kind);
    expect(badgeWord(kind)).toBe('Moved');
  });
});
