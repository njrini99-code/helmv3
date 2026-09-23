<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->

# coachhelm ai test ledger

## 2026-09-04 — no new tests; the composer fixes ride the existing suite (PR #1828)

- `PromptComposer`'s Enter-by-pointer gate and `CoachHelmChat`'s per-conversation
  key are the same two fixes the team-message composer received, and are covered
  there by `MessageComposer.enterKey.test.tsx` and
  `FairwayMessages.composerScope.test.ts`. The CoachHelm siblings were changed
  identically and verified against the existing 299-test CoachHelm suite rather
  than duplicating those gates.
- Recorded deliberately: if the two composers ever diverge, this is the note
  that says the CoachHelm side has no gate of its own and should get one.

## 2026-09-23 — A9 slice 1 comparable-opportunity attribution (SHA dadbe5f0d)

- New `src/lib/coachhelm/v3/causality/comparable-attribute.test.ts` (12
  tests): `isShotLevelAttributionMetric`'s three supported ids vs. an
  unsupported/unknown one; `computeComparableAttribution`'s
  `unsupported-metric` skip (no DB call at all), `no-exposure-record` skip
  (zero `golf_insight_exposure` rows — asserts `loadPlayerContext` is never
  called), `insufficient-evidence` skip (both the pure core's own status
  and a defensive null-value guard), the success path's exact row mapping
  (`intervention_at` sourced from the real `shown_at`, never a
  `created_at` proxy), and the baseline/follow-up window math (mirrors
  `attribute.ts`'s `PRE_WINDOW_DAYS`/`POST_WINDOW_DAYS`) plus the
  yard-to-feet distance-band conversion for the 125–175ft metric.
  `writeComparableAttribution`'s `lift: null` invariant, and the
  unknown-column degrade/retry for both `PGRST204` and `42703`, plus a
  genuine (non-unknown-column) error that is NOT retried.
  `loadPlayerContext` and `computeComparableOpportunities` are both mocked
  wholesale — this file proves this module's own DB orchestration, not
  the pure core's matching/aggregation math (that's PR #1992's own
  `comparable-opportunities.test.ts`) and not the cron's wiring (below).
- New describe block in `src/test/api/cron/causality-attribute.test.ts`
  (7 tests, "A9 slice 1: comparable-opportunity attribution"): flag OFF
  leaves a shot-level metric dropped by the pre-filter exactly as before
  this slice; flag ON lets it through and routes it to
  `computeComparableAttribution` instead of `computeAttribution`; each of
  the three skip/success outcomes increments its own `summary.comparable_*`
  counter and never calls `writeComparableAttribution` on a skip; a
  successful write asserts the round-level coach-weight upsert
  (`weightCalls.upserts`) is never touched; the `method_version_column_
  missing` degrade signal and a write-error path (logged under
  `cron.v3.causality.comparable-insert`) are each covered. The
  pre-existing `"drops intentional-null metrics..."` test (P1 describe
  block) already proves flag-off parity for one of these exact metrics
  since the new `isFlagEnabled` mock defaults to `false` — not
  duplicated.

## 2026-09-23 — A9 slice 1 review catch: follow-up-window-open coverage

