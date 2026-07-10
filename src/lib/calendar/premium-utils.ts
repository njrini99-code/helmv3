/**
 * Premium Calendar Utilities
 *
 * Helper functions for premium calendar UI features
 */

// ============================================================================
// EVENT STYLING
// ============================================================================

/**
 * Get event type styling
 */
function getEventTypeClass(eventType: string): string {
  const typeMap: Record<string, string> = {
    practice: 'event-type-practice',
    match: 'event-type-match',
    tournament: 'event-type-tournament',
    qualifier: 'event-type-qualifier',
    meeting: 'event-type-meeting',
    travel: 'event-type-travel',
    social: 'event-type-social',
    // Baseball event types — give games/scrimmages/camps/tryouts a distinct
    // colored ribbon instead of falling back to the neutral "other" grey.
    game: 'event-type-game',
    scrimmage: 'event-type-scrimmage',
    camp: 'event-type-camp',
    tryout: 'event-type-tryout',
  };
  return typeMap[eventType] || 'event-type-other';
}

/**
 * Get event status styling
 */
function getEventStatusClass(status: string): string {
  const statusMap: Record<string, string> = {
    draft: 'status-draft',
    confirmed: 'status-confirmed',
    cancelled: 'status-cancelled',
    completed: 'status-completed',
  };
  return statusMap[status] || '';
}

/**
 * Combined event classes
 */
export function getEventClasses(event: {
  event_type: string;
  status: string;
}): string {
  return [
    'event-block',
    getEventTypeClass(event.event_type),
    getEventStatusClass(event.status),
  ].filter(Boolean).join(' ');
}

/**
 * CSS custom property for the event type's accent hue (see
 * src/styles/calendar-tokens.css `--event-*`). Used for the small category
 * dot next to the title — replaces the former left-border stripe.
 */
export function getEventDotColorVar(eventType: string): string {
  const known = new Set([
    'practice', 'tournament', 'qualifier', 'meeting', 'travel', 'other',
    'game', 'scrimmage', 'camp', 'tryout',
  ]);
  const key = known.has(eventType) ? eventType : 'other';
  return `var(--event-${key})`;
}

// ============================================================================
// TIME UTILITIES
// ============================================================================

/**
 * Format time for display
 */
export function formatTime(time: string | null): string {
  if (!time) return '';

  // Full datetime strings (ISO with 'T' or Supabase timestamptz with space)
  if (time.includes('T') || time.includes(' ')) {
    const date = new Date(time);
    if (!isNaN(date.getTime())) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    }
  }

  // Time-only strings (HH:MM or HH:MM:SS)
  const [hours, minutes] = time.split(':').map(Number);
  if (hours === undefined || minutes === undefined || isNaN(hours)) return time;
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/**
 * Get time position percentage for current time indicator
 */
export function getCurrentTimePosition(
  startHour: number = 0,
  endHour: number = 24
): number {
  const now = new Date();
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const totalHours = endHour - startHour;
  const position = ((currentHour - startHour) / totalHours) * 100;
  return Math.max(0, Math.min(100, position));
}
