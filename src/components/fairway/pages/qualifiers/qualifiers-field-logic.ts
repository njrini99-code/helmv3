/**
 * ============================================================================
 * Qualifiers · pure logic
 * ----------------------------------------------------------------------------
 * Every derivation the qualifiers field sheet needs, with no JSX and no React,
 * so the arithmetic can be tested without a DOM. Nothing here reads a clock:
 * the caller passes `today` as a bare `YYYY-MM-DD` string resolved once, which
 * is what keeps the server render and the client's first paint identical.
 *
 * Every field read below already arrives on `golf_qualifiers.*`, which the
 * loader selects whole. `entry_deadline`, `selection_state`,
 * `selection_slots_total`, `selection_slots_coach_pick` and `num_rounds` have
 * been arriving on every page load and rendering nowhere; this file is where
 * they start counting.
 * ========================================================================== */

import type { GolfQualifier } from '@/lib/types/golf';
import type { VerdictPart } from '@/components/fairway/pages/dashboard/coach-home-logic';

export const RECENT_CONCLUDED_LIMIT = 5;
export const LOCKING_SOON_WINDOW_DAYS = 30;
/** A deadline inside this many days recolors its bar amber on the stage. */
export const URGENT_DEADLINE_DAYS = 7;
export const NEEDS_DECISION_LIMIT = 6;
export const LOCKING_SOON_LIMIT = 5;

export const detailHref = (id: string) => `/golf/dashboard/qualifiers/${id}`;
export const workspaceHref = (id: string) => `/golf/dashboard/coachhelm/qualifying/${id}`;

/** A date-only column as a local-midnight timestamp. Never `new Date(str)`:
 *  that reads a bare date as UTC midnight, so any zone behind UTC renders the
 *  previous calendar day and the server and client disagree (#30/#126). */
export function localMidnight(dateStr: string): number {
  const [y, m, d] = (dateStr.split('T')[0] ?? dateStr).split('-').map(Number);
  if (!y || !m || !d) return Number.NaN;
  return new Date(y, m - 1, d).getTime();
}

const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;
/**
 * How far from today a date may sit and still be plottable.
 *
 * This is not defensive decoration. Production carries qualifier rows whose
 * start_date is "60824-02-02" — load-test junk that a date column happily
 * accepts. Two such rows stretched the axis across fifty-eight thousand years,
 * which collapsed every real bar to a hairline at the left edge and drove the
 * monthly tick loop through roughly seven hundred thousand iterations. One bad
 * row must not be able to destroy the instrument for every good one.
 */
export const DOMAIN_LIMIT_YEARS = 5;

export function isPlottable(dateStr: string | null | undefined, today: string): boolean {
  if (!dateStr) return false;
  const t = localMidnight(dateStr);
  const now = localMidnight(today);
  if (!Number.isFinite(t) || !Number.isFinite(now)) return false;
  return Math.abs(t - now) <= DOMAIN_LIMIT_YEARS * YEAR_MS;
}

/** Whole days from `today` to `dateStr`. Negative is in the past. */
export function daysUntil(dateStr: string, today: string): number {
  const target = localMidnight(dateStr);
  const now = localMidnight(today);
  if (!Number.isFinite(target) || !Number.isFinite(now)) return Number.NaN;
  return Math.round((target - now) / DAY_MS);
}

/** `status` carries no CHECK constraint and is nullable at the schema level,
 *  so every read coalesces the same way the shipped `isActiveStatus` does. */
export function statusOf(q: GolfQualifier): string {
  return q.status ?? 'upcoming';
}

export function isActive(q: GolfQualifier): boolean {
  const s = statusOf(q);
  return s === 'upcoming' || s === 'in_progress';
}

export function isConcluded(q: GolfQualifier): boolean {
  return q.status === 'completed';
}

/** The real QUALIFIER_SELECTION_STATES enum, said in prose. */
export function selectionStateLabel(state: string | null | undefined): string {
  switch (state ?? 'open') {
    case 'scoring':
      return 'scoring';
    case 'closed':
      return 'closed, awaiting picks';
    case 'selected':
      return 'decided';
    case 'open':
    default:
      return 'open';
  }
}

/** The one qualifier the page is about: the live one, else the next to start. */
export function pickHero(qualifiers: readonly GolfQualifier[]): GolfQualifier | null {
  const active = qualifiers.filter(isActive);
  if (active.length === 0) return null;
  const live = active.find((q) => q.status === 'in_progress');
  if (live) return live;
  return active.reduce((soonest, q) =>
    localMidnight(q.start_date) < localMidnight(soonest.start_date) ? q : soonest,
  );
}

