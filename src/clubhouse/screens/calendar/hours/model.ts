import type { HoursAdjustment } from '@/lib/golf/practice-hours';
import { addDays, dowOf, dayNum, monthName, TYPE_LABEL, type ChCalEvent, type ChCalPerson, type ChCalType } from '../model';
import { chCsvName, csvRound, type ChCsvFile, type ChCsvValue } from '../../../lib/csv';
import { plural } from '../../../lib/plural';
import { civicDayOf, fmtHours, type ChHoursFlagKind, type ChHoursLimits } from './rules';

/**
 * Launch readiness F-03: a week of countable athletically related activity (CARA), drafted from the team calendar for
 * each player, and read against the team's limits (`rules.ts`). It is a draft for the compliance office, never a signed
 * record: the coach checks it, adjusts an event that counts differently, and exports it. Pure: no React, no reads.
 *
 * What counts, and for whom:
 *  - Practice, qualifier, tournament and meeting events count; travel, classes, busy time, other events and anything
 *    cancelled do not (a coach can count an other event, or stop one counting, with an adjustment).
 *  - An event counts for its invitees; with none, a practice or qualifier is the whole team's, while a meeting is no one's
 *    and a tournament asks who went (a B-team event saved with nobody on it is not the A team's). A decline or a no-show
 *    mark takes a player off; a present or late mark puts one on.
 *  - "OYO" (on your own) practice is voluntary and an "OFF" entry marks a day off: neither counts, whatever its type.
 *  - Practice and meetings count what they ran. A qualifier is a practice round. A tournament day is a competition day
 *    and counts the competition-day figure (3 hours in Division I and II), with everything before the round in it; a
 *    practice round at the tournament site the day before counts the eve figure (3). An event with no times counts
 *    nothing and says so.
 */

export type ChHoursMark = 'present' | 'late' | 'no_show';

/** A coach's change to how one event counts (golf_hours_adjustments, held migration). */
export type ChHoursAdjustment = HoursAdjustment;

/** A calendar day entry as the log reads it. `invitedList`: the coach invited players by name (`people`), not the whole team. */
export type ChHoursEventIn = Pick<
  ChCalEvent,
  'id' | 'type' | 'title' | 'date' | 'start' | 'end' | 'allDay' | 'location' | 'people' | 'rsvp' | 'cancelled' | 'span'
> & {
  invitedList: boolean;
};

/** How an item's hours were found. */
export type ChHoursRule = 'length' | 'standard' | 'competition' | 'eve' | 'adjusted' | 'absorbed' | 'after' | 'unknown';

export type ChHoursWhen = Pick<ChCalEvent, 'allDay' | 'start' | 'end' | 'date' | 'span'>;

export interface ChHoursItem {
  key: string;
  eventId: string;
  title: string;
  type: ChCalType;
  when: ChHoursWhen;
  /** What it adds to the player's day; null when it has no times. */
  hours: number | null;
  rule: ChHoursRule;
  practiceRound: boolean;
}

export interface ChHoursDay {
  date: string;
  /** The day's countable hours. */
  hours: number;
  /** Something counted that day has no times, so the figure may be short. */
  unknown: boolean;
  items: ChHoursItem[];
  competition: boolean;
  travel: boolean;
  /** No countable activity: a day off (a travel day too, where the association allows it). */
  off: boolean;
}

export interface ChHoursFlag {
  kind: ChHoursFlagKind;
  date: string | null;
  text: string;
  bylaw: string | null;
  /** A check, not a breach: the order of events that day isn't known. */
  check?: boolean;
}

export interface ChHoursRow {
  id: string;
  name: string;
  year: string | null;
  days: ChHoursDay[];
  total: number;
  off: number;
  flags: ChHoursFlag[];
}

/** One event on one day, as the list under the week shows it: whether it counted, how much, and why. */
export interface ChHoursLine {
  key: string;
  eventId: string;
  date: string;
  title: string;
  type: ChCalType;
  when: ChHoursWhen;
  counted: boolean;
  hours: number | null;
  rule: ChHoursRule | null;
  /** Why it counts as it does, or why it doesn't: "Competition day: counts 3", "Travel isn't countable". */
  why: string;
  players: number;
  adjustment: ChHoursAdjustment | null;
}

