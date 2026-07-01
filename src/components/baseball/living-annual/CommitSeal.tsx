'use client';

/**
 * CommitSeal — the ceremony object (spec §6 #2, §7, §9 north-star #2).
 *
 * An oxblood (`--pursuit-deep`) embossed seal that presses down with a STAMP
 * PRESS (fast down → settle + overshoot) over an ink-bleed bloom — the physical
 * payoff of landing a commit or extending an offer. `label` is the ceremony
 * word (`COMMITTED`, `OFFER`).
 *
 * The `packet` variant is the wax-style Helm seal used when a Scout Packet
 * tear-sheet is minted (a monogram `H` over an issue label); `PacketSeal` is a
 * thin convenience wrapper for it. Reduced motion → the seal is shown pressed,
 * without the press or bleed animation.
 */
import { m, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { inkBleed, stampPress } from './motion';

export interface CommitSealProps {
  /** Ceremony word (defaults by variant: commit → `COMMITTED`, packet → `ISSUED`). */
  label?: string;
  /** `commit` = worded seal; `packet` = wax-style Helm monogram seal. */
  variant?: 'commit' | 'packet';
  size?: 'sm' | 'md' | 'lg';
  /** Override the tilt in degrees (default -1.5° for hand-stamped character). */
  rotate?: number;
  className?: string;
}

const SIZE: Record<'sm' | 'md' | 'lg', { box: string; label: string; mono: string }> = {
  sm: { box: 'h-16 w-16', label: 'text-[8px]', mono: 'text-lg' },
  md: { box: 'h-24 w-24', label: 'text-[10px]', mono: 'text-3xl' },
  lg: { box: 'h-32 w-32', label: 'text-xs', mono: 'text-5xl' },
};

/** Oxblood emboss — inset shade + inset highlight + a tight contact shadow. */
const EMBOSS =
  'shadow-[inset_0_2px_4px_rgba(0,0,0,0.35),inset_0_-1px_2px_rgba(255,255,255,0.12),0_2px_6px_rgba(0,0,0,0.22)]';

export function CommitSeal({ label, variant = 'commit', size = 'md', rotate = -1.5, className }: CommitSealProps) {
  const reduced = useReducedMotion() ?? false;
  const dims = SIZE[size];
  const text = label ?? (variant === 'packet' ? 'ISSUED' : 'COMMITTED');

  return (
    <div className={cn('relative inline-grid place-items-center', className)}>
      {/* Ink-bleed bloom behind the seal */}
      <m.span
        aria-hidden
        initial="hidden"
        animate="visible"
        variants={inkBleed(reduced)}
        className={cn('pointer-events-none absolute rounded-full blur-md', dims.box)}
        style={{ background: 'var(--pursuit-deep)' }}
      />

      <m.div
        initial="hidden"
        animate="visible"
        variants={stampPress(reduced)}
        style={{ rotate }}
        className={cn(
          'relative inline-grid select-none place-items-center rounded-full text-[color:var(--paper)]',
          dims.box,
          EMBOSS,
        )}
      >
        <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: 'var(--pursuit-deep)' }} />
        {/* Inner ceremony ring */}
        <span aria-hidden className="absolute inset-[12%] rounded-full border border-[rgba(255,248,233,0.28)]" />

        {variant === 'packet' ? (
          <span className="relative flex flex-col items-center leading-none">
            <span className={cn('font-serif font-medium', dims.mono)}>H</span>
            <span className={cn('mt-1 uppercase tracking-[0.16em] opacity-90', dims.label)}>{text}</span>
          </span>
        ) : (
          <span
            className={cn('relative px-2 text-center font-serif font-medium uppercase leading-tight tracking-[0.08em]', dims.label)}
          >
            {text}
          </span>
        )}
      </m.div>
    </div>
  );
}

/** Wax-style Helm seal for minted Scout Packet tear-sheets. */
export function PacketSeal(props: Omit<CommitSealProps, 'variant'>) {
  return <CommitSeal {...props} variant="packet" />;
}
