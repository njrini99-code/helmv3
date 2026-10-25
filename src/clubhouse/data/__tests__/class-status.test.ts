import { describe, expect, it } from 'vitest';
import type { ChClassBlock, ChClassDay, ChClassDayPlayer } from '../class-day-shape';
import {
  classLabel,
  classStatusFor,
  classStatusText,
  composerPlaceholder,
  freeWindow,
  instantAt,
  mergeIslands,
  minutesOfDay,
  notifyAnywayTargets,
  teamNow,
  windowRange,
} from '../class-status';

/** Monday 2026-10-26 in New York is EDT (UTC-4): 9:30 AM is 13:30Z. */
const z = (hhmm: string) => `2026-10-26T${hhmm}:00.000Z`;
const t = (hhmm: string) => Date.parse(z(hhmm));
const block = (from: string, to: string, over: Partial<ChClassBlock> = {}): ChClassBlock => ({
  classId: 'c',
  label: 'STAT 201 - Probability',
  kind: 'class',
  source: 'pattern',
  startsAt: z(from),
  endsAt: z(to),
  ...over,
});
const player = (over: Partial<ChClassDayPlayer> = {}): ChClassDayPlayer => ({
  playerId: 'p1',
  firstName: 'Theo',
  lastName: 'Park',
  avatarUrl: null,
  tracked: true,
  holds: true,
  onCourse: false,
  offToday: false,
  away: null,
  blocks: [block('13:30', '14:45')],
  ...over,
});
const dayOf = (players: ChClassDayPlayer[], over: Partial<ChClassDay> = {}): ChClassDay => ({
  on: '2026-10-26',
  teamTimeZone: 'America/New_York',
  classTimeZone: 'America/New_York',
  term: null,
  nextTerm: null,
  players,
  fetchedAt: 0,
  ...over,
});
const opts12 = { clock: '12' as const, teamTz: 'America/New_York', classTz: null };

describe('mergeIslands', () => {
  it('merges overlapping, adjacent and 15-minute-gap blocks, and splits at 16 minutes', () => {
    expect(mergeIslands([block('13:00', '14:00'), block('13:30', '14:30')])).toHaveLength(1);
    expect(mergeIslands([block('13:00', '14:00'), block('14:00', '15:00')])).toHaveLength(1);
    expect(mergeIslands([block('13:00', '14:00'), block('14:15', '15:00')])).toHaveLength(1);
    expect(mergeIslands([block('13:00', '14:00'), block('14:16', '15:00')])).toHaveLength(2);
  });

  it('sorts unsorted input, keeps the longest end, and lists each block in its island', () => {
    const [island] = mergeIslands([block('15:00', '15:30'), block('13:00', '16:00'), block('14:00', '14:30')]);
    expect(island).toMatchObject({ startsAt: t('13:00'), endsAt: t('16:00') });
    expect(island!.blocks).toHaveLength(3);
  });

  it('calls an island an exam only when every block in it is one', () => {
    expect(mergeIslands([block('13:00', '14:00', { kind: 'exam' })])[0]!.kind).toBe('exam');
    expect(mergeIslands([block('13:00', '14:00', { kind: 'exam' }), block('14:00', '15:00')])[0]!.kind).toBe('class');
  });

  it('skips blocks that do not parse', () => {
    expect(mergeIslands([block('13:00', '14:00', { startsAt: 'nope' }), block('14:00', '13:00')])).toEqual([]);
  });
});

describe('classStatusFor', () => {
  it('reads in class inside the island, with the island end', () => {
    const s = classStatusFor(player(), t('14:00'));
    expect(s).toMatchObject({ kind: 'in_class', until: t('14:45') });
  });

  it('reads an exam when the island is only exams', () => {
    expect(classStatusFor(player({ blocks: [block('13:30', '14:45', { kind: 'exam', source: 'exam' })] }), t('14:00')).kind).toBe('exam');
  });

  it('holds the whole merged island: between two close classes is still in class until the last end', () => {
    const p = player({ blocks: [block('13:30', '14:45'), block('14:55', '16:00')] });
    expect(classStatusFor(p, t('14:50'))).toMatchObject({ kind: 'in_class', until: t('16:00') });
  });

  it('is soon exactly 15 minutes before a block starts, and not at 15:01', () => {
    expect(classStatusFor(player(), t('13:15'))).toMatchObject({ kind: 'soon', at: t('13:30') });
    expect(classStatusFor(player(), t('13:14')).kind).toBe('none');
  });

  it('is none at the block end and after it', () => {
    expect(classStatusFor(player(), t('14:45')).kind).toBe('none');
    expect(classStatusFor(player(), t('18:00')).kind).toBe('none');
  });

  it('lets the course outrank class', () => {
    expect(classStatusFor(player({ onCourse: true }), t('14:00')).kind).toBe('none');
  });

  it('reads a confirmed trip as travelling, and an unconfirmed one as nothing', () => {
    const away = { destination: 'Pinehurst', returnDate: null, confirmed: true };
    expect(classStatusFor(player({ away, blocks: [] }), t('14:00'))).toEqual({ kind: 'travelling', destination: 'Pinehurst' });
    expect(classStatusFor(player({ away: { ...away, confirmed: false }, blocks: [] }), t('14:00')).kind).toBe('none');
  });

  it('reads an untracked player as nothing even if blocks are present', () => {
    expect(classStatusFor(player({ tracked: false }), t('14:00')).kind).toBe('none');
  });
});

