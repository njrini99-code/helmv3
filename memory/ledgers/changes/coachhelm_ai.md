# Change ledger — coachhelm_ai

## 2026-09-02 — worst-holes/warmup evidence refusals no longer page as errors

- SHA: 8350ad6e0.
- Change: the catch blocks in `generateWorstHolesInsights` and
  `generateWarmupHoleInsight`
  (`src/lib/coachhelm/v2/mining/course-management.ts`) now check
  `isEvidenceRefusal(err)` before logging. A refusal (`upsertInsight` throwing
  `InsightEvidenceRefusal` because `evidence.sample_n` is below the Rule 1
  floor) routes through `logServerEvent` at `warning` severity with
  `skipSentry: true`; anything else still goes through `logServerError`
  unchanged.
- Why: incident fingerprint `ea766422` ("worst_holes upsert failed") — the
  sample-floor refusal is control flow by design (not enough evidence to
  publish yet), but both catch blocks logged every `upsertInsight` failure
  through `logServerError` unconditionally, so the refusal paged as a
  production error. The file's own header comment on
  `WORST_HOLES_MIN_ROUNDS` already documented this exact failure mode; the
  catch block itself had never been updated to close it. Mirrors the
  existing split in `src/lib/coachhelm/v3/composite/synthesis.ts`.

## 2026-08-27 — insight notifications no longer deep-link a coach into the player view

- SHA: 1a57943e6.
- Change: `push.ts` `coachhelm_insight` now picks its URL from an `audience`
  field instead of hardcoding `/golf/dashboard/coachhelm`; `insights.ts`
  `triggerPlayerInsightsAfterRound` passes `audience: 'coach'` explicitly.
  Coaches land on the Signals insights view (`surfaceHref('insights')`, the
  same destination the shipped FocusAreaCard uses); players keep the player
  front door. Hrefs come from surface-registry, never hand-written.
- Why: the only sender resolves the TEAM COACH's user_id, so every "New
  CoachHelm Insight" push deep-linked a coach into a page that renders "This
  CoachHelm dashboard is the player view" with nothing but a button back to
  Brief — the in-app dead end from the 2026-08-26 owner report, reached
  through an OS notification and therefore frozen into already-delivered
  payloads.
- Watch: `audience` defaults to `'coach'`, which INVERTS the prior behaviour
  for any sender that omits it. Safe while there is one sender and it is
  explicit; a player-facing sender MUST pass `audience: 'player'`.
- Registry: `src/app/golf/actions/insights.ts` was mapped into this feature in
  the same commit — `insight-*.ts` never matched `insights.ts`, so the largest
  insight action file in the tree resolved to no feature and every edit to it
  tripped the context guard.

## 2026-08-26 — Ask surface: no keyboard-on-open, honest empty pulse

- SHA: 596913022.
- Change: the Ask composer autofocus (CoachHelmChat `variant==='page' &&
  isEmpty`) now also requires a fine pointer; ProgramOpening renders a
  compact EmptyState (+ coverage line) instead of `return null` when the
  pulse has no items. Regression tests: ProgramOpening.empty.test.tsx;
  feature doc UI-contract updated same day.
- Why: owner TestFlight report — opening Ask on iPhone popped the keyboard
  over a page that was mostly blank cream, because an empty pulse left the
  flex-1 opening region stretching around nothing while the route skeleton
  had promised a findings list.

## 2026-09-04 — the Ask composer had both message-composer bugs

- SHA: PR #1828 (branch `agent/mobile-p0-stability`).
- Change: `PromptComposer` gates Enter-to-send on `(pointer: fine)`;
  `CoachHelmChat` keys it on `conversationId`; `AskSurface` subtracts
  `max(0px, keyboard - 56px - safe-area-bottom)` from its height and carries
  `data-fw-keyboard-aware`.
- Why: generalising the team-message fixes to their siblings. A coach could not
  write a two-line question (an iOS keyboard has no Shift+Enter, so the newline
  branch was unreachable), a draft survived a conversation switch and would be
  sent to whichever conversation was then current, and the full-page Ask surface
  had no keyboard term at all — the DRAWER variant was already keyboard-aware,
  which is exactly why this only bit on the full page.

## 2026-09-07 — route `loading.tsx` fallbacks reshaped to the real first paint

- SHA: 6eccdf03d.
- Change: this feature's route Suspense fallbacks (`dashboard/coachhelm`, `dashboard/development`) were reshaped.
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

## 2026-09-23 — A7 distance-profile surface: loader, view model, Fairway section, Game Fingerprint mount (slice 1)

