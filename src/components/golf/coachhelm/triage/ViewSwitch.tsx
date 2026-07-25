'use client';

/**
 * ============================================================================
 * ViewSwitch — the Triage Desk's Signals / Players / Effectiveness segmented
 * control (Triage Desk spec §2)
 * ----------------------------------------------------------------------------
 * URL-driven via the EXISTING `?view=` values every legacy shim redirect
 * (alerts/insights/patterns/development/analytics/coachhelm) already writes,
 * so every old bookmark keeps landing on the right tab — see
 * `resolveTriageView` in `buildTriageViewModel.ts`, the only place that
 * decodes the param.
 *
 * Visual treatment (owner request, 2026-07-25 — "give that more depth ... add
 * some green ... like a lil toggle"): renders the SAME sunken-track +
 * elevated-pill + green "on" mark that `Segmented`
 * (`src/components/fairway/controls/segmented.tsx`) already gives its 34+
 * call sites, via that file's exported shared recipe
 * (`TRACK_SUNKEN_SHADOW`, `segmentedTrackClassName`, `segmentedItemClassName`,
 * `SegmentedPill`) — NOT by becoming a `Segmented` instance. See that file's
 * docblock for the full reasoning; short version: Radix `ToggleGroup.Item`'s
 * internal click handling has no modifier-key awareness and no override
 * point, so it can't honor this control's "cmd/ctrl/shift/middle-click opens
 * the target view in a NEW tab and leaves THIS tab's `view` untouched"
 * contract (below) the way a plain anchor + our own gated `onClick` can; and
 * `asChild`-wrapping the anchor would swap its exposed role to Radix's
 * `role="radio"` on an element whose real behavior is page navigation
 * (`TriageDesk.navigation.test.tsx` already asserts
 * `getByRole('link', { name: 'Players' })`).
 * ========================================================================== */

import { useId } from 'react';
import Link from 'next/link';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import {
  SegmentedPill,
  segmentedTrackClassName,
  segmentedItemClassName,
  TRACK_SUNKEN_SHADOW,
} from '@/components/fairway/controls/segmented';
import { useScrollFade } from '@/lib/fairway/use-scroll-fade';
import type { TriageView } from './buildTriageViewModel';

export interface ViewSwitchProps {
  view: TriageView;
  hrefFor: (view: TriageView) => string;
  onSelect: (view: TriageView) => void;
}

const OPTIONS: ReadonlyArray<{ value: TriageView; label: string }> = [
  { value: 'signals', label: 'Signals' },
  { value: 'players', label: 'Players' },
  { value: 'effectiveness', label: 'Effectiveness' },
];

export function ViewSwitch({ view, hrefFor, onSelect }: ViewSwitchProps) {
  // CoachHelm v3 surfaces always resolve reduced-motion through this guard
  // (never the raw framer-motion hook) — it defaults the SSR/first-paint
  // `null` to `false` so the animated path hydrates byte-identical, then
  // flips client-side for reduced-motion users without a #418 mismatch.
  const prefersReducedMotion = useReducedMotionGuard();
  // Unique layoutId so this instance's pill never shares a magic-move with
  // any other Segmented/ViewSwitch pill on the same page.
  const pillId = useId();
  // Same graceful narrow-screen affordance every other Segmented switcher
  // gets: at 390px "Signals / Players / Effectiveness" can overflow the
  // track, so it scrolls internally with a soft edge fade instead of
  // clipping (the app's mobile `overflow-x: clip` guard — see globals.css).
  const { ref: scrollFadeRef, fadeStyle } = useScrollFade<HTMLElement>('x');

  return (
    <nav
      ref={scrollFadeRef}
      aria-label="CoachHelm view"
      data-slot="fw-segmented"
      style={{ ...fadeStyle, boxShadow: TRACK_SUNKEN_SHADOW }}
      className={segmentedTrackClassName('md', false)}
    >
      {OPTIONS.map((option) => {
        const selected = option.value === view;
        return (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            replace
            scroll={false}
            data-slot="fw-segment"
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              ) {
                return;
              }
              event.preventDefault();
              onSelect(option.value);
            }}
            aria-current={selected ? 'page' : undefined}
            className={segmentedItemClassName(selected, 'md', false)}
          >
            {selected && (
              <SegmentedPill
                layoutId={prefersReducedMotion ? undefined : `fw-segment-pill-${pillId}`}
                reduceMotion={prefersReducedMotion}
              />
            )}
            <span className="whitespace-nowrap">{option.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
