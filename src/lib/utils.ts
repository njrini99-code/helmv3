import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isToday, isYesterday, differenceInMinutes, differenceInHours, differenceInDays, isSameYear } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ===== NUMBER FORMATTING =====
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—';
  return num.toLocaleString();
}

// ===== PLURALIZATION =====
export function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 0) return `No ${plural || singular + 's'}`;
  if (count === 1) return `1 ${singular}`;
  return `${formatNumber(count)} ${plural || singular + 's'}`;
}

// ===== DATE FORMATTING =====
export function formatDateTime(date: Date | string): string {
  const d = new Date(date);
  if (isToday(d)) return `Today at ${format(d, 'h:mm a')}`;
  if (isYesterday(d)) return `Yesterday at ${format(d, 'h:mm a')}`;
  return format(d, 'MMM d, h:mm a');
}

// Premium relative time formatting
export function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const mins = differenceInMinutes(now, d);
  const hours = differenceInHours(now, d);
  const days = differenceInDays(now, d);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (isSameYear(d, now)) return format(d, 'MMM d');
  return format(d, 'MMM d, yyyy');
}

export function formatHeight(feet: number | null | undefined, inches: number | null | undefined): string {
  if (!feet) return '—';
  return `${feet}'${inches || 0}"`;
}

export function getFullName(firstName: string | null | undefined, lastName: string | null | undefined): string {
  return [firstName, lastName].filter(Boolean).join(' ') || 'Unknown';
}

export function getPipelineStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    watchlist: 'Prospects',
    high_priority: 'High Priority',
    offer_extended: 'Offer Extended',
    committed: 'Committed',
    uninterested: 'Not Interested',
  };
  return labels[stage] || stage;
}


