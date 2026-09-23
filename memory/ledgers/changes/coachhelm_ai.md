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
  round-level `computeAttribution` only when the flag is on; flag off means
  no new DB reads or writes on this path at all — the summary just gains
  three permanently-zero counters.
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

## 2026-09-23 — PR #2007 review: MUST 2 starvation fix + MUST 3 mislabel fix

- Same PR (#2007), rebased onto PR #1992's fixed tip (`3aab65ef1`) after a
  formal review verdict of "Fix" with 3 MUSTs.
- MUST 2 (starvation, reintroduced): with the flag on, every shot-level
  candidate since W22 was passing the cron's pre-filter on metric alone,
  including old `no-exposure-record`/`follow-up-window-open` ones —
  refilling every run's fixed work-list slots oldest-first and starving
  round-level attribution, the exact P1 stall the pagination rewrite
  originally fixed. Fixed: `api/cron/v3/causality-attribute/route.ts` now
  bulk-fetches each page's shot-level candidates' first
  `golf_insight_exposure` row in one `.in()` query (already page-bounded)
  and drops a candidate with no exposure or a still-open window BEFORE it
  ever takes a `todo` slot or costs a `loadPlayerContext` call.
  `computeComparableAttribution`'s own per-candidate checks stay as a
  backstop. A bulk-fetch error fails closed for that page (candidates not
  enqueued, not silently guessed) and is logged/counted distinctly
  (`comparable_exposure_read_failed`, `cron.v3.causality.comparable-
  exposure-bulk-fetch`) — the SAME reason/counter the per-candidate
  backstop uses for its own exposure-lookup failures, replacing the prior
  "throw and let the generic catch handle it" approach so a real infra
  error is never folded into the legitimate `no-exposure-record` case.
- **Residual gap, raised to the task owner, not fixed**: once a
  candidate's window IS closed, a terminal `insufficient-evidence` result
  has no honest row to write into `golf_insight_outcome_attribution` —
  `baseline_value`/`post_value`/`delta` are `NOT NULL numeric` in the
  schema (`20260527000000_prod_public_baseline.sql`), so a side with zero
  contributing shots has no real number, and even a real-but-underpowered
  pair of values has no column to flag "measured, below the support
  floor" as distinct from a certified row. These now-bounded (closed-
  window-only) candidates still cost a real compute every run until this
  is resolved or accepted as a known cost.
- MUST 3 (`method_version` mislabel): the round-level path's own degrade
  pattern — retry the insert without `method_version` on an
  unknown-column error — would write a `NULL`-labeled row here too, but
  `NULL` means "v1" (the round-level method) by that migration's own
  comment; a comparable-opportunities row written that way would be
  silently, permanently misread as a round-level row once read back.
  Fixed: `writeComparableAttribution` now writes NOTHING on an
  unknown-column error (`written: false, methodVersionColumnMissing:
  true`, no retry-insert); `route.ts`'s handling was also fixed to check
  `write.written` explicitly rather than inferring success from `!write.
  error` (a `written: false` + no-error result was previously
  miscounted as `comparable_attributed`). The flag's enable criteria
  (`config/feature-flags.yml`) now states migration 20260922230000 must
  be applied, and A9 slice 2 (confounding detection) must ship, before
  this flag can ever go on in production — a slice-1 row is permanent
  (idempotent insert, PK on `insight_id`).
- SHOULD decisions: the exposure lookup's own DB error is its own typed
  skip (`exposure-read-failed`), never folded into `no-exposure-record`;
  the first-exposure lookup is on ANY surface (player or coach), doc
  comments that said "coach" fixed, no surface filter added.
- Verification: `npm run typecheck:fast` clean (0 errors — the #1992
  fixture error from the prior entry is gone now that this branch is
  rebased onto its fix). `npm run test -- --run src/test/coachhelm`: 140
  files, 1434 passed, 0 failed. `eslint` on all touched/new files: 0
  problems. `flags:check`: clean (6 flags). `docs:check` clean. See the
  matching test-ledger entry for the new/changed test cases.

## 2026-09-23 — #2007 residual resolved: retry horizon caps re-check cost, no migration

- Task owner's decision on the residual gap from the entry above: no
  schema addition. Instead of a terminal row, the bulk pre-filter in
  `api/cron/v3/causality-attribute/route.ts` now also drops a shot-level
  candidate once its retry horizon has expired — `firstExposure +
  POST_WINDOW_DAYS + RETRY_GRACE_DAYS` (14 days) `< now` — before it ever
  reaches the per-candidate loop, counted under a new
  `summary.comparable_retry_horizon_expired`. Once expired, a candidate
  never takes a `todo` slot again (no further `loadPlayerContext` calls),
  distinct from `comparable_follow_up_open` (window still open, expected
  to retry) and from `comparable_insufficient_evidence` (the pure core
  actually ran and reported it).
- Rationale: once the follow-up window closes, the matched evidence is
  essentially fixed — only a late-logged round can still change it. 14
  days of grace covers that without retrying forever. This bounds each
  insight's cost at roughly `RETRY_GRACE_DAYS` daily-cron
  `loadPlayerContext` calls after window-close, instead of unbounded.
