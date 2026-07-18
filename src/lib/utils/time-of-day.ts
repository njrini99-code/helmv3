/**
 * Time-of-day helpers shared by the welcome page and any future greeting
 * surface (dashboard home, CoachHelm daily briefing, etc.). Keep the
 * boundaries in ONE place so UX stays consistent.
 *
 * Four buckets (#950 — the old 3-bucket scheme, `< 12` morning / `< 17`
 * afternoon / else evening, called 1am "Good morning"): 5-11 morning,
 * 11-17 afternoon, 17-22 evening, 22-5 late night. Late night gets a
 * time-neutral "Welcome back" rather than an invented "Good ___ night" —
 * it reads naturally at 1am, 3am, or 4:59am alike.
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'lateNight';

/** Bucket a plain (possibly decimal, e.g. from a timezone-aware hour helper
 *  like `getCurrentDecimalHourInTz`) hour-of-day into a `TimeOfDay`. */
export function timeOfDayForHour(h: number): TimeOfDay {
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'lateNight';
}

export function getTimeOfDay(now: Date = new Date()): TimeOfDay {
  return timeOfDayForHour(now.getHours());
}

export function getGreeting(t: TimeOfDay): string {
  switch (t) {
    case 'morning': return 'Good morning';
    case 'afternoon': return 'Good afternoon';
    case 'evening': return 'Good evening';
    case 'lateNight': return 'Welcome back';
  }
}