const byStartAsc = (a: GolfQualifier, b: GolfQualifier) => {
  const d = localMidnight(a.start_date) - localMidnight(b.start_date);
  return d !== 0 ? d : (a.name ?? '').localeCompare(b.name ?? '');
};
const byStartDesc = (a: GolfQualifier, b: GolfQualifier) => {
  const d = localMidnight(b.start_date) - localMidnight(a.start_date);
  return d !== 0 ? d : (a.name ?? '').localeCompare(b.name ?? '');
};

/** Stage row order: live, then upcoming soonest-first, then recent history.
 *  Only the horizontal axis carries date; row order carries priority. */
export function stageRows(qualifiers: readonly GolfQualifier[], view: 'active' | 'all'): GolfQualifier[] {
  const live = qualifiers.filter((q) => statusOf(q) === 'in_progress').sort(byStartAsc);
  const upcoming = qualifiers.filter((q) => statusOf(q) === 'upcoming').sort(byStartAsc);
  const concluded = qualifiers.filter(isConcluded).sort(byStartDesc);
  // Anything the app has never written falls outside all three buckets. It is a
  // data defect, not a case to design for, but it must still be reachable in
  // the All view rather than vanishing from a page that claims to list every
  // qualifier.
  const other = qualifiers.filter((q) => !isActive(q) && !isConcluded(q)).sort(byStartDesc);
  if (view === 'all') return [...live, ...upcoming, ...concluded, ...other];
  return [...live, ...upcoming, ...concluded.slice(0, RECENT_CONCLUDED_LIMIT)];
}

/** The axis span for whatever rows are on screen. The waiting period before a
 *  qualifier opens is part of its life, so the domain starts at the earliest
 *  deadline, not the earliest start. Today is always inside the span, which is
 *  what lets the interior Today rule mean something. */
export function fieldDomain(rows: readonly GolfQualifier[], today: string): { start: string; end: string } {
  const dayOf = (d: string) => (d.split('T')[0] ?? d);
  let start = today;
  let end = today;
  for (const q of rows) {
    // A row with an unplottable date contributes nothing to the span. It still
    // renders, and says so, rather than dragging the axis with it.
    if (!isPlottable(q.start_date, today)) continue;
    const startDay = dayOf(q.start_date);
    const deadlineDay = isPlottable(q.entry_deadline, today) ? dayOf(q.entry_deadline as string) : startDay;
    const first = localMidnight(deadlineDay) < localMidnight(startDay) ? deadlineDay : startDay;
    const last = isPlottable(q.end_date, today) ? dayOf(q.end_date as string) : startDay;
    if (localMidnight(first) < localMidnight(start)) start = first;
    if (localMidnight(last) > localMidnight(end)) end = last;
  }
  return { start, end };
}

export interface QualifyingBar {
  id: string;
  name: string;
  status: string;
  /** Whole life of the qualifier, waiting period included. */
  trackStart: string;
  trackEnd: string;
  /** The play window inside it. */
  playStart: string;
  playEnd: string;
  /** True when entry_deadline is null, so the track and the play window are
   *  the same span and the bar must not imply a waiting period we never
   *  recorded. */
  deadlineUnknown: boolean;
  /** The row's dates fall outside the plottable window, so it has no bar. */
  offAxis: boolean;
  tone: 'live' | 'urgent' | 'neutral';
  spots: number | null;
  href: string;
}

/**
 * A qualifier whose whole life is one calendar day.
 *
 * It has a position on the axis but no length along it. Drawn as a lozenge it
 * reads as a handle parked on a slider, which is the one shape this field must
 * never produce; drawn as a stroke carrying its own date it reads as the day
 * it actually is.
 */
export function isPointEvent(bar: QualifyingBar): boolean {
  return bar.trackStart === bar.trackEnd;
}

export function toBar(q: GolfQualifier, today: string): QualifyingBar {
  const dayOf = (d: string) => (d.split('T')[0] ?? d);
  const start = dayOf(q.start_date);
  const offAxis = !isPlottable(q.start_date, today);
  const end = isPlottable(q.end_date, today) ? dayOf(q.end_date as string) : start;
  const deadline = isPlottable(q.entry_deadline, today) ? dayOf(q.entry_deadline as string) : null;
  // A deadline recorded after the start date is a data anomaly; clamp it so a
  // bar can never run backwards.
  const trackStart = deadline && localMidnight(deadline) < localMidnight(start) ? deadline : start;
  const s = statusOf(q);
  const urgent =
    s === 'upcoming' &&
    deadline !== null &&
    daysUntil(deadline, today) >= 0 &&
    daysUntil(deadline, today) <= URGENT_DEADLINE_DAYS;
  return {
    id: q.id,
    name: q.name ?? 'Untitled qualifier',
    status: s,
    trackStart,
    trackEnd: end,
    playStart: start,
    playEnd: end,
    deadlineUnknown: deadline === null,
    offAxis,
    tone: s === 'in_progress' ? 'live' : urgent ? 'urgent' : 'neutral',
    spots: q.spots_available ?? null,
    href: detailHref(q.id),
  };
}

