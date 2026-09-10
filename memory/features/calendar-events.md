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
existing event actions and reuses `checkScheduleConflicts`.

Acceptance rule (2026-09-09): `acceptProposal(evaluation)` in
`src/lib/calendar/scheduling/evaluate.ts` is the ONE rule for whether a
proposed time may be chosen — every schedule verified and every REQUIRED
person free; optional participants may be busy. `SchedulingWorkspace` uses it
for the task board and the confirm action, and `CalendarSchedulingDialog`
uses it for the final recheck, so an enabled action is never rejected by the
same unchanged selection. `allAvailable` (nobody has an overlap) remains the
stricter signal for wording and for `suggestScheduleTimes`.

Workspace composition: the contextual action lives in `SchedulingTaskBoard`
(Fairway `Elevated`, one floating object) whose content follows the task —
accepted / required person busy (names + "Next open time") / unverified
(names + Retry) / fetch or recheck failure ("Could not verify schedules",
Retry, confirm disabled). The frame reserves the board's space below the
scrolling body. `CalendarSchedulingDialog` opens `ModalShell` with
`presentation="workspace"` (phone: edge-to-edge full height, keyboard-aware;
`sm`+: a wide stage) instead of per-dialog `!important` geometry.

Gesture contract: releasing a drag commits the RELEASE position (a pending
animation frame is cancelled and its coordinate flushed, never dropped); a
lane tap places the window only when the pointer stayed within 8px between
down and up, so horizontal pans and page scrolls never move the selection.
Dragging proposes; nothing is saved until the confirm action. A valid
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

## Calendar composition contract (2026-09-09, redirected)

- Compose with Fairway primitives, not a calendar-local material system.
  Rows that carry several children (event rows, people rows, conflict rows,
  busy-time rows, document rows, the attendance disclosure, the scheduling
  name column and suggestion cards) are `PressTarget` with their own layout;
  `Button` is only for labeled actions and is never reached into (no
  `[&>span]`, no `.buttonRow`). A distinct row = a bordered `bg-surface`
  Surface with `--fw-shadow-card`, `hover:bg-surface-sunken`, and a
  selected state of `border-accent-650` + inset ring. Colored left edges on
  cards remain banned (owner, 2026-09-09).
- `CalendarSurfaces.module.css` keeps only functional calendar vocabulary:
  `.scope` colours, lane/day grid hairlines, busy/class/team/personal blocks,
  `.hatch` (unverified), `.reference`, the selection lens and its
  follow/settle/dragging motion, `.enter` stagger, `.pending`, `.inspector`,
  `.panel` (page ground), and the reduced-motion / reduced-transparency
  blocks. Retired (2026-09-09): `.ground`, `.chipFloat`, `.avatarChip`,
  `.teamChip`, `.buttonRow`, `.paper`, `.well`, `.chrome`, `.dock`, `.float`,
  `.selected`, `.glow`, `.check`, `.attention`, `.row`, `.rowIcon`, `.press`,
  `.rise`. Their consumers use Tailwind tokens directly (`fw-glass-chrome`
  for chrome, bordered `bg-surface` for rows, `bg-accent-650
  text-text-on-accent` for a checked state, `fw-warning-*` for attention).
- Detail drawer (`FairwayEventDetailDrawer`, `EventPeopleSection`): row
  icons are bare emerald glyphs (`text-accent-700`) — a cream disc on a
  cream card washed out, and the owner asked for the green as the accent
  (2026-09-09); only semantic warning/success discs keep a fill. Responses
  is ONE centred `dl` strip — figure over label, hairline dividers, labels
  Accepted / Maybe / No / Pending — not four sunken tiles; the Accepted count
  carries the accent when above zero. The date line is the sans body-sm face
  with an emerald clock, not mono.
