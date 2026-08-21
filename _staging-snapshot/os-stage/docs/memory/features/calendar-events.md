# Feature: Calendar And Events

```
feature_id: calendar_events
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: partial
```

## Purpose

Team scheduling, RSVP, attendance tracking, recurring events, iCal feed
subscriptions, calendar notifications, coach blocked time, academic conflict
detection, class-schedule sync, event-document links, and attendance
summaries. Shared by coaches (create/manage events, attendance) and players
(respond, consume schedule context) on one route with role-differentiated
actions.

## User Contract

A coach or player sees one consistent event truth across month/week/day/
mobile views, with visible status, attendee/RSVP state, documents, and
conflict warnings (classes, blocked time, exclusions) where relevant.

## Current Behavior

**Recurring events ARE implemented — not on a separate table.** Recurrence
lives on `golf_events` itself: `recurring` (bool), `recurrence_rule` (text),
`parent_event_id` (uuid), driven by `src/app/golf/actions/
recurring-events.ts` (~2,000 lines). There is no `golf_recurring_events`
table.

**"Sync" here means class-schedule sync, not external-calendar sync.**
`src/app/golf/actions/calendar-sync.ts` materializes a player's class
schedule into events (`parseSemesterDates`, `CLASS_EVENT_TYPE`). It has
nothing to do with Google/Outlook; there is no sync-state or sync-log table.

**Genuinely not implemented** (no backing table and no source references):
availability polling/poll responses, external-calendar connections, player
availability blocks. Extending one of these is new work, not an extension of
something partial.

A fix landed this week for an all-day-event edge case:
`getUserBusyPeriodsWithStatus` has four busy-period push sites; three route
through `eventBusyInterval` (which correctly expands an all-day span in the
team's zone), but the fourth — a player's own class occurrences — read
`event.end_time` directly. Since `golf_events.end_time` on an all-day row is
UTC midnight on the *inclusive* last day, the raw form ended the block a day
early. Fixed `446be8fbb` using the already-settled `eventDaySpan` helper the
other three sites use (bug #1493/#1494/#1495).

## Invariants

- Coach event writes are scoped to teams they can manage; player RSVP
  writes are scoped to their own attendance row.
- Recurring-event edits respect scope: `this`, `thisAndFuture`, or `all`.
- Feed tokens are treated as secrets and rate limited.
- Conflict detection considers classes, blocked time, and exclusions.
- Event state transitions log lifecycle changes; a status change should not
  skip that logging.

## Primary Journeys

1. Coach creates an event → `createGolfEvent()` → `golf_events` row →
   optional invitations/documents/qualifier/travel link.
2. Player responds → `respondToEvent()` → `golf_event_attendance` row
   (pending/accepted/declined/tentative).
3. Coach checks attendance → updates `checked_in` and absence metadata.
4. Calendar renders month/week/day/mobile views from the same event truth,
   with conflict detection against classes and blocked time.

## Architecture/Data Flow

```txt
Coach creates event -> createGolfEvent() -> WRITE golf_events
  -> optional invitations, documents, qualifier, or travel link

Player responds -> respondToEvent() -> WRITE golf_event_attendance
  -> pending | accepted | declined | tentative

Coach checks attendance -> update checked_in and absence metadata

Calendar renders views -> month, week, day, mobile list/sheet
  -> conflict detection against classes and blocked time
```

## Permissions/Tenancy

Coach writes scoped to teams they manage; player writes scoped to their own
attendance rows (see Invariants). Feed tokens are the one credential-like
surface in this feature and must be rate limited server-side.

## Dependencies

supabase, notifications, travel, qualifiers.

## Failure Modes

- Calendar has both premium/editorial and shared/simple component histories
  — avoid duplicating divergent logic between them.
- Filtering and event-click behavior have historically been bug areas in
  `PremiumCalendarClient`.
- iCal/feed code has token-security implications.
- Calendar links to travel, qualifiers, classes, and notifications — changes
  can have broad downstream effects.
- A hooks-order React error on `/golf/dashboard/calendar` (Mobile Safari,
  Sentry fingerprint "NT," first seen 2026-08-21 17:21 UTC) was investigated
  tonight and concluded an **honest negative**: 14/14 clean repros of the
  related error shape on `main`, zero rules-of-hooks lint violations
  repo-wide, and a prior "fix" (`89c287161`) shown to be a no-op rename. Not
  root-caused; still open. Do not assume it is fixed.

## Observability Contract

Calendar errors surface through the shared `logServerError`/`admin_events`
pipeline documented under `admin_platform`. A separate Bridge alert for
`syncClassToCalendar`'s malformed `timestamptz` handling was investigated
tonight and found **already fixed** on `main` (`f888fa6c7`, #1294,
2026-08-06 — `normalizeTimeOfDay` in `calendar-sync.ts`, confirmed present
at line 135); the Bridge signal predated that fix and needed no new work.

## Test Contract

- `src/test/lib/calendar/write-integrity.test.ts`
- `src/test/api/calendar/feed-token-security.test.ts`
- Browser checks for desktop calendar and mobile RSVP/event-sheet behavior.
- RLS tests when event/attendance/feed tables change.

## Known Debt/Unknowns

- The open hooks-order calendar error (Sentry "NT") has two candidate
  surfaces per tonight's investigation notes — this calendar route and a
  separate player game/genome route sharing the same error class — and the
  debugger investigation explicitly could not confirm a shared root
  component. Treat as unresolved, not merely "under investigation."
- Push notification support for urgent announcements/events may still lag
  behind in-app/email behavior (carried over from the prior doc generation,
  not independently re-verified this pass).
- This doc's schema section was already corrected 2026-08-19 (10 fabricated
  table names removed) and was not fully re-run against `information_schema`
  this pass — only the 18 named tables (8 real + 10 non-existent) were
  spot-re-checked against `database.ts`, all matching the prior finding
  exactly.

## Incident History

No `memory/incidents/calendar_events/` directory exists yet.

- All-day class-occurrence off-by-one (bugs #1493/#1494/#1495): fixed
  `446be8fbb`, 2026-08-19.
- `syncClassToCalendar` malformed-timestamp Bridge alert: confirmed
  already-fixed by `f888fa6c7` (2026-08-06); no action needed tonight.
- Hooks-order calendar crash (Sentry "NT"): investigated tonight, concluded
  honest negative — still open, no root cause identified yet.

## ADR Links

None yet.

## Verification Evidence

- Re-verified against `src/lib/types/database.ts` (pattern
  `^\s+<table>: \{`): all 8 real tables present exactly once each
  (`golf_events`, `golf_event_attendance`, `golf_event_documents`,
  `golf_academic_exclusions`, `golf_attendance_summary`,
  `golf_calendar_feeds`, `golf_calendar_notifications`,
  `golf_coach_blocked_time`); all 10 previously-flagged fabricated names
  confirmed still absent (0 matches each).
- Read `git show --stat 446be8fbb` (full commit message) confirming the
  all-day fix's root cause and mechanism.
- Confirmed `normalizeTimeOfDay` exists at `src/app/golf/actions/
  calendar-sync.ts:135` and `f888fa6c7` is on `HEAD`'s ancestry
  (`git log -1 f888fa6c7`).
- Cross-referenced tonight's `/tmp/claude/night/ledger.md` for the F8
  (hooks-order) and F12 (`syncClassToCalendar`) items.
- Did not re-run `write-integrity.test.ts` or `feed-token-security.test.ts`
  live this pass.
