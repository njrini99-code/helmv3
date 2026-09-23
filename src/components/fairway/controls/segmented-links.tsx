'use client';

/**
 * ============================================================================
 * Fairway · SegmentedLinks
 * ----------------------------------------------------------------------------
 * `Segmented` (`./segmented.tsx`) is THE tab-switcher for STATE — a Radix
 * `ToggleGroup` that calls `onValueChange`. It is the wrong primitive for any
 * control that changes the URL: Radix's `Toggle` fires its internal
 * `onPressedChange` for any unmodified click that isn't already
 * `defaultPrevented`, with no modifier-key awareness and no override point,
 * so it can never honor "cmd/ctrl/shift/middle-click opens the target in a
 * NEW tab and leaves the CURRENT view untouched" — a plain `<a>` gets that
 * behaviour for free, a Radix `ToggleGroup.Item` cannot be made to (see
 * `segmented.tsx`'s own docblock for the full mechanics). `role="tab"` is
 * also the wrong semantic here: these are links to different views of the
 * SAME page, which is exactly what `aria-current="page"` exists for, and
 * building a tablist out of plain navigation links is the WCAG 4.1.2 keyboard
 * trap this avoids by construction.
 *
 * `ViewSwitch` (`src/components/golf/coachhelm/triage/ViewSwitch.tsx`) and
 * `IncidentLensRail` (`src/app/admin/_components/IncidentLensRail.tsx`)
 * independently solved this same problem — one golf-facing, one admin-facing.
 * `SegmentedLinks` is that solved shape promoted to a Fairway export: the
 * identical sunken-track / elevated-pill recipe `Segmented` and `ViewSwitch`
 * already share (`TRACK_SUNKEN_SHADOW`, `segmentedTrackClassName`,
 * `segmentedItemClassName`, `SegmentedPill`), rendered on real `next/link`
 * anchors, plus the two things neither existing implementation needed on its
 * own: an optional per-option COUNT (tri-state — see below) and an
 * ACTIVE-OPTION description line. `IncidentLensRail` is now a thin wrapper
 * over this component; `ViewSwitch` is left as-is (golf scope, flagged as a
 * follow-up — CoachHelm resolves reduced motion through its own
 * `useReducedMotionGuard`, a different contract than this component's).
 *
 * STRUCTURE: `<nav aria-label>` → `<ul>` (the sunken track) → `<li>` → a real
 * `next/link` `<a aria-current="page">` — never `role="tab"`, never a
 * `<button>`. No `onClick` handler at all: a plain `<a>` already navigates on
 * a primary click and already lets a modified or middle click open a new tab
 * without touching the current page's state, which is exactly the contract
 * `ViewSwitch` has to hand-gate with `preventDefault()` because IT still owns
 * client-side `onSelect` state — `SegmentedLinks` has no such state to
 * protect, so doing nothing is the correct implementation, not an omission.
 *
 * COUNT IS THREE STATES, NOT A NUMBER-OR-FALSY:
 *   - `undefined` — this option carries no count concept. No count node
 *     renders at all.
 *   - `null`      — the count could not be read. Renders "—", NEVER "0" —
 *     "unknown is a state" is the load-bearing invariant this whole surface
 *     protects, and a dash where a real zero could be would be its own lie
 *     in the other direction.
 *   - `0`         — a real, known zero. Renders the digit "0"; the OPTION
 *     de-emphasises (`opacity-50`) unless it is the active one — a deep link
 *     into an empty option must still read as selected, never as disabled.
 * A shorthand `!count` check would wrongly conflate all three; every branch
 * below is explicit.
 *
 * EVERY OPTION ALWAYS RENDERS, even at count 0. An option that disappears
 * when its count hits zero makes the full vocabulary unlearnable — an
 * operator who has never seen it hold a number has no way to know it exists.
 *
 * MOTION: the moving pill only mounts on the active option and only carries a
 * `layoutId` (the framer-motion shared-layout glide) when `useReducedMotion()`
 * resolves non-true — reduced motion snaps instead of gliding. This mirrors
 * `Segmented`'s own resolution of that hook exactly (this file lives beside
 * it and shares its recipe), not the CoachHelm-specific
 * `useReducedMotionGuard` `ViewSwitch` uses.
 *
 * BUNDLE-SIZE NOTE: `SegmentedPill` imports `motion` (not the lazy `m`) from
 * `framer-motion` directly, the same as `Segmented` already does. A page
 * under `src/app/admin/**` that renders `SegmentedLinks` is therefore the
 * first place framer-motion enters the admin bundle for a triage visual
 * (admin's own convention up to now has been plain CSS `motion-safe:`
 * utilities — see `SystemOrbit.tsx`). `src/components/admin/motion-provider.tsx`
 * wraps `/admin` in `LazyMotion` with no `strict` prop, so a `motion.*`
 * component does not throw there and needs no further wiring — this is a
 * bundle-size/policy trade-off, not a correctness one. Flagged for whoever
 * reviews the first admin page that adopts this component.
 *
 * This also means the pill's `layoutId` glide does NOT depend on whether
 * that ancestor `LazyMotion` loaded `domAnimation` or `domMax`: `motion.*`
 * preloads framer-motion's full feature bundle (layout included) into the
 * shared global feature registry the instant `motion.span` is first
 * accessed, regardless of which feature set any ancestor `LazyMotion`
 * loaded — only the lazy `m.*` family is gated by that choice. See
 * `segmented-links.motion-integration.test.tsx` for the unmocked proof.
 * ========================================================================== */

