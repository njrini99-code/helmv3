# Feature: Golf Round Lifecycle

```yaml
feature_id: golf_round_lifecycle
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: not_started
```

> This is the missing 18th doc of this wave — the prior `memory/features/`
> corpus had 17 files; this one did not exist and `memory/registry.yml`
> pointed to it anyway. Refreshed from the old-format doc that used to live
> at this path (no yaml header, no verification trail) rather than written
> from scratch, because its routes/actions/tables were still a reasonable
> starting inventory — each one was re-verified against `last_verified_sha`
> before being kept.

## Purpose

The end-to-end life of a round: create → save draft → continue → submit →
(new, 2026-08-20) post-submit round-type correction → stats-cache
invalidation → hand off to review/recap and CoachHelm. This doc owns the
orchestration across that whole arc and the handoff points; it deliberately
does **not** re-derive the entry/autosave/submit write-path mechanics or the
review/insight-generation internals in full — see Dependencies below for
where each lives and why duplicating them here would be a drift risk, not a
convenience.

## Registry Note — this code is mapped to three feature IDs, not one

`memory/registry.yml` maps overlapping code to `golf_round_lifecycle`,
`shot_tracking`, and `player_coachhelm_development` simultaneously:

- `golf_round_lifecycle` (this doc): all of `dashboard/rounds/**`, `golf.ts`,
  `round-*.ts`, `shot-analytics.ts`, `player-feedback.ts`, `src/lib/golf/**`,
  `post-round-trigger.ts`, `src/lib/coachhelm/v3/llm/round-review.ts`.
- `shot_tracking` (`memory/features/shot-tracking.md`): the entry/continue/
  recover routes, `golf.ts`, `round-drafts.ts`, `shot-analytics.ts`,
  `src/lib/offline/**`, `src/lib/coachhelm/v2/shot-analysis/**`.
- `player_coachhelm_development` (`memory/features/
  player-coachhelm-development.md`): `dashboard/rounds/[id]/review/**`,
  `round-reviews.ts`, `shot-analytics.ts`, `player-feedback.ts`, plus the
  whole CoachHelm player-home surface.

`golf.ts`, `shot-analytics.ts`, and `player-feedback.ts` each sit inside all
three ownership lists at once. This was not resolved this pass — it is
recorded here as a structural gap, in the same spirit as `shot-tracking.md`'s
note on `feature-registry.ts` vocabulary drift: three docs can now describe
the same file three different ways with nothing forcing them to agree.
Treat this doc as authoritative for creation → submit → edit orchestration
and cache invalidation; treat the other two as authoritative for their
named slices.

## Current Behavior

Entry is a wizard (course/round-type/qualifier selection → hole
configuration → per-shot capture → submit) rendered under the Fairway
component tree. **The registry's `components` list for this feature —
`src/components/golf/rounds/**` and `src/components/golf/shot-tracking/**`
— does not exist**, confirmed by direct filesystem check at
`last_verified_sha`. The live components are
`src/components/fairway/pages/{rounds,rounds-new,rounds-tracking}/**`
(`FairwayRoundDetail.tsx`, `FairwayRoundsLibrary.tsx`, `FairwayRoundRow.tsx`,
`FairwayShotTracking.tsx`, `RoundTypeEditor.tsx`, etc.) — see
`shot-tracking.md` Current Behavior for the full component inventory; not
re-listed here to avoid a second copy that can drift from that one.

**Submit and autosave writes are both single-flight as of this week** —
this doc's own verification, not copied from `shot-tracking.md`:

- Autosave (`save_partial_round_atomic`) went single-flight first, via
  migration `20260820170000_single_flight_partial_round_save.sql` (commit
  `e196ef6a8`, PR #1517, merged 2026-08-20): `FOR UPDATE NOWAIT`, fails
  immediately with `{success:false, error:'busy'}` on contention — safe
  because a dropped autosave is superseded by the next tick's full-state
  resend.
- Submit (`submit_round_atomic`) got the equivalent guard one day later, via
  migration `20260821043500_single_flight_round_submit.sql` (commit
  `e1bde2b01`, PR #1554, merged 2026-08-21): a **bounded** `FOR UPDATE` with
  `SET LOCAL lock_timeout = '3s'` (not `NOWAIT` — submit is the terminal,
  once-per-round action, so it gives a same-round autosave or a second
  submit tab a short window to finish before failing, per the migration's
  own header comment). Returns `{success:false, error:'busy'}` on
  `lock_not_available` (55P03).
- **Independently verified against live production**, not just the
  migration file: the migration file's own header states "This file is NOT
  YET APPLIED to production as of this commit... the commander applies it
  out-of-band after merge" — recorded ≠ applied, per this repo's standing
  rule. Queried `pg_get_functiondef` for `public.submit_round_atomic`
  directly on 2026-08-21 (this pass) and confirmed the live function body
  contains the `SET LOCAL lock_timeout = '3s'` / `FOR UPDATE` / `'busy'`
  guard verbatim. The migration is applied.

**A submitted round's type can now be changed post-submit** (commit
`c619a96cc`, 2026-08-20, "let a submitted round's type be changed (and keep
the qualifier link honest)"): `updateRoundType()`
(`src/app/golf/actions/round-type.ts`) is called from `RoundTypeEditor`,
confirmed mounted and rendered on `FairwayRoundDetail.tsx`. It re-validates
the qualifier link on convert-to-qualifier and clears `qualifier_id`
cleanly on convert-away, refusing rather than half-linking. This is a
lifecycle event this doc owns (it changes a *completed* round's
classification after the create→submit arc is already finished) even
though the mechanics live in `shot-tracking.md`'s Invariants section in
more detail.

**Offline entry resilience was hardened this week** (PR #1586, "offline
sync survives a broken IndexedDB", merged 2026-08-21) — noted here because
it changes what "the round is safely captured" means during entry, even
though the changed files (`src/lib/offline/shot-storage.ts`,
`indexed-db.ts`, `sync-engine.ts`) sit under `shot_tracking`'s registry
mapping, not this feature's:

- Fixed a Safari-specific IndexedDB transaction-lifecycle race: any `await`
  between opening a transaction and placing a request on it lets Safari
  auto-commit the transaction first, so the request silently lands on a
  dead transaction (`InvalidStateError`, "Failed to get sync metadata" was
  the observed production symptom; never reproduced in Chrome devtools).
  Fixed by a `withShotTransaction()` helper (`shot-storage.ts:351`) that
  resolves the DB handle first, then creates the transaction and places
  every request on it synchronously in the same microtask — mirrored for
  the sibling v1 database in `indexed-db.ts`.
- Added a session-scoped open-failure flag: `isIdbUnavailableThisSession()`
  (`shot-storage.ts:167`) now gates duplicate `console.error` calls in
  `sync-engine.ts` (`loadSyncMetadata`/`refreshPendingCount`, which run
  repeatedly) so a device-level IndexedDB open failure is reported once per
  tab session instead of once per remount — the production incident this
  fixes was 5 duplicate events from one user's one session.
- 10 new regression tests: `src/lib/offline/__tests__/idb-resilience.test.ts`.
- This is entry-path resilience, not lifecycle orchestration — see
  `shot-tracking.md` for anything beyond this summary.

## Invariants

- Do not use client-side DELETE-then-INSERT as the *primary* save/submit/
  sync write path. (One guarded fallback exists in `golf.ts` for when the
  atomic RPC is unavailable — see `shot-tracking.md` Invariants for its
  snapshot/restore mechanics; not re-derived here.)
- A round linked to a qualifier keeps `qualifier_id` through draft,
  continue, submit, **and now post-submit type edits** — `updateRoundType()`
  clears the link deliberately on convert-away rather than orphaning it.
- Cache invalidation after a round is completed must reach both
  player-facing and coach-facing views that read `golf_player_stats_cache`.
- Round review and CoachHelm generation must consume committed round data
  (post-`submit_round_atomic`), not stale draft state.
- A client-side write timeout is not evidence a write failed — see
  `shot-tracking.md`'s `isIndeterminateWriteFailure()` note; this
  distinction is why the round `8e89c73e` destruction (Incident History)
  happened and how it was fixed.

## Primary Journeys

```txt
Create -> draft -> continue -> submit
  new-round-client.tsx (course/type/qualifier -> holes -> shots)
  -> autosave: save_partial_round_atomic (single-flight, NOWAIT, since 2026-08-20)
  -> submit: submit_round_atomic (single-flight, bounded 3s wait, since 2026-08-21)
  -> WRITE golf_rounds, golf_holes, golf_shots; draft_data cleared
  -> invalidate golf_player_stats_cache
  -> hand off to CoachHelm (post-round-trigger.ts) + round review generation

Post-submit correction (new, 2026-08-20)
  -> RoundTypeEditor on FairwayRoundDetail.tsx -> updateRoundType()
  -> re-validate/clear qualifier_id -> UPDATE golf_rounds
  -> authorized: owning player or a coach of the team

Review / recap / CoachHelm handoff
  -> src/lib/coachhelm/v2/post-round-trigger.ts fires on completion
  -> round-review-system.ts (CoachHelm v2 engine, drives useRoundReviewV2)
     and round-reviews.ts (review-record CRUD: view tracking, coach
     annotate/share, team review inbox) both back the SAME
     /rounds/[id]/review page for different concerns — not competing
     systems, confirmed by import-graph check this pass.
  -> round-recap.ts (generateRoundRecap) and
     src/lib/coachhelm/v3/llm/round-review.ts produce narrative content
  -> deep internals owned by player-coachhelm-development.md and
     coachhelm-ai.md, not re-derived here
```

## Architecture/Data Flow

```txt
golf_rounds (status: draft|in_progress|completed)
  -> golf_holes, golf_shots (written atomically on submit)
  -> golf_round_reviews (review record: highlights, patterns_detected,
     coach_feedback_text, player_acknowledged_at, etc.)
  -> golf_player_stats_cache (invalidated on completion + on qualifier-
     relevant edits)
```

Cross-feature dependency chain: `shot_tracking` (entry/write mechanics) ->
this feature (orchestration, post-submit edit, cache invalidation) ->
`player_coachhelm_development` + `coachhelm_ai` (review/insight generation)
-> `qualifiers` / `stats_analytics` (consumers of the committed round).

## Permissions/Tenancy

- Round writes are scoped to the authenticated player (`player_id` on
  `golf_rounds`).
- `updateRoundType()` authorizes the owning player OR a coach of the team —
  see `shot-tracking.md` Permissions/Tenancy for the caveat that this was
  not independently cross-checked against the live RLS policy SQL.
- Coach-facing review actions (`saveCoachFeedback`, `shareReviewWithPlayer`,
  `getTeamReviews`, `getPendingCoachReviews` in `round-reviews.ts`) are a
  coach/team-scoped surface layered on top of the player-owned round; not
  re-verified against RLS this pass — owned by
  `player-coachhelm-development.md`.

## Dependencies

- `shot_tracking` — entry wizard, autosave/submit write mechanics, offline
  storage, qualifier-link invariant at write time. Read that doc first for
  anything below "submit returns success."
- `player_coachhelm_development` — round review generation, viewing,
  acknowledgement, coach annotation, and the player CoachHelm home that
  surfaces post-round insight.
- `coachhelm_ai` — the v2/v3 engine `post-round-trigger.ts` and
  `round-review.ts` call into.
- `qualifiers` — the shared `qualifier_id` linkage invariant, now enforced
  at create, submit, *and* post-submit edit.
- `stats_analytics` — consumes `golf_player_stats_cache` invalidation.

## Failure Modes

- **Indeterminate write outcome on timeout** and **lock contention under
  concurrent writes** — both root-caused, fixed, and detailed in
  `shot-tracking.md` Failure Modes/Incident History; not duplicated here.
- **Stale stats cache after a post-submit round-type edit**: `updateRoundType()`
  updates `golf_rounds` directly; whether it also invalidates
  `golf_player_stats_cache` (relevant if the edit changes qualifier
  standing) was not independently confirmed this pass — worth checking
  before trusting stats immediately after a round-type conversion.
- **Two review-generation entry points** (`round-review-system.ts`'s
  `generateAndStoreRoundReview` vs. `round-reviews.ts`'s
  `generateRoundReview`) exist on the same page. Confirmed via import graph
  that both are live and serve different concerns (v2-engine-backed
  generation vs. review-record CRUD), not a dead duplicate — but a reader
  who greps for "generate round review" and finds only one will get an
  incomplete picture.

## Observability Contract

- No dedicated Sentry-tag mapping for this feature independently confirmed
  this pass — see `shot-tracking.md` for the entry-path logging severity
  contract (`'busy'` below error, indeterminate writes never silently
  retried).

## Test Contract

- `src/app/golf/actions/__tests__/golf-schemas.test.ts` (registry-listed,
  confirmed present).
- `src/test/coachhelm/v2/post-round-trigger.test.ts` (registry-listed,
  confirmed present).
- `e2e/golf-round.spec.ts` — registry lists `e2e/**/round*.spec.ts` as a
  glob; the one file matching it is this single spec. See `shot-tracking.md`
  Test Contract for the 2026-08-21 note that this suite must not run
  against production with real credentials (it seeded 37 junk rounds onto a
  real roster before cleanup).
- Review-side tests confirmed present but not registry-listed:
  `src/app/golf/actions/__tests__/round-reviews.test.ts`,
  `round-review-system.test.ts`, `round-review-system.recommendations.test.ts`,
  `round-recap.test.ts`, `src/test/coachhelm/round-recap-citations.test.ts`,
  `src/test/golf/actions/round-review-feedback-write-integrity.test.ts`.
- `src/app/golf/actions/__tests__/round-type.test.ts` (9 tests, new
  2026-08-20 per `shot-tracking.md`) covers the post-submit edit invariant
  this doc also documents.

## Known Debt/Unknowns

- Three-way registry overlap (see Registry Note above) is the main
  structural debt: no mechanism currently forces `golf_round_lifecycle`,
  `shot_tracking`, and `player_coachhelm_development` to agree on shared
  files like `golf.ts` / `shot-analytics.ts` / `player-feedback.ts`.
- `src/components/golf/rounds/**` and `src/components/golf/shot-tracking/**`,
  named in this feature's own registry entry, do not exist — same legacy-
  teardown pattern `shot-tracking.md` documents for its own component list
  (Wave W1, 2026-07-09).
- Whether `updateRoundType()` invalidates the stats cache was not confirmed
  this pass (see Failure Modes).
- `docs/ROUND_REVIEW_ACCURACY_REPORT.md`, referenced by this feature's
  registry entry, exists on disk but its content/currency was not read this
  pass — flagged for the next verification pass, not asserted as
  current or stale.

## Incident History

- **2026-08-20 — round `8e89c73e` destroyed** and **2026-08-19/20 — Guilford
  team session lock pile-up** — both root-caused and fixed; full detail
  lives in `shot-tracking.md` Incident History (this doc's autosave/submit
  single-flight summary above is downstream of the same incidents).
- **2026-08-21 — round submit single-flight (PR #1554)** — this doc's own
  verification: fixed the gap left after the 2026-08-20 autosave fix, where
  `submit_round_atomic` had no equivalent guard and could still 15s-lock-
  wait under contention with a same-round autosave. See Current Behavior
  for the bounded-wait-vs-NOWAIT design rationale, taken from the
  migration's own header comment.
- **2026-08-21 — offline IndexedDB transaction race + open-failure log
  spam (PR #1586)** — see Current Behavior; primarily a `shot_tracking`
  incident, recorded here because it affects what "safely captured" means
  during the entry portion of this lifecycle.
- **Issue #916 (qualifier linkage loss, date unknown)** — the historical
  failure motivating `updateRoundType()`'s qualifier-clearing invariant, per
  `shot-tracking.md`'s note that it is referenced from code comments and
  the round-type test docstring but has no `memory/incidents/` record yet.

## ADR Links

None recorded yet — `memory/decisions/` contains only a README stub as of
`last_verified_sha`.

## Verification Evidence

- Table names confirmed present in `src/lib/types/database.ts` at
  `last_verified_sha`: `golf_rounds` (16087), `golf_holes` (13415),
  `golf_shots` (16261), `golf_courses` (12609), `golf_round_reviews`
  (15813), `golf_player_stats_cache` (14759) — line numbers as found this
  pass, will drift on future edits to that generated file.
- `golf_round_holes` — named by the *previous* version of this doc —
  **confirmed absent** from `src/lib/types/database.ts` (already tracked in
  `.doc-schema-baseline.json`). Removed from this refresh; this is a
  ratchet-down. Run `node scripts/check-doc-schema-drift.mjs --update` after
  this doc lands, per the baseline's own instructions.
- Action files confirmed present: `golf.ts`, `round-drafts.ts`,
  `round-recap.ts`, `round-review-system.ts`, `round-reviews.ts`,
  `shot-analytics.ts`, `player-feedback.ts`, `round-type.ts`.
- Engine files confirmed present: `src/lib/coachhelm/v2/post-round-trigger.ts`,
  `src/lib/coachhelm/v2/shot-analysis/`, `src/lib/coachhelm/v3/llm/round-review.ts`.
- All six routes under `dashboard/rounds/**` named in this doc confirmed
  present via direct filesystem check.
- `round-review-system.ts` vs. `round-reviews.ts` both-live claim confirmed
  via `grep -rl` import-graph check this pass: the former is imported by
  `round-review-content.ts`, the review page, `buildReviewViewModel.ts`,
  `FilmstripReview.tsx`, `useRoundReviewV2.ts`, and `orchestrator.ts`; the
  latter by `CoachNotesSection.tsx`, the same review page, and an
  integration test — both wired into the same
  `dashboard/rounds/[id]/review/page.tsx`.
- Single-flight submit guard confirmed **live in production**, not just in
  the migration file, via `pg_get_functiondef` on `public.submit_round_atomic`
  queried this pass (2026-08-21) through the Supabase MCP — the returned
  body contains the `SET LOCAL lock_timeout = '3s'` / `FOR UPDATE` /
  `'busy'` guard verbatim, matching
  `supabase/migrations/20260821043500_single_flight_round_submit.sql`.
- Commits confirmed via `git log --format='%h %ad %s' --date=short`:
  `e196ef6a8` (#1517, 2026-08-20), `e1bde2b01` (#1554, 2026-08-21),
  `c619a96cc` (2026-08-20), `2c27b266f` (#1586, 2026-08-21) — all ancestors
  of/equal to `last_verified_sha`.
- `docs/audits/ROUND_SUBMIT_TIMEOUT_INVERSION_2026-08-20.md` and every doc
  path in this feature's registry entry (`SHOT_TRACKING_DATA_FLOW.md`,
  `SHOT_TRACKING_VERIFICATION.md`, `ROUND_REVIEW_ACCURACY_REPORT.md`,
  `v3-research-golf-domain.md`, `v3-testing-standards.md`,
  `operations/2026-05-17-p0-runbook.md`) confirmed present on disk this
  pass (content/currency not re-read).
- `withShotTransaction` (`shot-storage.ts:351`) and
  `isIdbUnavailableThisSession` (`shot-storage.ts:167`, gating
  `sync-engine.ts` console.error calls at two call sites) confirmed by
  direct grep against PR #1586's actual diff
  (`indexed-db.ts`, `shot-storage.ts`, `sync-engine.ts`, plus the new
  `idb-resilience.test.ts`).
