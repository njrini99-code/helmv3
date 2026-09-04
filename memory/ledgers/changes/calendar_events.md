# Change ledger — calendar_events

## 2026-08-27 — attendance readouts go 2-up on phone; Fairway tree mapped

- SHA: 1a57943e6.
- Change: `FairwayEventDetailDrawer`'s attendance grid is `grid-cols-2` with
  `sm:grid-cols-4`, and each `Inset` gains `min-w-0`. Registry now maps
  `src/components/fairway/pages/calendar/**` into this feature.
- Why: `Readout`'s label is uppercase with `tracking-[0.14em]`, so "ACCEPTED"
  and "PENDING" need far more than the ~80px a 4-column grid leaves at 390pt;
  they spilled across their tiles and clipped at the screen edge (2026-08-26
  owner report). Separately, the SHIPPED calendar UI is the Fairway tree while
  only the older `golf/calendar` tree was mapped, so `knowledge:map` resolved
  the live components to no feature and context packs skipped them.
- Correction: an earlier draft of that registry comment said the gap "tripped
  the context guard as an unmapped governed path". It did not —
  `src/components/fairway/**` is outside GOVERNED_PATTERNS
  (`.claude/hooks/lib/feature-map.mjs`), verified by calling `isGoverned()`.
  The guard claim is true only of the `insights.ts` entry.

## 2026-09-04 — the calendar stopped blocking on its own second query, and its sheet cleared the keyboard

- SHA: PR #1828 (branch `agent/mobile-p0-stability`).
- Change: `calendar/page.tsx` phase 2 (events, members, settings, class owners —
  everything gated on `teamId`) moved into `CalendarEventsSection`, an async
  child behind an interior `<Suspense>` reusing `FairwayCalendarSkeleton`, so
  the shell paints on its own schedule. The section is EXPORTED so the page's
  data-fetch contract tests can still assert on it. `MobileEventSheet` lifts by
  `--keyboard-height` (it is pinned to `bottom-0` and holds a description
  Textarea) and its cap becomes `dvh`. The member rail drops its duplicate
  colour legend.
- Why: the two phases were strictly sequential with no interior boundary, so the
  route skeleton covered both — the repo's own `NavPending.tsx` cites calendar
  as the slowest destination. The sheet is hand-rolled rather than built on the
  keyboard-aware `Sheet` primitive, which is why it never inherited #1739.
