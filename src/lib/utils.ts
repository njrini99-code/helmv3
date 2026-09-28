import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { format, isToday, isYesterday, differenceInMinutes, differenceInHours, differenceInDays, isSameYear } from "date-fns";
import { PIPELINE_STAGES } from "@/lib/recruiting/stages";

/**
 * This project's custom `fontSize` scale, mirrored from `tailwind.config.ts`.
 *
 * WHY cn() NEEDS TO BE TOLD ABOUT THESE
 * ------------------------------------
 * `tailwind-merge` resolves conflicts by mapping each class to a group and
 * keeping the last one per group. It ships knowing the DEFAULT scale, so it
 * files `text-xs` under font-size and `text-warm-500` under text-color, and
 * keeps both. It has never heard of `text-caption`, so it guesses from the
 * `text-` prefix and files it under text-COLOR — where `text-warm-500` then
 * supersedes it and the size is silently dropped:
 *
 *     twMerge('text-caption text-warm-500')  ->  'text-warm-500'
 *     twMerge('text-xs text-warm-500')       ->  'text-xs text-warm-500'
 *
 * Verified directly against the installed tailwind-merge on 2026-08-27, not
 * inferred: `text-caption`, `text-eyebrow`, `text-h3` and `text-body` all
 * vanish when merged alongside a text colour.
 *
 * The failure is invisible in review — the JSX still reads
 * `cn('text-caption', 'text-warm-500')` — and invisible at runtime, because the
 * element still renders, just at inherited size. It hits every one of the 43
 * tokens below, including `text-eyebrow` inside the shared `<Eyebrow>`
 * component, so a single mis-grouping silently unstyled that primitive
 * everywhere it is used.
 *
 * Registering them in the `font-size` group is the fix at the source. The
 * alternative found in the wild — avoiding `cn()` and hand-writing template
 * literals at each call site — treats the symptom and leaves the next caller to
 * rediscover it.
 *
 * KEEP IN SYNC with `tailwind.config.ts` → `theme.extend.fontSize`. A token
 * added there and missed here is silently dropped again; `cn.test.ts` asserts
 * this list against the config so the drift fails a test rather than a screen.
 */
const CUSTOM_FONT_SIZE_TOKENS = [
  'display', 'display-sm', 'display-md', 'display-lg', 'display-xl',
  'h1', 'h2', 'h3',
  'body-lg', 'body', 'body-sm',
  'caption', 'caption-1', 'caption-2',
  'eyebrow',
  'stat-xl', 'stat-lg',
  'microlabel', 'microbadge', 'micro',
  'ink-hero', 'ink',
  'large-title', 'title-1', 'title-2', 'title-3',
  'headline', 'callout', 'subhead', 'footnote', 'label',
] as const;

/**
 * `cn()`'s merge engine, taught this project's type scale.
 *
 * Only the CUSTOM tokens are registered. The default-scale sizes (`xs`, `sm`,
 * `base`, `lg`, `xl`, `2xl`…) are deliberately omitted: tailwind-merge already
 * groups those correctly, and re-declaring them would be a second source of
 * truth for classes it already handles.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': CUSTOM_FONT_SIZE_TOKENS.map((token) => `text-${token}`),
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Exported for the drift test that pins this list to the Tailwind config. */
export const __CUSTOM_FONT_SIZE_TOKENS = CUSTOM_FONT_SIZE_TOKENS;

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