describe('classStatusText', () => {
  const inClass = classStatusFor(player(), t('14:00'));

  it('writes the line in 12 and 24 hours', () => {
    expect(classStatusText(inClass, opts12)).toBe('In class until 10:45 AM');
    expect(classStatusText(inClass, { ...opts12, clock: '24' })).toBe('In class until 10:45');
  });

  it('words an exam, a soon block and a trip', () => {
    expect(classStatusText(classStatusFor(player({ blocks: [block('13:30', '14:45', { kind: 'exam' })] }), t('14:00')), opts12)).toBe('In an exam until 10:45 AM');
    expect(classStatusText(classStatusFor(player(), t('13:20')), opts12)).toBe('Class at 9:30 AM');
    expect(classStatusText({ kind: 'travelling', destination: 'Pinehurst' }, opts12)).toBe('Travelling · Pinehurst');
    expect(classStatusText({ kind: 'travelling', destination: null }, opts12)).toBe('Travelling');
    expect(classStatusText({ kind: 'none' }, opts12)).toBeNull();
  });

  it('adds the class zone abbreviation, and draws the time in that zone, only when it differs from the team zone', () => {
    const same = classStatusText(inClass, { ...opts12, classTz: 'America/New_York' });
    expect(same).toBe('In class until 10:45 AM');
    const chicago = classStatusText(inClass, { ...opts12, classTz: 'America/Chicago' });
    expect(chicago).toBe('In class until 9:45 AM CT');
  });

  it('never writes an exclamation mark or an emoji', () => {
    for (const s of [inClass, classStatusFor(player(), t('13:20')), { kind: 'travelling', destination: 'Pinehurst' } as const]) {
      const text = classStatusText(s, opts12) ?? '';
      expect(text).not.toMatch(/!|\p{Extended_Pictographic}/u);
    }
  });
});

describe('classLabel', () => {
  it('shows the course code when there is one, never the rest', () => {
    expect(classLabel('STAT 201 - Probability')).toBe('STAT 201');
  });
  it('shows the first 24 characters with an ellipsis when there is no code', () => {
    expect(classLabel('Intro to Writing')).toBe('Intro to Writing');
    expect(classLabel('An extremely long class name with no code at all')).toBe('An extremely long class…');
  });
});

describe('zones', () => {
  it('reads the wall clock of a zone and puts a wall time back on the instant', () => {
    expect(minutesOfDay(t('14:00'), 'America/New_York')).toBe(10 * 60);
    expect(minutesOfDay(t('14:00'), 'America/Los_Angeles')).toBe(7 * 60);
    expect(instantAt('2026-10-26', 9 * 60 + 30, 'America/New_York')).toBe(t('13:30'));
    // the Monday after daylight saving ends
    expect(instantAt('2026-11-02', 9 * 60 + 30, 'America/New_York')).toBe(Date.parse('2026-11-02T14:30:00Z'));
    expect(minutesOfDay(1, 'Mars/Olympus')).toBeNull();
    expect(instantAt('2026-10-26', 0, 'Mars/Olympus')).toBeNull();
  });
});

