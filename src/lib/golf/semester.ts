/**
 * Academic-term date maths, shared by everything that has to answer "when does
 * this class actually meet?".
 *
 * Extracted from calendar-sync.ts so the availability layer can reuse it: that
 * file is a `'use server'` module, and exporting a non-async helper from one
 * registers it as a server action (the class of bug that killed golf messaging).
 * Term parsing is pure, so it belongs here.
 */

export interface SemesterWindow {
  /** Inclusive first day, YYYY-MM-DD. */
  start: string;
  /** Inclusive last day, YYYY-MM-DD. */
  end: string;
}

/**
 * A caller-supplied semester start must be a real calendar date inside the
 * term's own window — on or after 1 January of the term year, and on or before
 * the term end. DS-B4: it was previously used verbatim, so a year-0001 start on
 * a "Fall 9999" term produced a five-century occurrence walk.
 */
function isValidCustomStart(customStartDate: string, termYear: number, endDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(customStartDate)) return false;
  const start = new Date(customStartDate + 'T00:00:00Z').getTime();
  const lowerBound = new Date(`${termYear}-01-01T00:00:00Z`).getTime();
  const upperBound = new Date(endDate + 'T00:00:00Z').getTime();
  if (!Number.isFinite(start)) return false;
  return start >= lowerBound && start <= upperBound;
}

/** Inclusive term windows, keyed by term. Sole definition — the switch below
 *  and the contradiction check both read from here so they cannot drift. */
const TERM_WINDOWS = {
  spring: { start: (y: number) => `${y}-01-15`, end: (y: number) => `${y}-05-15` },
  summer: { start: (y: number) => `${y}-06-01`, end: (y: number) => `${y}-08-15` },
  fall:   { start: (y: number) => `${y}-08-20`, end: (y: number) => `${y}-12-15` },
  winter: { start: (y: number) => `${y}-12-15`, end: (y: number) => `${y + 1}-01-15` },
} as const;

/**
 * Shortest window a term is allowed to produce, in days.
 *
 * A real academic term is months long. Anything shorter means the term LABEL
 * and the supplied start date disagree, and the label is the weaker evidence:
 * it comes from `detectSemester('')`, a pure function of whatever day the
 * import happened to run, while the start date was read off the player's actual
 * schedule.
 *
 * Measured in production 2026-08-13: four class series held between one and two
 * meetings each. A schedule imported on 6 August carried a start date of
 * 12 August — a Fall class — but `detectSemester('')` returned "Summer 2026"
 * because 6 August still falls inside the summer window. Summer ends 15 August,
 * so `{ start: 2026-08-12, end: 2026-08-15 }` generated a three-day class and
 * the player's real semester never appeared on their calendar at all.
 */
const MIN_PLAUSIBLE_TERM_DAYS = 21;

const DAY_MS = 86_400_000;

function utcDay(date: string): number {
  return new Date(`${date}T00:00:00Z`).getTime();
}

/**
 * The academic term to use for a schedule imported on `todayIso` that does not
 * state its own term.
 *
 * Callers must NOT infer this from the calendar month. The term CONTAINING a
 * date is the wrong answer at both ends of a window: on 15 August the summer
 * window ends that very day, so "Summer" yields `{06-01 … 08-15}` — a term with
 * zero days left — and every generated meeting lands in the past. The player
 * imports their schedule, sees "Synced to your calendar", and the calendar is
 * empty. Same on 15 May, the last day of spring. Both dates fall in an
 * enrolment rush, which is exactly when the feature gets used.
 *
 * So: the soonest term that still has at least MIN_PLAUSIBLE_TERM_DAYS to run.
 * This is the same rule `termForDate` applies when a start date contradicts a
 * stated label — one definition, so the inferred term and the overrule cannot
 * disagree.
 */
export function inferTermForImport(todayIso: string): string | null {
  const t = utcDay(todayIso);
  if (!Number.isFinite(t)) return null;
  const year = Number(todayIso.slice(0, 4));
  if (!Number.isFinite(year)) return null;

  // Neighbouring years matter: winter runs 15 Dec → 15 Jan, so early January
  // has to be able to see the PRIOR year's winter.
  const usable: Array<{ term: keyof typeof TERM_WINDOWS; year: number; start: number; end: number }> = [];
  for (const y of [year - 1, year, year + 1]) {
    for (const term of ['spring', 'summer', 'fall', 'winter'] as const) {
      const start = utcDay(TERM_WINDOWS[term].start(y));
      const end = utcDay(TERM_WINDOWS[term].end(y));
      // STRICTLY after today: a term whose last day is today has no future date
      // left to put a meeting on. That single `>` is the whole fix — the term
      // containing 15 August is Summer, whose window ENDS 15 August.
      if (end > t) usable.push({ term, year: y, start, end });
    }
  }
  if (usable.length === 0) return null;

  // Prefer the term actually in progress; otherwise the next one to begin,
  // which covers the gaps between windows (16–19 August, say).
  const inProgress = usable.filter((c) => c.start <= t).sort((a, b) => b.start - a.start)[0];
  const chosen = inProgress ?? usable.sort((a, b) => a.start - b.start)[0];
  if (!chosen) return null;

  const label = chosen.term.charAt(0).toUpperCase() + chosen.term.slice(1);
  return `${label} ${chosen.year}`;
}

