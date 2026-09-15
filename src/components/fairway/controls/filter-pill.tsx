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
import Link from 'next/link';
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

// WCAG 2.2 AA (2.5.8) / DoD-required >=44px touch target on coarse pointers
// (touch) — both sizes sat under 44px (30px / 36px) for the desktop-tuned
// visual height, so the min-height only expands under `(pointer: coarse)`.
// Mirrors the identical fix already applied to Button `sm` and Segmented
// `sm`/`md` (see `button.tsx`, `segmented.tsx`) — the pill's visual height
// on a mouse-driven desktop is unchanged.
const sizeStyles: Record<'sm' | 'md', string> = {
  sm: 'min-h-[30px] [@media(pointer:coarse)]:min-h-[44px] px-3 text-[12px] gap-1.5',
  md: 'min-h-[36px] [@media(pointer:coarse)]:min-h-[44px] px-3.5 text-[13px] gap-1.5',
};

/** The pill's visuals, shared by the <button> and <a> forms below. */
function pillClassName(selected: boolean, size: 'sm' | 'md', className?: string): string {
  return cn(
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
  );
}

function PillContents({
  selected,
  showCheck,
  icon,
  count,
  children,
}: {
  selected: boolean;
  showCheck: boolean;
  icon?: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  return (
    <>
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
            'ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1 tabular-nums font-fw-mono text-eyebrow',
            selected ? 'bg-accent-500/15 text-accent-700' : 'bg-surface-sunken text-text-tertiary',
          )}
        >
          {count}
        </span>
      )}
    </>
  );
}

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
      className={pillClassName(selected, size, className)}
      {...props}
    >
      <PillContents selected={selected} showCheck={showCheck} icon={icon} count={count}>
        {children}
      </PillContents>
    </button>
  );
});

/**
 * The same pill as a real link.
 *
 * A filter that changes the URL IS navigation, and the Bridge's filter chips
 * were `<button onClick={() => router.push(href)}>` — which cannot be
 * middle-clicked into a new tab, cmd-clicked, copied with "copy link
 * address", or previewed in the status bar on hover, and which needs a
 * `'use client'` boundary and a router hook to do what an `<a href>` does for
 * free. On an admin console the whole point of a filtered view is that you can
 * hand someone the URL.
 *
 * `aria-current="true"` rather than `aria-pressed`: a link is not a toggle,
 * and the selected chip is the current view of this list.
 */
export function FilterPillLink({
  href,
  selected = false,
  size = 'md',
  icon,
  count,
  showCheck = true,
  className,
  children,
}: {
  href: string;
  selected?: boolean;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  count?: number;
  showCheck?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={selected ? 'true' : undefined}
      data-slot="fw-filter-pill"
      data-selected={selected || undefined}
      className={pillClassName(selected, size, className)}
    >
      <PillContents selected={selected} showCheck={showCheck} icon={icon} count={count}>
        {children}
      </PillContents>
    </Link>
  );
}