export interface ChHoursWeek {
  days: string[];
  limits: ChHoursLimits;
  rows: ChHoursRow[];
  lines: ChHoursLine[];
  /** Counted events with no times, whose hours aren't in the figures. */
  noTimes: ChHoursLine[];
  /** Players with at least one warning. */
  flagged: number;
}

const COUNTED_TYPES: ReadonlySet<ChCalType> = new Set(['practice', 'qualifier', 'tournament', 'meeting']);
/** With no invitees, these are the team's; a meeting with none is the coach's own. */
const TEAM_TYPES: ReadonlySet<ChCalType> = new Set(['practice', 'qualifier', 'travel']);
const PRACTICE_ROUND = /\bpractice\s+round\b|\bqualif/i;
/** "On your own" practice is voluntary, so never countable (real calendars write it "OYO"). */
const ON_YOUR_OWN = /\boyo\b|\bon your own\b/i;
/** A calendar entry that marks a day off ("OFF", "Off day", "OFF DAY"), whatever type it was saved as. */
const DAY_OFF = /^\s*off\b(\s*day)?\s*$|\boff\s+day\b/i;

/** "Tue 3 Nov". */
export function shortDay(date: string): string {
  return `${dowOf(date)} ${dayNum(date)} ${monthName(date).slice(0, 3)}`;
}

const sameText = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * What a timed entry ran on its day, or null: no times, or a whole day (a part of 12 hours or more is a run over the day,
 * not a session). Real calendars often save practice as an all-day event (Guilford College, staging, fall 2026: every
 * practice), so a team can set the hours an untimed practice or meeting counts (`untimedHours`).
 */
function length(e: ChHoursEventIn): number | null {
  if (e.allDay || e.start == null || e.end == null) return null;
  const h = e.end - e.start;
  return h > 0 && h < 12 ? h : null;
}

/** The players an event counts for, before replies and marks. */
function invitees(e: ChHoursEventIn, roster: readonly string[]): string[] {
  if (e.invitedList) return e.people;
  return TEAM_TYPES.has(e.type) ? [...roster] : [];
}

/** Who an event counts for: its invitees, less a decline or a no-show, plus anyone marked present or late. */
export function whoCounts(e: ChHoursEventIn, roster: readonly string[], marks: Readonly<Record<string, ChHoursMark>> | undefined): string[] {
  const on = new Set(invitees(e, roster).filter((id) => e.rsvp[id] !== 'declined'));
  for (const [id, m] of Object.entries(marks ?? {})) {
    if (m === 'no_show') on.delete(id);
    else if (roster.includes(id)) on.add(id);
  }
  return roster.filter((id) => on.has(id));
}

interface Drafted {
  line: ChHoursLine;
  item: Omit<ChHoursItem, 'rule' | 'hours'> & { rule: ChHoursRule; hours: number | null };
  who: string[];
  /** The competition's last day (no countable activity after it there). */
  lastCompetitionDay: boolean;
}

