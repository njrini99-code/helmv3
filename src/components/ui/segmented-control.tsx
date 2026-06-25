'use client';

/**
 * SegmentedControl — a semantically-correct segmented toggle for small,
 * mutually-exclusive option sets (page tabs, stat-type filters, view
 * switchers). It renders a `role="tablist"` of plain `<button>`s inside a
 * single rail, so exactly one segment reads as selected.
 *
 * Why this exists (Wave qa-screens fix): several baseball surfaces were
 * abusing the product CTA `<Button variant="primary">` as a tab toggle and
 * trying to express the inactive state purely through an appended className.
 * Because `cn()` uses tailwind-merge, the primary variant's `bg-primary-600`
 * survived on inactive segments (no competing `bg-*` to strip it), so every
 * segment painted solid green and the control read as broken. The primary
 * Button also bakes in a hover-lift, shadow, click ripple, and native haptic
 * that leaked onto non-CTA tab/day surfaces. This primitive owns the correct
 * affordance: one highlighted segment, a restrained inactive state, and no
 * CTA behaviours.
 *
 * Visual vocabulary: glass rail (matches the Command Center surface), a green
 * `bg-primary-600` pill on the ACTIVE segment only, warm text + subtle warm
 * hover on inactive segments. This deliberately differs from the
 * white-pill-on-cream ToggleGroup so the coach's primary landing screen keeps
 * its solid-green active affordance — but now correctly, on exactly one tab.
 */

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Visual density. `md` (default) for page tabs, `sm` for inline filters. */
  size?: 'sm' | 'md';
  /** Accessible label for the tablist (screen readers). */
  'aria-label'?: string;
  className?: string;
}

const sizeStyles = {
  md: {
    rail: 'p-1 gap-1 rounded-2xl',
    segment: 'gap-2 px-5 py-2 rounded-xl text-sm min-h-[40px]',
  },
  sm: {
    rail: 'p-0.5 gap-0.5 rounded-xl',
    segment: 'gap-1 px-3 py-1 rounded-lg text-xs min-h-[32px]',
  },
} as const;

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ...props
}: SegmentedControlProps<T>) {
  const s = sizeStyles[size];
  return (
    <div
      role="tablist"
      aria-label={props['aria-label']}
      className={cn(
        'inline-flex bg-cream-100/75 backdrop-blur-sm border border-warm-200/45 shadow-sm',
        s.rail,
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) void triggerHaptic('light');
              onChange(opt.value);
            }}
            className={cn(
              'inline-flex items-center justify-center font-medium whitespace-nowrap',
              'transition-[color,background-color,box-shadow] duration-200 ease-out',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-cream-50',
              s.segment,
              active
                ? 'bg-primary-600 text-white shadow-sm'
                : 'text-warm-600 hover:text-warm-900 hover:bg-warm-100/70',
            )}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

SegmentedControl.displayName = 'SegmentedControl';

/**
 * A single pressable surface for clickable tiles/rows that must NOT carry the
 * product CTA affordances (hover-lift / ripple / haptic) of `<Button>`. This is
 * the sanctioned clickable surface for things that are conceptually a card or a
 * cell, not a call-to-action. It ships a keyboard focus-visible ring and a
 * restrained active press so it stays operable without a mouse.
 *
 * Prefer `<Card variant="interactive">` when the surface is literally a card;
 * use this when you need a bare pressable (e.g. a compact calendar day cell)
 * without card chrome.
 */
export const Pressable = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(function Pressable({ className, type = 'button', ...props }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'transition-[background-color,box-shadow,color] duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50',
        'active:duration-75',
        className,
      )}
      {...props}
    />
  );
});