export interface QualifiersVerdictInput {
  hero: GolfQualifier | null;
  activeCount: number;
  concludedCount: number;
  today: string;
  formatDate: (d: string) => string;
}

/** The masthead sentence. Every clause is appended only when its own input
 *  exists; an absent field drops its clause rather than guessing a value. */
export function buildQualifiersVerdict(input: QualifiersVerdictInput): VerdictPart[] {
  const { hero, activeCount, concludedCount, today, formatDate } = input;
  const parts: VerdictPart[] = [];

  if (!hero) {
    parts.push({ text: 'No qualifier is active right now.' });
  } else if (statusOf(hero) === 'in_progress') {
    parts.push({ text: hero.name ?? 'This qualifier', href: detailHref(hero.id) });
    parts.push({ text: ' is live.' });
  } else {
    parts.push({ text: hero.name ?? 'The next qualifier', href: detailHref(hero.id) });
    parts.push({ text: ` opens ${formatDate(hero.start_date)}.` });
  }

  // The entry period is definitionally over once play has started, so this
  // clause never appears for a live hero, and it is never invented when the
  // column is null.
  if (hero && statusOf(hero) === 'upcoming' && hero.entry_deadline) {
    const d = daysUntil(hero.entry_deadline, today);
    if (Number.isNaN(d)) {
      // An unparseable date says nothing; better to omit than to print NaN.
    } else if (d > 0) {
      parts.push({ text: ` Entries close ${formatDate(hero.entry_deadline)}, ${d} ${d === 1 ? 'day' : 'days'} away.` });
    } else if (d === 0) {
      parts.push({ text: ' Entries close today.' });
    } else {
      parts.push({ text: ` Entries closed ${formatDate(hero.entry_deadline)}.` });
    }
  }

  if (hero) {
    parts.push({ text: ` The lineup is ${selectionStateLabel(hero.selection_state)}.` });
  }

  parts.push({ text: ` ${activeCount} active, ${concludedCount} concluded.` });
  return parts;
}

/** Ledger A: active qualifiers whose lineup is not decided yet. */
export function needsDecision(qualifiers: readonly GolfQualifier[]): GolfQualifier[] {
  return qualifiers
    .filter((q) => isActive(q) && (q.selection_state ?? 'open') !== 'selected')
    .sort(byStartAsc)
    .slice(0, NEEDS_DECISION_LIMIT);
}

/** Ledger B: upcoming qualifiers whose entry deadline lands inside the window.
 *  The window is wider than the stage's amber threshold on purpose, so a coach
 *  reads a deadline coming before its bar changes colour. */
export function lockingSoon(qualifiers: readonly GolfQualifier[], today: string): Array<{ q: GolfQualifier; days: number }> {
  return qualifiers
    .filter((q) => statusOf(q) === 'upcoming' && q.entry_deadline)
    .map((q) => ({ q, days: daysUntil(q.entry_deadline as string, today) }))
    .filter(({ days }) => Number.isFinite(days) && days >= 0 && days <= LOCKING_SOON_WINDOW_DAYS)
    .sort((a, b) => a.days - b.days || (a.q.name ?? '').localeCompare(b.q.name ?? ''))
    .slice(0, LOCKING_SOON_LIMIT);
}

/** Ledger C: the same slice the stage's Active view shows, not a second one. */
export function recentlyConcluded(qualifiers: readonly GolfQualifier[]): GolfQualifier[] {
  return qualifiers.filter(isConcluded).sort(byStartDesc).slice(0, RECENT_CONCLUDED_LIMIT);
}

/** Open spots across the active pipeline, plus how many rows could not be
 *  counted. A null spot count is not a zero, so the caller says so rather than
 *  publishing a total that quietly understates itself. */
export function openSpots(qualifiers: readonly GolfQualifier[]): { total: number; unknown: number } {
  let total = 0;
  let unknown = 0;
  for (const q of qualifiers.filter(isActive)) {
    if (q.spots_available == null) unknown += 1;
    else total += q.spots_available;
  }
  return { total, unknown };
}
