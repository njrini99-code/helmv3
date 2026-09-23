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
