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
 *
 * The moving pill also carries a small green "on" mark (owner request,
 * 2026-07-25) — see `SegmentedPill` below.
 *
 * SHARED VISUAL RECIPE (exported): `TRACK_SUNKEN_SHADOW`, `SegmentedPill`,
 * `segmentedTrackClassName`, and `segmentedItemClassName` are exported so
 * `ViewSwitch` (`src/components/golf/coachhelm/triage/ViewSwitch.tsx`) can
 * render the IDENTICAL track/pill/dot treatment on `next/link` anchors
 * instead of Radix `ToggleGroup.Item`s. That control is deliberately NOT a
 * `Segmented` instance: Radix's `Toggle` fires its internal `onPressedChange`
 * (→ `onValueChange`) for ANY unmodified-or-not click that isn't
 * `event.defaultPrevented`, with no modifier-key awareness and no consumer
 * override point (`onPressedChange` is hard-wired in `ToggleGroupItemImpl`,
 * spread AFTER the consumer's props). `ViewSwitch`'s hrefs are real
 * navigation — a cmd/ctrl/shift/middle-click must open the target view in a
 * new tab and leave the CURRENT tab's `view` state untouched. Gating that
 * requires calling `preventDefault()` only for a plain primary click, but
 * Radix only skips its internal activation when `defaultPrevented` is
 * already true — so any click that must NOT `preventDefault()` (a modified
 * click, to let the browser's native new-tab behavior proceed) also can't be
 * stopped from firing Radix's activation, which would incorrectly mutate the
 * current tab's `view`. Wrapping the anchor via `asChild` would also swap
 * the item's exposed role to Radix's `role="radio"` + `aria-checked`
 * (`ToggleGroupItemImpl`'s `singleProps`) on an element whose real behavior
 * is "navigate to a URL" — a widget/document semantic mismatch (confirmed:
 * `TriageDesk.navigation.test.tsx` already asserts
 * `getByRole('link', { name: 'Players' })`, i.e. these ARE links, not
 * radios). So the two components share styling/motion, never the Radix
 * primitive.
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

/**
 * The track's full class list — exported so `ViewSwitch` can build the exact
 * same sunken well (radius, padding, hidden native scrollbar) around its
 * `next/link` anchors instead of hand-copying the string. Pair with a `style`
 * spreading `TRACK_SUNKEN_SHADOW` (and, for a scrolling track, `fadeStyle`
 * from `useScrollFade`) — this function only owns the Tailwind classes.
 */
export function segmentedTrackClassName(
  size: 'sm' | 'md' | 'lg' = 'md',
  fullWidth = false,
  className?: string,
): string {
  return cn(
    'inline-flex max-w-full items-center overflow-x-auto rounded-fw-sm bg-surface-sunken',
    '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
    'border border-border-subtle',
    sizeTrack[size],
    fullWidth && 'flex w-full',
    className,
  );
}

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
 * A single segment item's full class list (minus the `key`/`value`/handler
 * props) — exported so `ViewSwitch` renders byte-identical sizing, transition,
 * focus ring, and selected/unselected typography on its anchors. `relative
 * isolate` is required: it's what lets the pill's `-z-10` sit correctly
 * behind this item's own label instead of behind the whole track.
 */
export function segmentedItemClassName(
  selected: boolean,
  size: 'sm' | 'md' | 'lg' = 'md',
  fullWidth = false,
): string {
  return cn(
    'relative isolate inline-flex items-center justify-center rounded-md',
    'font-fw-sans',
    fwTransition,
    fwFocusRing,
    'disabled:opacity-40 disabled:pointer-events-none',
    sizeItem[size],
    fullWidth ? 'flex-1' : 'flex-shrink-0',
    // Crisper active/inactive hierarchy: the selected label sits on the
    // elevated pill and reads semibold + primary; everything else stays
    // medium-weight and secondary until hovered.
    selected
      ? 'font-semibold text-text-primary'
      : 'font-medium text-text-secondary hover:text-text-primary',
  );
}

/**
 * The sunken track's inset shadow — a warm, low-alpha two-layer inset (same
 * hue-60 oklch language as `--fw-shadow-flat`/`--fw-shadow-soft` in
 * design-tokens.css) so the well reads as genuinely carved into the surface,
 * not just a flat tint swap. Inline (not a new Tailwind shadow key) so the
 * track and the pill's brightness-lift below can share this file without a
 * design-tokens.css change. Exported so `ViewSwitch` carves the exact same
 * well.
 */
export const TRACK_SUNKEN_SHADOW =
  'inset 0 1px 3px oklch(0.18 0.01 60 / 0.10), inset 0 1px 0 oklch(0.18 0.01 60 / 0.04)';

/**
 * The moving pill's shadow: the existing `--fw-shadow-soft` elevation (the
 * exact recipe the `shadow-soft` utility already applied) PLUS an inset warm-
 * white top highlight — the same "lit from above" tell `--fw-shadow-card`
 * uses for light matte cards — for the requested slight brightness lift.
 * Not exported: only `SegmentedPill` below needs it, and exporting the
 * component is what gives `ViewSwitch` the shared implementation (not just
 * the shadow string).
 */
const PILL_SHADOW = 'inset 0 1px 0 oklch(1 0 0 / 0.6), var(--fw-shadow-soft)';

export interface SegmentedPillProps {
  /**
   * Unique `layoutId` for the framer-motion shared-layout glide between
   * segments. `undefined` disables the animated travel (reduced motion: the
   * pill simply appears at its new position, no magic-move).
   */
  layoutId?: string;
  /** The consumer's resolved reduced-motion flag (never pass the raw,
   *  possibly-`null` hook value — resolve it first). */
  reduceMotion: boolean;
}

/**
 * The moving selection pill — the "little buckle" depth (warm `bg-surface`
 * fill lifted off the sunken track via `PILL_SHADOW` + a hairline border)
 * PLUS the green "on" mark the owner asked for. Shared by `Segmented`
 * (Radix `ToggleGroup.Item`) and `ViewSwitch` (`next/link` anchors) — see
 * the file docblock for why `ViewSwitch` can't just become a `Segmented`
 * instance. Purely decorative (`aria-hidden`, `absolute inset-0 -z-10`): it
 * never participates in the host item's box model, so it can never cause a
 * sibling to reflow when the active segment changes.
 */
export function SegmentedPill({ layoutId, reduceMotion }: SegmentedPillProps) {
  return (
    <motion.span
      layoutId={layoutId}
      aria-hidden="true"
      className="absolute inset-0 -z-10 rounded-md border border-border-subtle bg-surface"
      style={{ boxShadow: PILL_SHADOW }}
      transition={
        reduceMotion
          ? { duration: 0 }
          : // Slightly underdamped (ζ≈0.85) — a real, physical settle with
            // the faintest single overshoot, not a dead-flat snap.
            { type: 'spring', stiffness: 450, damping: 28, mass: 0.6 }
      }
    >
      {/*
       * The "lil toggle" green mark (owner request, 2026-07-25): a small
       * decorative dot — the repo's established idiom (StatusPill's leading
       * dot; NEVER a side-rail/bar, a standing project rule) — not the
       * label's text color, since `accent-500` fails WCAG AA as text
       * (~2.67:1; see `fairway_accent_green_fails_aa`). `accent-600` is
       * reused here because `fwFocusRing` (`./_internal.ts`) already proved
       * it clears the WCAG 1.4.11 non-text 3:1 minimum against
       * canvas/surface/sunken/elevated in BOTH themes — a decorative dot is
       * exempt from TEXT contrast rules but still must clear that non-text
       * bar. `ring-1 ring-surface` is a solid (not alpha) ring — never
       * `bg-fw-accent/30` or similar `/NN` alpha shorthand on a CSS-
       * variable-backed color, which silently compiles to nothing in this
       * repo's Tailwind config. Nested INSIDE this decorative pill (not the
       * item's flex flow), it's mounted/unmounted with the pill and is
       * carried along by the SAME `layoutId` glide — it can never lag
       * behind the pill or animate on its own timeline, and it can never
       * change the item's width the way inserting it into the label row
       * would have.
       */}
      <span
        aria-hidden="true"
        className="absolute right-1 top-1 h-[5px] w-[5px] rounded-full bg-accent-600 ring-1 ring-surface"
      />
    </motion.span>
  );
}

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
      className={segmentedTrackClassName(size, fullWidth, className)}
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
            // No min-w-0 here (deliberately): a flex item's default
            // `min-width: auto` floors it at its own content size, which is
            // what lets the row overflow into the track's `overflow-x-auto`
            // + useScrollFade affordance above instead of every segment
            // shrinking to an illegible sliver (the bug this comment
            // replaces). `fullWidth` still grows items to share the row
            // evenly when there's slack, via flex-1; when there isn't
            // enough room even for that, the same content-size floor kicks
            // in and the row scrolls, same as the non-fullWidth case.
            className={segmentedItemClassName(selected, size, fullWidth)}
          >
            {selected && (
              <SegmentedPill
                layoutId={reduceMotion ? undefined : `fw-segment-pill-${pillId}`}
                reduceMotion={Boolean(reduceMotion)}
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
