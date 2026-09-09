# Feature: Calendar And Events

<!-- schema-drift-banner: hand-written above/below; do not auto-band this file -->

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
> **These 10 table names do not exist:** `golf_recurring_events`,
> `golf_availability_polls`, `golf_poll_responses`, `golf_calendar_sync_log`,
> `golf_calendar_sync_state`, `golf_external_calendars`,
> `golf_event_exclusions`, `golf_event_status_log`,
> `golf_player_availability_blocks`, `golf_player_attendance_stats`.
> Declared absent below so `npm run docs:schema-drift` exempts them
> structurally instead of carrying them in the numeric baseline.
>
> **A missing table does not always mean a missing feature** — check which case
> you're in before concluding anything. See "Current State".

<!-- schema-drift-absent: golf_recurring_events, golf_availability_polls, golf_poll_responses, golf_calendar_sync_log, golf_calendar_sync_state, golf_external_calendars, golf_event_exclusions, golf_event_status_log, golf_player_availability_blocks, golf_player_attendance_stats -->

## Current State

Calendar and Events provide team scheduling, RSVP, attendance tracking,
**recurring events**, iCal feed subscriptions, calendar notifications, coach
blocked time, academic conflict detection, class-schedule sync, event document
links, and attendance summaries.

**Recurring events ARE implemented — just not where this file said.** There is no
`golf_recurring_events` table. Recurrence lives on `golf_events` itself:
`recurring` (bool), `recurrence_rule` (text), `parent_event_id` (uuid), driven by
`src/app/golf/actions/recurring-events.ts` (~2,000 lines). Verified 2026-08-19
against `information_schema.columns`.

**"Sync" here means class-schedule sync, not external-calendar sync.**
`src/app/golf/actions/calendar-sync.ts` materializes a player's class schedule
into events (`parseSemesterDates`, `CLASS_EVENT_TYPE`). It has nothing to do with
Google/Outlook, and there is no sync-state or sync-log table.

**Genuinely not implemented** — no backing table *and* no source references:
availability polling / poll responses, external-calendar connections, player
availability blocks. If asked to extend one of these, it is new work, not an
extension.

