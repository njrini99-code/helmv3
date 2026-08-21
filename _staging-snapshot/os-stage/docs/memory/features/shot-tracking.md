# Feature: Shot Tracking

```yaml
feature_id: shot_tracking
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: not_started
```

> Merged from two independent verification passes this wave (both against
> `last_verified_sha`) — one focused on the round-entry/round-type-edit
> surface, one focused on the submit/autosave write-path incidents. Nothing
> here is asserted by only one pass without being marked as such.

## Purpose

The round-entry flow where a player records hole-by-hole and shot-by-shot
data live during or after a round. It is the primary evidence source for
stats, round review, CoachHelm, and qualifiers — everything downstream
trusts that what got typed here is what actually happened.

## User Contract

- A player must never lose entered shots. Save, submit, continue, and
  recover must all be interruption-tolerant.
- Continuing an in-progress round reconstructs exactly where the player left
  off from persisted data, not client memory alone.
- Submitting a round is decisive: it either fully succeeds or fails with a
  retryable state, never a partial or duplicated result.
- A round linked to a qualifier stays linked through draft, continue,
  submit, and — as of 2026-08-20 — post-submit round-type edits, unless the
  player deliberately converts it away from a qualifier round.

## Current Behavior

Entry is a wizard: course/round-type/qualifier selection → hole
configuration → per-shot capture → submit, confirmed live entirely under the
Fairway component tree, not the `src/components/golf/` package named by the
prior generation of this doc:

- `new-round-client.tsx` imports `FairwayCoursePicker`, `FairwayNewRoundEntry`,
  and `FairwayShotTracking` (from `src/components/fairway/pages/rounds-new/`
  and `src/components/fairway/pages/rounds-tracking/`).
- `src/components/golf/ShotTrackingComprehensive.tsx` — named as the primary
  component by the prior doc and still named in `memory/registry.yml` —
  **does not exist anywhere in `src/`**, confirmed by repo-wide grep. Its
  replacement is `FairwayShotTracking.tsx`, paired with `FairwayShotEntry`,
  `FairwayScorecardHeader`, and `FairwayEditShotModal` in the same directory.
- `src/components/golf/rounds/**`, also named by the prior doc and the
  registry, does not exist as a directory. The live round library/detail/
  banner components are `src/components/fairway/pages/rounds/**`
  (`FairwayRoundDetail.tsx`, `FairwayRoundsLibrary.tsx`, `FairwayRoundRow.tsx`,
  `FairwayUnsyncedRoundBanner.tsx`, `RoundTypeEditor.tsx`).

