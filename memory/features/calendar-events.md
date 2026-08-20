# Feature: Calendar And Events

## Status

- active

> **⚠️ Schema claims in this file were corrected 2026-08-19 against production.**
> It previously named 17 tables, **10 of which do not exist** — and, because it
> listed them beside the 8 real ones in the same format, described several
> subsystems the product does not have. The 10 are recorded in
> `.doc-schema-baseline.json`; `npm run docs:schema-drift` fails on any new one.
>
> **The 8 calendar tables that exist in production** (verified by direct
> `pg_class` query, and matching what the shipped calendar code queries):
> `golf_events`, `golf_event_attendance`, `golf_event_documents`,
> `golf_academic_exclusions`, `golf_attendance_summary`, `golf_calendar_feeds`,
> `golf_calendar_notifications`, `golf_coach_blocked_time`.
>
> **Do not exist — do not build on them:** `golf_recurring_events`,
> `golf_availability_polls`, `golf_poll_responses`, `golf_calendar_sync_log`,
> `golf_calendar_sync_state`, `golf_external_calendars`,
> `golf_event_exclusions`, `golf_event_status_log`,
> `golf_player_availability_blocks`, `golf_player_attendance_stats`.

## Current State

Calendar and Events provide team scheduling, RSVP, attendance tracking, iCal
feed subscriptions, calendar notifications, coach blocked time, academic
conflict detection, event document links, and attendance summaries.

**Not implemented**, despite earlier revisions of this file listing them as
current: recurring-event definitions, availability polling / poll responses,
external-calendar connections, and two-way sync state. Each was described here
with a backing table; none of those tables exist in production. If you are asked
to extend one of these, the honest answer is that it would be new work, not an
extension.

The route is shared by coaches and players, but permissions and actions differ. Coaches create/manage events and attendance; players respond and consume schedule context.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/calendar/page.tsx`

### Components

- `src/components/golf/calendar/GolfCalendarWrapper.tsx`
- `src/components/golf/calendar/PremiumCalendarClient.tsx`
- `src/components/golf/calendar/MonthView.tsx`
- `src/components/golf/calendar/WeekView.tsx`
- `src/components/golf/calendar/DayView.tsx`
- `src/components/golf/calendar/MobileEventSheet.tsx`
- `src/components/golf/calendar/MobileRSVPButtons.tsx`
- `src/components/golf/calendar/editorial/**`

### Actions And Services

- `src/app/golf/actions/attendance.ts`
- `src/app/golf/actions/calendar-feeds.ts`
- `src/app/golf/actions/calendar-sync.ts`
- `src/app/golf/actions/event-documents.ts`
- `src/app/golf/actions/event-lifecycle.ts`
- `src/app/golf/actions/recurring-events.ts`
- `src/lib/calendar/**`

## Core Data

- `golf_events`
- `golf_event_attendance`
- `golf_event_exclusions`
- `golf_event_status_log`
- `golf_availability_polls`
- `golf_poll_responses`
- `golf_academic_exclusions`
- `golf_player_availability_blocks`
- `golf_coach_blocked_time`
- `golf_attendance_summary`
- `golf_player_attendance_stats`
- `golf_calendar_feeds`
- `golf_calendar_notifications`
- `golf_calendar_sync_log`
- `golf_calendar_sync_state`
- `golf_external_calendars`
- `golf_recurring_events`

## Data Flow

```txt
Coach creates event
  -> createGolfEvent()
  -> WRITE golf_events
  -> optional invitations, documents, qualifier, or travel link

Player responds
  -> respondToEvent()
  -> WRITE golf_event_attendance
  -> pending | accepted | declined | tentative

Coach checks attendance
  -> attendance action/component
  -> update checked_in and absence metadata

Calendar renders views
  -> month, week, day, mobile list/sheet
  -> conflict detection against classes and blocked time
```

## Business Rules

- Coach event writes must be scoped to teams they can manage.
- Player RSVP writes must be scoped to their own attendance row.
- Recurring event edits must respect scope: this, thisAndFuture, or all.
- Feed tokens must be treated as secrets and rate limited.
- Calendar conflict detection should consider classes, blocked time, and exclusions.
- Event state transitions should not skip lifecycle logging when status changes.

## UI Contract

- Month, week, day, agenda, and mobile views should render from the same event truth.
- Mobile calendar must use compact event cards/sheets and clear RSVP actions.
- Event detail needs visible status, attendee/RSVP state, documents, and conflict warnings where relevant.
- Empty states should distinguish no events from filtered-out events.
- The header should avoid stacking multiple utility rows; lower-priority controls should move into sheets/menus.

## Known Risk Areas

- Calendar has both premium/editorial and shared/simple component histories; avoid duplicating divergent logic.
- Filtering and event-click behavior have been historical bug areas in `PremiumCalendarClient`.
- iCal/feed code has token security implications.
- Calendar links to travel, qualifiers, classes, and notifications; changes can have broad downstream effects.
- Push notification support for urgent announcements/events may lag behind in-app/email behavior.

## Tests To Prefer

- `src/test/lib/calendar/write-integrity.test.ts`
- `src/test/api/calendar/feed-token-security.test.ts`
- Browser checks for desktop calendar and mobile RSVP/event sheet behavior.
- RLS tests when event/attendance/feed tables change.

## Related Docs

- `memory/context/golfhelm-features.md`
- `memory/context/golfhelm-database.md`
- `docs/features/CALENDAR_COMPREHENSIVE_IMPLEMENTATION_PLAN.md`
- `docs/PUSH_NOTIFICATION_AUDIT.md`