- SHA: 7f1834abe (server loader + view model), 81860195b (rolling
  12-month scope + window label), 406e1dd10 (Fairway section
  component), 235e37aa5 (accessibility fixes + Game Fingerprint mount).
  Corrected 2026-09-23 (#2008 review) — the SHAs originally recorded
  here were not on this branch.
- Change: adds `loadDistanceProfile` (server-only, wraps
  `loadPlayerContext` + `computeDistanceProfile`),
  `buildRollingDistanceProfileScope`/`describeDistanceProfileWindow`
  (a labeled, closed `[today-12mo, today]` scope — Game Fingerprint's
  own Approach/Scoring sections read an opaque, cron-recomputed
  `golf_player_stats_cache` window with no `window_start`/`window_end`
  to mirror, confirmed by reading `player-fingerprint.ts`'s own doc
  comment, so there is no single window to match), and
  `DistanceProfileSection` (a status-discriminated tile grid +
  drill-down `Sheet`, switching on `MetricResult.status` only, never on
  `value !== null`). Mounted behind `coachhelm_a7_distance_profile_surface`
  (experiment, default off everywhere) via a new optional
  `sectionAddenda` prop on `FairwayPlayerGameFingerprint`
  (`Partial<Record<FingerprintSectionKey, ReactNode>>`, rendered right
  after that section's own card; absent → byte-for-byte unchanged
  output), threaded through `PlayerDeepDiveTabs` to
  `players/[playerId]/game/page.tsx`. The page's loader call runs in
  parallel with its existing fetches, reuses the page's own
  session-scoped Supabase client (never admin), and is wrapped in its
  own try/catch that degrades to no addendum (never a page error) with
  `logServerError` on failure.
- Why: addendum §13 A7, first Game Fingerprint mount for the A1/A2
  metrics work (A2 lands in Approach per this slice; A3 → Scoring and
  A4 → FilmstripReview are separate follow-up slices). Shipped flagged
  off pending a design/product review of placement and copy, per the
  same repair-plan pattern used for other new surfaces on this page.
- Verification: `loadPlayerContext`'s pagination (`fetchAllRows`, both
  the `golf_holes`/`golf_shots` id lists chunked at 200 via a shared
  `chunkIds(roundIds)`) was confirmed by direct code reading, not
  assumed, before choosing a live rolling-12-month load over a lifetime
  one. `FairwayPlayerGameFingerprint.mode.test.tsx` (7/7) passes
  unchanged, proving the new prop is a true no-op when absent.
  typecheck:fast and `eslint --max-warnings 0` clean on every touched
  file. Not verified: mobile/desktop visual layout (no local build or
  dev server run this session) — deferred to CI's `pr-smoke-a11y` job
  or a preview deploy.

## 2026-09-23 — A7 Scoring surface: loader, view model, section, Game Fingerprint mount (slice 2)

- SHA: 42d1dccd4. Stacked on slice 1 (61d611615).
- Change: adds `loadParOpportunities` (server-only, wraps
  `loadPlayerContext` + A3's `computeParOpportunities`, mirroring
  `load-distance-profile.ts`'s wiring-only shape), `buildScoringViewModel`
  (splits A3's flat `MetricResult[]` into its own two independent
  families — `parSections`, identity-agnostic, grouped by par + length
  band, and `par5Holes`, specific-hole, one card per course+hole
  identity), and `ScoringSection` (the same status-discriminated tile
  grid + drill-down `Sheet` pattern `DistanceProfileSection`
  established, adapted to two row shapes). Mounted behind a new,
  independently-toggleable `coachhelm_a7_scoring_surface` flag
  (experiment, default off everywhere) targeting
  `sectionAddenda.scoring`, reusing slice 1's mount mechanism and
  rolling-12-month scope/window helpers as-is; also queries
  `golf_courses` (chunked via `chunkIds`) to resolve each par-5 card's
  course name.
- A pre-wiring review caught three real bugs, all fixed before the
  page mount landed: (1) `par5Holes` is keyed by `course_hole_key`, but
  its label was a bare "Hole N" — two different courses' hole 7 would
  have rendered as identical, indistinguishable cards. Fixed by
  resolving `golf_courses.name` into each card's `courseLabel`, with a
  short-id-fragment fallback, never a raw full UUID or a silently
  dropped distinction. (2) An `invalid` par-5 row is a real state (the
  card only exists because plays were recorded) but its copy claimed
  "no data recorded yet" beside a real sibling `0%` supported tile on
  the same hole — made metric-aware instead (putting conversion's
  invalid state names its own zero-opportunity denominator explicitly,
  distinct from regulation/green-in-two's). (3) A3 never rounds a
  percent (`(100*n)/d` can repeat, e.g. `33.333333333333336%`); the
  drill-down now formats by unit, and the signed strokes-vs-par
  formatter rounds before testing for zero (previously printed "−0" for
  a small positive value).
- Why: addendum §13 A7 slice 2, A3 → Scoring per the slice plan (A2 →
  Approach was slice 1; A4 → FilmstripReview is a separate later
  slice). Corrected 2026-09-23 (#2010 review, SHOULD 3) — this
  originally accepted `loadPlayerContext` running twice for the same
  scope (once per addendum) as a known cost of independent
  reviewability/toggling. `loadDistanceProfileAndScoringAddenda` now
  calls it exactly once when both A7 flags are on, feeding the same
  `{shots, holes}` straight to `computeDistanceProfile` and
  `computeParOpportunities`; each surface keeps its own failure
  isolation on top of that shared read. A single flag on is unchanged
  (a thin pass-through to that addendum's own existing loader).
- Verification: 14 new/touched tests (`buildScoringViewModel` 5,
  `ScoringSection` 8, `load-par-opportunities` wiring 1).
  `FairwayPlayerGameFingerprint.mode.test.tsx` (7/7) and
  `PlayerDeepDiveTabs.test.tsx` rerun unchanged — neither exercises the
  flag gate (both receive `sectionAddenda` as an already-resolved prop,
  unrelated to page.tsx's server-side flag logic), so they prove no
  regression in existing markup, not the no-op claim. Corrected
  2026-09-23 (#2010 review, MUST 1) — the no-op-while-off property is
  actually proven by `loadScoringAddendumIfEnabled`'s own unit tests
  in the new `page.scoringAddendum.test.ts` (mirroring
  `page.distanceProfileAddendum.test.ts`'s convention: flag off never
  calls `loadScoringAddendum`; a throw resolves to `null`, not a
  rejection),
  mirroring slice 1's `loadDistanceProfileAddendumIfEnabled` pattern.
  `typecheck:fast` and `eslint --max-warnings 0` clean; `flags:check`
  clean (9 flags total). Not verified: mobile/desktop visual layout (no
  local build or dev server run this session).