- Test-fixture note: the existing A9 slice 1 cron tests used an absolute
  `exposures: { 'insight-1': OLD }` fixture (`OLD` = a fixed 2026-01-01
  date) to mean "window closed, reach the mock." With the new horizon
  check, `OLD` is now far past the 35-day cutoff and would be dropped by
  the new check instead. Replaced with a new `WINDOW_CLOSED_IN_GRACE`
  fixture computed relative to `Date.now()` (25 days ago — window closed,
  still inside the 14-day grace) in
  `src/test/api/cron/causality-attribute.test.ts`, so the fixture stays
  correct regardless of when the suite runs, unlike `OLD`.
- Verification: `npm run typecheck:fast` clean; the three A9 slice 1 test
  files together — 44 passed, 0 failed (2 new tests for the horizon-
  expired-drop and still-in-grace cases). See the matching test-ledger
  entry.

## 2026-09-23 — #2007 re-review catch: bulk exposure fetch needed pagination

- `.claude/rules/database.md`'s documented PostgREST trap, caught before
  re-review: the bulk exposure pre-filter's `.in('insight_id',
  shotLevelPageIds)` query had no pagination, and `golf_insight_exposure`
  has no uniqueness constraint on `insight_id`
  (`20260621160000_insight_event_ledger.sql`) — an insight can be
  re-shown/re-ranked any number of times. 200 page ids can legitimately
  produce more than 1,000 exposure rows, and an unpaginated fetch
  silently keeps only the globally-earliest 1,000, permanently
  misreading any candidate whose real first exposure landed later as
  `comparable_no_exposure_record` (a page is never re-fetched).
- Fixed: the bulk fetch now goes through `fetchAllRowsResult`
  (`src/lib/supabase/fetch-all-rows.ts`), the repo's existing
  past-the-cap pagination helper (used elsewhere for `golf_holes`/
  `golf_shots`), with `id` (the table's PK) added as an `.order()`
  tiebreaker after `shown_at` so `.range()` page boundaries stay stable
  when rows share the same `shown_at` instant.
- Added a test with 1,006 raw exposure rows across two candidates (one
  spammy insight with 1,005 rows, one candidate whose single, later
  exposure would sort past row 1,000) proving the later candidate's
  exposure is still found — not misclassified as
  `comparable_no_exposure_record` — after pagination.
- Also fixed a stale doc comment on `comparable_retry_horizon_expired`
  (wrongly implied `comparable_insufficient_evidence` only fires on
  runs that predate the retry-horizon cap; it still fires every run
  during the grace window itself).
- Verification: `npm run typecheck:fast` clean; `causality-attribute.
  test.ts` — 28 passed, 0 failed (1 new test).

## 2026-09-23 — A4 sequence-attribution rollup: scope-wide MetricResult[] (slice 2)

- SHA: TBD (branch `agent/a4-sequence-attribution-rollup`).
- Change: adds `computeSequenceAttribution(facts, holes, scope):
  MetricResult[]` to `src/lib/coachhelm/v3/metrics/sequence-attribution.ts`,
  rolling slice 1's per-hole `attributeSequence` events up into the shared
  `MetricResult` (`metrics/types.ts`), mirroring `computeParOpportunities`'s
  argument order and reusing its `factsInScope` (newly exported) rather
  than duplicating window/cutoff logic. One `sequence_event_strokes_gained`
  row per `SequenceEventKind` (mean `measuredContribution` over every
  ATTRIBUTED hole's resolved events of that kind — an unresolved event's
  `baselineGap` lands in `exclusions`, never the denominator) plus one
  `sequence_hole_coverage` count row (a suppressed hole contributes no
  events but is still counted here, via its `buildHoleSequence` reasons in
  `exclusions`). New floor constants: `SEQUENCE_MIN_EVENTS` (10),
  `SEQUENCE_MIN_ROUNDS` (3), `SEQUENCE_MIN_HOLES` (10, deliberately
  separate from `SEQUENCE_MIN_EVENTS` since "event" and "hole" are
  different units). Also fixes this module's own header doc comment,
  which still framed slice 2 as blocked on `MetricResult` "not existing on
  main yet" — it has been consumed by A2/A3 since #1990 and this slice was
  never actually blocked on it.
- Why: addendum §13, A4 slice 2, per the slice plan (slice 1 was the
  per-hole pure core; a later slice wires this rollup into
  `hypothesis-policy.ts`/a FilmstripReview mount). Every row's
  `eligibleCount`/`denominator`/`distinctRounds` is computed from that
  row's own real gating population by construction — carrying forward the
  #2008 review's MUST 1 lesson (a distance-profile row once reported a
  floor its own narrower population had already cleared, hiding the wider
  floor that actually produced `'insufficient'`) into a brand-new module
  rather than repeating it.
- Verification: 6 new tests in
  `src/test/coachhelm/v3/sequence-attribution.test.ts` (conservation +
  insufficient-but-real-value, zero-denominator invalid rows, real
  non-null coverage value below its floor, suppressed-hole-still-counted,
  gap-lands-in-exclusions-not-denominator), reusing this file's own
  existing per-hole fixtures (`CONSERVATION_HOLE`, `incompleteShotSequence`,
  `explicitPenaltyPair`) rather than inventing new ones. Full file: 19/19
  passing. `typecheck`/`lint` run on touched files. Not wired into any
  generator, composite, or page — pure core + tests only, same posture as
  A0–A3.
