'use client';

/**
 * ============================================================================
 * Fairway · FilterPill
 * ----------------------------------------------------------------------------
 * An interactive, toggleable filter pill (e.g. the quiet filter row on a
 * Toolbar). A real <button> with `aria-pressed` — selected = accent-tinted
 * with a check; unselected = matte surface hairline. Every state covered:
 * hover (warm tint), focus-visible (green ring), active (translate-y), selected,
 * disabled.
 *
 * Optional trailing `count` (tabular). Sizes sm | md (both >=24px target).
 * ========================================================================== */

import { type ButtonHTMLAttributes, type ReactNode, forwardRef } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fwDisabled, fwFocusRing, fwTransition } from './_internal';

export interface FilterPillProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  selected?: boolean;
  size?: 'sm' | 'md';
  /** Leading icon (e.g. a lucide glyph). Hidden while showing the selected check. */
  icon?: ReactNode;
  /** Optional trailing count badge (rendered tabular). */
  count?: number;
  /** Show the check glyph when selected (default true). */
  showCheck?: boolean;
  children: ReactNode;
}

const sizeStyles: Record<'sm' | 'md', string> = {
  sm: 'min-h-[30px] px-3 text-caption gap-1.5',
  md: 'min-h-[36px] px-3.5 text-body-sm gap-1.5',
};

export const FilterPill = forwardRef<HTMLButtonElement, FilterPillProps>(function FilterPill(
  { className, selected = false, size = 'md', icon, count, showCheck = true, disabled, children, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-pressed={selected}
      data-slot="fw-filter-pill"
      data-selected={selected || undefined}
      disabled={disabled}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-full border font-fw-sans font-medium',
        'whitespace-nowrap',
        fwTransition,
        fwFocusRing,
        fwDisabled,
        'active:translate-y-[0.5px] motion-reduce:active:translate-y-0',
        sizeStyles[size],
        selected
          ? 'border-accent-500 bg-accent-50 text-accent-700 hover:bg-accent-100'
          : 'border-border-subtle bg-surface text-text-secondary hover:border-border-strong hover:bg-surface-tint hover:text-text-primary',
        className,
      )}
      {...props}
    >
      {selected && showCheck ? (
        // Selected check springs in with a soft overshoot (scale 0 → 1.2 → 1) on
        // the shared bounce easing. Pure transform — layout unchanged; motion-safe
        // gates reduced motion. strokeWidth stays 2.5: an intentional bold glyph so
        // the 14px selected-state check stays legible inside the tinted pill.
        <Check
          className="h-3.5 w-3.5 flex-shrink-0 origin-center motion-safe:animate-check-bounce"
          strokeWidth={2.5}
          aria-hidden="true"
        />
      ) : (
        icon && <span className="flex-shrink-0 [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>
      )}
      <span>{children}</span>
      {typeof count === 'number' && (
        <span
          className={cn(
            'ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 tabular-nums font-fw-mono text-caption',
            selected ? 'bg-accent-500/15 text-accent-700' : 'bg-surface-sunken text-text-tertiary',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
});
