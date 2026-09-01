# Feature: Qualifiers

## Status

- active

## Current State

Qualifiers are multi-round golf team qualification events. Coaches create qualifier events and entries, players submit linked rounds, and leaderboards aggregate scores, ties, totals, and completion progress.

There are three user surfaces:

- Coach/team qualifier list, creation, detail, and leaderboard.
- Player "My Qualifiers" view for entered qualifiers.
- CoachHelm V3 qualifying surfaces for more intelligence-oriented standing/board views.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/qualifiers/page.tsx`
- `src/app/golf/(dashboard)/dashboard/qualifiers/new/page.tsx`
- `src/app/golf/(dashboard)/dashboard/qualifiers/[id]/page.tsx`
- `src/app/golf/(dashboard)/dashboard/my-qualifiers/page.tsx`
- `src/app/golf/(dashboard)/dashboard/coachhelm/qualifying/**`

### Components

- `src/components/golf/qualifiers/**`
- `src/components/golf/coachhelm/v3/QualifyingBoard/**`
- `src/components/fairway/pages/qualifiers/FairwayQualifierDetail.tsx`
- `src/components/fairway/pages/qualifiers/FairwayQualifierLeaderboard.tsx`
- `src/components/fairway/pages/my-qualifiers/FairwayMyQualifiers.tsx`

### Actions And Engine Code

- `src/app/golf/actions/golf.ts`
- `src/app/golf/actions/v3/qualifying.ts`
- `src/lib/coachhelm/v3/qualifying/**`

## Core Data

- `golf_qualifiers`
- `golf_qualifier_entries`
- `golf_rounds.qualifier_id`
- `golf_shots` and `golf_holes` through linked round submission.

Use `memory/context/golfhelm-database.md` for exact columns.

## Data Flow

```txt
Coach creates qualifier
  -> createGolfQualifier()
  -> INSERT golf_qualifiers
  -> INSERT golf_qualifier_entries

Player enters a qualifier round
  -> rounds/new with qualifier context
  -> savePartialRound() establishes an in-progress parent with qualifier identity
  -> submitGolfRoundComprehensive() resolves that persisted identity before
     validating or writing the completed scorecard
  -> WRITE golf_rounds.qualifier_id / qualifier_round_number (never clear or
     retarget a started round from stale browser recovery data)
  -> WRITE golf_holes and golf_shots
  -> updateQualifierEntryStats() reads completed linked rounds and verifies its
     privileged aggregate write affected the entrant row

Leaderboard reads qualifier
  -> getQualifierLeaderboard()
  -> aggregate score, to-par, rounds completed, ties, and position
```

## Business Rules

- Only authorized coaches should create or manage team qualifiers.
- Players can see qualifiers they are entered in through My Qualifiers.
- Qualifier rounds must remain normal rounds too; do not fork scoring logic.
- Leaderboard aggregation must handle ties and incomplete entries consistently.
- Round submission is the source of truth for qualifier progress; do not manually drift entry stats away from linked rounds.
- Qualifier lifecycle rejections (closed qualifier, duplicate round number,
  configured-round limit) are expected outcomes, not faults: their
  `{ success: false }` envelopes carry the stable codes `qualifier_closed`,
  `qualifier_round_already_exists`, and `qualifier_round_limit_reached`,
  which `observe-action-result.ts` classifies as handled warnings (no
  Sentry capture). Keep the codes on these envelopes when rewording the
  user-facing messages.
- Scheduled dates and end dates are calendar metadata, never an automatic
  player-entry deadline. A player can be blocked from entering only when a
  coach explicitly closes the qualifier or when the coach-configured round
  count has been reached.
- Every entry refusal must name the corrective action: resume the saved round,
  ask the coach to reopen the qualifier, or ask the coach to raise the round
  count. It must never present a generic failure or imply that a calendar date
  closed the qualifier.
- For a multi-round qualifier, players advance through the first unused
  configured slot (1 -> 2 -> 3). A recovered out-of-order historical record
  must fill its missing slot rather than skip to a new number or strand the
  player at the cap.
- A coach who can explicitly close a qualifier must be able to reopen it from
  the qualifier workspace; closing is not a one-way lockout.
- The configured `num_rounds` cap is an entry rule and must be written atomically
  with the qualifier itself. A multi-round qualifier must never be created as a
  one-round qualifier and repaired later in a best-effort follow-up write.
- A coach must explicitly acknowledge the one-round cap in the creation UI;
  missing `numRounds` is rejected by the server action rather than defaulted.
- Round-cap edits must reject, rather than coerce, a missing, fractional, or
  out-of-range value. The database also rejects a cap reduction below a
  submitted or in-progress qualifier round, regardless of the caller.
- Scheduled dates are calendar metadata, never a player-entry deadline. A
  qualifier remains open until a coach explicitly closes it. When entry is
  unavailable, the player-facing error must explain the accurate next step:
  continue a saved round, ask the coach to reopen it, or ask the coach to raise
  the configured round count.
- Multi-round progression always returns the first unused configured round
  number (1 → 2 → 3). It must not use `max(completed) + 1`, because historic or
  out-of-order rows can contain a gap that should be repaired rather than
  skipped.
- An existing in-progress round's persisted qualifier identity is authoritative.
  A stale or recovered client may not remove, change, or silently overwrite its
  round type, qualifier link, or qualifier round number during final
  submission. The terminal database RPC also rejects closed qualifiers and
  duplicate numbers; only a verified legacy missing-number row may be filled.
  Continue Round presents that legacy player with only server-derived unused
  round numbers before final submit; it never guesses a result number from
  local recovery state.
- Qualifier events can feed calendar/team surfaces, so date/course changes can have downstream UI impact.
- Correcting an already completed round's type or qualifier linkage must use
  `reclassify_golf_round`; a direct `golf_rounds` update is not a permitted
  way to change completed score history.

## UI Contract

- Coach qualifier list should distinguish upcoming, in-progress, completed, and ended qualifiers.
- Player My Qualifiers should show progress, score/to-par, status, enter-round action, and leaderboard link.
- Detail views should make ties and round-by-round breakdowns inspectable.
- Mobile qualifier views need compact cards, clear primary action, and no stacked header utility rows.
- Empty states should explain whether there are no qualifiers, no entries, or no rounds yet.

## Known Risk Areas

- Leaderboard totals can drift if entry stats are updated outside round submission.
  The aggregate refresh must check both its source read and affected-row write;
  an error-free zero-row PostgREST update is still a failure that must be logged.
- Qualifier round entry can regress if `qualifier_id` is lost through draft/continue/recover flows.
- `start_date` and `end_date` describe the planned schedule only. They must
  never prevent a player from entering, continuing, or submitting a qualifier
  round. Entrant progress also never closes a qualifier automatically; only a
  coach's explicit manual completion action can do that.
- A mismatch between the coach's intended number of rounds and `num_rounds`
  blocks the next result by design, so creation and edit saves must surface a
  failed cap write rather than reporting success.
- The new-qualifier form must state that the cap is enforced and make a
  single-round configuration an affirmative choice, not an invisible default.
- A coach-open qualifier that has reached its configured cap remains visible in
  round setup. It must show server-derived `submitted/cap` progress and an
  actionable coach-update message; it must never disappear as if closed or be
  mislabeled as a completed qualifier.
- CoachHelm V3 qualifying views may evolve faster than the older qualifier pages; update both docs and registry when new paths land.
- Calendar integration means deleting or rescheduling qualifiers can affect event views.
- A date-based entry gate is a release-blocking regression: it strands an
  eligible player and contradicts the coach-controlled qualifier lifecycle.

## Tests To Prefer

- `e2e/golf-qualifier.spec.ts`
- `src/test/coachhelm/v3/qualifying.test.ts`
- Round lifecycle tests when qualifier entry round behavior changes.
- RLS tests when qualifier tables or policies change.

## Related Docs

- `memory/context/golfhelm-features.md`
- `memory/context/golfhelm-database.md`
- `docs/v3-feature-audit.md`
- `docs/v3-page-audit.md`
