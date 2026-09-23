# Change ledger — player_coachhelm_development

## 2026-09-23 — trust rollup no longer counts a thin-sample outcome as measured

- SHA: 390a44c65.
- Change: `getInsightEffectivenessSignals` (event-ledger.ts) gains a
  `coachhelm_trust_status_exclude_unmeasured_outcomes` flag (default off).
  On, a null-`improvement` `golf_insight_outcome` row (thin-sample
  attribution, below attribute.ts's MIN_WINDOW_ROUNDS) is excluded from
  `measured`/`worked` instead of counting as a real measurement. Off is
  byte-identical to prior behavior.
- Why: Package 10 gap audit — the gate "missing post-action evidence
  remains unknown" was violated by the rollup (not the write side, which
  already nulls `lift`/never reaches `nextWeight` for these rows): an
  insight with only thin-sample outcomes could read `needs_validation`,
  or `underperforming` with 3+ such rows, on zero real evidence.
- Verification: 5 new tests (event-ledger.test.ts), full `npm run
  typecheck` (tsc, 0 errors), eslint 0, `npm run docs:check` clean.

## 2026-08-26 — log-progress drawers stop autofocusing the measurement field on touch

- SHA: 596913022.
- Change: both LogProgressDrawer copies (FairwayMyDevelopment.tsx and
  golf/coachhelm/home/DevelopmentDrill.tsx) gate the measurement input's
  autoFocus on a fine pointer.
- Why: on iPhone the numeric keypad popped over the drawer before the
  player had read the field's context (owner TestFlight report,
  same class as the event editor).

## 2026-09-07 — route `loading.tsx` fallbacks reshaped to the real first paint

- SHA: 6eccdf03d.
- Change: this feature's route Suspense fallbacks (`dashboard/coachhelm`, `dashboard/my-development`) were reshaped.
  No route, table, server action, data flow or business rule changed — the
  edits are confined to `loading.tsx` skeleton geometry and its ARIA
  wrapper.
- Why: the fallbacks were shape-matched to each page's SETTLED layout
  rather than the markup that paints at t=0. For a `'use client'` page
  holding its own `loading` state, the Suspense fallback is replaced by
  that component's loading branch, so reserving the populated geometry
  caused the layout shift the fallback exists to prevent. A route whose
  `page.tsx` is a pure `permanentRedirect` shim now renders `bg-canvas`
  only — no geometry, no `<h1>` for a screen that never mounts.
- Verification: every edited file was adversarially re-verified against
  its page's source, twice for the files that failed the first pass.
  typecheck 0, lint 0, build 0.
