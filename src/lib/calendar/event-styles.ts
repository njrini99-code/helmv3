/**
 * Event Type Color Mappings - Premium Calendar Styling
 * Warm, sophisticated colors with subtle gradients and shadows
 */

import type { EventType, EventTypeConfig } from '@/lib/types/calendar';

export const eventTypeConfigs: Record<EventType, EventTypeConfig> = {
  // Game/Tournament - Premium emerald (brand)
  game: {
    label: 'Game',
    color: 'emerald',
    bgColor: 'bg-emerald-50/60',
    borderColor: 'border-l-emerald-500',
    textColor: 'text-emerald-800',
    showText: true,
  },
  tournament: {
    label: 'Tournament',
    color: 'emerald',
    bgColor: 'bg-emerald-50/60',
    borderColor: 'border-l-emerald-600',
    textColor: 'text-emerald-800',
    showText: true,
  },
  // Qualifier - Premium amber/gold
  qualifier: {
    label: 'Qualifier',
    color: 'amber',
    bgColor: 'bg-amber-50/60',
    borderColor: 'border-l-amber-500',
    textColor: 'text-amber-800',
    showText: true,
  },
  // Practice - Warm stone/neutral
  practice: {
    label: 'Practice',
    color: 'stone',
    bgColor: 'bg-stone-100/60',
    borderColor: 'border-l-stone-400',
    textColor: 'text-stone-700',
    showText: true,
  },
  // Scrimmage - Soft teal
  scrimmage: {
    label: 'Scrimmage',
    color: 'teal',
    bgColor: 'bg-teal-50/60',
    borderColor: 'border-l-teal-500',
    textColor: 'text-teal-800',
    showText: true,
  },
  // Recruiting Visit - Premium violet
  recruiting_visit: {
    label: 'Recruiting Visit',
    color: 'violet',
    bgColor: 'bg-violet-50/60',
    borderColor: 'border-l-violet-500',
    textColor: 'text-violet-800',
    showText: true,
  },
  // Camp - Warm orange
  camp: {
    label: 'Camp',
    color: 'orange',
    bgColor: 'bg-orange-50/60',
    borderColor: 'border-l-orange-500',
    textColor: 'text-orange-800',
    showText: true,
  },
  // Meeting - Soft sky blue
  meeting: {
    label: 'Meeting',
    color: 'sky',
    bgColor: 'bg-sky-50/60',
    borderColor: 'border-l-sky-500',
    textColor: 'text-sky-800',
    showText: true,
  },
  // Workout - Warm rose
  workout: {
    label: 'Workout',
    color: 'rose',
    bgColor: 'bg-rose-50/60',
    borderColor: 'border-l-rose-500',
    textColor: 'text-rose-800',
    showText: true,
  },
  // Class - Subtle stone (low contrast)
  class: {
    label: 'Class',
    color: 'stone',
    bgColor: 'bg-stone-100/50',
    borderColor: 'border-l-stone-300',
    textColor: 'text-stone-500',
    showText: false,
  },
  // Blocked Time - Very subtle
  blocked_time: {
    label: 'Blocked Time',
    color: 'stone',
    bgColor: 'bg-stone-100/40',
    borderColor: 'border-l-stone-200',
    textColor: 'text-stone-400',
    showText: false,
  },
  // Travel - Premium purple
  travel: {
    label: 'Travel',
    color: 'purple',
    bgColor: 'bg-purple-50/60',
    borderColor: 'border-l-purple-500',
    textColor: 'text-purple-800',
    showText: true,
  },
  // Other - Neutral stone
  other: {
    label: 'Other',
    color: 'stone',
    bgColor: 'bg-stone-100/60',
    borderColor: 'border-l-stone-400',
    textColor: 'text-stone-600',
    showText: true,
  },
};

/**
 * Get configuration for a specific event type
 */
export function getEventTypeConfig(type: EventType): EventTypeConfig {
  return eventTypeConfigs[type] || eventTypeConfigs.other;
}

/**
 * Check if event type should show text (false for classes/blocked time)
 */
export function shouldShowEventText(type: EventType): boolean {
  return eventTypeConfigs[type]?.showText ?? true;
}

/**
 * Format time for display (e.g., "9:00 AM")
 */
export function formatTime(timeString: string): string {
  // Handle time-only strings (HH:MM:SS or HH:MM)
  if (timeString && !timeString.includes('T') && !timeString.includes(' ')) {
    const parts = timeString.split(':').map(Number);
    const hours = parts[0] ?? 0;
    const minutes = parts[1] ?? 0;
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    const displayMinutes = String(minutes).padStart(2, '0');
    return `${displayHour}:${displayMinutes} ${period}`;
  }

  // Handle full datetime strings
  const date = new Date(timeString);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

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
 * Check if event is happening today
 */
export function isToday(dateString: string): boolean {
  const date = new Date(dateString);
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Get hour from date string or time string (0-23)
 */
export function getHour(timeString: string): number {
  // Handle time-only strings (HH:MM:SS or HH:MM)
  if (timeString && !timeString.includes('T') && !timeString.includes(' ')) {
    const parts = timeString.split(':').map(Number);
    return parts[0] ?? 0;
  }
  // Handle full datetime strings
  return new Date(timeString).getHours();
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
