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

## 2026-09-23 — A9 slice 1: comparable-opportunity attribution wired into the cron

- SHA: dadbe5f0d (branch `agent/coachhelm-comparable-attribution`, stacked
  on PR #1992 — OPEN as of this SHA).
- Change: new `src/lib/coachhelm/v3/causality/comparable-attribute.ts`
  wires PR #1992's pure `computeComparableOpportunities` core into the
  `causality-attribute` cron for the three `intentional-null`
  "needs-shot-level-join" approach-proximity metrics, behind a new
  default-off flag `coachhelm_comparable_opportunity_attribution`. The
  cron's pre-filter and main loop (`api/cron/v3/causality-attribute/
  route.ts`) route these metrics to the new module instead of the
  round-level `computeAttribution` only when the flag is on; flag off is
  byte-identical to before this slice.
- Why: `attribute.ts`'s round-level before/after average has no per-shot
  "opportunity" concept for these metrics — they've been permanently
  skipped since W22. This gives them a real, shot-level comparison instead,
  using the insight's FIRST REAL `golf_insight_exposure.shown_at` as
  `interventionAt` (never a `created_at` proxy — zero exposure rows retries
  next run rather than a permanent skip, per the addendum's anti-simulation
  rule). Every written row carries `lift: null` unconditionally, so it can
  never move a coach weight — `recordInsightOutcome`/`updateCoachWeight`
  are never called for these rows. Whether this signal should ever feed
  learning is an explicit, separate decision (A9 slice 3), not something
  this slice decides.
- Verification: `comparable-attribute.test.ts` (new, 12 tests — the
  module's own DB orchestration: the exposure lookup, window computation,
  skip-reason mapping, and the write function's `lift: null` invariant +
  unknown-column degrade/retry for both PGRST204 and 42703) and a new A9
  slice 1 describe block in `causality-attribute.test.ts` (7 tests — the
  cron's wiring: flag on/off, all three skip reasons, the success path,
  the `method_version_column_missing` degrade signal, a write error, and
  that the weight/outcome-ledger tables are never touched). `flags:check`
  clean (6 flags). `typecheck:fast` clean except a pre-existing,
  out-of-scope error in PR #1992's own
  `src/test/coachhelm/v3/comparable-opportunities.test.ts` (confirmed
  present on that branch before this slice's changes, not caused by them).
  `docs:check` clean.

## 2026-09-23 — A9 slice 1 review catch: follow-up window can still be open

- Fixes a real bug found in review before merge, same PR (#2007), branch
  `agent/coachhelm-comparable-attribution`.
- Change: `computeComparableAttribution` now checks whether
  `followUpWindow.end` (interventionAt + `POST_WINDOW_DAYS`) is still in
  the future and returns a new typed skip,
  `{ok: false, reason: 'follow-up-window-open'}`, BEFORE calling
  `loadPlayerContext` — counted in the cron's new
  `summary.comparable_follow_up_open`, retried next run like
  `no-exposure-record`, never a permanent skip. Also: a genuine DB error on
  the exposure lookup now THROWS (caught by the cron's existing
  per-candidate try/catch) instead of being silently misread as
  `no-exposure-record`.
- Why: the cron's own `MIN_AGE_DAYS` (21d, === `POST_WINDOW_DAYS`)
  candidate-age filter guarantees the ROUND-LEVEL path's post window has
  fully elapsed, because that path's window is anchored to `created_at`.
  This path's window is anchored to the real, independently-timed
  `shown_at` instead — which can land long after `created_at` — so an
  insight created 30 days ago but first shown to a coach only 3 days ago
  still has most of its 21-day follow-up window open. Measuring early
  would have permanently recorded a row built from a truncated slice of
  data: the insert is idempotent (PK on `insight_id`), so a premature
  measurement could never be corrected once the window actually closed.
- Known limitation raised but NOT fixed in this slice (documented in
  `memory/features/coachhelm-ai.md` and the PR body, question open to the
  task owner): with the flag on, every shot-level candidate since W22
  — including old `no-exposure-record`/`follow-up-window-open` ones —
  still passes the cron's P1 pre-filter and can fill every run's fixed
  work-list slots oldest-first, reintroducing the original P1 stall for
  round-level attribution. A real fix needs a synchronous per-page
  cheap-drop of these candidates (mirroring the existing anti-join
  batch-fetch) and is out of this slice's scope.
- Verification: 4 new tests in `comparable-attribute.test.ts` (exposure-
  error throws without loading player context; follow-up-window-open skip;
  the exact end-equals-now boundary proceeds, not skipped; the
  `proximityOutcome` spec/outcome — `shotRole`/`lie`/the `reachedGreen`-
  gated `valueOf`, including its `lie_after` fallback and the dropped-miss
  case) plus 1 new cron test for `summary.comparable_follow_up_open`.
  `npm run typecheck` (tsc, the actual CI gate — not just `typecheck:fast`)
  exit 0. `npm run test -- --run src/test/coachhelm` (the feature map's
  required check): 140 files, 1434 passed, 3 skipped, 0 failed. `eslint`
  on all touched files: 0 problems. `docs:check` clean.
