/**
 * Event Type Color Mappings - Premium Calendar Styling
 * Warm, sophisticated colors with subtle gradients and shadows
 */

import type { EventType, EventTypeConfig } from '@/lib/types/calendar';

const eventTypeConfigs: Record<EventType, EventTypeConfig> = {
  // Game/Tournament - Premium primary green (brand)
  game: {
    label: 'Game',
    color: 'primary',
    bgColor: 'bg-primary-50/60',
    dotColor: 'bg-primary-500',
    dotRingColor: 'ring-primary-500/[0.18]',
    textColor: 'text-primary-800',
    showText: true,
  },
  tournament: {
    label: 'Tournament',
    color: 'primary',
    bgColor: 'bg-primary-50/60',
    dotColor: 'bg-primary-600',
    dotRingColor: 'ring-primary-600/[0.18]',
    textColor: 'text-primary-800',
    showText: true,
  },
  // Qualifier - Premium amber/gold
  qualifier: {
    label: 'Qualifier',
    color: 'amber',
    bgColor: 'bg-amber-50/60',
    dotColor: 'bg-amber-500',
    dotRingColor: 'ring-amber-500/[0.18]',
    textColor: 'text-amber-800',
    showText: true,
  },
  // Practice - Warm stone/neutral
  practice: {
    label: 'Practice',
    color: 'stone',
    bgColor: 'bg-stone-100/60',
    dotColor: 'bg-stone-400',
    dotRingColor: 'ring-stone-400/[0.18]',
    textColor: 'text-stone-700',
    showText: true,
  },
  // Scrimmage - Soft teal
  scrimmage: {
    label: 'Scrimmage',
    color: 'teal',
    bgColor: 'bg-teal-50/60',
    dotColor: 'bg-teal-500',
    dotRingColor: 'ring-teal-500/[0.18]',
    textColor: 'text-teal-800',
    showText: true,
  },
  // Recruiting Visit - Premium violet
  recruiting_visit: {
    label: 'Recruiting Visit',
    color: 'violet',
    bgColor: 'bg-violet-50/60',
    dotColor: 'bg-violet-500',
    dotRingColor: 'ring-violet-500/[0.18]',
    textColor: 'text-violet-800',
    showText: true,
  },
  // Camp - Warm orange
  camp: {
    label: 'Camp',
    color: 'orange',
    bgColor: 'bg-orange-50/60',
    dotColor: 'bg-orange-500',
    dotRingColor: 'ring-orange-500/[0.18]',
    textColor: 'text-orange-800',
    showText: true,
  },
  // Meeting - Soft sky blue
  meeting: {
    label: 'Meeting',
    color: 'sky',
    bgColor: 'bg-sky-50/60',
    dotColor: 'bg-sky-500',
    dotRingColor: 'ring-sky-500/[0.18]',
    textColor: 'text-sky-800',
    showText: true,
  },
  // Workout - Warm rose
  workout: {
    label: 'Workout',
    color: 'rose',
    bgColor: 'bg-rose-50/60',
    dotColor: 'bg-rose-500',
    dotRingColor: 'ring-rose-500/[0.18]',
    textColor: 'text-rose-800',
    showText: true,
  },
  // Class - Subtle stone (low contrast)
  class: {
    label: 'Class',
    color: 'stone',
    bgColor: 'bg-stone-100/50',
    dotColor: 'bg-stone-300',
    dotRingColor: 'ring-stone-300/[0.18]',
    textColor: 'text-stone-500',
    showText: false,
  },
  // Blocked Time - Very subtle
  blocked_time: {
    label: 'Blocked Time',
    color: 'stone',
    bgColor: 'bg-stone-100/40',
    dotColor: 'bg-stone-200',
    dotRingColor: 'ring-stone-200/[0.18]',
    textColor: 'text-stone-400',
    showText: false,
  },
  // Travel - Premium purple
  travel: {
    label: 'Travel',
    color: 'purple',
    bgColor: 'bg-purple-50/60',
    dotColor: 'bg-purple-500',
    dotRingColor: 'ring-purple-500/[0.18]',
    textColor: 'text-purple-800',
    showText: true,
  },
  // Showcase - Baseball recruiting-facing (event-ink 'pursuit', solid) — shares
  // the violet recruiting family with recruiting_visit so pursuit events read
  // as one class across sports.
  showcase: {
    label: 'Showcase',
    color: 'violet',
    bgColor: 'bg-violet-50/60',
    dotColor: 'bg-violet-500',
    dotRingColor: 'ring-violet-500/[0.18]',
    textColor: 'text-violet-800',
    showText: true,
  },
  // Tryout - Baseball recruiting-facing (event-ink 'pursuit', soft)
  tryout: {
    label: 'Tryout',
    color: 'violet',
    bgColor: 'bg-violet-50/50',
    dotColor: 'bg-violet-400',
    dotRingColor: 'ring-violet-400/[0.18]',
    textColor: 'text-violet-700',
    showText: true,
  },
  // Other - Neutral stone
  other: {
    label: 'Other',
    color: 'stone',
    bgColor: 'bg-stone-100/60',
    dotColor: 'bg-stone-400',
    dotRingColor: 'ring-stone-400/[0.18]',
    textColor: 'text-stone-600',
    showText: true,
  },
};

/**
 * Get configuration for a specific event type
 */