**Round-type editing is new and is mounted, contrary to its own commit
message.** Commit `c619a96c` (2026-08-20, "let a submitted round's type be
changed") added `updateRoundType()` (`src/app/golf/actions/round-type.ts`)
and states in its own commit message that `RoundTypeEditor` "is built and
tested but NOT yet mounted on the round detail page." Reading
`FairwayRoundDetail.tsx` at `last_verified_sha` shows `RoundTypeEditor`
imported and rendered (~line 384) — it is live. Whether it was mounted
same-day as a fast-follow or the commit message simply understated its own
scope was not determined; the current source is unambiguous either way.

Autosave writes through the `save_partial_round_atomic` RPC
(`golf.ts`, ~line 5586) on an interval; submit writes through the
`submit_round_atomic` RPC via `submitGolfRoundComprehensiveImpl()`. Both
RPCs are **single-flight per round** as of this week: a concurrent second
write on the same round gets a clean `{ success: false, error: 'busy' }`
instead of a lock-contention timeout or a corrupted result — see Invariants
and Incident History; this is the highest-severity fixed issue in the
feature's recent history.

Draft data is read from a dedicated `draft_data` column with a fallback to
`golf_rounds.notes` for legacy rows (`round-drafts.ts:457-463`) — new drafts
do not live in `notes`; only old rows created before `draft_data` existed
fall back to it.

## Invariants

- Never lose user-entered shots; save/submit/recover must not silently
  discard data on a failed write.
- Save/submit must not use client-side DELETE-then-INSERT as the *primary*
  write path. One does exist — `submitRoundDirectFallback()` in `golf.ts`
  (~lines 1083-1220, called from `attemptDirectSubmitFallback` at
  ~1696-2083) — but only as an explicit fallback when the atomic RPC is
  unavailable, gated by a full row snapshot captured and null-checked
  *before* any delete, with `restoreSnapshot()` on every failure path. Each
  delete carries an inline `nosemgrep: helmv3-destructive-write-pattern`
  justification; this is the one legitimate use of that suppression in the
  feature.
- A client-side write timeout is not evidence a write failed.
  `isIndeterminateWriteFailure()` (`golf.ts`, ~line 1017) distinguishes a
  client `AbortSignal` timeout (indeterminate outcome — the RPC's own
  `statement_timeout` is wider than the client's abort window, so a
  "failed" write may have already committed) from a DB-returned error
  carrying a SQLSTATE (Postgres already rolled back — safe to rebuild). This
  distinction exists because of a real incident — see Incident History.
- A qualifier-linked round must retain `golf_rounds.qualifier_id` through
  draft, continue, submit, **and now edit**: `updateRoundType()` clears
  `qualifier_id` deliberately when converting away from a qualifier round
  rather than orphaning it, and re-validates the link on convert-to. It
  refuses rather than half-linking. See `qualifiers.md` for the shared
  invariant.
- Shot records preserve sequence, hole, lie, type, club, distance, result,
  miss direction, and putting detail where captured.

## Primary Journeys

```txt
Round setup
  -> course, round type, qualifier selection, saved course
  -> hole configuration
  -> FairwayShotTracking records per-shot/per-hole data
  -> autosave (interval) -> save_partial_round_atomic RPC -> golf_rounds.draft_data
  -> submit -> submitGolfRoundComprehensiveImpl()
       -> primary: submit_round_atomic RPC (single-flight, FOR UPDATE + 55P03 busy handler)
       -> fallback only if RPC unavailable: submitRoundDirectFallback()
            (snapshot -> guarded delete+reinsert -> restore-on-any-failure)
  -> WRITE golf_rounds, golf_holes, golf_shots
  -> invalidate stats cache; trigger CoachHelm + round review work
  -> update qualifier entry if qualifier_id exists

Post-submit round-type correction (new, 2026-08-20)
  -> RoundTypeEditor on FairwayRoundDetail.tsx
  -> updateRoundType(): re-validates qualifier link on convert-to,
     clears it cleanly on convert-away; refuses rather than half-linking
  -> authorized: owning player or a coach of the team

Concurrent write collision
  -> a second autosave/submit on the same round while one is in flight
     -> RPC returns { success: false, error: 'busy' }
     -> must render as "save in progress," never as a server error
        (golf.ts explicitly carves 'busy' out of error-severity logging)
```

## Architecture/Data Flow

```txt
Round completion
  -> WRITE golf_rounds, golf_holes, golf_shots (via submit_round_atomic)
  -> invalidateOnRoundComplete() marks golf_player_stats_cache stale
  -> CoachHelm / round-review triggered
  -> qualifier entry updated if qualifier_id present

Round-type edit (post-submit)
  -> updateRoundType() -> re-validate/clear qualifier_id -> UPDATE golf_rounds
```

Offline support exists at the type/storage layer
(`src/lib/offline/indexed-db.ts` defines `OfflineShot`/`OfflineRound`) but
sync is not the trusted path — see Known Debt/Unknowns.

## Permissions/Tenancy

- Round writes are scoped to the authenticated player (`player_id` on
  `golf_rounds`); coaches read but do not write shot data through this flow.
- `updateRoundType()`'s authorization (owning player OR a coach of the team)
  is stated directly in the `c619a96c` commit message as mirroring "the live
  RLS UPDATE policies in code so a refusal is legible instead of arriving as
  '0 rows updated.'" Not independently cross-checked against the live RLS
  policy SQL this pass.
- Shot-level detail reads are gated by the `can_read_golf_shot_detail`
  SECURITY DEFINER function, shared with `stats_analytics` and
  `team_access_control` — see those docs' Incident History for this week's
  planner-cost fix on that function.

## Dependencies

- `qualifiers` (round-to-qualifier linkage invariant, now also enforced on
  edit, not just create).
- `stats_analytics` (consumes rounds/shots; shares the `golf_shots` RLS/perf
  surface).
- `coachhelm_ai` (`src/lib/coachhelm/v2/shot-analysis/**`).
- Supabase RPCs `save_partial_round_atomic`, `submit_round_atomic`.

## Failure Modes

- **Indeterminate write outcome on timeout** — the highest-severity failure
  mode; see Invariants and Incident History (round `8e89c73e`).
- **Lock contention under concurrent writes** on the same round — resolved
  to a clean `'busy'` response as of this week (both autosave and submit).
- **Row-by-row hole/shot inserts** — inserts are looped per-row rather than
  set-based, a latency (not correctness) issue, unfixed as of
  `last_verified_sha` (ledger item F21).
- **Offline sync type mismatch** — `ShotRecord` (app shot shape) and
  `OfflineShot` (IndexedDB shape) diverge, so offline shot sync is disabled;
  DB autosave is the only trusted persistence path when online.
- **Round-type conversion without the qualifier-id write** would reproduce
  issue #916's shape (a round labeled "qualifier" everywhere in the UI but
  absent from standings) — this is exactly what `updateRoundType()`'s own
  test suite is built to catch; a naive reimplementation fails 2 of 9 tests
  per the commit message.

