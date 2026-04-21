/**
 * Time-of-day helpers shared by the welcome page and any future greeting
 * surface (dashboard home, CoachHelm daily briefing, etc.). Keep the
 * boundaries in ONE place so UX stays consistent.
 */
export type TimeOfDay = 'morning' | 'afternoon' | 'evening';

export function getTimeOfDay(now: Date = new Date()): TimeOfDay {
  const h = now.getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

export function getGreeting(t: TimeOfDay): string {
  return t === 'morning' ? 'Good morning' : t === 'afternoon' ? 'Good afternoon' : 'Good evening';
}
