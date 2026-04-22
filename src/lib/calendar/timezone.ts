/**
 * Timezone Utilities for Calendar Operations
 *
 * Provides consistent timezone handling across the calendar system.
 * All times are stored in UTC in the database and converted to local
 * timezone for display.
 *
 * Key principles:
 * 1. Store in UTC - All database timestamps are UTC
 * 2. Display in local - Convert to team/user timezone for display
 * 3. Handle DST - Use IANA timezone names (e.g., 'America/New_York')
 */

import { format } from 'date-fns';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default timezone used when no team or user timezone is set
 * This should match the most common user timezone
 */
export const DEFAULT_TIMEZONE = 'America/New_York';

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

/**
 * Format just the date portion for iCal (all-day events)
 */
export function formatICalDate(date: Date): string {
  return format(date, 'yyyyMMdd');
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a string is a valid IANA timezone
 */
function isValidTimezone(timezone: string): boolean {
  try {
    // Attempt to use the timezone - will throw if invalid
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get a valid timezone, falling back to default if invalid
 */
export function getValidTimezone(timezone: string | null | undefined): string {
  if (timezone && isValidTimezone(timezone)) {
    return timezone;
  }
  return DEFAULT_TIMEZONE;
}
