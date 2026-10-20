import type { ParsedClass } from '@/lib/utils/schedule-parser';
import { termOn, toChClasses, weekDates, type ChClassesPage, type ChClassRow, type ChTeamEvent, type ChWeek } from '../data/classes-shape';

/**
 * Classes sample data: design/handoff/classes.jsx (Jonah Okafor, Fall 2026). The
 * board's today is Tuesday 14 October; in 2026 the 14th is a Wednesday, so this
 * week runs Monday 12 to Sunday 18 October and the trip is on Thursday the 15th.
 */

export const PREVIEW_CLASSES_TODAY = '2026-10-14';

const row = (
  n: number,
  class_name: string,
  days: string[],
  start: string,
  end: string,
  instructor: string,
  building: string | null,
  room: string | null,
  credits: number | null,
  over: Partial<ChClassRow> = {},
): ChClassRow => ({
  id: `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  class_name,
  instructor,
  days,
  start_time: start,
  end_time: end,
  building,
  room,
  credits,
  color: '#3B82F6',
  notes: null,
  semester: 'Fall 2026',
  created_at: `2026-08-2${n}T14:00:00Z`,
  ...over,
});

export const PREVIEW_CLASS_ROWS: ChClassRow[] = [
  row(1, 'STAT 201 - Probability and Statistics', ['T', 'Th'], '09:00:00', '10:15:00', 'Dr. L. Osei', 'Hanes Hall', '120', 3),
  row(2, 'ECON 310 - Intermediate Macroeconomics', ['M', 'W'], '10:10:00', '11:25:00', 'Prof. M. Hart', 'Gardner Hall', '008', 3),
  row(3, 'BUSI 401 - Corporate Finance', ['T', 'Th'], '12:30:00', '13:45:00', 'Prof. A. Chen', 'McColl', '2150', 3),
  row(4, 'ENGL 105 - Writing in the Disciplines', ['M', 'W', 'F'], '13:25:00', '14:15:00', 'Dr. R. Pike', 'Greenlaw', '222', 3),
  row(5, 'EXSS 188 - Golf Performance Lab', ['F'], '08:00:00', '09:15:00', 'Coach Reyes', null, 'Finley GC', 1),
];

const at = (id: string, title: string, type: string, date: string, s: number, e: number, where: string | null): ChTeamEvent => ({
  id,
  title,
  type,
  startDate: date,
  startMin: s,
  endDate: date,
  endMin: e,
  allDay: false,
  where,
});

const PRACTICE = [
  at('e1', 'Practice', 'practice', '2026-10-12', 15 * 60 + 30, 17 * 60 + 30, 'Finley GC'),
  at('e2', 'Practice', 'practice', '2026-10-13', 15 * 60 + 30, 17 * 60 + 30, 'Finley GC'),
  at('e3', 'Practice', 'practice', '2026-10-14', 15 * 60 + 30, 17 * 60 + 30, 'Finley GC'),
  at('e5', 'Recovery nine', 'practice', '2026-10-16', 15 * 60 + 30, 17 * 60, 'Finley GC'),
];
/** The Pinehurst qualifier: the bus at 6:15 AM, back about 8 PM, so it meets the two Thursday classes. */
const TRIP = at('e4', 'Pinehurst qualifier', 'travel', '2026-10-15', 6 * 60 + 15, 20 * 60, 'Pinehurst No. 2');

const week = (events: ChTeamEvent[], error = false): ChWeek => ({ dates: weekDates(PREVIEW_CLASSES_TODAY), events, error });
const TERM = termOn(PREVIEW_CLASSES_TODAY)!;

const page = (rows: ChClassRow[], events: ChTeamEvent[], over: Partial<ChClassesPage> = {}): ChClassesPage => ({
  todayIso: PREVIEW_CLASSES_TODAY,
  term: TERM,
  classes: { list: toChClasses(rows), error: false },
  week: week(events),
  ...over,
});

export const PREVIEW_CLASSES = page(PREVIEW_CLASS_ROWS, [...PRACTICE, TRIP]);
/** Nothing overlaps: the side card's calm state and a zero on the term bar. */
export const PREVIEW_CLASSES_CLEAR = page(PREVIEW_CLASS_ROWS, PRACTICE);
export const PREVIEW_CLASSES_EMPTY = page([], [...PRACTICE, TRIP]);
export const PREVIEW_CLASSES_FAILED = page([], [], { classes: { list: [], error: true } });
/** The team's events didn't load: classes show, and every overlap part says it can't tell. */
export const PREVIEW_CLASSES_PARTIAL = page(PREVIEW_CLASS_ROWS, [], { week: week([], true) });
/** The odd ones: an online class, times with no days, a class from an earlier term, and one that meets on a Saturday. */
export const PREVIEW_CLASSES_MIXED = page(
  [
    ...PREVIEW_CLASS_ROWS.slice(0, 3),
    row(6, 'CSCI 110 - Intro to Programming', [], '', '', 'Dr. K. Rao', null, null, 3, { start_time: null, end_time: null }),
    row(7, 'ART 101 - Drawing', [], '14:00:00', '16:30:00', '', null, null, 2),
    row(8, 'GEOG 110 - Global Environmental Change', ['M', 'W'], '09:30:00', '10:45:00', 'Dr. J. Alvarez', 'Carroll Hall', '111', 3, { semester: 'Spring 2026' }),
    row(9, 'MUSC 140 - Ensemble', ['Sa'], '10:00:00', '12:00:00', 'Prof. D. Lin', 'Hill Hall', null, 1, { semester: null }),
  ],
  [...PRACTICE, TRIP],
);

const parsed = (
  n: number,
  course_code: string,
  course_name: string,
  days: string[],
  start_time: string,
  end_time: string,
  building: string,
  room: string,
  instructor: string,
  credits: number,
): ParsedClass => ({
  id: `p${n}`,
  course_code,
  course_name,
  instructor,
  days,
  start_time,
  end_time,
  location: [building, room].filter(Boolean).join(' '),
  building,
  room,
  credits,
  semester: 'Fall 2026',
});

/**
 * What the preview's reader finds in a screenshot (the board's `PARSED`, with other classes so an import adds something): three classes
 * that read cleanly, one with no room, one with no days or time (online), and STAT 201, which is already on the schedule.
 */
export const PREVIEW_PARSED: ParsedClass[] = [
  parsed(1, 'GEOG 110', 'Global Environmental Change', ['M', 'W'], '15:30', '16:45', 'Carroll Hall', '111', 'Dr. J. Alvarez', 3),
  parsed(2, 'MATH 232', 'Linear Algebra', ['T', 'Th'], '14:00', '15:15', 'Phillips Hall', '332', 'Prof. S. Nakamura', 4),
  parsed(3, 'ART 101', 'Drawing', ['F'], '10:00', '12:30', '', '', 'Prof. E. Ruiz', 2),
  parsed(4, 'PHIL 150', 'Ethics', [], '', '', '', '', 'Dr. B. Okoye', 3),
  parsed(5, 'STAT 201', 'Probability and Statistics', ['T', 'Th'], '09:00', '10:15', 'Hanes Hall', '120', 'Dr. L. Osei', 3),
];

/** A schedule as a portal's table copies: paste it into the preview's Paste text to read it with the real parser. */
export const PREVIEW_SCHEDULE_TEXT = [
  'Course\tTitle\tDays\tTime\tLocation\tInstructor\tCredits',
  'STAT 201\tProbability and Statistics\tTTh\t9:00AM - 10:15AM\tHanes Hall 120\tDr. L. Osei\t3',
  'ECON 310\tIntermediate Macroeconomics\tMW\t10:10AM - 11:25AM\tGardner Hall 008\tProf. M. Hart\t3',
].join('\n');
