/**
 * StatusPill — single source of truth for the iOS-style chip-pill grammar
 * the dashboard now uses everywhere. Replaces the dozens of one-off
 * `inline-flex items-center px-2 py-0.5 rounded-full bg-X-50 ring-1 ring-X-200 text-X-700`
 * spans scattered through coachhelm, calendar, recruiting, and player-hub.
 *
 * Variants:
 *   - `soft`  — tinted background + same-tone text + ring (default; matches
 *               the AvailabilityDayView + Recruiting HQ chips).
 *   - `solid` — saturated tone + white text + 1px white-bullet dot
 *               (active filter, primary-CTA-adjacent contexts).
 *   - `dot`   — minimal: a colored dot + warm-700 text. Use inside dense
 *               rows when a full pill would be visual noise.
 *
 * Tones map to the iOS palette + brand primary. Add new tones here, not at
 * the call site.
 */

import { cn } from '@/lib/utils';
import type { ComponentType } from 'react';

export type StatusPillTone =
  | 'primary'
  | 'amber'
  | 'rose'
  | 'blue'
  | 'violet'
  | 'teal'
  | 'warm'
  | 'success'
  | 'danger'
  | 'info';

export type StatusPillVariant = 'soft' | 'solid' | 'dot';
export type StatusPillSize = 'xs' | 'sm' | 'md';

interface StatusPillProps {
  tone?: StatusPillTone;
  variant?: StatusPillVariant;
  size?: StatusPillSize;
  /** Lucide / IconX-style icon component. Rendered before the label. */
  icon?: ComponentType<{ size?: number; className?: string }>;
  /** Optional dot indicator on `soft`/`solid` variants — shown left of label. */
  dot?: boolean;
  /** Polite live-region for status-changing pills (e.g. "Saving..."). */
  live?: 'polite' | 'assertive';
  className?: string;
  children: React.ReactNode;
}

const TONE_SOFT: Record<StatusPillTone, string> = {
  primary: 'bg-primary-50 text-primary-700 ring-primary-100',
  amber:   'bg-amber-50 text-amber-700 ring-amber-100',
  rose:    'bg-rose-50 text-rose-700 ring-rose-100',
  blue:    'bg-blue-50 text-blue-700 ring-blue-100',
  violet:  'bg-violet-50 text-violet-700 ring-violet-100',
  teal:    'bg-teal-50 text-teal-700 ring-teal-100',
  warm:    'bg-warm-100 text-warm-700 ring-warm-200',
  success: 'bg-primary-50 text-primary-700 ring-primary-100',
  danger:  'bg-rose-50 text-rose-700 ring-rose-100',
  info:    'bg-blue-50 text-blue-700 ring-blue-100',
};

const TONE_SOLID: Record<StatusPillTone, string> = {
  primary: 'bg-primary-600 text-white shadow-[0_2px_8px_rgba(22,163,74,0.25)]',
  amber:   'bg-amber-500 text-white shadow-[0_2px_8px_rgba(245,158,11,0.25)]',
  rose:    'bg-rose-500 text-white shadow-[0_2px_8px_rgba(244,63,94,0.25)]',
  blue:    'bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.25)]',
  violet:  'bg-violet-600 text-white shadow-[0_2px_8px_rgba(124,58,237,0.25)]',
  teal:    'bg-teal-600 text-white shadow-[0_2px_8px_rgba(13,148,136,0.25)]',
  warm:    'bg-warm-700 text-white shadow-[0_2px_8px_rgba(28,25,23,0.20)]',
  success: 'bg-primary-600 text-white shadow-[0_2px_8px_rgba(22,163,74,0.25)]',
  danger:  'bg-rose-500 text-white shadow-[0_2px_8px_rgba(244,63,94,0.25)]',
  info:    'bg-blue-600 text-white shadow-[0_2px_8px_rgba(37,99,235,0.25)]',
};

const TONE_DOT: Record<StatusPillTone, string> = {
  primary: 'bg-primary-500',
  amber:   'bg-amber-500',
  rose:    'bg-rose-500',
  blue:    'bg-blue-500',
  violet:  'bg-violet-500',
  teal:    'bg-teal-500',
  warm:    'bg-warm-500',
  success: 'bg-primary-500',
  danger:  'bg-rose-500',
  info:    'bg-blue-500',
};

const SIZE_CLASSES: Record<StatusPillSize, string> = {
  xs: 'px-1.5 py-0.5 text-[10px] gap-1',
  sm: 'px-2 py-0.5 text-[11px] gap-1.5',
  md: 'px-2.5 py-1 text-xs gap-1.5',
};

const ICON_SIZE: Record<StatusPillSize, number> = {
  xs: 10,
  sm: 12,
  md: 13,
};

const DOT_SIZE: Record<StatusPillSize, string> = {
  xs: 'w-1 h-1',
  sm: 'w-1.5 h-1.5',
  md: 'w-1.5 h-1.5',
};

export function StatusPill({
  tone = 'warm',
  variant = 'soft',
  size = 'sm',
  icon: Icon,
  dot,
  live,
  className,
  children,
}: StatusPillProps) {
  if (variant === 'dot') {
    return (
      <span
        aria-live={live}
        className={cn(
          'inline-flex items-center font-medium text-warm-700',
          SIZE_CLASSES[size],
          'px-0',
          className,
        )}
      >
        <span className={cn('rounded-full', DOT_SIZE[size], TONE_DOT[tone])} aria-hidden="true" />
        {children}
      </span>
    );
  }

  return (
    <span
      aria-live={live}
      className={cn(
        'inline-flex items-center rounded-full font-semibold tracking-wide whitespace-nowrap',
        SIZE_CLASSES[size],
        variant === 'soft' ? cn('ring-1 ring-inset', TONE_SOFT[tone]) : TONE_SOLID[tone],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={cn(
            'rounded-full',
            DOT_SIZE[size],
            variant === 'solid' ? 'bg-white/85' : TONE_DOT[tone],
          )}
        />
      )}
      {Icon && <Icon size={ICON_SIZE[size]} />}
      {children}
    </span>
  );
}
