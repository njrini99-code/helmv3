'use client';

/**
 * ============================================================================
 * GradeDots — five-square round-grade indicator (mockup §.gradedots)
 * ----------------------------------------------------------------------------
 * `score` (0–5) dots are lit, the rest dim. Renders for the dark green spine
 * / filmstrip surface by default (`onGreen`, lit = accent-400, unlit = a
 * translucent-white inline overlay — mirroring StandingTrack's on-dark
 * convention, never `bg-white/N`) or for a cream surface (`onGreen={false}`,
 * lit = accent-500, unlit = surface-sunken).
 * ========================================================================== */

import { cn } from '@/lib/utils';
import type { GradeDotsProps } from './types';

/** Off-state dot on the dark green spine/filmstrip surface. Not `bg-white/N`
 *  (banned outside src/components/ui) — an inline oklch overlay instead. */
const OFF_ON_GREEN = 'oklch(1 0 0 / 0.14)';

export interface GradeDotsComponentProps extends GradeDotsProps {
  /** Render for the dark green surface (default `true`) vs. a cream surface. */
  onGreen?: boolean;
}

export function GradeDots({ score, label, onGreen = true }: GradeDotsComponentProps) {
  return (
    <div data-slot="grade-dots" className="mt-3.5 flex items-center gap-1">
      {Array.from({ length: 5 }, (_, i) => {
        const on = i < score;
        return (
          <i
            key={i}
            aria-hidden="true"
            className={cn(
              'block h-[13px] w-[13px] rounded-fw-sm',
              on && (onGreen ? 'bg-accent-400' : 'bg-accent-500'),
              !on && !onGreen && 'bg-surface-sunken',
            )}
            style={!on && onGreen ? { background: OFF_ON_GREEN } : undefined}
          />
        );
      })}
      <span
        className={cn(
          'ml-1.5 font-fw-mono text-eyebrow uppercase tracking-[0.07em]',
          onGreen ? 'text-accent-200' : 'text-text-tertiary',
        )}
      >
        {label}
      </span>
    </div>
  );
}
