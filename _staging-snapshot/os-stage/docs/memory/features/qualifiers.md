# Feature: Qualifiers

- feature_id: qualifiers
- status: active
- criticality: high
- last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
- last_verified_at: 2026-08-21
- history_backfill: not_started (memory/ledgers/{changes,tests,operations}/qualifiers.md do not exist yet)

## Purpose

Run multi-round team qualification events: coaches create a qualifier and
entries, players submit linked rounds against it, and leaderboards aggregate
score/to-par/completion/ties for team-selection decisions.

## User Contract

Coaches create, edit, and monitor qualifiers and their leaderboards. Players
see the qualifiers they are entered in and can enter a round against one.
Qualifier standing must always match the linked rounds — never a hand-edited
number.

## Current Behavior

Three live surfaces, all confirmed by reading each route file's imports:

- Coach list/detail/leaderboard: `src/app/golf/(dashboard)/dashboard/
  qualifiers/**` renders `FairwayQualifiers` from
  `src/components/fairway/pages/qualifiers/FairwayQualifiers.tsx`.
- Player "My Qualifiers": `src/app/golf/(dashboard)/dashboard/
  my-qualifiers/page.tsx` renders `FairwayMyQualifiers` from
  `src/components/fairway/pages/my-qualifiers`.
- CoachHelm V3 qualifying board: `src/app/golf/(dashboard)/dashboard/
  coachhelm/qualifying/**`, backed by `src/lib/coachhelm/v3/qualifying/**`.