describe('teamNow and freeWindow', () => {
  // Nine players: two in 13:30-14:45, one 15:30-16:30, others untracked.
  const team = (extra: ChClassDayPlayer[] = []) =>
    dayOf([
      player({ playerId: 'a' }),
      player({ playerId: 'b', blocks: [block('13:30', '14:45')] }),
      player({ playerId: 'c', blocks: [block('15:30', '16:30')] }),
      ...extra,
    ]);

  it('counts tracked players in class now and finds the first and last block', () => {
    const n = teamNow(team(), t('14:00'));
    expect(n).toMatchObject({ total: 3, tracked: 3, inClassNow: 2, inExamNow: 0, firstClassAt: t('13:30'), lastEndAt: t('16:30') });
    expect(n.nextClass).toEqual({ at: t('15:30'), count: 1 });
  });

  it('counts only tracked players: an untracked player in the list is not a number', () => {
    const n = teamNow(team([player({ playerId: 'u', tracked: false, holds: false })]), t('14:00'));
    expect(n).toMatchObject({ total: 4, tracked: 3, inClassNow: 2 });
  });

  it('keeps a player on the course out of the counts', () => {
    const n = teamNow(dayOf([player({ onCourse: true })]), t('14:00'));
    expect(n.inClassNow).toBe(0);
  });

  it('finds a bounded free window of at least an hour, then the unbounded one after the last block', () => {
    // 14:45 to 15:30 is only 45 minutes: no window yet, so the first one is after the last block.
    expect(freeWindow(team(), t('14:00'))).toEqual({ from: t('16:30'), to: null });
    // Move the last class later: 14:45 to 16:00 is 75 minutes, bounded.
    const late = dayOf([player({ playerId: 'a' }), player({ playerId: 'c', blocks: [block('16:00', '17:00')] })]);
    expect(freeWindow(late, t('14:00'))).toEqual({ from: t('14:45'), to: t('16:00') });
  });

  it('starts a window at now when nobody is in class and the next class is an hour away', () => {
    expect(freeWindow(dayOf([player({ blocks: [block('16:00', '17:00')] })]), t('14:00'))).toEqual({ from: t('14:00'), to: t('16:00') });
  });

  it('says there is no hour before 7 PM when the afternoon is full', () => {
    // 7 PM EDT is 23:00Z. The gaps are 15 minutes, then the last block runs to the cutoff.
    const full = dayOf([player({ blocks: [block('13:30', '14:45'), block('15:00', '16:00'), block('16:15', '23:00')] })]);
    expect(freeWindow(full, t('14:00'))).toBe('none_before_cutoff');
    expect(freeWindow(dayOf([player({ blocks: [block('13:30', '22:30')] })]), t('14:00'))).toBe('none_before_cutoff');
  });

  it('is null when no block is left today', () => {
    expect(freeWindow(team(), t('18:00'))).toBeNull();
  });

  it('ignores untracked players and players on the course when finding the window', () => {
    const d = dayOf([player({ playerId: 'a', blocks: [block('13:30', '14:45')] }), player({ playerId: 'u', tracked: false, blocks: [block('15:00', '23:00')] })]);
    expect(freeWindow(d, t('14:00'))).toEqual({ from: t('14:45'), to: null });
  });

  it('starts the search at the first class when the day has not begun', () => {
    const d = dayOf([player({ blocks: [block('13:30', '14:45')] })]);
    expect(teamNow(d, t('11:00')).freeWindow).toEqual({ from: t('14:45'), to: null });
  });

  it('flags a team-wide off day only when every tracked player has it', () => {
    expect(teamNow(dayOf([player({ offToday: true }), player({ playerId: 'b', offToday: true })]), t('14:00')).allOffToday).toBe(true);
    expect(teamNow(dayOf([player({ offToday: true }), player({ playerId: 'b' })]), t('14:00')).allOffToday).toBe(false);
  });

  it('writes a window as times only', () => {
    expect(windowRange(t('14:45'), null, opts12)).toBe('10:45 AM');
    expect(windowRange(t('18:15'), t('19:30'), opts12)).toBe('2:15 to 3:30 PM');
    expect(windowRange(t('14:45'), t('17:30'), opts12)).toBe('10:45 AM to 1:30 PM');
    expect(windowRange(t('18:15'), t('19:30'), { ...opts12, clock: '24' })).toBe('14:15 to 15:30');
  });
});

describe('composerPlaceholder', () => {
  it('speaks only while the player is in a class and their pushes are held, and promises nothing about when they read it', () => {
    expect(composerPlaceholder(player(), t('14:00'), 'Theo')).toBe("Won't interrupt Theo in class");
    expect(composerPlaceholder(player({ blocks: [block('13:30', '14:45', { kind: 'exam' })] }), t('14:00'), 'Theo')).toBe("Won't interrupt Theo in an exam");
  });
  it('uses them when the first name is missing', () => {
    expect(composerPlaceholder(player(), t('14:00'), null)).toBe("Won't interrupt them in class");
    expect(composerPlaceholder(player(), t('14:00'), '  ')).toBe("Won't interrupt them in class");
  });
  it('stays quiet when the hold is off, before class (soon), after class, on the course and for the untracked', () => {
    expect(composerPlaceholder(player({ holds: false }), t('14:00'), 'Theo')).toBeNull();
    expect(composerPlaceholder(player(), t('13:20'), 'Theo')).toBeNull();
    expect(composerPlaceholder(player(), t('14:45'), 'Theo')).toBeNull();
    expect(composerPlaceholder(player({ onCourse: true }), t('14:00'), 'Theo')).toBeNull();
    expect(composerPlaceholder(player({ tracked: false, holds: false }), t('14:00'), 'Theo')).toBeNull();
  });
});

describe('notifyAnywayTargets', () => {
  it('lists only participants who are tracked, holding and in a block right now', () => {
    const day = dayOf([
      player({ playerId: 'in' }),
      player({ playerId: 'nohold', holds: false }),
      player({ playerId: 'soon', blocks: [block('14:10', '15:00')] }),
      player({ playerId: 'free', blocks: [] }),
      player({ playerId: 'other' }),
    ]);
    expect(notifyAnywayTargets(day, ['in', 'nohold', 'soon', 'free'], t('14:00')).map((p) => p.playerId)).toEqual(['in']);
    expect(notifyAnywayTargets(day, [], t('14:00'))).toEqual([]);
  });
});