function draftEntry(
  e: ChHoursEventIn,
  ctx: {
    roster: readonly string[];
    marks: Record<string, Record<string, ChHoursMark>>;
    adjustments: Record<string, ChHoursAdjustment>;
    limits: ChHoursLimits;
    tournamentStarts: Map<string, ChHoursEventIn[]>;
    untimedHours: number | null;
    /** Whose change it is, in the reader's words: "your change" to the coach, "your coach’s change" to a player. */
    changedBy: string;
  },
): Drafted {
  const adj = ctx.adjustments[e.id] ?? null;
  const who = whoCounts(e, ctx.roster, ctx.marks[e.id]);
  const key = `${e.id}:${e.date}`;
  const when: ChHoursWhen = { allDay: e.allDay, start: e.start, end: e.end, date: e.date, span: e.span };
  const base = { key, eventId: e.id, title: e.title, type: e.type, when };
  const off = (why: string): Drafted => ({
    line: { ...base, date: e.date, counted: false, hours: null, rule: null, why, players: 0, adjustment: adj },
    item: { ...base, rule: 'unknown', hours: null, practiceRound: false },
    who: e.type === 'travel' && !e.cancelled ? who : [],
    lastCompetitionDay: false,
  });

  if (e.cancelled) return off('Cancelled');
  if (adj && !adj.counted) return off(adj.note?.trim() ? `Doesn’t count: ${adj.note.trim()}` : `Doesn’t count (${ctx.changedBy})`);
  const forced = !!adj && adj.hours != null;
  if (!forced && e.type !== 'tournament' && ON_YOUR_OWN.test(e.title)) return off('On your own: voluntary, so not countable');
  if (!forced && DAY_OFF.test(e.title)) return off('A day off on the calendar');
  if (e.type === 'travel' && !forced) return off('Travel isn’t countable');
  if (e.type === 'tournament' && !e.invitedList && !forced && who.length === 0)
    return off('No players on it: invite the players who went, or mark them on the event');
  if (!COUNTED_TYPES.has(e.type) && !forced) return off(e.type === 'other' ? 'Not a practice, round or meeting' : `${TYPE_LABEL[e.type]} isn’t countable`);

  const competition = e.type === 'tournament';
  const nextDay = addDays(e.date, 1);
  const eve =
    e.type === 'practice' &&
    ctx.limits.practiceRoundEve != null &&
    (ctx.tournamentStarts.get(nextDay) ?? []).some((t) => PRACTICE_ROUND.test(e.title) || sameText(t.location, e.location));
  const practiceRound = e.type === 'qualifier' || (e.type === 'practice' && (eve || PRACTICE_ROUND.test(e.title)));

  let hours: number | null;
  let rule: ChHoursRule;
  let why: string;
  if (adj && adj.hours != null) {
    hours = adj.hours;
    rule = 'adjusted';
    why = `Counts ${fmtHours(adj.hours)} (${ctx.changedBy}${adj.note?.trim() ? `: ${adj.note.trim()}` : ''})`;
  } else if (competition) {
    hours = ctx.limits.competitionDay;
    rule = 'competition';
    why = `Competition day: counts ${fmtHours(hours)}`;
  } else if (eve) {
    hours = ctx.limits.practiceRoundEve!;
    rule = 'eve';
    why = `Practice round at the tournament site the day before: counts ${fmtHours(hours)}`;
  } else {
    hours = length(e);
    rule = hours == null ? 'unknown' : 'length';
    why = practiceRound ? 'Practice round: counts what it ran' : 'Counts what it ran';
    if (hours == null && ctx.untimedHours != null && ctx.untimedHours > 0) {
      hours = ctx.untimedHours;
      rule = 'standard';
      why = `No times: counts your ${fmtHours(hours)}-hour standard`;
    } else if (hours == null) {
      why = 'No times on the calendar, so no hours counted';
    }
  }
  const lastCompetitionDay = competition && (!e.span || e.span.to === e.date);
  return {
    line: { ...base, date: e.date, counted: true, hours, rule, why, players: who.length, adjustment: adj },
    item: { ...base, rule, hours, practiceRound },
    who,
    lastCompetitionDay,
  };
}

/**
 * The week, drafted. `events` holds every day entry the calendar loaded around the week (the day after it too, so a
 * practice round the day before a tournament that starts on the week's next day is found); `people` are the rows to
 * draft (every rostered player for a coach, the player alone for themselves).
 */
