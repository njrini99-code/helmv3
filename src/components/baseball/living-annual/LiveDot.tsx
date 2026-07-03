'use client';

/**
 * LiveDot — the small breathing dot that marks genuinely-live state (spec §4.4
 * "LIVE presence").
 *
 * A 2s pulse on a small dot, used SPARINGLY — a live game, an incoming sync, a
 * value crossing a threshold — never decoration. Green (`team`) by default;
 * `sodium` marks a PR / live-value moment. Under `prefers-reduced-motion` the
 * dot renders static (no pulse), per the motion contract. Pass `label` and a
 * small-caps lane-ink label sits beside it (`LIVE`, `STANDING BY`, `SYNCING`).
 */
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface LiveDotProps {
  /** Dot ink: `team` green (default) or `sodium` for a live/PR moment. */
  ink?: 'team' | 'sodium';
  /** Optional small-caps label rendered beside the dot. */
  label?: string;
  className?: string;
}

const INK: Record<NonNullable<LiveDotProps['ink']>, { text: string; varRef: string }> = {
  team: { text: 'text-grade-plus', varRef: 'var(--grade-plus)' },
  sodium: { text: 'text-sodium', varRef: 'var(--sodium)' },
};

export function LiveDot({ ink = 'team', label, className }: LiveDotProps) {
  const reduced = useReducedMotion() ?? false;
  const { text, varRef } = INK[ink];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5',
        label && 'text-eyebrow font-semibold uppercase leading-none tracking-[0.14em]',
        text,
        className,
      )}
    >
      <m.span
        aria-hidden
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: varRef }}
        animate={reduced ? undefined : { opacity: [1, 0.3, 1], scale: [1, 0.82, 1] }}
        transition={reduced ? undefined : { duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
      {label ? <span>{label}</span> : null}
    </span>
  );
}
