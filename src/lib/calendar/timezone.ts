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

import { format, parseISO } from 'date-fns';
import { toZonedTime, fromZonedTime, formatInTimeZone } from 'date-fns-tz';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default timezone used when no team or user timezone is set
 * This should match the most common user timezone
 */
export const DEFAULT_TIMEZONE = 'America/New_York';

/**
 * Common US timezones for team settings dropdown
 */
export const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Phoenix', label: 'Arizona (no DST)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
] as const;

/**
 * All IANA timezones commonly used (for international support)
 */
export const ALL_TIMEZONES = [
  ...US_TIMEZONES,
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
] as const;

// ============================================================================
// TYPES
// ============================================================================

export interface TimezoneInfo {
  timezone: string;
  abbreviation: string;
  offsetMinutes: number;
  offsetString: string; // e.g., '-05:00'
  isDST: boolean;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Convert a UTC date to a specific timezone
 *
 * @param utcDate - Date in UTC (from database)
 * @param timezone - IANA timezone string (e.g., 'America/New_York')
 * @returns Date object adjusted to the target timezone
 *
 * @example
 * const utcDate = new Date('2024-03-15T14:00:00Z');
 * const localDate = toTimezone(utcDate, 'America/New_York');
 * // During EST: 9:00 AM local
 * // During EDT: 10:00 AM local
 */
export function toTimezone(utcDate: Date, timezone: string = DEFAULT_TIMEZONE): Date {
  return toZonedTime(utcDate, timezone);
}

/**
 * Convert a local time to UTC for storage
 *
 * @param localDate - Date in local timezone
 * @param timezone - IANA timezone string
 * @returns Date object in UTC
 *
 * @example
 * // User enters 9:00 AM in New York
 * const localDate = new Date('2024-03-15T09:00:00');
 * const utcDate = fromTimezone(localDate, 'America/New_York');
 * // During EST: 14:00:00Z
 * // During EDT: 13:00:00Z
 */
export function fromTimezone(localDate: Date, timezone: string = DEFAULT_TIMEZONE): Date {
  return fromZonedTime(localDate, timezone);
}

/**
 * Parse an ISO date string and convert to specific timezone
 *
 * @param isoString - ISO date string (typically from database)
 * @param timezone - Target timezone
 * @returns Date in the target timezone
 */
export function parseInTimezone(isoString: string, timezone: string = DEFAULT_TIMEZONE): Date {
  const utcDate = parseISO(isoString);
  return toTimezone(utcDate, timezone);
}

/**
 * Format a date in a specific timezone
 *
 * @param date - Date to format (can be UTC or already in timezone)
 * @param timezone - Target timezone for display
 * @param formatStr - date-fns format string
 * @returns Formatted string in the target timezone
 *
 * @example
 * formatInTz(new Date(), 'America/New_York', 'MMM d, yyyy h:mm a zzz')
 * // "Mar 15, 2024 9:00 AM EST"
 */
export function formatInTz(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE,
  formatStr: string = 'yyyy-MM-dd HH:mm:ss'
): string {
  return formatInTimeZone(date, timezone, formatStr);
}

/**
 * Get the current time in a specific timezone
 */
export function nowInTimezone(timezone: string = DEFAULT_TIMEZONE): Date {
  return toTimezone(new Date(), timezone);
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

/**
 * Format a date for display with timezone abbreviation
 *
 * @example formatDateTimeWithTz(date, 'America/New_York')
 * // "Mar 15, 2024 at 9:00 AM EST"
 */
export function formatDateTimeWithTz(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE
): string {
  return formatInTimeZone(date, timezone, "MMM d, yyyy 'at' h:mm a zzz");
}

/**
 * Format just the time with timezone abbreviation
 *
 * @example formatTimeWithTz(date, 'America/New_York')
 * // "9:00 AM EST"
 */
export function formatTimeWithTz(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE
): string {
  return formatInTimeZone(date, timezone, 'h:mm a zzz');
}

/**
 * Format a date for iCal (RFC 5545) in a specific timezone
 * Returns format: YYYYMMDDTHHMMSS
 *
 * Note: For iCal, we include TZID in the property, not in the value
 */
export function formatICalDateTime(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE
): string {
  return formatInTimeZone(date, timezone, "yyyyMMdd'T'HHmmss");
}

/**
 * Format a date for iCal in UTC (with Z suffix)
 */
export function formatICalDateTimeUTC(date: Date): string {
  return format(date, "yyyyMMdd'T'HHmmss") + 'Z';
}

/**
 * Format just the date portion for iCal (all-day events)
 */
export function formatICalDate(date: Date): string {
  return format(date, 'yyyyMMdd');
}

// ============================================================================
// TIMEZONE INFO
// ============================================================================

/**
 * Get timezone information for a specific timezone at a given date
 *
 * @param timezone - IANA timezone string
 * @param date - Date to check (affects DST calculation)
 * @returns Timezone information including offset and DST status
 */
export function getTimezoneInfo(
  timezone: string = DEFAULT_TIMEZONE,
  date: Date = new Date()
): TimezoneInfo {
  // Get the offset for this timezone at the given date
  const zonedDate = toZonedTime(date, timezone);

  // Calculate offset by comparing UTC and zoned time
  const utcTime = date.getTime();
  const zonedTime = zonedDate.getTime();
  const offsetMs = zonedTime - utcTime;
  const offsetMinutes = Math.round(offsetMs / (1000 * 60));

  // Format offset string
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const offsetString = `${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMins).padStart(2, '0')}`;

  // Get abbreviation (e.g., EST, PDT)
  const abbreviation = formatInTimeZone(date, timezone, 'zzz');

  // Determine if DST is active by checking if abbreviation ends with 'DT'
  // This is a heuristic - works for US timezones
  const isDST = abbreviation.endsWith('DT');

  return {
    timezone,
    abbreviation,
    offsetMinutes,
    offsetString,
    isDST,
  };
}

/**
 * Get the timezone label for display
 *
 * @example getTimezoneLabel('America/New_York')
 * // "Eastern Time (ET)"
 */
export function getTimezoneLabel(timezone: string): string {
  const found = ALL_TIMEZONES.find(tz => tz.value === timezone);
  return found?.label ?? timezone;
}

// ============================================================================
// DATE RANGE HELPERS
// ============================================================================

/**
 * Get the start of day in a specific timezone, returned as UTC
 * Useful for querying events that start on a specific day
 */
export function startOfDayInTimezone(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE
): Date {
  const zonedDate = toZonedTime(date, timezone);
  zonedDate.setHours(0, 0, 0, 0);
  return fromZonedTime(zonedDate, timezone);
}

/**
 * Get the end of day in a specific timezone, returned as UTC
 */
export function endOfDayInTimezone(
  date: Date,
  timezone: string = DEFAULT_TIMEZONE
): Date {
  const zonedDate = toZonedTime(date, timezone);
  zonedDate.setHours(23, 59, 59, 999);
  return fromZonedTime(zonedDate, timezone);
}

/**
 * Check if a date falls on a specific day in a timezone
 * Handles cases where UTC date might be different from local date
 */
export function isSameDayInTimezone(
  date1: Date,
  date2: Date,
  timezone: string = DEFAULT_TIMEZONE
): boolean {
  const zoned1 = toZonedTime(date1, timezone);
  const zoned2 = toZonedTime(date2, timezone);

  return (
    zoned1.getFullYear() === zoned2.getFullYear() &&
    zoned1.getMonth() === zoned2.getMonth() &&
    zoned1.getDate() === zoned2.getDate()
  );
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a string is a valid IANA timezone
 */
export function isValidTimezone(timezone: string): boolean {
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
