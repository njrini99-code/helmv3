'use client';

/**
 * ============================================================================
 * ViewSwitch — the CoachHelm page's top toggle: Home · The Lab · Chat
 * ----------------------------------------------------------------------------
 * URL-backed through `?view=home|lab|chat` (`resolveTriageView` in
 * `buildTriageViewModel.ts` is the only place that decodes it, including the
 * legacy `signals`/`effectiveness` values old bookmarks still carry). The
 * deep-link-only `players` view has no segment: while it is showing, no
 * segment is marked current, and any segment leads back into the toggle.
 *
 * Visual treatment: the SAME sunken track and solid green pill that
 * `Segmented` (`src/components/fairway/controls/segmented.tsx`) gives its
 * other call sites, via that file's exported recipe (`TRACK_SUNKEN_SHADOW`,
 * `segmentedTrackClassName`, `segmentedItemClassName`, `SegmentedPill`), NOT
 * by becoming a `Segmented` instance. Radix `ToggleGroup.Item` has no
 * modifier-key awareness, so it cannot honour this control's contract: a
 * cmd/ctrl/shift/middle click opens the target view in a NEW tab and leaves
 * this tab untouched. A real anchor plus our own gated `onClick` can.
 *
 * Full width on a phone (three equal thumbs, the iOS segmented control
 * shape), content width from `sm` up. 44px tall everywhere: this is the
 * page's primary navigation, not a dense toolbar toggle.
 * ========================================================================== */

import { useId } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useReducedMotionGuard } from '@/lib/coachhelm/v3/motion';
import {
  SegmentedPill,
  segmentedTrackClassName,
  segmentedItemClassName,
  TRACK_SUNKEN_SHADOW,
} from '@/components/fairway/controls/segmented';
import { fwHaptic } from '@/lib/fairway/haptics';
import type { ToggleView, TriageView } from './buildTriageViewModel';

export interface ViewSwitchProps {
  view: TriageView;
  hrefFor: (view: ToggleView) => string;
  onSelect: (view: ToggleView) => void;
  className?: string;
}

const OPTIONS: ReadonlyArray<{ value: ToggleView; label: string }> = [
  { value: 'home', label: 'Home' },
  { value: 'lab', label: 'The Lab' },
  { value: 'chat', label: 'Chat' },
];

export function ViewSwitch({ view, hrefFor, onSelect, className }: ViewSwitchProps) {
  // CoachHelm v3 surfaces resolve reduced motion through this guard (never
  // the raw framer-motion hook): it defaults the SSR/first-paint `null` to
  // `false` so the animated path hydrates byte-identical, then flips
  // client-side for reduced-motion users without a #418 mismatch.
  const prefersReducedMotion = useReducedMotionGuard();
  // Unique layoutId so this pill never shares a magic-move with any other
  // Segmented pill on the page.
  const pillId = useId();

  return (
    <nav
      aria-label="CoachHelm view"
      data-slot="fw-segmented"
      style={{ boxShadow: TRACK_SUNKEN_SHADOW }}
      className={segmentedTrackClassName('lg', false, cn('flex w-full sm:inline-flex sm:w-auto', className))}
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
              // The iOS segment tick (no-op off native), only on a real change.
              if (option.value !== view) fwHaptic('selection');
              onSelect(option.value);
            }}
            aria-current={selected ? 'page' : undefined}
            className={cn(segmentedItemClassName(selected, 'lg', false), 'flex-1 px-5 sm:flex-none')}
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