export function draftHours(input: {
  days: readonly string[];
  events: readonly ChHoursEventIn[];
  people: readonly ChCalPerson[];
  roster?: readonly string[];
  marks?: Record<string, Record<string, ChHoursMark>>;
  adjustments?: Record<string, ChHoursAdjustment>;
  limits: ChHoursLimits;
  /** The team's standard for a practice or meeting saved with no times; null counts none and says so. */
  untimedHours?: number | null;
  /** Who reads it: a coach's changes are "your change" to a coach and "your coach’s change" to a player. */
  viewer?: 'coach' | 'player';
}): ChHoursWeek {
  const { days, limits } = input;
  const roster = input.roster ?? input.people.map((p) => p.id);
  const inWeek = new Set(days);
  const tournamentStarts = new Map<string, ChHoursEventIn[]>();
  for (const e of input.events) {
    if (e.type !== 'tournament' || e.cancelled) continue;
    const first = e.span?.from ?? e.date;
    if (e.date !== first) continue;
    tournamentStarts.set(first, [...(tournamentStarts.get(first) ?? []), e]);
  }
  const ctx = {
    roster,
    marks: input.marks ?? {},
    adjustments: input.adjustments ?? {},
    limits,
    tournamentStarts,
    untimedHours: input.untimedHours ?? null,
    changedBy: input.viewer === 'player' ? 'your coach’s change' : 'your change',
  };
  const drafted = input.events
    .filter((e) => inWeek.has(e.date) && e.type !== 'class' && e.type !== 'busy')
    .slice()
    .sort((a, b) => (a.date === b.date ? (a.start ?? -1) - (b.start ?? -1) : a.date < b.date ? -1 : 1))
    .map((e) => draftEntry(e, ctx));

  const civic = civicDayOf(Number(days[0]!.slice(0, 4)));
  const by = (kind: ChHoursFlagKind) => limits.bylaws[kind] ?? null;

  const rows: ChHoursRow[] = input.people.map((p) => {
    const flags: ChHoursFlag[] = [];
    const dayRows: ChHoursDay[] = days.map((date) => {
      const mine = drafted.filter((d) => d.line.date === date && d.who.includes(p.id));
      const counted = mine.filter((d) => d.line.counted);
      const travel = mine.some((d) => d.line.type === 'travel' && !d.line.counted);
      const comp = counted.find((d) => d.item.rule === 'competition' || (d.line.type === 'tournament' && d.item.rule === 'adjusted'));
      const items: ChHoursItem[] = [];
      let hours = 0;
      let unknown = false;
      if (comp) {
        // A competition day counts its figure once, with everything associated with it in it; activity after the last round
        // of the event is outside it (and not allowed where the association says so), so it adds its own hours.
        hours += comp.item.hours ?? 0;
        items.push({ ...comp.item });
        const compEnd = comp.line.when.allDay ? null : comp.line.when.end;
        for (const d of counted) {
          if (d === comp) continue;
          if (d.line.type === 'tournament') {
            items.push({ ...d.item, hours: 0, rule: 'absorbed' });
            continue;
          }
          const after = compEnd != null && d.line.when.start != null && !d.line.when.allDay && d.line.when.start >= compEnd;
          if (after && comp.lastCompetitionDay) {
            items.push({ ...d.item });
            if (d.item.hours == null) unknown = true;
            else hours += d.item.hours;
            if (limits.noActivityAfterCompetition) {
              flags.push({
                kind: 'afterCompetition',
                date,
                text: `${shortDay(date)}: ${d.line.title} came after the tournament’s last round`,
                bylaw: by('afterCompetition'),
              });
            }
          } else {
            items.push({ ...d.item, hours: 0, rule: 'absorbed' });
            if (compEnd == null && comp.lastCompetitionDay && limits.noActivityAfterCompetition) {
              flags.push({
                kind: 'afterCompetition',
                date,
                text: `${shortDay(date)}: ${d.line.title} is on the tournament’s last day. If it came after the round, it isn’t allowed`,
                bylaw: by('afterCompetition'),
                check: true,
              });
            }
          }
        }
      } else {
        for (const d of counted) {
          items.push({ ...d.item });
          if (d.item.hours == null) unknown = true;
          else hours += d.item.hours;
        }
        if (limits.day != null && counted.length) {
          const round = counted.some((d) => d.item.practiceRound);
          if (round && limits.practiceRoundExempt) {
            const others = counted.some((d) => !d.item.practiceRound);
            if (others && limits.practiceRoundDay != null && hours > limits.practiceRoundDay) {
              flags.push({
                kind: 'roundDay',
                date,
                text: `${shortDay(date)}: ${fmtHours(hours)} hours with a practice round and other activity, over ${fmtHours(limits.practiceRoundDay)}`,
                bylaw: by('roundDay'),
              });
            }
          } else if (hours > limits.day) {
            flags.push({ kind: 'day', date, text: `${shortDay(date)}: ${fmtHours(hours)} hours, over the ${fmtHours(limits.day)}-hour day`, bylaw: by('day') });
          }
        }
      }
      if (limits.civicDay && date === civic && counted.length) {
        flags.push({ kind: 'civic', date, text: `${shortDay(date)}: activity on the civic engagement day, which is a required day off`, bylaw: by('civic') });
      }
      const off = counted.length === 0 && (!travel || limits.travelDayIsOff);
      return { date, hours, unknown, items, competition: !!comp, travel, off };
    });
    const total = dayRows.reduce((s, d) => s + d.hours, 0);
    const off = dayRows.filter((d) => d.off).length;
    if (limits.week != null && total > limits.week) {
      flags.push({ kind: 'week', date: null, text: `${fmtHours(total)} hours this week, over ${fmtHours(limits.week)}`, bylaw: by('week') });
    }
    if (off < limits.daysOff) {
      flags.push({
        kind: 'dayOff',
        date: null,
        text:
          off === 0
            ? limits.daysOff === 1
              ? 'No day off this week'
              : `No day off this week, ${limits.daysOff} needed`
            : `${plural(off, 'day')} off this week, ${limits.daysOff} needed`,
        bylaw: by('dayOff'),
      });
    }
    return { id: p.id, name: p.name, year: p.year, days: dayRows, total, off, flags };
  });

  const lines = drafted.map((d) => d.line);
  return {
    days: [...days],
    limits,
    rows,
    lines,
    noTimes: lines.filter((l) => l.counted && l.rule === 'unknown'),
    flagged: rows.filter((r) => r.flags.length > 0).length,
  };
}

