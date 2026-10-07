# INC-2026-09-23 — org coaches offered as invitees deny the conflict check

- Feature: `calendar_events`
- Status: repairing — fix in the app-health routine PR (`ea1b36dd5`); not released.
- Risk: R1 — client-side filter on who the invite picker offers; no auth, RLS or schema change.
- First seen: 2026-08-20 (same message, earlier causes — see below)
- Last seen: 2026-09-23 18:24Z
- Bridge: `/admin/errors/0bef9c32` (24 events since 2026-08-20; auto-closed by
  triage on 2026-09-23 21:17Z as "expected access control", which it is not)

## User impact

A head coach creating the week's practices with the full roster saw "Not
authorized to check availability for these people" on 14 consecutive event
creations (2026-09-23 18:10–18:24Z). The events saved with the 12 players,
but no conflict check ran for any of them.

## Root cause and invariant

The golf calendar page passes the editor `teamMembers`: the roster merged with
every coach in the organisation, tagged `role: 'coach'`. `FairwayEventEditor`
dropped only the signed-in coach's own row (`currentUserId` is the viewer's
`golf_coaches.id`), so the organisation's other coach was an invitable option.
`checkScheduleConflicts` → `resolveSharedScheduleScope` admits only player ids
on the caller's teams and denies the whole check when any requested id is
outside that set. The save path hid the problem: attendance references
`golf_players` and `sendEventInvitations` drops non-roster ids.

Invariant: the invite picker offers exactly the ids an attendance row can hold
— players.

This message has had three distinct causes: the 2026-08-20 user-id/player-id
mismatch (#1538), departed players on existing events (2026-09-01), and this
one.

## Repair

`FairwayEventEditor` filters `role === 'coach'` rows out of `availablePlayers`
(the source for the inline grid, select-all and the people picker).

## Verification

- `src/components/fairway/pages/calendar/__tests__/FairwayEventEditor.test.tsx`
  "coaches are not invitees" — fails on `96b3992a8` (coach offered as a picker
  option), passes with the fix.
- Replay: `replay/manifests/calendar-coach-invitees-conflict-deny-2026-09-23.yml`.