- Same PR (#2007) as above, a pre-merge review catch — see the change
  ledger's matching entry for the bug.
- `comparable-attribute.test.ts` gained 4 tests: the exposure-lookup DB
  error path THROWS and never calls `loadPlayerContext` (proves a genuine
  infra failure is no longer misread as `no-exposure-record`); the
  follow-up window still being open returns the new typed skip without
  loading player context or calling the pure core; the exact
  `followUpWindow.end === now` boundary instant proceeds (not skipped —
  proves the check is a strict `>`, not `>=`); and the `proximityOutcome`
  spec/outcome the module builds internally — `shotRole: 'approach'`,
  `lie: null`, and the `reachedGreen`-gated `valueOf` (a `result: 'green'`/
  `'hole'` shot returns its proximity, the `lie_after: 'green'` fallback
  for a null `result` works, and a missed-green shot returns `null` rather
  than a fabricated proximity value).
- `causality-attribute.test.ts` gained 1 test in the A9 slice 1 describe
  block: `summary.comparable_follow_up_open` increments on that skip
  reason and `writeComparableAttribution` is never called for it.
- Also ran (not new tests, but widened verification per the feature map's
  required checks): `npm run typecheck` (tsc) exit 0, and
  `npm run test -- --run src/test/coachhelm` — 140 files, 1434 passed, 3
  skipped, 0 failed.

## 2026-09-23 — PR #2007 review round: MUST 2/3 coverage + a real-core test

- Same PR (#2007), same session as the entry above — a formal review round
  ("Fix", 3 MUSTs) landed after the follow-up-window fix was already
  pushed; this entry covers the tests added to close those MUSTs.
- `comparable-attribute.test.ts`: the exposure-lookup-DB-error test now
  asserts the typed `{ok: false, reason: 'exposure-read-failed', error}`
  skip (was asserting a thrown `Error` before MUST 1's SHOULD decision
  changed the contract). The two unknown-column "degrade and retry" write
  tests were rewritten for MUST 3: they now assert `written: false`,
  `methodVersionColumnMissing: true`, and exactly ONE insert call (no
  retry-insert) — previously asserted a successful retried write.
- New file `comparable-attribute.open-window.test.ts` (PR #2007 review,
  explicit ask: "exercise the real `computeComparableOpportunities` with a
  fake-client `loadPlayerContext` for the open-window case"). Unlike
  `comparable-attribute.test.ts`'s suite, this file does NOT mock
  `context/load-player-context` or `evaluation/comparable-opportunities` —
  it uses the REAL functions, with a fake client that implements only
  `golf_insight_exposure` and THROWS for any other table (`golf_rounds`
  first, if `loadPlayerContext` were ever reached). Proves the
  follow-up-window-open short-circuit against the real dependencies, not a
  stand-in for them: a regression that called through anyway would fail
  loudly (a thrown "Unexpected table" surfacing as a rejection) instead of
  silently passing on stubbed shot data.
- `causality-attribute.test.ts`: `makeClient`'s shared helper gained
  `golf_insight_exposure` table support (`exposures` fixture map,
  `exposureBulkFetchError` option) for the new per-page bulk pre-filter.
  6 new tests: two prove the bulk pre-filter itself now drops a
  no-exposure and an open-window shot-level candidate BEFORE
  `computeComparableAttribution` is ever called (MUST 2's actual new
  behavior); one proves a bulk-fetch error fails closed for the page,
  logs/counts distinctly, and never reaches the mock; two "backstop"
  tests prove `computeComparableAttribution`'s own no-exposure-record/
  follow-up-window-open returns are STILL correctly counted even when the
  bulk pre-filter let the candidate through (the mocked function
  independently reporting the reason); one proves the new
  `exposure-read-failed` reason is logged under its own action tag and
  counted separately from `no-exposure-record`. One existing test rewritten
  for MUST 3: a write degraded away for a missing column (`written: false,
  methodVersionColumnMissing: true`, no `error`) must NOT be counted as
  `comparable_attributed` and must NOT log an error — this is the bug MUST
  3 fixed in `route.ts` (previously inferred success from `!write.error`
  alone).
- Verification: all three files together — 42 passed, 0 failed. Full
  `npm run test -- --run src/test/coachhelm` — 140 files, 1434 passed, 0
  failed. `npm run typecheck` (tsc) exit 0. `eslint` on all touched/new
  files: 0 problems.

## 2026-09-23 — #2007 residual: retry-horizon-expired coverage

- `causality-attribute.test.ts` gained 2 tests: a shot-level candidate
  shown 40 days ago (past `POST_WINDOW_DAYS` + `RETRY_GRACE_DAYS`, i.e.
  past 35 days) is dropped by the bulk pre-filter, counted under the new
  `summary.comparable_retry_horizon_expired`, and never reaches
  `computeComparableAttribution`; a candidate shown 25 days ago (window
  closed, still inside the 14-day grace) is NOT dropped and still reaches
  the mock as before.
- Replaced the absolute `OLD` exposure fixture (8 call sites) with a new
  `WINDOW_CLOSED_IN_GRACE` constant computed relative to `Date.now()` (25
  days ago) across the existing "reaches computeComparableAttribution"
  tests in this file — `OLD`'s fixed 2026-01-01 date is now past the new
  35-day retry horizon relative to the current date, so those tests would
  otherwise have started failing (dropped by the new check instead of
  reaching the mock) without changing anything about their own intent.
- Verification: the three A9 slice 1 test files together — 44 passed, 0
  failed. `npm run typecheck:fast` clean.

## 2026-09-23 — #2007 re-review catch: bulk exposure fetch pagination test

- `causality-attribute.test.ts` gained 1 test: 1,005 exposure rows for a
  spammy `insight-1` plus a single, later exposure row for `insight-2`
  (1,006 total, across only 2 candidates) — `insight-2`'s row sorts past
  global index 1,000. Asserts it is still found
  (`comparable_no_exposure_record` stays 0, `comparable_follow_up_open`
  becomes 1) rather than silently dropped, proving the bulk fetch's new
  `fetchAllRowsResult` pagination actually runs past PostgREST's 1,000-row
  cap instead of just adding an unused import.
- `makeClient`'s `exposureBuilder` gained a `range(from, to)` step
  (previously resolved on `.order()`) to mirror the real query's new
  `.order().order().range()` chain, plus an `exposureRowsRaw` option for
  injecting raw multi-row-per-insight fixtures (the existing `exposures`
  single-shown_at-per-id map can't express an insight with more than one
  exposure row).
- Verification: `causality-attribute.test.ts` — 28 passed, 0 failed.
  `npm run typecheck:fast` clean.

## 2026-09-23 — A7 distance-profile surface: new contracts pinned by tests

- New: `distance-profile-window.test.ts` (4) — closed-window bounds, a
  pinned (not assumed) leap-year `addMonths` edge case, and the window
  label including its neutral no-window fallback.
  `buildDistanceProfileViewModel.test.ts` (6) and
  `DistanceProfileSection.test.tsx` (5) — the status-discriminated
  render switch (`kind`, never raw `value !== null`), the
  `approach_measured_contribution` special case (always a real number,
  never an InsufficientData hedge), the accessible name baking in
  value/kind (an advisor-review catch — a bare `aria-label` had been
  replacing all descendant text for assistive tech), and
  keyboard open/close (Enter, Escape) parity with click.
- `FairwayPlayerGameFingerprint.mode.test.tsx` (existing, 7) reran
  unchanged and green — pins that the new `sectionAddenda` prop is a
  true no-op for every call site that doesn't pass it.

## 2026-09-23 — #2007 re-review follow-ups: boundary + multi-page-drop coverage

- `causality-attribute.test.ts` gained 2 tests (A9 slice 2 branch, before
  the slice-2 confounding work): the exact retry-horizon boundary instant
  (`shownAt + POST_WINDOW_DAYS + RETRY_GRACE_DAYS === now`, via fake
  timers) still reaches `computeComparableAttribution` and is NOT counted
  under `comparable_retry_horizon_expired` — proves that check is a
  strict `<`, not `<=`, mirroring the same boundary-proof convention
  already used for `follow-up-window-open` in `comparable-attribute.
  test.ts`. Second: a full `FETCH_PAGE_SIZE` (200) page of shot-level
  candidates ALL dropped by the bulk pre-filter (no exposure record) does
  not stall the outer candidate-page loop — pagination continues to page
  2 and reaches the one attributable candidate there, the same guarantee
  the original P1 pagination rewrite gives for a page of only
  intentional-null metrics.
- Also fixed a stale line in `memory/features/coachhelm-ai.md` (~line
  601) that still said a genuine exposure-lookup DB error "THROWS ...
  per-candidate try/catch" — that changed to the typed
  `exposure-read-failed` skip during the PR #2007 review round; the
  narrative there hadn't been updated to match.
- Verification: `causality-attribute.test.ts` — 30 passed, 0 failed.
  `npm run typecheck:fast` clean.

## 2026-09-23 — A9 slice 2: confounding-intervention detection tests

- New `src/lib/coachhelm/v3/causality/confounding-check.test.ts` (7
  tests): zero-other-exposure reports `false`; another insight's first
  exposure inside the window reports `true`, and asserts the exact
  `.eq`/`.neq`/`.lte` calls the query makes; an insight already exposed
  BEFORE baseline start (not a new intervention entering the window)
  does not confound; the MINIMUM shown_at per insight_id is what's
  checked, not any row inside the window — a re-exposure inside the
  window of an insight first shown before baseline start does not
  confound; the exact `windowStart` boundary instant counts (inclusive
  lower bound); a query error returns a typed failure, never silently
  "no confounder found"; and a pagination test (1,000 rows for one
  spammy insight, plus a confounding insight whose row sorts past page
  1) proves `fetchAllRowsResult` pagination actually runs.
- `comparable-attribute.test.ts` gained a new "A9 slice 2" describe
  block (5 tests) plus one more in `writeComparableAttribution`'s own
  block: mocks `detectConfoundingInterventions` wholesale (same
  reasoning as `loadPlayerContext`/`computeComparableOpportunities`
  already being mocked in this file — this file proves
  `comparable-attribute.ts`'s OWN orchestration, not
  `confounding-check.ts`'s DB query logic). Covers: the confounder
  check is called with `windowStart = baselineWindow.start`, `windowEnd
  = followUpWindow.end`, excluding this insight, and strictly BEFORE
  `loadPlayerContext` (asserted via `invocationCallOrder`); a `true`
  result passes `multipleInterventions: true` through to the pure core
  and the row is written with the LIMITED method_version; a `false`
  result (the default) writes the CLEAN method_version; a confounder
  check failure returns `{ok: false, reason: 'confounder-read-failed',
  error}` without ever calling `loadPlayerContext` or
  `computeComparableOpportunities`; and `writeComparableAttribution`
  passes a limited row's method_version through to the insert unchanged
  and distinct from a clean row's.
- `src/test/api/cron/causality-attribute.test.ts` gained 2 tests: a
  successful write with the LIMITED method_version counts
  `summary.comparable_attributed_limited`, NOT `comparable_attributed`;
  a `confounder-read-failed` skip is logged under its own action
  (`cron.v3.causality.comparable-confounder-read`), counted under its
  own new `comparable_confounder_read_failed` counter (separate from
  every other `comparable_*` reason), and never written.
- Verification: `comparable-attribute.test.ts` — 21 tests (was 16: 5 new
  in the "A9 slice 2" describe block plus 1 new in
  `writeComparableAttribution`'s own block), `confounding-check.test.ts`
  — 7 tests (new file), `causality-attribute.test.ts` — 32 tests (was
  30: 2 new). All 60 combined passed, 0 failed. `npm run typecheck:fast`
  clean. `npx eslint` on all touched/new files: 0 problems. The pure
  core's own suite (`comparable-opportunities.test.ts`) and the
  dedicated real-core open-window test
  (`comparable-attribute.open-window.test.ts`) re-run clean (9 passed,
  0 failed) — the open-window test never reaches the confounder check
  (it short-circuits at the follow-up-window-open gate, before the new
  code runs), so it needed no changes.
## 2026-09-23 — A7 Scoring surface: new contracts pinned by tests (slice 2)

- New: `buildScoringViewModel.test.ts` (5) — par-grouping across
  'all'/'mid' bands, par5-grouping into fixed metric order, a
  `courseNameById` resolution + its fallback, a two-courses-same-hole
  identity collision (mirroring A3's own fixture), and the
  empty-input case. `ScoringSection.test.tsx` (8) — a supported par
  tile next to an insufficient one switching on `kind` alone (not
  `value !== null`), fixed per-hole metric ordering, accessible-name
  baking for both row shapes, keyboard open/close (Enter, Escape)
  parity with click, the empty-collection state, an invalid par-5 row
  next to a real `0%` sibling getting metric-aware copy rather than a
  blanket "no data" claim, a non-terminating percent
  (`33.333333333333336%` → `33.3%`) formatted in the drill-down, and
  two identical hole numbers at different courses rendering with
  distinct accessible names. `load-par-opportunities.test.ts` (1) —
  wiring-only pass-through, mirroring `load-distance-profile.test.ts`.
- Two of these tests initially asserted the wrong thing rather than
  finding a real bug: a single-play "invalid" fixture at
  `greenShotNumber: 4` (fails regulation) produced `eligible=1`
  (nonzero) so the row was `'insufficient'`, not `'invalid'` as
  intended — the fixture was changed to three such plays, which
  clears the 3-play floor for regulation/green-in-two (`'supported'`,
  real `0%`) while putting-conversion's own `created` denominator
  stays 0 (`'invalid'`), correctly isolating the case the copy fix
  targets. `FairwayPlayerGameFingerprint.mode.test.tsx` (existing, 7)
  and `PlayerDeepDiveTabs.test.tsx` reran unchanged and green.

## 2026-09-23 — A9 slice 3: coach-facing attribution-readout tests

- SHA: (pending push).
- New: `src/lib/coachhelm/v3/effectiveness/attribution-read.test.ts` (13)
  — a hand-rolled chainable fake `sb` (per-table queued pages, same
  convention as `comparable-attribute.test.ts`'s `makeExposureClient`).
  Covers: an empty insight/player id short-circuits before ever calling
  `sb.from` at all; a found row maps through with `method_version`
  normalized; zero rows is `{ok: true, rows: []}`, never mistaken for
  failure; a genuine read error is `{ok: false}`, never an empty array;
  the unknown-column (unapplied-migration) degrade retries without
  `method_version` and maps every row's version to `null`; a failure on
  the degrade retry itself is still `{ok: false}`; a player with zero
  insights returns `{ok: true, rows: []}` without ever querying the
  attribution table; a failed insight-id lookup is `{ok: false}`; 250
  insight ids split into two `.in()` chunks (200 + 50) and both chunks'
  rows merge into one result; one failed chunk (of two) fails the WHOLE
  call, never a partial success.
- New: `src/lib/coachhelm/v3/effectiveness/attribution-view-model.test.ts`
  (16) — pure, no mocks. `describeMethodVersion`: every known
  `method_version` value maps to its documented label (`null` and
  `'v2_observed_delta'` both → `earlier_method`, never clean;
  `comparable_opportunities_v1` → `observed_change`, IS clean;
  `comparable_opportunities_v1_limited` → `observed_change_limited`,
  never clean — the explicit "limited ≠ clean" case; an unrecognized
  string → `unknown`, never clean); a sweep asserting no label's
  description ever contains "improved"/"proven"/"caused".
  `rowToAttributionReadout`: below `MIN_SUFFICIENT_ROUNDS` on either side
  (before alone, after alone, or both) → `insufficient`; at/above the
  floor → `result`; a LIMITED row with a healthy sample size is still
  `result` (limited is a method-quality flag, orthogonal to the
  sample-size state, not a synonym for "not enough data"); an
  insufficient readout still carries method info + sample size.
  `toAttributionReadout`: zero rows → `missing`; one row → identical
  output to `rowToAttributionReadout` on that row.
- New: `src/test/golf/actions/insight-attribution.test.ts` (10) —
  `attribution-read.ts` mocked wholesale (this file proves the action's
  OWN flag/auth orchestration, not the loader's), `attribution-view-
  model.ts` left real. `getInsightAttributionReadout`: flag off → `null`
  AND `createClient`/the loader are never called (the required
  "flag-off makes no DB call" coverage); an empty insight id short-
  circuits before even checking the flag; not authenticated → `null`; a
  FAILED read (`{ok: false}` from the loader) → `null`, never a
  fabricated readout (the required "a failed read renders nothing"
  coverage, at the action layer); no attribution row yet → the real
  `{state: 'missing'}`, not `null`; a found row → a `result` readout
  built by the REAL view model (an integration check, not just a mock
  echo). `getPlayerAttributionReadouts`: flag off → `null`, no DB call;
  access denied (`verifyPlayerAccess`) → `null` without ever calling the
  loader; a failed read → `null`; rows found → keyed by `insight_id`.
- New: `src/test/golf/components/AttributionReadout.test.tsx` (5) — the
  required "a failed read renders nothing" coverage at the component
  layer: a `null` prop renders an empty DOM element. Plus: the `missing`
  state renders a quiet "Not attributed yet" note (a real, non-null
  state DOES render, unlike `null`); the `insufficient` state renders
  both sample-size numbers; the clean-method `result` state renders its
  hedged description and never "improved"/"proven"/"caused"; the
  limited-method `result` state renders distinctly (`data-method`
  differs, "can't be isolated" wording) — limited ≠ clean, visibly.
- Verification: all 4 new files, 44 tests, 0 failed, 0 skipped. Broader
  regression sweep — `src/test/coachhelm/v3`, `src/test/golf/actions`,
  `src/test/golf/components`, `src/lib/coachhelm` — 247 files / 2483
  passed / 3 skipped (pre-existing, unrelated), 0 failed. `npm run
  typecheck:fast` clean. `npx eslint` on every touched/new file: 0
  problems. `observed-outcome-language.test.ts` (PR #2023) isn't on this
  branch yet (stacked on #2016) — every new user-facing string was
  manually checked against its four forbidden patterns instead; will run
  for real once this branch rebases past #2023.