export function getEventTypeConfig(type: EventType): EventTypeConfig {
  // Own-key guard: callers pass raw DB strings (cast to EventType), and a
  // plain index would resolve inherited keys like '__proto__' to a truthy
  // prototype object with no styling fields instead of the 'other' fallback.
  return Object.prototype.hasOwnProperty.call(eventTypeConfigs, type)
    ? eventTypeConfigs[type]
    : eventTypeConfigs.other;
}

/**
 * Format time for display (e.g., "9:00 AM")
 */
/**
 * Delegates to the calendar's other formatTime rather than keeping a second
 * copy. The two agreed on every well-formed value and diverged only on input
 * neither could read — where this one INVENTED an answer:
 *
 *   formatTime('abc')  ->  '12:00 AM'     (`parts[1] ?? 0`; `??` does not
 *                                          catch NaN, so garbage became midnight)
 *   formatTime('')     ->  'Invalid Date' (empty skipped the time-only branch
 *                                          and reached `new Date('')`)
 *
 * Both were rendered straight to a coach on EventCard and MobileEventCard. A
 * fabricated 12:00 AM is the worse of the two, because it is a time a real
 * event can legitimately have — it does not read as an error. The surviving
 * implementation hands the raw string back instead, per this repo's standing
 * rule against fabricated values.
 *
 * Kept as a named re-export so both call sites and their imports are unchanged.
 * Pinned by src/lib/calendar/__tests__/format-time-agreement.test.ts.
 */
export { formatTime } from '@/lib/calendar/premium-utils';

/**
 * Format date range for display (e.g., "Dec 31, 9:00 AM - 10:30 AM")
 */
export function formatEventTime(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const dateStr = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  const startTime = startDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const endTime = endDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `${dateStr}, ${startTime} - ${endTime}`;
}

/**
 * Is `dateString` the viewer's current LOCAL calendar day?
 *
 * Two input shapes, because two things get called a date here and they do not
 * mean the same thing:
 *
 *   - A bare `"2026-08-18"` is a CALENDAR DAY. JS parses that at UTC midnight,
 *     so reading local fields back off it lands on the previous day everywhere
 *     west of Greenwich — `new Date('2026-08-18').getDate()` is 17 in Eastern.
 *     The literal Y/M/D is the only honest reading, the same doctrine
 *     `eventCalendarDay` applies to all-day events in ./timezone.ts.
 *   - Anything else is an INSTANT (all three live callers pass
 *     `someDate.toISOString()`), and the local day of that instant is exactly
 *     what "is this today" should mean for a timed event.
 *
 * A full UTC-midnight timestamp — `2026-08-18T00:00:00+00:00`, how an all-day
 * event's `start_time` is stored — deliberately takes the instant path. Only
 * the `allDay` flag can distinguish that from a real midnight event, this
 * function never receives one, and guessing is how the iCal writer managed to
 * be wrong in both directions at once. Callers holding an all-day event should
 * pass its date prefix, or use `eventCalendarDay`.
 */
export function isToday(dateString: string): boolean {
  const today = new Date();

  const calendarDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateString);
  if (calendarDay) {
    return (
      Number(calendarDay[1]) === today.getFullYear() &&
      Number(calendarDay[2]) === today.getMonth() + 1 &&
      Number(calendarDay[3]) === today.getDate()
    );
  }

  const date = new Date(dateString);
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Calculate event card height based on duration (for week/day views)
 * Each hour = 64px
 */
export function calculateEventHeight(start: string, end: string | null): number {
  // Handle time-only strings (HH:MM:SS or HH:MM)
  if (start && !start.includes('T') && !start.includes(' ')) {
    const startParts = start.split(':').map(Number);
    const startH = startParts[0] ?? 0;
    const startM = startParts[1] ?? 0;
    const endTime = end || '00:00:00';
    const endParts = endTime.split(':').map(Number);
    const endH = endParts[0] ?? 0;
    const endM = endParts[1] ?? 0;

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const durationMinutes = endMinutes > startMinutes ? endMinutes - startMinutes : 60; // Default to 1 hour if invalid
    const durationHours = durationMinutes / 60;

    return Math.max(durationHours * 64, 48); // Minimum 48px
  }

  // Handle full datetime strings
  const startDate = new Date(start);
  const endDate = end ? new Date(end) : new Date(startDate.getTime() + 60 * 60 * 1000); // Default to 1 hour if no end
  const durationMs = endDate.getTime() - startDate.getTime();
  const durationHours = durationMs / (1000 * 60 * 60);
  return Math.max(durationHours * 64, 48); // Minimum 48px
}

/**
 * Calculate top offset for event positioning (for week/day views)
 * Based on start time relative to calendar start hour (6 AM)
 */
export function calculateEventTop(timeString: string, startHour: number = 6): number {
  if (!timeString) return 0;

  let hour: number;
  let minutes: number;

  // Handle time-only strings (HH:MM:SS or HH:MM)
  if (timeString && !timeString.includes('T') && !timeString.includes(' ')) {
    // Check if it's a date-only string (YYYY-MM-DD) — treat as midnight / return 0
    if (/^\d{4}-\d{2}-\d{2}$/.test(timeString)) return 0;
    const parts = timeString.split(':').map(Number);
    hour = parts[0] ?? 0;
    minutes = parts[1] ?? 0;
  } else {
    // Handle full datetime strings
    const date = new Date(timeString);
    if (isNaN(date.getTime())) return 0;
    hour = date.getHours();
    minutes = date.getMinutes();
  }

  const hoursFromStart = hour - startHour;
  const minuteOffset = (minutes / 60) * 64;
  return Math.max(0, hoursFromStart * 64 + minuteOffset);
}
