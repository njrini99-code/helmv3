// BATCH 6: Recurrence Utilities (RRULE format)
// Extended with event expansion, academic exclusions, and filtering

import type { RecurrenceRule } from '@/lib/types/calendar';
import { addDays, addWeeks, addMonths, addYears, startOfDay, isBefore, isAfter, isSameDay, parseISO, format as formatDate } from 'date-fns';

// ============================================================================
// ADDITIONAL TYPES
// ============================================================================

export interface RecurringEvent {
  id: string;
  title: string;
  eventType: string;
  startDate: Date;
  endDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  recurrenceRule: string | null; // RRULE string
  recurrenceParentId: string | null;
  originalStartDate: Date | null;
  isException: boolean;
}

export interface AcademicExclusion {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  excludePractices: boolean;
  excludeMatches: boolean;
  excludeAllEvents: boolean;
}

export interface ExpandedEvent {
  id: string;
  parentId: string | null;
  title: string;
  eventType: string;
  startDate: Date;
  endDate: Date | null;
  startTime: string | null;
  endTime: string | null;
  isRecurringInstance: boolean;
  originalStartDate: Date;
}

/**
 * Convert RecurrenceRule to RRULE string format
 * Format: RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;COUNT=10
 */
function toRRULE(rule: RecurrenceRule): string {
  const parts: string[] = [];

  // Frequency (required)
  parts.push(`FREQ=${rule.frequency.toUpperCase()}`);

  // Interval
  if (rule.interval && rule.interval > 1) {
    parts.push(`INTERVAL=${rule.interval}`);
  }

  // BYDAY (for weekly recurrence)
  if (rule.byDay && rule.byDay.length > 0) {
    parts.push(`BYDAY=${rule.byDay.join(',')}`);
  }

  // BYMONTHDAY (for monthly recurrence)
  if (rule.byMonthDay && rule.byMonthDay.length > 0) {
    parts.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
  }

  // BYMONTH (for yearly recurrence)
  if (rule.byMonth && rule.byMonth.length > 0) {
    parts.push(`BYMONTH=${rule.byMonth.join(',')}`);
  }

  // End condition - either COUNT or UNTIL
  if (rule.count) {
    parts.push(`COUNT=${rule.count}`);
  } else if (rule.until) {
    // Convert ISO date to RRULE format (YYYYMMDD)
    const untilDate = rule.until.replace(/-/g, '').substring(0, 8);
    parts.push(`UNTIL=${untilDate}`);
  }

  return `RRULE:${parts.join(';')}`;
}

/**
 * Parse RRULE string to RecurrenceRule object
 * Example: "RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;COUNT=10"
 */
export function fromRRULE(rrule: string): RecurrenceRule | null {
  if (!rrule || !rrule.startsWith('RRULE:')) {
    return null;
  }

  const ruleString = rrule.substring(6); // Remove "RRULE:" prefix
  const parts = ruleString.split(';');
  const rule: Partial<RecurrenceRule> = {};

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (!value) continue; // Skip if no value

    switch (key) {
      case 'FREQ':
        rule.frequency = value.toLowerCase() as RecurrenceRule['frequency'];
        break;

      case 'INTERVAL':
        rule.interval = parseInt(value);
        break;

      case 'BYDAY':
        rule.byDay = value.split(',');
        break;

      case 'BYMONTHDAY':
        rule.byMonthDay = value.split(',').map((v) => parseInt(v));
        break;

      case 'BYMONTH':
        rule.byMonth = value.split(',').map((v) => parseInt(v));
        break;

      case 'COUNT':
        rule.count = parseInt(value);
        break;

      case 'UNTIL':
        // Convert YYYYMMDD to ISO date YYYY-MM-DD
        rule.until = `${value.substring(0, 4)}-${value.substring(4, 6)}-${value.substring(6, 8)}`;
        break;
    }
  }

  return rule.frequency ? (rule as RecurrenceRule) : null;
}