import { useEffect, useId, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useScrollFade } from '@/lib/fairway/use-scroll-fade';
import {
  SegmentedPill,
  segmentedTrackClassName,
  segmentedItemClassName,
  TRACK_SUNKEN_SHADOW,
} from './segmented';

export interface SegmentedLinksOption<T extends string = string> {
  value: T;
  label: ReactNode;
  /** The URL for this option. Always a plain string — never a callback —
   *  so this component (and its `'use client'` boundary) can be handed
   *  props computed entirely server-side. */
  href: string;
  /** `undefined` = no count concept for this option (renders nothing);
   *  `null` = the count could not be read (renders "—", never "0");
   *  a number = a real, known count (0 renders the digit "0"). */
  count?: number | null;
}

export interface SegmentedLinksProps<T extends string = string> {
  options: ReadonlyArray<SegmentedLinksOption<T>>;
  value: T;
  /** Accessible name for the `<nav>`. */
  ariaLabel: string;
  size?: 'sm' | 'md' | 'lg';
  /** One line rendered under the track — always the ACTIVE option's own
   *  description, never a generic caption. Omit for a page with nothing to
   *  say there. */
  description?: ReactNode;
}

export function SegmentedLinks<T extends string = string>({
  options,
  value,
  ariaLabel,
  size = 'md',
  description,
}: SegmentedLinksProps<T>) {
  // Same resolution `Segmented` uses (this file's sibling): `null`/`undefined`
  // pre-hydration resolves to "not reduced" via `Boolean(...)` below, exactly
  // as `Segmented` already does for the identical pill.
  const reduceMotion = useReducedMotion();
  // Unique layoutId so this instance's pill never shares a magic-move with
  // any other Segmented/ViewSwitch/SegmentedLinks pill on the same page.
  const pillId = useId();
  // Graceful narrow-screen behavior, same as `Segmented`: the docblock above
  // notes `INCIDENT_LENSES` (9 options) will not fit at 390px, so the track
  // must scroll internally rather than bleed past its parent.
  const { ref: scrollFadeRef, fadeStyle } = useScrollFade<HTMLUListElement>('x');

  // Keep the ACTIVE option in view — ported from `Segmented`
  // (segmented.tsx:274-290), fixed there for the identical regression this
  // sibling component would otherwise reproduce: a deep link landing on a
  // lens/view near the end of a scrollable rail (e.g. `lens=stalled`) must
  // not leave the active pill sitting off-screen with no visible selection
  // (audit 2026-07-24, H7). Keyed on `value` (this component has no Radix
  // `data-state`, so the query target is the `aria-current="page"` anchor
  // this component already renders for the active option).
  const trackRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    if (track.scrollWidth <= track.clientWidth) return;
    const active = track.querySelector<HTMLElement>('[aria-current="page"]');
    active?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [value]);

  return (
    <nav aria-label={ariaLabel} className="min-w-0">
      <ul
        ref={(node) => {
          scrollFadeRef(node);
          trackRef.current = node;
        }}
        data-slot="fw-segmented"
        style={{ ...fadeStyle, boxShadow: TRACK_SUNKEN_SHADOW }}
        className={segmentedTrackClassName(size, false, 'snap-x snap-mandatory')}
      >
        {options.map((option) => {
          const active = option.value === value;
          const deEmphasise = option.count === 0 && !active;
          return (
            <li key={option.value} className="shrink-0 snap-start">
              <Link
                href={option.href}
                aria-current={active ? 'page' : undefined}
                data-slot="fw-segment"
                className={cn(segmentedItemClassName(active, size, false), deEmphasise && 'opacity-50')}
              >
                {active && (
                  <SegmentedPill
                    layoutId={reduceMotion ? undefined : `fw-segment-link-pill-${pillId}`}
                    reduceMotion={Boolean(reduceMotion)}
                  />
                )}
                <span className="whitespace-nowrap">{option.label}</span>
                {option.count !== undefined && (
                  <span className="font-fw-mono text-caption tabular-nums opacity-80">
                    {option.count === null ? '—' : option.count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      {description !== undefined && (
        <p className="mt-1.5 text-caption text-text-tertiary">{description}</p>
      )}
    </nav>
  );
}
