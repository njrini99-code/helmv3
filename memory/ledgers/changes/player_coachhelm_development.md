# Change ledger — player_coachhelm_development

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

## 2026-09-23 — A7 distance-profile scope/loader: rolling 12 months, confirmed-safe pagination

- SHA: 7f1834abe, 81860195b. Corrected 2026-09-23 (#2008 review) — the
  SHAs originally recorded here were not on this branch.
- Change: `loadDistanceProfile` and `buildRollingDistanceProfileScope`
  give the new A7 distance-profile surface (see coachhelm_ai's ledger
  for the full slice) a real, labeled `[today-12mo, today]`
  `AnalysisScope`, rather than defaulting to a lifetime load.
- Why: a lifetime shot load for a heavy player risks PostgREST's
  1,000-row cap or its ~22.8KB id-list URL limit. Read
  `load-player-context.ts` directly to confirm `fetchAllRows` already
  paginates both the `golf_holes` and `golf_shots` queries and that
  `chunkIds(roundIds)` (shared between both) already keeps every id
  list at 200 — so the existing loader was already safe for this load;
  no pagination change was needed, only the window choice itself.
- Verification: `distance-profile-window.test.ts` (4/4), including a
  pinned (not assumed) leap-year edge case: Feb 29 minus 12 months
  CLAMPS to Feb 28 of the target year, deliberately, via a hand-written
  `subtractMonthsUTC` using only UTC calendar methods (`date-fns`'s
  `addMonths` reads LOCAL getters against a UTC-midnight `now`, which
  rolled to March 1 depending on the process's timezone — a
  timezone-dependent CI-only bug, not a decision; see
  `distance-profile-window.ts`'s own doc comment). Verified under
  `TZ=UTC`, `TZ=America/New_York`, and `TZ=Asia/Tokyo`.
