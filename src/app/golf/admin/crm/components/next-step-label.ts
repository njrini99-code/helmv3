// ============================================================================
// Next-step label — pure derivation for the CoachTable "Next step" column.
// ============================================================================
// Given a coach's next_follow_up_at (ISO timestamp or null/undefined), derives
// the short display text + a semantic tone the caller maps to Tailwind classes
// (CoachTable.tsx owns the actual color mapping so this module stays UI-free).
//
// Comparisons are CALENDAR-DAY granular, not raw-millisecond: a follow-up at
// 11pm tonight and "now" at 6am today are both "today" even though they're
// ~17h apart, and a follow-up at 1am tomorrow is "in 1d" even though it's only
// a couple of hours away. We truncate both sides to local midnight before
// diffing so the label matches what a human would say looking at a calendar.
// ============================================================================

export type NextStepTone = 'none' | 'future' | 'today' | 'overdue';

export interface NextStepLabel {
  text: string;
  tone: NextStepTone;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Truncates to local midnight so the diff below is calendar-day granular.
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * nextStepLabel('2026-07-19T08:00:00Z') -> { text: 'in 3d', tone: 'future' }  (when now = 2026-07-16)
 * nextStepLabel(null)                    -> { text: '—', tone: 'none' }
 *
 * `now` is injectable for deterministic tests; defaults to the real clock.
 */
export function nextStepLabel(iso: string | null | undefined, now: Date = new Date()): NextStepLabel {
  if (!iso) return { text: '—', tone: 'none' };

  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return { text: '—', tone: 'none' };

  const dayDiff = Math.round((startOfDay(target).getTime() - startOfDay(now).getTime()) / MS_PER_DAY);

  if (dayDiff === 0) return { text: 'today', tone: 'today' };
  if (dayDiff > 0) return { text: `in ${dayDiff}d`, tone: 'future' };
  return { text: `${Math.abs(dayDiff)}d overdue`, tone: 'overdue' };
}