The route is shared by coaches and players, but permissions and actions differ. Coaches create/manage events and attendance; players respond and consume schedule context.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/calendar/page.tsx`

### Components

- `src/components/fairway/pages/calendar/FairwayCalendar.tsx`
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
- `src/app/golf/actions/golf.ts` — event lifecycle CRUD (createGolfEvent / updateGolfEvent / deleteGolfEvent); the separate `event-lifecycle.ts` no longer exists
- `src/app/golf/actions/recurring-events.ts`
- `src/lib/calendar/**`

## Core Data

Verified against production 2026-08-19. **Only the first group exists.**

Real:

- `golf_events` — also carries recurrence: `recurring`, `recurrence_rule`, `parent_event_id`
- `golf_event_attendance`
- `golf_event_documents`
- `golf_academic_exclusions`
- `golf_coach_blocked_time`
- `golf_attendance_summary`
- `golf_calendar_feeds`
- `golf_calendar_notifications`

❌ **Do not exist. Not tables, views, functions, or types** — every one returned
absent from `pg_class`/`pg_proc`/`pg_type`:

- ❌ `golf_recurring_events` — recurrence is columns on `golf_events` (see above)
- ❌ `golf_event_exclusions`
- ❌ `golf_event_status_log`
- ❌ `golf_availability_polls`
- ❌ `golf_poll_responses`
- ❌ `golf_player_availability_blocks`
- ❌ `golf_player_attendance_stats`
- ❌ `golf_calendar_sync_log`
- ❌ `golf_calendar_sync_state`
- ❌ `golf_external_calendars`

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

Coach compares schedules
  -> getScheduleWindow() (RLS-backed read only)
  -> getUserBusyPeriodsWithStatus() for the coach and selected active roster members
  -> verified free/busy snapshot; partial reads are never presented as free

Calendar renders views
  -> month, week, day, mobile list/sheet
  -> conflict detection against classes and blocked time
```

## Scheduling Workspace

`src/app/golf/actions/scheduling.ts` is the single server boundary for the
Fairway “Find a time” workspace. It requires a coach or player membership in
the requested team; only a coach may request another player’s schedule. The
returned snapshot carries only the team-local day, named busy intervals, and a
per-person verification state. `CalendarSchedulingDialog` rechecks the exact
choice immediately before returning it to the event editor, so a stale visual
snapshot cannot be used as a confirmation.

The workspace is read-only. Creating or editing an event remains in the
existing event actions and reuses `checkScheduleConflicts`. A valid
`golf_coach_blocked_time.recurrence_rule` is authoritative; writes keep its
legacy `is_recurring` flag in sync for older consumers.

## Business Rules

- Coach event writes must be scoped to teams they can manage.
- Player RSVP writes must be scoped to their own attendance row.
- Recurring event edits must respect scope: this, thisAndFuture, or all.
- Feed tokens must be treated as secrets and rate limited.
- Calendar conflict detection should consider classes, blocked time, and exclusions.
- **Class meetings take no RSVPs and never travel through attendance.**
  `respondToEvent` refuses any `isClassEvent` row with code `class_meeting`;
  `getUserBusyPeriodsWithStatus` skips class rows reached via
  `golf_event_attendance`; the conflict inbox re-resolves class-ness from a
  fresh `golf_events`/`golf_player_classes` read and omits the title when the
  viewer lacks access. A teammate's class is a titleless busy block or
  nothing — never a titled event. The `golf_event_attendance_insert_self` RLS
  policy still lacks an `event_type` check (defense-in-depth migration
  pending owner decision); the app layer is the enforced boundary. Tests:
  `src/test/lib/calendar/availability.test.ts`,
  `src/app/golf/actions/__tests__/conflict-inbox.test.ts`,
  `src/test/golf/actions/rsvp-failure-vs-refusal.test.ts`.
- Event state transitions should not skip lifecycle logging when status changes.

## UI Contract

- Month, week, day, agenda, and mobile views should render from the same event truth.
- Mobile calendar must use compact event cards/sheets and clear RSVP actions.
- Event detail needs visible status, attendee/RSVP state, documents, and conflict warnings where relevant.
- Empty states should distinguish no events from filtered-out events.
- The header should avoid stacking multiple utility rows; lower-priority controls should move into sheets/menus.
- The Agenda anchors "Today" into view only when earlier buckets are visible
  above it and the range genuinely changes; on a fresh load past buckets are
  collapsed, "Today" already heads the list, and nothing scrolls — the old
  unconditional anchor pushed the masthead 130–386px off-screen (mobile audit
  2026-09-02, UI-2/UI-3). The event editor scrolls its own error banner into
  view (`role="alert"`) so an end-before-start rejection is never rendered
  above the fold of a scrolled modal (UI-5 / P1-8).

## Known Risk Areas

- Calendar has both premium/editorial and shared/simple component histories; avoid duplicating divergent logic.
- Filtering and event-click behavior have been historical bug areas in `PremiumCalendarClient`.
- iCal/feed code has token security implications.
- Calendar links to travel, qualifiers, classes, and notifications; changes can have broad downstream effects.
- Push notification support for urgent announcements/events may lag behind in-app/email behavior.
- **Class meetings are `golf_events` rows on the TEAM calendar, not a
  side table.** `syncClassToCalendar` (`src/app/golf/actions/calendar-sync.ts`)
  writes one row per class meeting with `event_type = 'class'` (filterable —
  `NOT NULL text`, so `.neq()` cannot silently drop rows) and a
  `[class:<uuid>]` tag inside `description` as the only owner link
  (`created_by` is null). Any sweep of `golf_events` by `team_id` that calls
  the result "someone's schedule" without both filters is wrong — shipped that
  way until a 2026-08-06 fix, when a coach filtering the calendar to their own
  avatar saw the whole roster's classes. `expandRecurringClass` must stay
  bounded by the class's persisted `semester`; an unbounded weekly rule marks
  players busy over the summer. A player sees only their own classes; a coach
  sees the whole team — this deliberately matches `golf_player_classes` RLS,
  don't "fix" it back. (STILL-TRUE-AND-USEFUL, source: auto-memory note
  `class-events-are-team-events.md` dated 2026-08-06; verified 2026-09-05
  against `src/lib/calendar/class-events.ts` and
  `src/app/golf/actions/calendar-sync.ts`, both present.)
- **`golf_events.end_time` for an all-day event is the INCLUSIVE last day at
  UTC midnight, not exclusive.** Comparing it as an instant against a day
  boundary reintroduces the classic "event shows one day early" bug for any
  non-UTC team, because a local day can straddle the UTC-midnight line by
  several hours. `eventDaySpan(ev, timezone)`
  (`src/lib/calendar/timezone.ts`) is the shared, correct comparison — a new
  surface reading `start_time`/`end_time` directly should call it rather than
  writing a seventh copy of the day-math. As of the source note, the coach and
  player dashboard "Today/Upcoming" surfaces still read only `start_time`
  (their fix needs a `p_today_date date` signature change on a
  `SECURITY DEFINER` function) — treat that as open until re-verified.
  (STILL-TRUE-AND-USEFUL, source: auto-memory note
  `instant-overlap-is-not-day-overlap.md` dated 2026-08-17; verified
  2026-09-05 against `src/lib/calendar/timezone.ts`, present; the dashboard
  fix status is unverified since 2026-08-17.)
- **`golf_events` has no `is_mandatory` column.** The concept is
  baseball-only (`baseball_events.is_mandatory` is real). The player-hub RPC
  `get_player_hub_events` returns `is_mandatory: FALSE` hardcoded for golf, by
  design — a bug report describing "editing a mandatory golf event clears its
  mandatory flag" is a false alarm against a stub, not a data bug. See
  `memory/context/golfhelm-database.md` for the schema fact. (STU, source:
  `golf-has-no-mandatory-event-flag.md` dated 2026-08-16.)

## Tests To Prefer

- `src/test/lib/calendar/write-integrity.test.ts`
- `src/test/api/calendar/feed-token-security.test.ts`
- `src/test/api/calendar/feed-last-synced-waituntil.test.ts` — the feed
  route's `last_synced_at` stamp is registered with waitUntil and never rejects
- Browser checks for desktop calendar and mobile RSVP/event sheet behavior.
- RLS tests when event/attendance/feed tables change.

## Related Docs

- `memory/context/golfhelm-features.md`
- `memory/context/golfhelm-database.md`
- `docs/features/CALENDAR_COMPREHENSIVE_IMPLEMENTATION_PLAN.md`
- `docs/PUSH_NOTIFICATION_AUDIT.md`

Mobile calendar day cells retain a 44px width and scroll horizontally when the week cannot fit; the
selected date stays visible after selection and resize. Phone hero padding and day-cell height are
compact, with a matching route skeleton. The schedule card uses the same touch-sized day rail and
keeps its date separate from the return-to-today action.

## Calendar material contract (2026-09-09 makeover)

- `src/components/fairway/pages/calendar/CalendarSurfaces.module.css` is the one
  material vocabulary for every calendar surface: `.scope` declares the
  calendar-only colours (busy periwinkle, class, team, lens, overlap, ground
  wash, chrome tint) once with dark overrides; `.ground` paints the page wash
  the glass refracts; `.chrome`, `.dock`, `.float` are the frosted champagne
  glass (token blur, `--fw-blur-mobile` at ≤768px); `.paper`, `.well`,
  `.row` are matte content planes; `.selected`, `.glow`, `.check`, `.lens`
  are the emerald focused plane. Reduced motion switches off every
  animated/transitioned class and reduced transparency makes chrome and docks
  opaque — `__tests__/CalendarSurfaces.reducedMotion.test.ts` enforces both.
- The calendar hero (`FairwayCalendarHero`) is sticky glass chrome: it sits at
  `--golf-mobile-header-offset` plus `--fw-hub-subnav-offset` (AppShell
  publishes the second one as `2.5rem` when a hub sub-nav is part of its
  sticky unit, else `0px`) so agenda rows, the member rail and the grids
  scroll under it. It owns the view `Segmented` control, prev/today/next, the
  ONE primary action, and the secondary actions (Find a time, Conflicts, My
  availability, Add to phone) as ghost pills at md+ or a More menu on phone.
- Agenda rows are time-gutter + ivory `.row` cards with a type-tinted icon
  disc; the conflict count on the home is a real inbox count (`null` while
  unknown, never a fabricated zero).
