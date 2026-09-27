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
 * added there and missed here is silently dropped again; `cn-font-size.test.ts` asserts
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
/**
 * Custom `borderRadius` keys from `tailwind.config.ts` (the Fairway ramp).
 *
 * Unregistered, tailwind-merge does not recognise `rounded-card` at all, so it
 * keeps it NEXT TO a conflicting radius instead of replacing it, and the
 * stylesheet decides. Tailwind v3 emits same-plugin rules alphabetically, so
 * `rounded-full` (f-u) lands after `rounded-card` and wins:
 * `<Button className="rounded-card">` rendered as a pill. Registered in the
 * `radius` theme scale, the token joins `rounded` AND every side group
 * (`rounded-t-card`, `rounded-bl-fw-lg`...), and the last class passed wins.
 *
 * KEEP IN SYNC with `theme.extend.borderRadius`; `cn-custom-tokens.test.ts` checks it.
 */
const CUSTOM_RADIUS_TOKENS = ['card', 'fw-sm', 'fw-md', 'fw-lg'] as const;

/**
 * Custom `boxShadow` keys from `tailwind.config.ts`.
 *
 * Unregistered, tailwind-merge files `shadow-soft` under shadow-COLOUR (any
 * unknown `shadow-*` value is taken for a colour name), so a real colour such
 * as `shadow-black/5` silently deleted it, and a later `shadow-none` could not
 * replace it. Registered in the `shadow` scale they merge as shadows.
 *
 * `xs` and the default t-shirt sizes are omitted: tailwind-merge knows them.
 * KEEP IN SYNC with `theme.extend.boxShadow`; `cn-custom-tokens.test.ts` checks it.
 */
const CUSTOM_SHADOW_TOKENS = [
  'glass', 'glass-hover', 'glass-sm', 'glass-md', 'glass-lg', 'glass-xl',
  'card', 'card-hover', 'focus', 'focus-ring',
  'glow-green', 'glow-green-lg', 'glow-green-intense', 'glow-amber', 'glow-emerald',
  'subtle', 'inner-highlight',
  'elevation-1', 'elevation-2', 'elevation-3', 'elevation-4',
  'flat', 'soft', 'raise', 'pop', 'fw-modal', 'fw-glow-accent',
] as const;

/**
 * The remaining custom scales from `tailwind.config.ts`, by utility prefix.
 *
 * `backgroundImage` has the font-size/shadow failure: an unknown `bg-*` value
 * is taken for a COLOUR, so `bg-canvas bg-canvas-gradient` lost `bg-canvas`,
 * and the reverse order would lose the gradient. The others are unknown to
 * tailwind-merge the way the radius ramp was, so both classes survive and the
 * alphabetical stylesheet picks the winner (`duration-fast duration-base`
 * rendered 150ms).
 *
 * KEEP IN SYNC with the matching `theme.extend` blocks; `cn-custom-tokens.test.ts`
 * checks each one. Keys tailwind-merge already knows are omitted.
 */
const CUSTOM_SCALE_TOKENS = {
  /** theme.extend.backgroundImage */
  'bg-image': [
    'gradient-radial', 'gradient-conic', 'mesh', 'glass-gradient', 'shimmer', 'aurora',
    'aurora-gradient', 'gradient-green', 'gradient-dark', 'hero-glow', 'cream-gradient',
    'linen-gradient', 'canvas-gradient',
  ],
  /** theme.extend.zIndex (numeric keys are already known) */
  z: ['base', 'raised', 'overlay', 'modal', 'toast', 'toolbar', 'tooltip'],
  /** theme.extend.transitionDuration (numeric keys are already known) */
  duration: ['fast', 'slow', 'base', 'cinematic'],
  /** theme.extend.transitionTimingFunction (`out` is already known) */
  ease: [
    'bounce', 'ios', 'ios-spring', 'ios-smooth', 'ios-sharp', 'apple', 'cinematic',
    'smooth', 'out-expo', 'in-out-expo', 'elastic',
  ],
  /** theme.extend.animation */
  animate: [
    'fade-in', 'fade-in-slow', 'fade-up', 'fade-up-slow', 'scale-in', 'slide-up', 'slide-down',
    'slide-in-right', 'slide-in-left', 'bounce-in', 'scan', 'shake', 'card-hover',
    'check-bounce', 'number-tick', 'count-up', 'pulse-subtle', 'shimmer', 'spin-slow', 'glow',
    'float', 'float-complex', 'float-delayed', 'aurora', 'scroll-bounce', 'gradient-shift',
    'ripple', 'checkmark', 'progress-fill', 'progress-indeterminate', 'badge-pulse',
  ],
  /** theme.extend.backdropBlur (`xs` is already known) */
  'backdrop-blur': ['glass-subtle', 'glass', 'glass-prominent'],
  /** theme.extend.letterSpacing (`tighter`/`tight` are already known) */
  tracking: ['tightest'],
} as const;

const scaleClasses = (prefix: string, tokens: readonly string[]) =>
  tokens.map((token) => `${prefix}-${token}`);

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: [...CUSTOM_RADIUS_TOKENS],
      shadow: [...CUSTOM_SHADOW_TOKENS],
      ease: [...CUSTOM_SCALE_TOKENS.ease],
      animate: [...CUSTOM_SCALE_TOKENS.animate],
      tracking: [...CUSTOM_SCALE_TOKENS.tracking],
    },
    classGroups: {
      'font-size': CUSTOM_FONT_SIZE_TOKENS.map((token) => `text-${token}`),
      // Class groups rather than theme keys: tailwind-merge's `blur` theme also
      // feeds the `blur-*` filter, and z/duration/bg-image have no theme key.
      'bg-image': scaleClasses('bg', CUSTOM_SCALE_TOKENS['bg-image']),
      z: scaleClasses('z', CUSTOM_SCALE_TOKENS.z),
      duration: scaleClasses('duration', CUSTOM_SCALE_TOKENS.duration),
      'backdrop-blur': scaleClasses('backdrop-blur', CUSTOM_SCALE_TOKENS['backdrop-blur']),
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Exported for the drift test that pins this list to the Tailwind config. */
export const __CUSTOM_FONT_SIZE_TOKENS = CUSTOM_FONT_SIZE_TOKENS;
/** Exported for the drift tests that pin these lists to the Tailwind config. */
export const __CUSTOM_RADIUS_TOKENS = CUSTOM_RADIUS_TOKENS;
export const __CUSTOM_SHADOW_TOKENS = CUSTOM_SHADOW_TOKENS;
export const __CUSTOM_SCALE_TOKENS = CUSTOM_SCALE_TOKENS;

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


