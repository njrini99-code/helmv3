# HELD FEATURE — Qualifier squad size and entrants

```text
Plan ID: HF-qualifier-squad-and-entrants
Status: HELD
Requested by design: design/handoff/Qualifiers.html and qualifiers.jsx (v1; v2 board Coach - Qualifiers.html), the Edit qualifier form (D-32)
Pages: Qualifiers (P009), /golf/dashboard/qualifiers/[id]/edit
Semantic feature owner if existing: qualifiers (memory/features/qualifiers.md)
Date: 2026-09-29
```

## Why this is needed

The owner decided that Edit qualifier is the create form, prefilled (D-32, answering Q-11). Two of
the fields it edits had no server action: the travel-squad size (places and coach's picks), and who
is entered.

## Existing capability

- `updateGolfQualifierDetails` saves the name, dates, format and notes, and `setQualifierRoundCourses`
  saves the rounds and their courses. Both existed before Clubhouse and are live.
- `createGolfQualifier` sets the squad size and entrants when a qualifier is created.
- Nothing changed them after creation.

## Gap

Two new server actions, in `src/app/golf/actions/qualifier-setup.ts`, built on 2026-09-29:

- `setQualifierSquadSize(qualifierId, { total, coachPicks })`
- `setQualifierEntrants(qualifierId, playerIds)`

They are new server behaviour, so under D-61 they are HELD, not EXISTING. They need no schema change.
The database gaps the security review found in the same area are a separate held data plan:
`docs/clubhouse/held/data/qualifier-db-hardening.md`.

## Desired behavior

Both actions:

- refuse a malformed qualifier id ("That qualifier link isn't valid.");
- **HELD gate:** refuse before any read unless `isClubhouseFor('coach')` is true, meaning
  `golf_clubhouse_ui` is on ("Editing a qualifier's setup isn't available yet.");
- refuse a signed-out caller, a qualifier the caller can't see, and a caller who doesn't coach the
  qualifier's team (`verifyTeamAccess`);
- run on the caller's RLS-scoped client, never the service role;
- never report a write that matched no row as saved.

Squad size: 1 to 12 places (the database's check), no more coach's picks than places, at least as
many pick spots as picks already chosen, and no change once the squad is confirmed
(`selection_state = 'selected'`).

Entrants: only players on the team's active roster; never takes out a player with a round in the
qualifier (any status) or a selection row; says which part saved when adding worked and removing
didn't.

## User actions

Save on the Edit qualifier form (`runEditPlan`). The squad and entrant steps run third and fourth,
after the details and the rounds. A refusal reaches the coach as CH-09002 (the toast) and CH-09902 (the
form's notice, naming what did save).

## Permissions

A coach of the qualifier's team, checked in the action and again by the RLS on `golf_qualifiers`
and `golf_qualifier_entries`. The HELD gate narrows it to the Clubhouse UI.

## Data requirements

None new. It reads and writes `golf_qualifiers` (`selection_slots_total`, `selection_slots_coach_pick`,
`selection_state`), `golf_qualifier_entries`, `golf_qualifier_selections`, `golf_team_members` and
`golf_rounds`.

## Notification impact

None.

## Offline behavior

A save that can't reach the server fails through `useAction` like any other write (CH-09002). Nothing
is queued.

## Bridge requirements

Both run inside `withAdminObserved` (`setQualifierSquadSize`, `setQualifierEntrants`) with
`observeSoftFailures: false`, because refusals are expected outcomes. Read and write failures are
logged through `logServerError` (`qualifierSetup.squadSize`, `qualifierSetup.entrants`). Bridge IDs are
assigned when the Qualifiers page contract (P009) is written.

## Tests required

`src/app/golf/actions/__tests__/qualifier-setup.test.ts`:

- "HELD gate (D-61)": both actions refuse before any read while the Clubhouse UI is off. Checked on
  2026-09-29 that it fails with the gate removed.
- The coach check, validation, the confirmed-squad refusal, the no-row write, the pick floor,
  entrant add and remove, roster and other-team refusals, round and selection refusals, partial
  saves.

The form states are in `src/clubhouse/__tests__/qualifiers.test.tsx` (CH-09002, CH-09902).

## Implementation sketch

Built as above and gated. Activation means removing the `isClubhouseFor` refusal (or keeping it, if
the actions stay Clubhouse-only by design) and updating this plan and the page manifest.

## Activation prerequisites

- The owner releases it from HOLD.
- The Qualifiers page contract (P009) lists both actions and their Bridge IDs.
- Worth doing first: the database hardening (`docs/clubhouse/held/data/qualifier-db-hardening.md`), so
  that a direct insert can't enter a player from another team, whatever this action checks.

## Owner decisions required

- Release from HOLD, and whether the actions stay Clubhouse-only after the Clubhouse UI is the default.

## Explicit prohibition

This plan may be implemented/prepared for review where appropriate, but it must not be activated as new production behavior until the owner explicitly releases it from HOLD.