**The prior-generation doc's component paths are gone.** It named
`src/components/golf/qualifiers/**` and `src/components/golf/coachhelm/v3/
QualifyingBoard/**` — both directories no longer exist on disk (checked
directly). The whole feature's UI moved to `src/components/fairway/pages/
qualifiers/**` and `src/components/fairway/pages/my-qualifiers/**` during
the Fairway redesign, which has been the only dashboard tree since Wave W1
(2026-07-09) — there is no legacy fallback these old paths could still be
serving.

## Invariants

- A round counts toward a qualifier's standings only when **both**
  `golf_rounds.round_type = 'qualifier'` **and** `golf_rounds.qualifier_id`
  point at the qualifier — one without the other is a round that looks
  right in the UI but is silently absent from the leaderboard (this is
  exactly issue #916's shape, referenced in `round-drafts.ts:167`).
  Production held this invariant as of 2026-08-20: 14 qualifier rounds, 14
  with a `qualifier_id`, 0 without (confirmed in the commit message for
  `c619a96c`, not independently re-queried this pass).
- Round submission (`submitGolfRoundComprehensive()`) is the sole source of
  truth for qualifier entry stats; nothing should hand-write
  `golf_qualifier_entries` aggregate fields outside that path.
- Leaderboard aggregation must handle ties and incomplete entries
  consistently (unverified in this pass beyond reading the intent in code
  comments — no leaderboard test was inspected line-by-line).

## Primary Journeys

```txt
Coach creates qualifier
  -> createGolfQualifier() (golf.ts)
  -> INSERT golf_qualifiers, INSERT golf_qualifier_entries

Player enters a qualifier round
  -> rounds/new with qualifier context
  -> submitGolfRoundComprehensive()
  -> WRITE golf_rounds.qualifier_id + round_type='qualifier'
  -> WRITE golf_holes, golf_shots
  -> updateQualifierEntryStats()

Coach or player changes a round's type after submission (NEW, 2026-08-20)
  -> updateRoundType() in src/app/golf/actions/round-type.ts
  -> converting TO qualifier re-runs the four submit-time checks (qualifier
     exists / not completed / player entered / round number valid+unclaimed)
  -> converting AWAY clears qualifier_id rather than orphaning the round
  -> refuses rather than writing a half-linked row
  -> authorized: owning player, or a coach of the team

Leaderboard reads
  -> getQualifierLeaderboard() aggregates score, to-par, rounds completed,
     ties, position
```

## Architecture / Data Flow

Coach and player surfaces both read `golf_qualifiers` /
`golf_qualifier_entries` directly from route handlers (`qualifiers/page.tsx`
resolves team id via `resolveCoachTeamIdWithCookie()` for coaches or a
`golf_team_members` lookup for players, then queries `golf_qualifiers`
filtered by `team_id`). The V3 qualifying board under
`src/lib/coachhelm/v3/qualifying/**` is a separate, more analytical read
path layered on the same tables, not a fork of the write path.

## Permissions / Tenancy

Qualifier creation/management requires coach role; entries and leaderboard
reads are team-scoped. The 2026-08-20 `updateRoundType` addition
authorizes the owning player OR a coach of the team, and its commit message
states it "mirrors the live RLS UPDATE policies in code" — not
independently re-verified against the live policy definitions this pass.

## Dependencies

Shot Tracking (linked rounds are the qualifier's evidence), CoachHelm AI
(V3 qualifying board), Calendar (qualifier date/course can appear on team
calendar surfaces).

## Failure Modes

- Losing `qualifier_id` through draft/continue/recover flows is the
  named historical risk (issue #916 shape); the 2026-08-20 round-type
  change was written specifically to not reproduce it on the edit path.
- A player membership-read failure on the qualifiers page throws rather
  than silently showing "no qualifiers" (confirmed in
  `qualifiers/page.tsx` — the comment there explicitly documents an
  earlier version of this bug where a discarded error caused a false
  empty state for rostered players).

## Observability Contract

`logServerError` calls present in `qualifiers/page.tsx` for the team
membership read failure path. No dedicated Sentry tag/feature area beyond
`featureArea: 'qualifiers'` passed to that one call was found this pass.

## Test Contract

Live and confirmed present: `e2e/golf-qualifier.spec.ts`,
`src/test/coachhelm/v3/qualifying.test.ts`,
`src/app/golf/actions/__tests__/round-type.test.ts` (9 unit tests per its
own docstring, asserting qualifier-linkage behavior specifically — the
docstring states that naively dropping the `qualifier_id` write breaks 2 of
9). Fairway component-level tests also exist and are current:
`FairwayQualifierLeaderboard.test.ts`, `.mobile.test.tsx`,
`FairwayQualifierDetail.selections-sync.test.tsx`,
`FairwayNewQualifier.a11y.test.tsx`, `.submit.test.tsx`,
`qualifier-date-format.test.ts` — none of these six are named in
`memory/registry.yml`'s `qualifiers.tests` list, which only names the two
non-Fairway files above.

## Known Debt / Unknowns

- **`memory/registry.yml`'s `qualifiers.code.components` list is stale**:
  it names `src/components/golf/qualifiers/**` and `src/components/golf/
  coachhelm/v3/QualifyingBoard/**`, both deleted. The live tree is
  `src/components/fairway/pages/qualifiers/**` and
  `src/components/fairway/pages/my-qualifiers/**`, and
  `npm run knowledge:map -- --files src/components/fairway/pages/qualifiers`
  returns `impactedFeatures: []` — the real component tree is invisible to
  the router. `memory/system/golfhelm-engineering-os.md` (2026-08-21 entry)
  independently confirms `qualifiers` is one of 4 feature ids where
  `src/lib/admin/feature-registry.ts` (the runtime registry) and
  `memory/registry.yml` already disagree on file/action ownership.
- `src/app/golf/actions/round-type.ts` (the `updateRoundType()` action,
  confirmed present and 268 lines per `git show --stat c619a96cc`) is not
  named anywhere in `memory/registry.yml`'s `qualifiers.code.actions` list
  — a real addition to file, not just a doc gap; the registry should be
  updated to include it.
- Leaderboard tie-handling and incomplete-entry aggregation logic in
  `getQualifierLeaderboard()` was not read line-by-line this pass — flagged
  as an open verification gap, not a known defect.

## Incident History

None recorded in `memory/incidents/qualifiers/`. Issue #916 (qualifier_id
loss through draft flows) is referenced by code comments in
`round-drafts.ts:167` and the `round-type.test.ts` docstring but has no
`memory/incidents/qualifiers/INC-*.md` record.

## ADR Links

None recorded.

## Verification Evidence

Files read: `qualifiers/page.tsx` (full), `my-qualifiers/page.tsx` (grep for
imports), `round-type.test.ts` diff from commit `c619a96c` (partial read).
`src/app/golf/actions/round-type.ts` existence and size (268 lines)
confirmed via `git show --stat c619a96cc` and `grep -rl updateRoundType`
against `src/app/golf/actions/` and `src/components/fairway/pages/rounds/`.
Tables confirmed present in `src/lib/types/database.ts`:
`golf_qualifiers`, `golf_qualifier_entries`, `golf_holes`. Component paths
confirmed absent by direct filesystem check:
`src/components/golf/qualifiers`, `src/components/golf/coachhelm/v3/
QualifyingBoard`. Fairway equivalents confirmed present by filesystem check
and by reading the two page files' import lines. Registry-router gap
confirmed by running `npm run knowledge:map` directly against the live
component path, not inferred from prose.
