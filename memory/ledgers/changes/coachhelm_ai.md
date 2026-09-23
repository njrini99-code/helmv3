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
  `hypothesis-policy.ts`/a Round Review mount). Every row's
  `eligibleCount`/`denominator`/`distinctRounds` is computed from that
  row's own real gating population by construction — carrying forward the
  #2008 review's MUST 1 lesson (a distance-profile row once reported a
  floor its own narrower population had already cleared, hiding the wider
  floor that actually produced `'insufficient'`) into a brand-new module
  rather than repeating it.
- Verification: 8 new tests in
  `src/test/coachhelm/v3/sequence-attribution.test.ts` (conservation +
  insufficient-but-real-value, zero-denominator invalid rows, real
  non-null coverage value below its floor, suppressed-hole-still-counted,
  gap-lands-in-exclusions-not-denominator), reusing this file's own
  existing per-hole fixtures (`CONSERVATION_HOLE`, `incompleteShotSequence`,
  `explicitPenaltyPair`) rather than inventing new ones. Full file: 22/22
  passing. Corrected 2026-09-23 (rev-2020 Fix-first, MUST): the first
  pass had no test that actually reached `'supported'` or exercised the
  `&&` between the two floors — a `>=` → `>`, an `&&` → `||`, or moving
  `acc.roundIds.add(...)` out of the `measuredContribution !== null`
  branch (the exact #2008 wrong-population bug) would all have passed.
  Three new floor-boundary tests (10 events/3 rounds → supported; 9/3 and
  10/2 → insufficient, for both the event-kind row and the coverage row
  at once, via a shared `holeInOneBatch` fixture) plus two added
  assertions on existing tests (`coverage.distinctRounds === 1` on the
  suppressed-hole test; `penaltyRow.distinctRounds === 0` on the gap
  test, which is what actually catches the `roundIds.add` mutation).
  `typecheck`/`lint` run on touched files. Not wired into any generator,
  composite, or page — pure core + tests only, same posture as A0–A3.

## 2026-09-23 — A9 slice 2: confounding-intervention detection wired in

- SHA: (pending push).
- Change: new `src/lib/coachhelm/v3/causality/confounding-check.ts`
  (`detectConfoundingInterventions`), called from `comparable-attribute.ts`
  right after the follow-up-window-open gate (never before — the write is
  permanent) and before `loadPlayerContext`. Replaces slice 1's hardcoded
  `multipleInterventions: false` with a real check: sets it `true` when
  ANY other insight's first-ever `golf_insight_exposure` to the same
  player lands inside `[baselineWindow.start, followUpWindow.end]`
  (window starts at BASELINE start, not `interventionAt` — an
  intervention landing during baseline contaminates it too), matched on
  ANY metric (insight→metric mapping isn't reliable enough to filter on).
  Excludes this insight itself; `golf_coach_insights` has no lineage/
  supersession key to exclude a re-surfacing chain by, only `signature`
  (identifies the generating rule, not an identity chain).
  A confounded write is still written, never dropped — under a new
  distinct `method_version`, `'comparable_opportunities_v1_limited'`
  (`COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION`,
  `comparable-attribute.ts`), instead of the clean
  `'comparable_opportunities_v1'`. A failed confounder query is its own
  typed skip (`{ok: false, reason: 'confounder-read-failed', error}`) —
  never silently read as "no confounder found", the wrong direction for a
  downgrade flag — counted under the cron's new
  `summary.comparable_confounder_read_failed` and logged under
  `cron.v3.causality.comparable-confounder-read`. The cron's summary also
  splits `comparable_attributed` (clean writes only, now) from a new
  `comparable_attributed_limited` (confounded writes), so a reader can
  tell clean vs. confounded evidence apart from the summary alone.
- Grepped every reader of `golf_insight_outcome_attribution`/
  `method_version` in the repo: the only other reads are the round-level
  `attribute.ts` path's own, unrelated `'v2_observed_delta'` literal and
  the cron's anti-join `.select('insight_id')` (never reads
  `method_version`). Nothing today does an equality/switch check on this
  column that could misclassify the new `_limited` value — nothing
  needed fixing.
- Deferred (named follow-up, not shipped): focus-area/drill-change
  confounders (repair-plan addendum item (c)) — no existing player-scoped
  table has a reliable activation timestamp to join against without
  inventing one.
- Docs: `docs/architecture/coachhelm-evidence-contract.md`'s
  "Comparable-opportunities outcome measurement" section now documents
  both `method_version` values and the layer each belongs to (pure core's
  own `methodVersion` never changes; the DB-write adapter is what maps
  `observed_change_limited` to the distinct DB value).
  `config/feature-flags.yml`'s flag entry updated: slice 2 is no longer a
  separate enable blocker, but the flag stays default-off pending the
  still-unapplied migration 20260922230000 and real-world shadow
  evidence.
- Verification: `npm run typecheck:fast` clean; `npx eslint` on all
  touched/new files clean; `npm run flags:generate` + `flags:check` clean
  (8 flags); `npm run docs:check` all green; `npm run markdown:ratchet`
  no regressions. Test counts in the matching test-ledger entry. Build
  not run locally (session rule — CI's Next build job covers it).
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
  local build or dev server run this session). Corrected 2026-09-23
  (#2010 review, round 3): added a test proving
  `renderDistanceProfileFromContext`/`renderScoringFromContext`'s
  isolation actually holds when one COMPUTE function throws (not just
  when the shared `loadPlayerContext` call itself fails, already
  covered) — `computeParOpportunities` throwing degrades only `scoring`
  to null; the shared distance-profile addendum still renders. Also
  documents `MetricResult.failedFloors`/`SupportFloorGap` (landed on
  `metrics/types.ts` via #2008) in this doc's and the evidence-contract
  doc's A2 sections — absent unless `status === 'insufficient'`, and can
  name more than one failed floor at once.
## 2026-09-23 — A6 slice 2: rollup-gated sequence eligibility, evidenceKey, material-change suppression, ranking-input adapter

- What: `ranking/situational-ranking.ts` (stacked on #2020's A4 rollup).
  Three additions on top of #2003's slice-1 `groupIssues`: (1) a sequence
  packet's `eligible` now gates on the #2020 rollup's own per-`event_kind`
  `status: 'supported'`, never on a single event's own resolution — slice
  1's own test adapter let one hole's one event found/own an issue with
  no real population behind it, contradicting the standing "a single
  round never clears the floors" rule; the packet's `sourceShotIds`/
  `strokesImpact` still describe only the one occurrence, never the
  rollup's full population, so eligibility and grouping data stay at
  different grains on purpose. (2) `Issue.evidenceKey: string | null` —
  owner-derived, stable across shot-set churn, deliberately never the
  shot-set-addressed `id`. (3) `applyMaterialChangeSuppression(issues,
  activeInterventions): SuppressibleIssue[]` — pure, keys off
  `evidenceKey`, never drops an issue from its output, suppresses an
  exact-key match unchanged or under `MATERIAL_CHANGE_THRESHOLD` (50%)
  worse than its intervention's baseline magnitude, resurfaces at or past
  it; a zero baseline always resurfaces (avoids silent divide-by-zero
  suppression); no match or no owner never suppresses. (4)
  `issueToRankableInsight(issue): RankableInsight` — new pure adapter,
  `scoreInsight`/`rankInsights`/all live callers untouched, no flag
  needed since no live ranking output changes.
- Why: addendum A6 slice 2, per the slice plan — #2003/slice 1 already
  built the union-find grouping, stable `id`, and ownership; this slice
  covers what was genuinely new: the rollup as an eligibility gate, the
  evidence-stable suppression key, the actual suppression contract, and
  the ranking-input bridge. Acceptance: "one underlying issue yields one
  leading priority," proved at the ranked-output level, not just at
  `claims[0]` (already covered by slice 1).
- Verification: 14 new tests in `situational-ranking.test.ts` (own
  fixture, separate round/hole ids from slice 1's) — a new anchor par-5
  hole plus 9 filler `approach_to_recovery` holes across 3 rounds so the
  kind clears `SEQUENCE_MIN_EVENTS`(10)/`SEQUENCE_MIN_ROUNDS`(3) exactly;
  grouping par+distance+sequence into one issue with the right
  `evidenceKey`; the rollup-not-cleared case where the sequence claim
  never joins; the `evidenceKey`-fallback case; the full
  `applyMaterialChangeSuppression` boundary matrix (unchanged, 49% worse,
  exactly 50%, well past, different key, no owner, zero baseline,
  never-drops-an-issue); `issueToRankableInsight`+`rankInsights` proving
  the trio ranks as one entry. The 50% boundary was mutation-verified for
  real: `>=` flipped to `>`, reran, confirmed exactly the boundary test
  failed and no other, then reverted and confirmed `git diff --stat`
  empty before reverifying green. Full suite: 39/39 passing (25
  pre-existing slice-1 tests unchanged). `typecheck`/`lint` clean on
  touched files. Still pure core, not wired into `ranking/score.ts`'s
  live callers or any delivery surface.

## 2026-09-23 — A9 slice 3: coach-facing read of attribution results

- SHA: (pending push).
- Change: the first-ever READ side of `golf_insight_outcome_attribution`.
  New `src/lib/coachhelm/v3/effectiveness/attribution-read.ts` — a pure,
  flag-unaware DB loader: `readAttributionForInsight` (single insight) and
  `readAttributionForPlayer` (player-scoped — resolves the player's own
  insight ids first, then reads attribution rows for them, chunked at
  `chunkIds`'s 200-id URL cap and paginated per chunk via
  `fetchAllRowsResult`). A genuine read failure returns `{ok: false}`, NEVER
  an empty rows array — a legitimate "not attributed yet" is
  `{ok: true, rows: []}`, a distinct, honest state. Same unknown-column
  degrade as the write side (`isUnknownColumnError`, a per-file copy
  matching this codebase's own established convention for that helper) —
  every row reads back `method_version: null` until migration
  20260922230000 is applied.
  New `src/lib/coachhelm/v3/effectiveness/attribution-view-model.ts` —
  pure labeling: `null`/`'v2_observed_delta'` (the round-level path, which
  predates A9 slice 2's confounding check entirely) both collapse to
  `'earlier_method'`, never clean evidence; `'comparable_opportunities_v1'`
  is the ONLY `isClean: true` value (the only method whose own pipeline
  actively checked for and ruled out a confound);
  `'comparable_opportunities_v1_limited'` is never clean either (limited ≠
  clean, but a healthy-sample limited row is still `state: 'result'`, not
  `'insufficient'` — those two axes are orthogonal); any unrecognized
  version string is a neutral `'unknown'` fallback. Sample size reuses
  `event-ledger.ts`'s `deriveTrustStatus` `< 3` floor
  (`MIN_SUFFICIENT_ROUNDS`).
  New `src/app/golf/actions/insight-attribution.ts` — the flag gate
  (`coachhelm_comparable_opportunity_attribution`, checked before any
  Supabase call, so an off flag makes zero DB calls) and auth check; a
  failed read or unauthenticated caller both return `null`.
  New `src/components/golf/coachhelm/insight-card/AttributionReadout.tsx`
  — renders nothing for `null` (flag off / unauthenticated / failed read)
  but DOES render the real `'missing'` state as a quiet "Not attributed
  yet" note — silence there would misread as "proven to do nothing" — and
  the `'insufficient'`/`'result'` states with sample sizes. Wired into
  `FairwayPlayerInsight.tsx`'s hero-insight slot (a new `useEffect` +
  local state, fetching via the new server action; inert while the flag
  is off) beside `InsightCard`'s `OutcomeBadge` — a DIFFERENT column
  (`golf_coach_insights.outcome_status`, the human self-report, not this
  automated pipeline).
- Why: repair-plan §14.12's A9 slice 3 — before this, nothing anywhere
  read `golf_insight_outcome_attribution` back for display (confirmed by
  the observed-outcome-language audit, PR #2023), so the whole A9
  attribution pipeline (slices 1-2) had no coach-visible surface at all.
- Not done by this slice (explicit non-goals): no migration applied
  (20260922230000 stays unapplied; the degrade path covers both cases);
  no change to whether these rows ever feed `nextWeight` (still the open,
  separate decision the A9 slice 2 entry above already named — this
  slice is read/display-only); the flag stays default-off, so no coach
  sees anything different in production from this change.
- Verification: see the matching test-ledger entry for exact counts.
  `npm run typecheck:fast` clean; `npx eslint` on all touched/new files
  clean; `npm run docs:check` clean (regenerated `DOCUMENT_AUTHORITY_
  INVENTORY.md`/`HELM_FEATURE_MAP.md` for the new ledger entries — same
  recurring generator-drift pattern as every prior entry in this
  session). Build not run locally (session rule) — CI's Next build job
  covers it. `observed-outcome-language.test.ts` (PR #2023) is not on
  this branch (stacked on #2016, not #2023) so it could not be run
  directly against this slice's new strings — manually verified none of
  them contain "proven"/"caused by"/"guaranteed"/a quantified "Saved N
  strokes" claim; will be covered automatically once #2023 lands and
  this branch rebases past it.
## 2026-09-23 — A10 slice 1: shadow-mode evaluation harness

- What: new `src/lib/coachhelm/v3/eval/shadow-harness.ts`. Pure and
  offline — `runShadowEvaluation(snapshot)` takes one de-identified
  `ShadowSnapshot` (`scope`/`facts`/`holes`, no live player id) and feeds
  it through A2 (`computeDistanceProfile`), A3 (`computeParOpportunities`),
  A4 both layers (per-hole `attributeSequence` and the #2020 rollup
  `computeSequenceAttribution`), A5 (`buildHypotheses`), and A6
  (`groupIssues`), returning a structured `ShadowEvalReport`: per-family
  `MetricStatus` counts + `eligibleCount`/exclusions histograms, A4
  per-hole suppression-reason/baseline-gap histograms, hypothesis counts
  by state + a missing-input distribution, and a `grouping` block
  (packet/issue counts, duplicate-issue rate, and two invariant counters).
  Sequence packets gate `eligible` on the #2020 rollup's own per-kind
  `status: 'supported'` (A6 slice 2's rule, #2026, reimplemented locally
  since that PR isn't on `main` yet). A2/A3 rows and the round-level
  `par5_opportunity_loss` hypothesis are deliberately never turned into a
  packet (no honest per-shot provenance) — counted under
  `nonGroupablePacketSources` instead of fabricating an id.
- Why: addendum §13, A10 slice 1 — "run all new families in shadow mode on
  de-identified fixed snapshots before coach-visible writes." No DB write,
  no flag flip, no delivery-surface change; this is proof-before-wiring,
  not a new production path.
- Correction: found and fixed a stale claim in both
  `docs/architecture/coachhelm-evidence-contract.md`'s "Controlled
  hypotheses" section and this ledger's own feature doc — `par5_opportunity
  _loss` was grouped with `short_bias`/`recovery` as having "no metric
  producer today." It does: A3 emits both `par5_regulation_opportunity_rate`
  and `par5_green_in_two_rate`, the exact two ids `par5_opportunity_loss`
  cites. It reaches `'supported_association'` on real input (a specific
  par-5 hole played 3+ times without reaching regulation) — proven, not
  asserted, by this slice's established-roster snapshot.
  `short_bias`/`recovery` remain genuinely unreachable (confirmed the same
  way): no A2/A3 family emits `approach_short_miss_rate`, and `recovery`
  never cites its own triggering shot as support by design.
- Verification: 16 new tests in `src/test/coachhelm/v3/shadow-harness.test.ts`.
  The two invariant counters (`countUnsupportedCauseClaims`,
  `countDuplicateLeadingPriority`) are each unit-tested against a
  hand-built VIOLATING input, not just real output — `.claude/rules/
  quality-gates.md`'s "a gate that cannot fail is not a gate."
  `countDuplicateLeadingPriority`'s shot-overlap check was mutation-verified
  for real (`> 1` flipped to `> 2`, reran, confirmed exactly the two
  shot-duplicate tests failed and no others, reverted, confirmed
  `git diff --stat` empty, reran green). `runShadowEvaluation` is proven
  against a real 2×2 snapshot matrix (`fixtures/shadow-eval-snapshots.ts`,
  composed from the A0 `situational-intelligence.ts` fixtures via
  `normalizeShot` plus one round-id re-keying helper — not a second
  fixture system): new-roster snapshots assert `'insufficient'`/suppressed
  outcomes (support genuinely fails); the established-roster snapshot
  asserts real A2/A3/A4-rollup rows actually reach `status: 'supported'`
  as a PRECONDITION before checking `grouping.unsupportedCauseClaims === 0`
  and `grouping.duplicateLeadingPriority === 0` on top of them — a
  contrast that never clears a real floor would prove nothing. Full v3
  suite: 1225/1225 passing (106 files, no regressions).
  `typecheck`/`lint`/`docs:check` clean on touched files. Not wired into
  any generator, composite, route, or page — pure core + tests only, same
  posture as A0–A6.
