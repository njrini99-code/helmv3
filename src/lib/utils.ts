import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, isToday, isYesterday, differenceInMinutes, differenceInHours, differenceInDays, isSameYear } from "date-fns";
import { PIPELINE_STAGES } from "@/lib/recruiting/stages";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ===== NUMBER FORMATTING =====
export function formatNumber(num: number | null | undefined): string {
  if (num === null || num === undefined) return '—';
  return num.toLocaleString();
}

// ===== METRIC LABEL FORMATTING =====
// Turn raw metric keys (scoreToPar, greens_in_regulation) into display labels.
const METRIC_LABELS: Record<string, string> = {
  scoreToPar: 'Score to Par',
  score_to_par: 'Score to Par',
  strokesGained: 'Strokes Gained',
  strokes_gained: 'Strokes Gained',
  puttsPerRound: 'Putts per Round',
  putts_per_round: 'Putts per Round',
  greensInRegulation: 'Greens in Regulation',
  greens_in_regulation: 'Greens in Regulation',
  fairwaysHit: 'Fairways Hit',
  fairways_hit: 'Fairways Hit',
  scramblingPct: 'Scrambling %',
  scrambling_pct: 'Scrambling %',
  driveDistance: 'Driving Distance',
  drive_distance: 'Driving Distance',
};
export function formatMetricLabel(metric: string | null | undefined): string {
  if (!metric) return '';
  if (METRIC_LABELS[metric]) return METRIC_LABELS[metric];
  return metric
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
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

// Single source of truth for pipeline stage labels is `PIPELINE_STAGES`
// (src/lib/recruiting/stages.ts). This used to hardcode its own label map
// that had drifted from PIPELINE_STAGES (e.g. `watchlist` → "Prospects" here
// vs. "Watchlist" there) — see the decision memo for the "Watchlist" vs
// "Prospects" collision this resolved.
export function getPipelineStageLabel(stage: string): string {
  return PIPELINE_STAGES.find((s) => s.id === stage)?.label ?? stage;
}