/**
 * Generate human-readable description of recurrence rule
 * Example: "Every week on Monday, Wednesday, Friday"
 */
function describeRecurrence(rule: RecurrenceRule): string {
  const parts: string[] = [];

  // Frequency + Interval
  if (rule.interval === 1) {
    parts.push(`Every ${rule.frequency === 'daily' ? 'day' : rule.frequency === 'weekly' ? 'week' : rule.frequency === 'monthly' ? 'month' : 'year'}`);
  } else {
    parts.push(`Every ${rule.interval} ${rule.frequency === 'daily' ? 'days' : rule.frequency === 'weekly' ? 'weeks' : rule.frequency === 'monthly' ? 'months' : 'years'}`);
  }

  // BYDAY for weekly
  if (rule.frequency === 'weekly' && rule.byDay && rule.byDay.length > 0) {
    const dayNames: Record<string, string> = {
      SU: 'Sunday',
      MO: 'Monday',
      TU: 'Tuesday',
      WE: 'Wednesday',
      TH: 'Thursday',
      FR: 'Friday',
      SA: 'Saturday',
    };
    const days = rule.byDay.map((d) => dayNames[d] || d).join(', ');
    parts.push(`on ${days}`);
  }

  // End condition
  if (rule.count) {
    parts.push(`for ${rule.count} occurrences`);
  } else if (rule.until) {
    parts.push(`until ${rule.until}`);
  }

  return parts.join(' ');
}

/**
 * Calculate next occurrence date based on recurrence rule
 * Note: This is a simplified implementation. For production, use a library like rrule.js
 */
function getNextOccurrence(startDate: Date, rule: RecurrenceRule): Date {
  const next = new Date(startDate);

  switch (rule.frequency) {
    case 'daily':
      next.setDate(next.getDate() + (rule.interval || 1));
      break;

    case 'weekly':
      next.setDate(next.getDate() + 7 * (rule.interval || 1));
      break;

    case 'monthly':
      next.setMonth(next.getMonth() + (rule.interval || 1));
      break;

    case 'yearly':
      next.setFullYear(next.getFullYear() + (rule.interval || 1));
      break;
  }

  return next;
}

// ============================================================================
// EVENT EXPANSION
// ============================================================================

/**
 * Expand a recurring event into individual instances within a date range
 */
function expandRecurringEvent(
  event: RecurringEvent,
  rangeStart: Date,
  rangeEnd: Date,
  exclusions: Date[] = [],
  academicExclusions: AcademicExclusion[] = []
): ExpandedEvent[] {
  if (!event.recurrenceRule) {
    // Not a recurring event, return as-is
    return [{
      id: event.id,
      parentId: null,
      title: event.title,
      eventType: event.eventType,
      startDate: event.startDate,
      endDate: event.endDate,
      startTime: event.startTime,
      endTime: event.endTime,
      isRecurringInstance: false,
      originalStartDate: event.startDate,
    }];
  }

  const rule = fromRRULE(event.recurrenceRule);
  if (!rule) return [];

  const instances: ExpandedEvent[] = [];
  let currentDate = startOfDay(event.startDate);
  const maxIterations = 1000; // Safety limit
  let iterationCount = 0;

  while (iterationCount < maxIterations) {
    iterationCount++;

    // Check if we've exceeded the count limit
    if (rule.count && instances.length >= rule.count) {
      break;
    }

    // Check if we've exceeded the until date
    if (rule.until) {
      const untilDate = parseISO(rule.until);
      if (isAfter(currentDate, untilDate)) {
        break;
      }
    }

    // Check if we've exceeded the range end
    if (isAfter(currentDate, rangeEnd)) {
      break;
    }

    // Check if this date should be included
    const shouldInclude = shouldIncludeDate(currentDate, rule);

    if (shouldInclude && !isBefore(currentDate, rangeStart)) {
      // Check if date is excluded
      const isExcluded = exclusions.some(excl => isSameDay(excl, currentDate));

      // Check academic exclusions
      const isAcademicallyExcluded = isDateAcademicallyExcluded(
        currentDate,
        event.eventType,
        academicExclusions
      );

      if (!isExcluded && !isAcademicallyExcluded) {
        // Calculate end date if original event has duration
        let instanceEndDate: Date | null = null;
        if (event.endDate) {
          const duration = event.endDate.getTime() - event.startDate.getTime();
          instanceEndDate = new Date(currentDate.getTime() + duration);
        }

        instances.push({
          id: `${event.id}_${formatDate(currentDate, 'yyyyMMdd')}`,
          parentId: event.id,
          title: event.title,
          eventType: event.eventType,
          startDate: currentDate,
          endDate: instanceEndDate,
          startTime: event.startTime,
          endTime: event.endTime,
          isRecurringInstance: true,
          originalStartDate: currentDate,
        });
      }
    }

    // Move to next date based on frequency
    currentDate = getNextDateForExpansion(currentDate, rule);
  }

  return instances;
}