/**
 * The soonest term that still has real time left on it as of `date`.
 *
 * Deliberately NOT "the term containing this date". The containing term is
 * exactly the one being overruled: a 12 August start sits inside Summer, and
 * Summer is the answer that produced a three-day semester. A term is only a
 * candidate if it ends at least MIN_PLAUSIBLE_TERM_DAYS after the start date;
 * among those, the earliest-starting one wins, which is the term a student
 * enrolling on that date is actually enrolling in.
 *
 * Used only to overrule a label a start date contradicts — see
 * MIN_PLAUSIBLE_TERM_DAYS.
 */
function termForDate(date: string): { term: keyof typeof TERM_WINDOWS; year: number } | null {
  const t = utcDay(date);
  if (!Number.isFinite(t)) return null;
  const year = Number(date.slice(0, 4));
  if (!Number.isFinite(year)) return null;

  // Neighbouring years matter: winter starts 15 Dec and runs into January, so a
  // 5 January date has to be able to see both the prior year's winter and this
  // year's spring.
  const candidates: Array<{ term: keyof typeof TERM_WINDOWS; year: number }> = [];
  for (const y of [year - 1, year, year + 1]) {
    for (const term of ['spring', 'summer', 'fall', 'winter'] as const) {
      candidates.push({ term, year: y });
    }
  }

  return (
    candidates
      .filter((c) => (utcDay(TERM_WINDOWS[c.term].end(c.year)) - t) / DAY_MS >= MIN_PLAUSIBLE_TERM_DAYS)
      .sort(
        (a, b) =>
          utcDay(TERM_WINDOWS[a.term].start(a.year)) - utcDay(TERM_WINDOWS[b.term].start(b.year)),
      )[0] ?? null
  );
}

/**
 * Parse semester string to get start and end dates
 * Format: "Fall 2025", "Spring 2026", etc.
 * If customStartDate is provided, use it instead of the default start date
 *
 * DS-B4: both inputs are caller-controlled, so the term year is bounded to a
 * plausible range and a custom start is range-checked against the term. An
 * unusable value returns null, which callers surface as the existing
 * "Could not determine semester dates" error.
 *
 * When a supplied `customStartDate` leaves the labelled term with less than
 * MIN_PLAUSIBLE_TERM_DAYS to run, the label is overruled and the term is
 * re-derived from the start date instead. See that constant for the production
 * failure this exists to stop.
 */
export function parseSemesterDates(
  semester: string | null | undefined,
  customStartDate?: string,
): SemesterWindow | null {
  if (typeof semester !== 'string') return null;

  const match = semester.match(/(Fall|Spring|Summer|Winter)\s+(\d{4})/i);
  if (!match || !match[1] || !match[2]) return null;

  const term = match[1];
  const year = match[2];
  const yearNum = parseInt(year, 10);
  // Anything outside this window is not a real academic term, and it is what
  // made the generated range unbounded ("Fall 9999").
  if (!Number.isFinite(yearNum) || yearNum < 2000 || yearNum > 2100) return null;

  const key = term.toLowerCase() as keyof typeof TERM_WINDOWS;
  const window = TERM_WINDOWS[key];
  if (!window) return null;

  const defaultStartDate = window.start(yearNum);
  const endDate = window.end(yearNum);

  if (customStartDate) {
    if (!isValidCustomStart(customStartDate, yearNum, endDate)) return null;

    // A start date far BEFORE the labelled term begins contradicts the label
    // just as surely as one that leaves no runway, and it was not checked:
    // isValidCustomStart only bounded the start at 1 January of the term year,
    // so `('Fall 2026', '2026-01-20')` was accepted verbatim and produced
    // `{2026-01-20 … 2026-12-15}` — a 329-day "Fall" term generating ~140
    // meetings for a class that has ~50. Worth avoiding on volume alone:
    // golf_events is in the realtime publication, so each row is a message to
    // every open calendar.
    //
    // The grace window keeps a legitimately-early start (orientation week, a
    // syllabus listing the Friday before) from being treated as a contradiction.
    const earlyByDays = (utcDay(defaultStartDate) - utcDay(customStartDate)) / DAY_MS;
    if (earlyByDays > MIN_PLAUSIBLE_TERM_DAYS) {
      const better = termForDate(customStartDate);
      if (better) {
        return {
          start: customStartDate,
          end: TERM_WINDOWS[better.term].end(better.year),
        };
      }
      // No better term — trust the LABEL's window rather than a start date it
      // disagrees with, since the label is the only other evidence we have.
      return { start: defaultStartDate, end: endDate };
    }

    // Does the label survive contact with the start date? A term with only days
    // left is not the term this class belongs to — the player imported their
    // NEXT semester while the current one was still running out.
    const remainingDays = (utcDay(endDate) - utcDay(customStartDate)) / DAY_MS;
    if (remainingDays < MIN_PLAUSIBLE_TERM_DAYS) {
      const better = termForDate(customStartDate);
      if (better) {
        const betterEnd = TERM_WINDOWS[better.term].end(better.year);
        // Only overrule if it actually buys a plausible term; otherwise leave
        // the original answer rather than trading one bad window for another.
        if ((utcDay(betterEnd) - utcDay(customStartDate)) / DAY_MS >= MIN_PLAUSIBLE_TERM_DAYS) {
          return { start: customStartDate, end: betterEnd };
        }
      }
    }

    return { start: customStartDate, end: endDate };
  }

  return { start: defaultStartDate, end: endDate };
}