## Observability Contract

- Writes must log at a severity reflecting whether the outcome is
  known-safe (`'busy'` — expected, logged below error) or indeterminate
  (must not be silently retried/rebuilt).
- `logServerError()` calls in the `submitRoundDirectFallback` restore path
  are `critical` severity — a failed restore is the one state where a round
  can be permanently lost, and the snapshot is attached to the log so the
  round is recoverable from the log if the restore itself fails.
- No dedicated Sentry-tag mapping for this feature was independently
  confirmed this pass.

## Test Contract

- `e2e/golf-round.spec.ts` — full round entry E2E. As of this week it must
  not run against production with real credentials: the CI `e2e` job did so
  and seeded 37 junk in-progress rounds onto a real player's real roster
  (Guilford team), cleaned up 2026-08-21 with a documented backup table
  (ledger item, HINT-tier — not yet in `memory/incidents/`). Verify current
  e2e workflow config before assuming this is still the case.
- `src/app/golf/actions/__tests__/golf-schemas.test.ts`
- `src/app/golf/actions/__tests__/round-type.test.ts` (9 tests) — new this
  week, not named in `memory/registry.yml`'s test list.
- `src/test/coachhelm/v2/shot-analysis/**`
- Fairway component tests confirmed present, none named in the registry's
  `code.tests` list: `FairwayShotTracking.conversion.test.ts`,
  `FairwayRoundDetail.test.tsx`, `FairwayRoundDetail.round-type.test.tsx`,
  `FairwayRoundsLibrary.test.tsx`, `FairwayRoundRow.test.tsx`,
  `FairwayUnsyncedRoundBanner.test.ts`.
- No pgTAP RLS test exists for `golf_rounds`/`golf_holes` write scoping;
  `golf_shot_detail_visibility.sql` covers shot-detail *read* scoping only.

## Known Debt/Unknowns

- `memory/registry.yml`'s `shot_tracking.code.components` names two dead
  paths: `src/components/golf/ShotTrackingComprehensive.tsx` and
  `src/components/golf/rounds/**`. The live tree is entirely under
  `src/components/fairway/pages/{rounds-new,rounds-tracking,rounds}/`. Same
  structural pattern as `qualifiers.md`/`player-hub.md`: the legacy
  `src/components/golf/**` UI tree was torn down at Wave W1 (2026-07-09)
  with no fallback path left in place.
- `src/hooks/golf/use-auto-save-round.ts`, named by the prior doc and the
  registry, does not exist — confirmed by direct filesystem check. The
  current autosave call site lives directly in `golf.ts`/the round-entry
  client components rather than a dedicated hook by that name; the
  live mechanism was not re-located under a new hook name this pass.
