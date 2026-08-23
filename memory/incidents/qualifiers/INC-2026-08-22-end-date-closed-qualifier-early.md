# INC-2026-08-22 — qualifier closed before its final local day

- Feature: `qualifiers`
- Status: repaired in production; code release pending verification.
- Risk: R1 — active competition workflow blocked for entered players.
- First seen: 2026-08-22
- Affected workflow: players beginning later rounds of an active multi-round qualifier.

## User impact

An active three-round qualifier was marked `completed` while every entered
player still had one or more rounds remaining. Players could no longer begin
their next qualifier round.

## Root cause and invariant

`golf_qualifiers.end_date` is a date-only, inclusive team-local calendar
boundary. The lifecycle reconciler compared `new Date(end_date)` (UTC midnight)
with the current timestamp. For an Eastern Time team, that treated the
qualifier as past its deadline on the preceding local evening.

A qualifier may complete only when every entrant has completed its configured
round count, or when the team-local calendar date is strictly after `end_date`.

## Repair

- Restored the affected qualifier to `in_progress` after verifying that all
  entrants had rounds remaining.
- Replaced the UTC timestamp comparison with a team-timezone calendar-date
  comparison in the qualifier lifecycle guard.
- Added a regression test covering the Eastern Time midnight-UTC boundary.

## Verification

- Live data after recovery: qualifier is `in_progress`, configured for three
  rounds, and all entered players have rounds remaining.
- `src/lib/golf/__tests__/qualifier-lifecycle.test.ts`
- `npm run typecheck`
