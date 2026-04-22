// BATCH 6: Recurrence Utilities (RRULE format)
// Extended with event expansion, academic exclusions, and filtering

import type { RecurrenceRule } from '@/lib/types/calendar';

// ============================================================================
// ADDITIONAL TYPES
// ============================================================================

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