/**
 * Determine if a date should be included based on recurrence rule
 */
function shouldIncludeDate(date: Date, rule: RecurrenceRule): boolean {
  const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // 1-12

  // Check BYDAY (for WEEKLY frequency)
  if (rule.byDay && rule.byDay.length > 0) {
    const weekdayMap: Record<number, string> = {
      0: 'SU',
      1: 'MO',
      2: 'TU',
      3: 'WE',
      4: 'TH',
      5: 'FR',
      6: 'SA',
    };
    const currentWeekday = weekdayMap[dayOfWeek];
    if (!currentWeekday) {
      return false;
    }
    if (!rule.byDay.includes(currentWeekday)) {
      return false;
    }
  }

  // Check BYMONTHDAY (for MONTHLY frequency)
  if (rule.byMonthDay && rule.byMonthDay.length > 0) {
    if (!rule.byMonthDay.includes(dayOfMonth)) {
      return false;
    }
  }

  // Check BYMONTH (for YEARLY frequency)
  if (rule.byMonth && rule.byMonth.length > 0) {
    if (!rule.byMonth.includes(month)) {
      return false;
    }
  }

  return true;
}

/**
 * Get next date based on frequency and interval (for expansion)
 */
function getNextDateForExpansion(currentDate: Date, rule: RecurrenceRule): Date {
  const interval = rule.interval || 1;

  switch (rule.frequency) {
    case 'daily':
      return addDays(currentDate, interval);
    case 'weekly':
      return addWeeks(currentDate, interval);
    case 'monthly':
      return addMonths(currentDate, interval);
    case 'yearly':
      return addYears(currentDate, interval);
    default:
      return addDays(currentDate, 1);
  }
}

/**
 * Check if a date falls within academic exclusion period
 */
function isDateAcademicallyExcluded(
  date: Date,
  eventType: string,
  academicExclusions: AcademicExclusion[]
): boolean {
  for (const exclusion of academicExclusions) {
    // Check if date falls within exclusion period
    if (isBefore(date, exclusion.startDate) || isAfter(date, exclusion.endDate)) {
      continue;
    }

    // Check if this event type should be excluded
    if (exclusion.excludeAllEvents) {
      return true;
    }

    if (exclusion.excludePractices && eventType === 'practice') {
      return true;
    }

    if (exclusion.excludeMatches && eventType === 'match') {
      return true;
    }
  }

  return false;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get weekday code from JavaScript day number
 */
function getWeekdayCode(dayNumber: number): string {
  const map: Record<number, string> = {
    0: 'SU',
    1: 'MO',
    2: 'TU',
    3: 'WE',
    4: 'TH',
    5: 'FR',
    6: 'SA',
  };
  return map[dayNumber] ?? 'SU';
}

/**
 * Get JavaScript day number from weekday code
 */
function getDayNumber(weekday: string): number {
  const map: Record<string, number> = {
    SU: 0,
    MO: 1,
    TU: 2,
    WE: 3,
    TH: 4,
    FR: 5,
    SA: 6,
  };
  return map[weekday] ?? 0;
}
