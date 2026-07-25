'use client';

/**
 * ============================================================================
 * Fairway · Segmented
 * ----------------------------------------------------------------------------
 * The quiet, compact segment control — replaces GolfTabBar / ad-hoc
 * Button-as-tab strips. Single-select, roving-focus, keyboard-driven (engine:
 * @radix-ui/react-toggle-group, `type="single"`).
 *
 * Design (DESIGN-SYSTEM §4.3 #5): the TRACK stays matte (`bg-surface-sunken`)
 * but reads as genuinely SUNKEN — a warm inset shadow (`TRACK_SUNKEN_SHADOW`,
 * same low-alpha oklch hue-60 language as `--fw-shadow-*`) gives the well real
 * depth instead of a flat tint. The moving selection pill sits UP off that
 * well: a solid warm `bg-surface` pill with the outer `--fw-shadow-soft`
 * elevation PLUS an inset top highlight (`PILL_SHADOW`, the same "lit from
 * above" recipe `--fw-shadow-card` uses for light matte cards) for a slight
 * brightness lift, a hairline border, and a springy (slightly underdamped)
 * framer-motion `layoutId` glide between segments. Reduced-motion disables
 * the slide (pill snaps, no spring).
 *
 * States: each segment has hover (text warms) + focus-visible (green ring) +
 * active/selected (sits on the moving pill, text → primary + semibold for a
 * crisper active/inactive hierarchy). Sizes sm | md | lg — all comfortable hit
 * targets (44px on coarse pointers). `lg` exists for primary, high-frequency
 * mobile toggles (e.g. the calendar view switcher) that must clear the WCAG
 * 2.2 AA (2.5.8) 44px touch target.
 * ========================================================================== */

import { type ReactNode, useEffect, useId, useRef } from 'react';
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

/**
 * The sunken track's inset shadow — a warm, low-alpha two-layer inset (same
 * hue-60 oklch language as `--fw-shadow-flat`/`--fw-shadow-soft` in
 * design-tokens.css) so the well reads as genuinely carved into the surface,
 * not just a flat tint swap. Inline (not a new Tailwind shadow key) so the
 * track and the pill's brightness-lift below can share this file without a
 * design-tokens.css change.
 */
const TRACK_SUNKEN_SHADOW =
  'inset 0 1px 3px oklch(0.18 0.01 60 / 0.10), inset 0 1px 0 oklch(0.18 0.01 60 / 0.04)';

/**
 * The moving pill's shadow: the existing `--fw-shadow-soft` elevation (the
 * exact recipe the `shadow-soft` utility already applied) PLUS an inset warm-
 * white top highlight — the same "lit from above" tell `--fw-shadow-card`
 * uses for light matte cards — for the requested slight brightness lift.
 */
const PILL_SHADOW = 'inset 0 1px 0 oklch(1 0 0 / 0.6), var(--fw-shadow-soft)';

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

  // Keep the SELECTED segment in view.
  //
  // The track scrolls horizontally once the options outgrow it, but nothing
  // scrolled the active one into view — at 320px the "Window" control's track
  // ended after "Season" while "All" was selected and sitting 34px past the
  // right edge, so the control looked like it had no selection at all
  // (audit 2026-07-24, H7).
  const trackRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (track.scrollWidth <= track.clientWidth) return;
    const active = track.querySelector<HTMLElement>('[data-state="on"]');
    active?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [value]);

  return (
    <ToggleGroup.Root
      // Composed: useScrollFade owns a callback ref (its own docs say to
      // compose it), and the selected-segment effect below needs the node too.
      ref={(node) => {
        scrollFadeRef(node);
        trackRef.current = node;
      }}
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
      style={{ ...fadeStyle, boxShadow: TRACK_SUNKEN_SHADOW }}
      className={cn(
        'inline-flex max-w-full items-center overflow-x-auto rounded-fw-sm bg-surface-sunken',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        'border border-border-subtle',
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
              'relative isolate inline-flex items-center justify-center rounded-md',
              'font-fw-sans',
              fwTransition,
              fwFocusRing,
              'disabled:opacity-40 disabled:pointer-events-none',
              sizeItem[size],
              fullWidth ? 'flex-1' : 'flex-shrink-0',
              // Crisper active/inactive hierarchy: the selected label sits on
              // the elevated pill and reads semibold + primary; everything
              // else stays medium-weight and secondary until hovered.
              selected
                ? 'font-semibold text-text-primary'
                : 'font-medium text-text-secondary hover:text-text-primary',
            )}
          >
            {selected && (
              <motion.span
                // The moving selection pill — matte warm surface, elevated off
                // the sunken track via PILL_SHADOW (soft outer shadow + inset
                // brightness-lift highlight) + a hairline border.
                layoutId={reduceMotion ? undefined : `fw-segment-pill-${pillId}`}
                aria-hidden="true"
                className="absolute inset-0 -z-10 rounded-md bg-surface border border-border-subtle"
                style={{ boxShadow: PILL_SHADOW }}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    // Slightly underdamped (ζ≈0.85) — a real, physical settle
                    // with the faintest single overshoot, not a dead-flat snap.
                    : { type: 'spring', stiffness: 450, damping: 28, mass: 0.6 }
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
