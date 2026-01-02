// BATCH 6: Recurrence Utilities (RRULE format)

import type { RecurrenceRule } from '@/lib/types/calendar';

/**
 * Convert RecurrenceRule to RRULE string format
 * Format: RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;COUNT=10
 */
export function toRRULE(rule: RecurrenceRule): string {
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
export function describeRecurrence(rule: RecurrenceRule): string {
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
export function getNextOccurrence(startDate: Date, rule: RecurrenceRule): Date {
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
