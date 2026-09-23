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