- Masthead (`FairwayCalendarHero`): shared `fw-glass-chrome` material with a
  warm bottom rim + the resting whisper (it floats over the list), sticky at
  `--golf-mobile-header-offset` + `--fw-hub-subnav-offset`; it publishes its
  own height as `--fw-calendar-hero-h` on the page column (ResizeObserver).
  Row 1 = the period as a large title (`MMMM` with the year quiet beside it,
  `weekRangeTitleParts` in Week, `EEEE, MMMM d` in Day) — the title is the
  date-jump: a `PressTarget` trigger opening a `PopoverPanel` with the shared
  `CalendarSurface`; picking a day calls `onSelectDate` and closes it — ·
  Today (secondary pill, only when away; carries today's number in a
  decorative calendar glyph outside the name) · More (secondary disc, below
  xl) · the coach's ONE primary action as a labelled button from md up.
  Row 2 = the full-width view `Segmented` in its shared depth presentation ·
  prev/next from md up only. Row 3 = the week strip in Day view only. A
  range fetch in flight is a 2px progress line along the masthead's bottom
  edge (`busy`, with the sr-only live text), not a banner in the list.
- Phone navigation: no arrows. The schedule body (`data-testid="calendar-body"`)
  swipes horizontally (≥56px, ≤40px drift, touch/pen only) to step the
  period; ←/→/T keys and the title's date-jump still work. The body is
  re-keyed per `view|period` and slides in from the direction of time
  (derived from the period keys, so arrows, swipes, strip taps and jumps all
  turn the page the right way; a view change is a cut; reduced motion
  disables it). The coach's phone primary action is a 56px floating `+`
  (`IconButton` primary, lit top edge + `--fw-shadow-raise`) fixed above the
  tab bar (`--fw-mobile-nav-height` + 1rem), rendered by `FairwayCalendar`.
- People entry (`FairwayCalendarMemberRail`): ONE raised row
  (`rounded-[16px]`, hairline, `--fw-shadow-card`): the summary
  (AvatarGroup max 2 · "Team schedule" / "Comparing N" · detail · chevron) is
  a `PressTarget` that IS the People menu trigger (`aria-label="People"`);
  Clear while comparing (ghost text, the only other thing inside the row).
  Nothing else nests in the row: on a phone "Compare schedules…" lives in
  the People menu; from md a labelled secondary Compare button stands BESIDE
  the row (`hidden md:inline-flex`), never inside it. Three distinct actions
  — team schedule, open a person, include in a comparison — never one avatar
  meaning all three.
- Agenda: month-scoped — its visible window is the title's calendar month
  and prev/next step by month (`Previous month` / `Next month`); the empty
  state names the period ("Nothing in September 2026") in a compact
  (`subtle`) EmptyState, never a full-screen card. Week view titles its
  exact Sunday-start range ("Sep 6 – 12, 2026", `weekRangeTitle`) and its
  empty state names the week. Day headings pin under the masthead while
  their day scrolls (`sticky`, top = bar offsets + `--fw-calendar-hero-h`,
  translucent canvas + blur, opaque under reduced transparency); Today /
  Tomorrow carry their calendar date beside the heading, days within the
  coming week a quiet "in N days" cue. Each day is ONE raised group card
  (`rounded-[16px]`, lit top edge + `--fw-shadow-soft`) of rows divided by
  hairlines (0.5px on 2x screens). Today's group carries a now-line
  (`role="separator"`, "Now, 3:30 PM" in the team zone) at its sorted
  position — after what has started, before what is next — seeded from
  `nowRef` and ticking by the minute only after mount. Rows show the start
  with its meridiem and the end time beneath on every width; a touch press
  tints the row.
- Scheduling name column: 116px on phones showing the first name whole
  (full name from `sm` and in the accessible label), 120px from md. A day heading and
  ONE grouped Surface of rows divided by hairlines; "Show N earlier events"
  is a ghost action with the real count.
  Phone Month view is `CalendarSurface` (DayPicker, event-day dots from
  `eventDaySpan`) as one raised card with sans tabular day numbers (never the
  mono face), the selected day's events beneath; a day tap never switches
  view. Desktop month keeps a single day target per cell. The week
  strip marks every day a multi-day event runs (same `eventDaySpan`).
- Player: "Needs your reply → Respond" is a contextual row next to the
  schedule, not a header CTA.
- Not yet done (Phase C): desktop context rail (Spine & Stage),
  event-to-detail continuity, physical-device / dark / large-text checks.
