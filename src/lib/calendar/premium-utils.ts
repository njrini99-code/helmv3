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
    meeting: 'event-type-meeting',
    social: 'event-type-social',
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