/** The team's week, as the week starting on `weekStartsOn` (0 Sunday to 6 Saturday) that holds `date`. */
export function hoursWeek(date: string, weekStartsOn: number): string[] {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  const back = (dow - weekStartsOn + 7) % 7;
  const first = addDays(date, -back);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** "Nov 9 – 15", "Oct 27 – Nov 2". */
export function weekTitle(days: readonly string[]): string {
  const a = days[0]!;
  const b = days[days.length - 1]!;
  const ma = monthName(a).slice(0, 3);
  const mb = monthName(b).slice(0, 3);
  return ma === mb ? `${ma} ${dayNum(a)} – ${dayNum(b)}` : `${ma} ${dayNum(a)} – ${mb} ${dayNum(b)}`;
}

/** A day's or a week's hours as a cell reads them: "2.5", "—" for none. */
export function hoursCell(h: number, unknown = false): string {
  if (h === 0 && !unknown) return '—';
  return `${fmtHours(h)}${unknown ? '+' : ''}`;
}

/**
 * The compliance export: one row a player a day (the day's hours, what made them, whether it was a day off, and any
 * warning), then the player's week. Numbers are bare so a spreadsheet sums them. A draft, as the page says.
 */
export function hoursCsv(week: ChHoursWeek, teamName: string | null): ChCsvFile {
  const head = ['Week of', 'Player', 'Class', 'Date', 'Day', 'Hours', 'What counted', 'Day off', 'Warnings'];
  const rows: ChCsvValue[][] = [];
  const first = week.days[0]!;
  for (const r of week.rows) {
    for (const d of r.days) {
      const what = d.items
        .filter((i) => i.rule !== 'absorbed' || i.type === 'tournament')
        .map((i) => `${i.title} (${i.rule === 'absorbed' ? 'in the competition day' : i.hours == null ? 'no times' : fmtHours(i.hours)})`)
        .join('; ');
      const warnings = r.flags
        .filter((f) => f.date === d.date)
        .map((f) => f.text)
        .concat(d.unknown ? ['An event that day has no times, so its hours aren’t counted'] : [])
        .join('; ');
      rows.push([first, r.name, r.year, d.date, dowOf(d.date), csvRound(d.hours, 2), what || null, d.off, warnings || null]);
    }
    const weekly = r.flags.filter((f) => f.date == null).map((f) => f.text);
    rows.push([first, r.name, r.year, null, 'Week', csvRound(r.total, 2), null, r.off, weekly.join('; ') || null]);
  }
  return { name: chCsvName(teamName, 'practice-hours', first), head, rows };
}
