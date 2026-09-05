'use client';

/**
 * ============================================================================
 * Fairway · Calendar · FairwayCalendarFab (S1 — chrome collapse)
 * ----------------------------------------------------------------------------
 * The ONE primary action, as a thumb-zone FAB. It replaces the full-width
 * "New event" button that used to occupy its own row inside the retired hero —
 * a permanent ~44px band of chrome above content the coach came to read.
 *
 * It is a Fairway `IconButton variant="primary"`, not a hand-rolled circle: the
 * accent fill, hover/pressed partner colour, focus ring, disabled contract and
 * press response all come from the primitive. This file only owns the two
 * things a FAB adds — where it floats, and how big it is.
 *
 * ── WHY NOT `src/components/golf/calendar/QuickAddEventFAB` ─────────────────
 * The rebuild brief says that component "ALREADY EXISTS — use it". It does
 * exist, and it cannot be used here. Three independent reasons, any one enough:
 *
 *   1. Its palette is the RETIRED pre-Fairway language, hard-coded in a module
 *      constant (`QUICK_ACTIONS`): `bg-amber-100` / `text-amber-700`,
 *      `bg-purple-100`, `bg-cream-50`, `text-warm-900`, `bg-primary-600`,
 *      `text-white`. `.claude/rules/design-system.md` bans raw `amber-*` /
 *      `violet-*` and new `cream-*` / `warm-*` on golf-dashboard surfaces, and
 *      the brief's own §2 repeats the ban. None of it is reachable from
 *      outside: its `className` lands on the outer positioning div only.
 *   2. It is LIVE on the baseball calendar
 *      (`BaseballCalendarWrapper` → `PremiumCalendarClient:1549`), so
 *      restyling it in place is a cross-product change, not this slice.
 *   3. Its speed-dial fans out six `QuickEventType` branches and
 *      `FairwayCalendar.openCreate()` takes no arguments — there is nothing to
 *      wire them to. The artboard shows a plain single-action `+`.
 *
 * What this DOES take from the legacy component is its one hard-won detail:
 * `--golf-mobile-bottom-nav-offset` (56px bar + safe area below md, 0 at md+)
 * as the bottom offset. A raw `env(safe-area-inset-bottom)` calc there once put
 * the FAB on top of the bottom bar's own tab.
 * ========================================================================== */

import * as React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/fairway/controls';

export interface FairwayCalendarFabProps {
  /** Fires the ONE primary action (coach → create; player → respond). */
  onClick: () => void;
  /** Accessible name — the FAB is icon-only, so this is its whole label. */
  label?: string;
  /**
   * Glyph. Defaults to `+` (create). A player's primary action is "Respond",
   * not "add", so that caller passes its own icon rather than shipping a `+`
   * that opens someone else's event.
   */
  icon?: React.ReactNode;
  className?: string;
}

export function FairwayCalendarFab({
  onClick,
  label = 'New event',
  icon,
  className,
}: FairwayCalendarFabProps) {
  return (
    <IconButton
      variant="primary"
      size="lg"
      aria-label={label}
      onClick={onClick}
      className={cn(
        // Rides the bottom-nav offset so it always CLEARS FairwayBottomNav.
        // z on the FAIRWAY ladder (`--fw-z-*`, design-tokens.css) at the nav
        // rung: level with the bar it sits above, and below `--fw-z-overlay`
        // so a Sheet/Modal covers it rather than the FAB punching through.
        'fixed right-4 z-[var(--fw-z-nav)] bottom-[calc(var(--golf-mobile-bottom-nav-offset,0px)+1.25rem)]',
        // 56px — the platform FAB size, one step above IconButton's `lg` (48px).
        'h-14 w-14 [&_svg]:h-6 [&_svg]:w-6',
        // A FAB floats, so elevation and nothing else. `IconButton` sets a
        // transparent border on `primary`, so this never lands a visible border
        // and a shadow together (surface.tsx: "the cheap-UI tell").
        'shadow-raise hover:shadow-raise',
        className,
      )}
    >
      {icon ?? <Plus strokeWidth={2.5} aria-hidden />}
    </IconButton>
  );
}
