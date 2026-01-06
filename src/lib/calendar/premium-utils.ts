/**
 * Premium Calendar Utilities
 *
 * Helper functions for premium calendar UI features
 */

import { isSameDay, isToday, isTomorrow } from 'date-fns';

// ============================================================================
// TEMPORAL DENSITY
// ============================================================================

/**
 * Get cell intensity class based on event count
 * Creates visual rhythm showing busy vs free days
 */
export function getCellDensityClass(eventCount: number): string {
  if (eventCount === 0) return 'density-0';
  if (eventCount === 1) return 'density-1';
  if (eventCount === 2) return 'density-2';
  if (eventCount === 3) return 'density-3';
  return 'density-4'; // 4+
}

/**
 * Calculate event density for a date
 */
export function getEventDensity(date: Date, events: any[]): number {
  return events.filter(event =>
    isSameDay(new Date(event.start_date), date)
  ).length;
}

// ============================================================================
// EVENT STYLING
// ============================================================================

export interface EventStyleConfig {
  container: string;
  badge: string;
  icon: any;
  textStyle?: string;
}

/**
 * Get event type styling
 */
export function getEventTypeClass(eventType: string): string {
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
export function getEventStatusClass(status: string): string {
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
// RSVP VISUALIZATION
// ============================================================================

export interface RSVPStats {
  confirmed: number;
  maybe: number;
  declined: number;
  pending: number;
  total: number;
  percentage: number;
}

/**
 * Calculate RSVP statistics for visualization
 */
export function calculateRSVPStats(
  responses: Array<{ status: string }>,
  totalInvited: number
): RSVPStats {
  const confirmed = responses.filter(r => r.status === 'confirmed').length;
  const maybe = responses.filter(r => r.status === 'maybe').length;
  const declined = responses.filter(r => r.status === 'declined').length;
  const pending = totalInvited - responses.length;

  return {
    confirmed,
    maybe,
    declined,
    pending,
    total: totalInvited,
    percentage: totalInvited > 0 ? (confirmed / totalInvited) * 100 : 0,
  };
}

/**
 * Get RSVP status color
 */
export function getRSVPColor(status: string): string {
  const colorMap: Record<string, string> = {
    confirmed: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    maybe: 'text-amber-600 bg-amber-50 border-amber-200',
    declined: 'text-rose-600 bg-rose-50 border-rose-200',
    pending: 'text-slate-600 bg-slate-50 border-slate-200',
  };
  return colorMap[status] || colorMap['pending'] || 'text-slate-600 bg-slate-50 border-slate-200';
}

// ============================================================================
// AVAILABILITY HEAT MAP
// ============================================================================

export interface HeatLevel {
  level: 0 | 1 | 2 | 3 | 4 | 5;
  className: string;
  percentage: number;
}

/**
 * Calculate heat level for availability grid cell
 */
export function getHeatLevel(
  availableCount: number,
  maybeCount: number,
  totalResponses: number
): HeatLevel {
  if (totalResponses === 0) {
    return { level: 0, className: 'heat-none', percentage: 0 };
  }

  const percentage = (availableCount + maybeCount * 0.5) / totalResponses;

  if (percentage >= 0.9) return { level: 5, className: 'heat-high', percentage };
  if (percentage >= 0.7) return { level: 4, className: 'heat-medium-high', percentage };
  if (percentage >= 0.5) return { level: 3, className: 'heat-medium', percentage };
  if (percentage >= 0.3) return { level: 2, className: 'heat-medium-low', percentage };
  if (percentage > 0) return { level: 1, className: 'heat-low', percentage };
  return { level: 0, className: 'heat-none', percentage: 0 };
}

// ============================================================================
// TIME UTILITIES
// ============================================================================

/**
 * Check if time is before sunrise (pre-dawn tee times)
 */
export function isPreDawn(time: string, sunriseTime: string = '06:00'): boolean {
  const [hour] = time.split(':').map(Number);
  const [sunriseHour] = sunriseTime.split(':').map(Number);
  if (hour === undefined || sunriseHour === undefined) return false;
  return hour < sunriseHour;
}

/**
 * Format time for display
 */
export function formatTime(time: string | null): string {
  if (!time) return '';
  const [hours, minutes] = time.split(':').map(Number);
  if (hours === undefined || minutes === undefined) return time;
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

// ============================================================================
// TODAY INDICATOR
// ============================================================================

/**
 * Get today's date styling
 */
export function getTodayClasses(date: Date): string {
  if (!isToday(date)) return '';
  return 'ring-2 ring-emerald-500 ring-offset-2 bg-emerald-50/50';
}

/**
 * Get date label for today/tomorrow
 */
export function getDateLabel(date: Date): string | null {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return null;
}

// ============================================================================
// URGENCY INDICATORS
// ============================================================================

export type UrgencyLevel = 'urgent' | 'warning' | 'normal';

/**
 * Determine urgency level based on minutes until deadline
 */
export function getUrgencyLevel(minutesUntil: number): UrgencyLevel {
  if (minutesUntil <= 60) return 'urgent';
  if (minutesUntil <= 240) return 'warning';
  return 'normal';
}

/**
 * Get urgency styling classes
 */
export function getUrgencyClasses(level: UrgencyLevel): string {
  const classMap: Record<UrgencyLevel, string> = {
    urgent: 'bg-rose-50 text-rose-700 border-rose-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    normal: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return classMap[level];
}

// ============================================================================
// ATTENDANCE
// ============================================================================

export interface AttendanceStats {
  present: number;
  absent: number;
  excused: number;
  total: number;
  percentage: number;
}

/**
 * Calculate attendance statistics
 */
export function calculateAttendanceStats(
  attendance: Array<{ status: string; is_excused?: boolean }>
): AttendanceStats {
  const present = attendance.filter(a => a.status === 'present').length;
  const absent = attendance.filter(a => a.status === 'absent' && !a.is_excused).length;
  const excused = attendance.filter(a => a.status === 'absent' && a.is_excused).length;
  const total = attendance.length;

  return {
    present,
    absent,
    excused,
    total,
    percentage: total > 0 ? (present / total) * 100 : 0,
  };
}

/**
 * Get attendance status color
 */
export function getAttendanceColor(status: string, isExcused?: boolean): string {
  if (status === 'present') return 'bg-emerald-500 text-white';
  if (status === 'absent' && isExcused) return 'bg-amber-500 text-white';
  if (status === 'absent') return 'bg-rose-500 text-white';
  return 'bg-slate-300 text-slate-600';
}

// ============================================================================
// VISUAL RHYTHM
// ============================================================================

/**
 * Check if a week is the current week (for visual highlight)
 */
export function isCurrentWeek(date: Date): boolean {
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);

  return date >= startOfWeek && date <= endOfWeek;
}