- Strokes-gained columns exist but are not reliably populated from shot
  data end to end — treat as null in practice.
- Hole/shot insert batching (F21) is open, unfixed latency debt.
- Commit-message-vs-source discrepancy on `RoundTypeEditor`'s mount status
  (see Current Behavior) is worth remembering generally: a commit message
  can describe scope as-of-authoring rather than as-of-merge when a PR gets
  a same-day follow-up.

## Incident History

- **2026-08-20 — round `8e89c73e` destroyed.** `submit_round_atomic`
  committed a round in full; the client's `AbortSignal` timed out at 10s and
  read that as failure; the then-existing recovery fallback treated the
  abort as "write failed," deleted the 18 holes and 72 shots the RPC had
  just written, and a bare `catch {}` swallowed the re-insert failure.
  Root-caused and documented in
  `docs/audits/ROUND_SUBMIT_TIMEOUT_INVERSION_2026-08-20.md` (confirmed
  present on disk). Fixed same day: `isIndeterminateWriteFailure()` now
  distinguishes a client-side abort from a DB-returned error, and every
  restore path logs at `critical` with the snapshot attached.
- **2026-08-19/20 — Guilford team session lock pile-up.** Eight players'
  autosaves hit `save_partial_round_atomic` concurrently; the function
  queued rather than skipped, producing a timeout cluster. Fixed by commit
  `e196ef6a8` (#1517): autosave is now single-flight per round.
- **2026-08-21 — recurrence on submit.** `submit_round_atomic` had no
  equivalent single-flight guard, so a submit racing an autosave could
  still 15s-lock-wait under contention. Fixed by commit `e1bde2b01` (#1554):
  a bounded `FOR UPDATE`-style guard (3s `lock_timeout`) with a `55P03`
  handler returns `'busy'`, carved out of error-severity logging and the
  destructive fallback path.
- **2026-08-21 — shot-detail query timeouts.** `can_read_golf_shot_detail`
  had no `COST` annotation, causing sequential per-row planner evaluation
  on a 6-table join (877ms → 105ms after the fix). Fixed via migration
  `20260821035329_can_read_golf_shot_detail_planner_cost.sql`. Shared with
  `stats_analytics` and `team_access_control`.
- **Issue #916 (qualifier linkage loss)** is the concrete historical failure
  motivating `updateRoundType()`'s qualifier-clearing invariant, referenced
  from code comments and the round-type test docstring. No
  `memory/incidents/shot_tracking/INC-*.md` record exists for it yet.

## ADR Links

None recorded yet — `memory/decisions/` contains only a README stub as of
`last_verified_sha`.

## Verification Evidence

- Table names (`golf_rounds`, `golf_holes`, `golf_shots`, `golf_courses`,
  `golf_course_holes`, `golf_player_courses`) confirmed present in
  `src/lib/types/database.ts`.
- `ShotTrackingComprehensive.tsx`, `src/components/golf/rounds/`, and
  `src/hooks/golf/use-auto-save-round.ts` confirmed absent by direct
  filesystem check; `FairwayShotTracking` confirmed present and imported by
  both `new-round-client.tsx` and `continue-round-client.tsx`.
- `submitRoundDirectFallback`, `isIndeterminateWriteFailure`, and the
  `'busy'` single-flight handling read directly from `golf.ts` at the line
  numbers cited above.
- `updateRoundType()` and `src/app/golf/actions/round-type.ts` confirmed
  present via grep and cross-checked against `git show --stat c619a96cc`;
  `RoundTypeEditor`'s import/render in `FairwayRoundDetail.tsx` confirmed
  by direct grep.
- Incident commits confirmed via `git log`: `e196ef6a8` (#1517), `e1bde2b01`
  (#1554), `c619a96c`; all ancestors of/equal to `last_verified_sha`.
- `docs/audits/ROUND_SUBMIT_TIMEOUT_INVERSION_2026-08-20.md` confirmed
  present on disk.
- e2e prod-seeding incident and cleanup taken from this week's operational
  ledger (`/tmp/claude/night/ledger.md`) — HINT-tier, not yet a durable
  incident record.
