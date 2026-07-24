'use client';

/**
 * ============================================================================
 * Fairway · Segmented
 * ----------------------------------------------------------------------------
 * The quiet, compact segment control — replaces GolfTabBar / ad-hoc
 * Button-as-tab strips. Single-select, roving-focus, keyboard-driven (engine:
 * @radix-ui/react-toggle-group, `type="single"`).
 *
 * Design (DESIGN-SYSTEM §4.3 #5): the TRACK stays matte (`bg-surface-sunken`),
 * and the moving selection pill may carry a *whisper* of glass — here a solid
 * warm `bg-surface` pill with `shadow-soft` that slides between segments via
 * framer-motion `layoutId`. Reduced-motion disables the slide (pill snaps).
 *
 * States: each segment has hover (text warms) + focus-visible (green ring) +
 * active/selected (sits on the moving pill, text → primary). Sizes sm | md | lg.
 * `lg` exists for primary, high-frequency mobile toggles (e.g. the calendar
 * view switcher) that must clear the WCAG 2.2 AA (2.5.8) 44px touch target.
 * ========================================================================== */

import { type ReactNode, useId } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { fwFocusRing, fwTransition } from './_internal';
import { fwHaptic } from '@/lib/fairway/haptics';
import { useScrollFade } from '@/lib/fairway/use-scroll-fade';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  /** Optional leading icon (e.g. a lucide glyph). */
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedProps<T extends string = string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  /**
   * sm | md (default) | lg. Use `lg` for a primary mobile control that must
   * meet the 44px touch-target minimum (WCAG 2.2 AA 2.5.8).
   */
  size?: 'sm' | 'md' | 'lg';
  /** Stretch each segment to share the row equally. */
  fullWidth?: boolean;
  /** Accessible name for the group (maps to aria-label on the toggle group). */
  'aria-label'?: string;
  className?: string;
}

const sizeTrack: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'p-0.5 gap-0.5',
  md: 'p-1 gap-1',
  lg: 'p-1 gap-1',
};

const sizeItem: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'min-h-[30px] [@media(pointer:coarse)]:min-h-[44px] px-3 text-[13px] leading-4 gap-1.5',
  // Dense (36px) on fine pointers, but expands to the WCAG 2.2 AA 2.5.8 / DoD
  // 44px touch target on coarse pointers (touch) — mirrors the Button `sm`
  // pattern so the toolbar stays calm on desktop yet tappable on mobile.
  md: 'min-h-[36px] [@media(pointer:coarse)]:min-h-[44px] px-4 text-[13px] leading-4 gap-1.5',
  // 44px touch target (WCAG 2.2 AA 2.5.8) — the item itself is the hit area.
  lg: 'min-h-[44px] px-4 text-[13px] leading-4 gap-1.5',
};

export function Segmented<T extends string = string>({
  options,
  value,
  onValueChange,
  size = 'md',
  fullWidth = false,
  className,
  ...aria
}: SegmentedProps<T>) {
  const reduceMotion = useReducedMotion();
  // Unique layoutId so multiple Segmented instances on one page don't share a pill.
  const pillId = useId();
  // Graceful narrow-screen behavior: when the segments' intrinsic width
  // exceeds the available track width (e.g. a 4-option switcher on a 320px
  // phone), the track scrolls internally instead of bleeding past its parent
  // (previously silently clipped by the app's mobile `overflow-x: clip`
  // guard — see globals.css). `fadeStyle` is `{}` when nothing overflows, so
  // desktop rendering, where every segment already fits, is unaffected.
  const { ref: scrollFadeRef, fadeStyle } = useScrollFade<HTMLDivElement>('x');

  return (
    <ToggleGroup.Root
      ref={scrollFadeRef}
      type="single"
      value={value}
      // Radix passes "" when the active item is toggled off; ignore that to keep
      // this a strict single-select (always one segment selected).
      onValueChange={(next) => {
        if (next) {
          fwHaptic('selection'); // the iOS segment "tick" (no-op off native)
          onValueChange(next as T);
        }
      }}
      aria-label={aria['aria-label']}
      data-slot="fw-segmented"
      style={fadeStyle}
      className={cn(
        'inline-flex max-w-full items-center overflow-x-auto rounded-fw-md bg-surface-sunken',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        'border border-border-subtle [box-shadow:inset_0_1px_2px_var(--fw-color-border-subtle)]',
        sizeTrack[size],
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <ToggleGroup.Item
            key={opt.value}
            value={opt.value}
            disabled={opt.disabled}
            aria-label={typeof opt.label === 'string' ? opt.label : undefined}
            data-slot="fw-segment"
            className={cn(
              // No min-w-0 here (deliberately): a flex item's default
              // `min-width: auto` floors it at its own content size, which is
              // what lets the row overflow into the track's `overflow-x-auto`
              // + useScrollFade affordance above instead of every segment
              // shrinking to an illegible sliver (the bug this comment
              // replaces). `fullWidth` still grows items to share the row
              // evenly when there's slack, via flex-1; when there isn't
              // enough room even for that, the same content-size floor kicks
              // in and the row scrolls, same as the non-fullWidth case.
              'relative isolate inline-flex items-center justify-center rounded-fw-sm',
              'font-fw-sans font-medium',
              fwTransition,
              fwFocusRing,
              'disabled:opacity-40 disabled:pointer-events-none',
              sizeItem[size],
              fullWidth ? 'flex-1' : 'flex-shrink-0',
              selected ? 'text-text-primary' : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {selected && (
              <motion.span
                // The moving selection pill (matte warm surface + soft shadow).
                layoutId={reduceMotion ? undefined : `fw-segment-pill-${pillId}`}
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-fw-sm border border-border-strong/60 bg-surface [box-shadow:var(--fw-shadow-card)]"
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 380, damping: 34, mass: 0.7 }
                }
              />
            )}
            {opt.icon && <span className="flex-shrink-0 [&_svg]:h-4 [&_svg]:w-4">{opt.icon}</span>}
            {/* No truncate: the label is what was being masked at 1 char wide.
                whitespace-nowrap keeps it on one line inside the fixed-height
                pill instead of wrapping now that the item can't shrink below
                its content. */}
            <span
              className="whitespace-nowrap"
              title={typeof opt.label === 'string' ? opt.label : undefined}
            >
              {opt.label}
            </span>
          </ToggleGroup.Item>
        );
      })}
    </ToggleGroup.Root>
  );
}
