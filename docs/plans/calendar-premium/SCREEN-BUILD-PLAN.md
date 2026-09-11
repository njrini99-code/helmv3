<!-- markdownlint-disable MD013 -->
# GolfHelm calendar: screen build plan

Screen-level companion to [DESIGN-PLAN.md](DESIGN-PLAN.md) (Revision 2) and
[PARALLEL-EXECUTION-PLAN.md](PARALLEL-EXECUTION-PLAN.md). Those two documents remain authoritative for product
intent and package ownership; this file turns the design's screen inventory (§3, §9, §18, §19, §20, §22) into
buildable screens with files, data sources, states, motion targets, accessibility, tests, and parallel waves.
It changes no product code and validated no live schema.

The user's brief, verbatim: "more depth and detail, like edit event, more premium feel both mobile and desktop";
"theres screens were missing"; "edit event, new event, class detail for players not just day view,
microinteractions etc." The centre of gravity is therefore the event editor, the missing screens (class detail
first), and material/motion on both form factors. This is not another infrastructure round.

## 1. Base, evidence, and what is already built

Base: worktree `/Users/ricknini/worktrees/helmv3/calendar-premium`, branch `codex/calendar-premium`, HEAD
`03c461bf0` ("feat(calendar): add verified premium scheduling"), PR #1911 against `main`. Do not touch the
canonical checkout; it is another session's branch. Line numbers below were read at this HEAD plus the
uncommitted polish pass described in §1.2; symbol names are the durable references.

### 1.1 Verified current surfaces

| Surface | Source (read) | What exists today |
| --- | --- | --- |
| Route | `src/app/golf/(dashboard)/dashboard/calendar/page.tsx` | Single server entry rendering `FairwayCalendar` |
| Orchestrator | `FairwayCalendar.tsx:175` | Owns view, member rail, drawer (`:1206`), editor (`:1234`), person dialog (`:1253`), scheduling dialog (`:1270`), subscribe sheet (`:1279`, defined `:1303-1449`) |
| Editor | `FairwayEventEditor.tsx:368` | One `ModalShell size="xl"`: title spine `:1008`, type chips, `EventWhenFields`, all-day, Find a time `:1122`, verification panel `:1140-1195`, location/notes `:1216-1236`, RSVP `:1242`, inline avatar-grid invite `:1286`, recurrence, footer `:1596`, series scope picker `:889-944`, `DiscardChangesModal` `:1704` |
| Detail | `FairwayEventDetailDrawer.tsx:117` | Bottom `Sheet` on every viewport (`:228-231`); RSVP gating `:180-205`; coach Readouts `:420`; legacy `AttendancePanel` embedded via `dynamic` (`:23-30`, `:459`) |
| Person schedule | `CalendarPersonDialog.tsx:139` | Full-height `ModalShell`, two lanes (classes / team and personal), commitments list; tapping a class does nothing beyond the lane and list row |
| Find a time | `scheduling/SchedulingWorkspace.tsx`, `CalendarSchedulingDialog.tsx` | Verified snapshot timeline, drag band, suggestions; read-only by contract |
| Member rail | `FairwayCalendarMemberRail.tsx:126-259` | Open-person by default, explicit Compare mode toggles checkbox selection |
| Data boundary | `src/app/golf/actions/scheduling.ts:11` `getScheduleWindow` | Team-membership authorization; coach-only for other people (`:55`); per-person `complete`/`partial`/`failed` |
| Contracts | `src/lib/calendar/scheduling-contracts.ts` | `ScheduleInterval.title: string` is required; no `access` field |
| Hook | `src/hooks/golf/use-schedule-window.ts:52` | Keyed requests, stale-response discard, retry |
| Material | `CalendarSurfaces.module.css` (untracked) | `.panel`, `.chrome`, `.paper`, `.selected`, `.enter`, reduced-motion and reduced-transparency blocks |

Legacy tree `src/components/golf/calendar/` (30 files) holds the only UI for attendance, documents, feeds,
notifications, and the old availability day view. The design says not to resurrect it; this plan reuses its
server actions and re-composes its behaviour in Fairway, then removes the two remaining legacy imports
(`AttendancePanel` in the drawer, `CalendarFeedManager` in the subscribe sheet).

### 1.2 The uncommitted polish pass, and how this plan absorbs it

`git status` shows four modified files (`CalendarPersonDialog.tsx`, `FairwayEventDetailDrawer.tsx`,
`FairwayEventEditor.tsx`, `scheduling/SchedulingWorkspace.tsx`) and the untracked `CalendarSurfaces.module.css`.
The diff introduces the material vocabulary, removes `sky-*` class colouring, fixes lane clipping in the person
dialog, and changes the scheduling drag mapping. Decision: the coordinator lands this pass as the first commit of
Wave A ("feat(calendar): shared calendar material vocabulary") after two checks, and the CSS module becomes a
coordinator-owned shared file. Nobody else edits it; workers request new class names through a handoff note.

Checks before that commit: (1) `SchedulingWorkspace.tsx` now computes `nextIndex` from `slots.length` but indexes
`validStarts` (the diff at the `handlePointer` block); confirm with the existing
`scheduling/__tests__/SchedulingWorkspace.test.tsx` drag case that the last valid start is still reachable.
(2) `CalendarPersonDialog.tsx` renders `snapshot!.window.start` with a non-null assertion inside the `person`
branch; keep it behind the existing `person` guard so a failed load cannot throw.

### 1.3 Screens the design calls for with no Fairway surface (verified)

| Design §3 surface | Evidence of absence | Planned in |
| --- | --- | --- |
| Conflict center and conflict detail | No component or action returns conflicts across events; only per-draft `checkScheduleConflicts` (`golf.ts:5570`) | §2.8 |
| People picker as a searchable surface | Invite is an inline avatar grid (`FairwayEventEditor.tsx:1286`) | §2.3 |
| Attendance screen | Only legacy `AttendancePanel`, embedded in the drawer | §2.5 |
| Files on an event | Only legacy `EventDocumentsSection.tsx`; not mounted anywhere in Fairway | §2.6 |
| My availability / personal busy time | `golf_coach_blocked_time` CRUD at `golf.ts:6133/6201/6284/6343`; no UI; player table does not exist | §2.7 |
| Calendar subscriptions / source status | Legacy `CalendarFeedManager` inside `FairwaySubscribeSheet` | §2.9 |
| Class detail for a player | Person dialog shows a lane and a list row only; `src/components/golf/classes/ClassDetailModal.tsx` belongs to the Classes page, not the calendar | §2.4 |

## 2. Screen workstreams

Every screen below follows the same contract: one primary action, mobile and desktop composition, exact files
under `src/components/fairway/pages/calendar/`, the server action or hook it consumes, states, microinteractions
tied to the §10/§20 motion grammar, accessibility, and the tests that prove it. Shared rules:

- Design authority order: `src/styles/design-tokens.css` → `src/components/fairway/**` → `.claude/rules/design-system.md`.
  Overlays are `ModalShell` or `Sheet` from `src/components/fairway/overlays/`; anchored menus are `PopoverPanel`;
  empty states use `EmptyState`/`FeatureUnavailable`; notices use `InlineNotice`; tabs use `Segmented`.
- Desktop means `useMediaQuery('(min-width: 1024px)')` (`src/hooks/use-media-query.ts:18`). Inspector width 300–360px.
  Between 768 and 1023px the inspector collapses into the mobile drill-in; the grid is never compressed.
- Motion uses `src/lib/coachhelm/v3/motion.ts` (`EASE_TAP`, `EASE_CINEMATIC`, `DURATION`, `useReducedMotionGuard`)
  and CSS classes from `CalendarSurfaces.module.css`. Haptics use `fwHaptic` from `src/lib/fairway/haptics.ts:131`
  with kinds `selection`, `light`, `success`, `warning` only; never during a pan.
- Honesty: missing data never renders as free; no verified check from a `partial` or `failed` result; no
  fabricated names, avatars, or availability; counts render real zeros.
- Privacy: free/busy access and detail access are separate. A class title renders only when the server returned
  it for this viewer. Hidden UI is not enforcement; every new read goes through a server action under RLS.
- Mobile: 320–430px, safe areas applied by exactly one owner (the overlay primitive), 44px targets, large text,
  dark mode, reduced motion, reduced transparency. Every test suite includes a 320px case.

### 2.1 Event editor: new event (S1)

Purpose: create a complete event with verified people and time. Primary action: **Publish event**.

Mobile: three stages inside the existing `ModalShell` (full height on phones): Essentials (title, type, location,
notes, files) → People and time (date/time via `EventWhenFields`, all-day, repeat, invite via the people picker,
Find a time, verification panel) → Review (receipt: What, When incl. timezone, Where, Who, Repeats, RSVP, unresolved
issues). A compact stage header shows three labelled dots; the footer dock holds Back and Continue, then Publish.
Global bottom navigation is behind the overlay backdrop; the dock is the only floating bar.

Desktop: `ModalShell size="full"` two-column layout. Left: essentials and when. Right: people, verification, and
the receipt pinned above the footer. No stage stepper; Review is the always-visible receipt. Find a time opens
`CalendarSchedulingDialog` as today (`FairwayCalendar.tsx:1270`), editor stays mounted via `suspended`.

Files:

- `FairwayEventEditor.tsx` (edit): becomes the orchestrator; keeps draft, hydration (`:518-559`), scope picker,
  submit, and discard logic; delegates rendering to the modules below.
- **NEW** `editor/EventEditorStages.tsx`: stage header, dock, and transition wrapper.
- **NEW** `editor/useEventEditorStages.ts`: stage state machine (`essentials | people-time | review`), validation
  per stage, focus target per stage.
- **NEW** `editor/EventEssentialsFields.tsx`: title spine, type chips, location, notes, files field (§2.6).
- **NEW** `editor/EventPeopleTimeFields.tsx`: when fields, all-day, repeat (extracted from the current recurrence
  block), invite summary button (opens §2.3), Find a time button, verification panel.
- **NEW** `editor/EventVerificationPanel.tsx`: extraction of `:1140-1195` with typed states
  `idle | checking | verified | partial | conflicts | failed`.
- **NEW** `editor/EventReviewReceipt.tsx`: receipt used by S1, S2, and the conflict review path.
- `EventWhenFields.tsx` (edit only if the stage layout needs a compact variant of `SpanSummary`).

Data: `createGolfEvent` (`golf.ts:3432`), `createRecurringEvent` (`recurring-events.ts:1023`),
`checkScheduleConflicts` (`golf.ts:5570`). No new action. Notification counts are not returned by these actions,
so the receipt says "Attendees will be notified" without a number (§18 "show count only when known").

States: loading (attendee roster hydrating: fields render, invite button shows count skeleton); empty roster (invite
button disabled with "No players on this team yet"); validation error (inline, `role="alert"`, scrolls into view as
today); verification `partial`/`failed` (amber panel with Retry, Publish still allowed with explicit disclosure text);
save failure (inline near dock, draft intact, Retry); offline (Publish disabled with "Reconnect to publish"; draft
kept in memory; Find a time disabled).

Microinteractions: stage change is a 200ms directional slide with `EASE_CINEMATIC`, reduced motion crossfades in
120ms; type chip press compresses to 0.97 for 90ms; verification state crossfades in 160ms and the check icon
appears once per verified result; Publish keeps its width, label becomes "Publishing…", duplicate activation is
blocked by the existing `busy` prop; success runs `fwHaptic('success')` once and closes with no artificial delay.

Accessibility: each stage is a `role="group"` with `aria-labelledby`; the active dot has `aria-current="step"`;
focus moves to the stage heading after a stage change; Escape closes popups before the dialog (ModalShell rule);
focus returns to "New event" on close (existing `ModalShell.focus-restore` behaviour); the receipt is a
description list so screen readers hear label/value pairs.

Tests: extend `__tests__/FairwayEventEditor.test.tsx` (stage navigation preserves draft; review shows unresolved
verification; Publish disabled offline); **NEW** `editor/__tests__/EventEditorStages.test.tsx`,
`editor/__tests__/EventReviewReceipt.test.tsx`, `editor/__tests__/EventVerificationPanel.test.tsx`.

### 2.2 Event editor: edit, reschedule, series (S2)

Purpose: change an existing event safely. Primary action: **Save changes** (label becomes **Move event** when only
time changed, per §7).

Mobile and desktop share S1's composition. Differences: the receipt highlights only changed fields and shows the
previous value beside each (from `pristineRef`, `FairwayEventEditor.tsx:503`); the series scope picker (`:889-944`)
stays as the first step for series members and the chosen scope appears in the receipt; attendee deltas use the
existing `computeAttendeeChanges` summary (`:581-585`). A cancelled event keeps the existing Restore/Delete panel.

Files: same modules as S1 plus **NEW** `editor/EventChangeSummary.tsx` (changed-field diff for the receipt).

Data: `updateGolfEvent` (`golf.ts:3716`), `editRecurringEvent` (`recurring-events.ts:1450`),
`deleteGolfEvent`/`deleteRecurringEvent`, `getEventRSVP` (`golf.ts:6045`). No new action. Stale-revision handling
(§12) is not available: `golf_events` has no revision column and the actions return no `stale` outcome. The
receipt therefore cannot show "changed since you opened it"; this is recorded as gate G4 and must not be faked.

States: hydration `loading | loaded | error` (existing); series scope pending; no changes (Save disabled, no
discard prompt, existing `isDirty` at `:858`); save failure (draft and scope preserved); locked (cancelled event).

Microinteractions: changed rows in the receipt get a 160ms tint crossfade, not a bounce; the scope picker's
options are large `Segmented`-style cards with 44px targets; haptic `light` on scope choice.

Tests: extend `__tests__/FairwayEventEditor.scope.test.tsx` (scope surfaces in receipt) and
`FairwayEventEditor.test.tsx` (changed-field diff; Move event label when only time changed).

### 2.3 People picker (S3)

Purpose: choose people deliberately, for invitations or comparison. Primary action: **Done** ("Apply attendees"
from the editor, "Compare selected" from the rail).

Mobile: full-height `ModalShell` matching `CalendarPersonDialog`'s shell. Fixed search at top; selected count and
"Select shown"/"Clear" row; list rows with avatar (not a control), name, role, and a 44px checkbox on the right.
In comparison mode a Required/Optional toggle per row appears; You is included by default with an explicit remove.
Desktop: `PopoverPanel` anchored to the trigger (max height 480px) with keyboard selection; from the rail it
renders inside the right inspector instead.

Files: **NEW** `people/CalendarPeoplePicker.tsx`, **NEW** `people/usePeopleSelection.ts` (selection, filter,
required/optional, cancel-restores-previous), **NEW** `people/__tests__/CalendarPeoplePicker.test.tsx`;
`FairwayEventEditor.tsx` replaces the inline grid with a summary button; `FairwayCalendarMemberRail.tsx` Compare
opens the picker instead of toggling avatars in place.

Data: the roster already passed as `teamPlayers`/`teamMembers` props; no server action. Groups are offered only
for real membership data (role coach/player); there are no position groups. Required/optional is client-only for
comparison because `golf_event_attendance` has no such column (unverified; gate G3).

States: loading roster; empty roster (`EmptyState`); search empty ("No one matches" with Clear search); no-access
(players never see the invite picker; comparison is coach-only, matching `getScheduleWindow`).

Microinteractions: row press compresses 0.98 for 90ms; checkbox check is an immediate state change with a 140ms
opacity crossfade; count updates locally with no layout shift; haptic `selection` per toggle, throttled to one per
gesture. Done returns to the exact editor scroll or timeline position and triggers one refreshed evaluation.

Accessibility: `role="listbox"` with `aria-multiselectable`, arrow keys move, Space toggles, Enter confirms,
Escape cancels and restores the previous set; the search input is labelled and its results count is announced
via a throttled live region.

### 2.4 Class detail for a player (S4)

Purpose: explain one class occurrence: what, when, where, and whether this meeting is happening. Primary action:
player **Edit class** (deep link to `/golf/dashboard/classes?class=<id>`, the existing owner of class CRUD);
coach **Compare schedules** (seeds Find a time with this player and date).

Entry points: a class interval in `CalendarPersonDialog` (lane block or commitments row), a class row in the
agenda/day views (`event_type = 'class'`), and a class overlap in conflict detail (§2.8).

Mobile: full-height bottom `Sheet`. Header: class code and name (`parseClassName` from the Classes page, moved to a
shared helper), meeting time for this occurrence in the team timezone, weekday pattern, semester. Sections:
Location (building, room), Instructor, This meeting (Scheduled / Excluded with the exclusion reason and date range /
Not synced to the team calendar), Source ("From your Helm class list"). Desktop: right inspector (360px) that
preserves the calendar date behind it; opened from the person dialog it replaces the dialog body with a back
control rather than stacking a second overlay (one overlay at a time, §19).

Who may see what: the player who owns the class sees everything. A coach of a team where the player is an active
member sees everything; RLS `golf_player_classes_select_team` and `golf_classes_select_coaches` (baseline
migration lines 19319 and 18881) grant exactly that. Any other viewer gets `access: 'free_busy'` and the screen
renders "Busy · Class" with time only and no title, instructor, or location. The server, not the client, decides.
The action authorizes against `golf_player_classes`, never against the `golf_events` class row, so a teammate who
can read the team calendar row still cannot obtain the title.

Files: **NEW** `class/CalendarClassDetail.tsx`, **NEW** `class/ClassOccurrenceStatus.tsx`, **NEW**
`class/__tests__/CalendarClassDetail.test.tsx`; `CalendarPersonDialog.tsx` gains `onOpenClass`; agenda/day rows
route class events to it via `FairwayCalendar.tsx` (coordinator).

Data: **NEW** server action `src/app/golf/actions/class-detail.ts` `getClassOccurrenceDetail({ eventId? , classId?,
date })`. It resolves the class id from the event's `[class:<uuid>]` tag (`src/lib/calendar/class-events.ts:34`
`classIdFromDescription`) or the given id, reads `golf_player_classes` (`class_name`, `instructor`, `days`,
`start_time`, `end_time`, `building`, `room`, `semester`, `notes`; `semester` added by
`supabase/migrations/20260621150000_player_classes_semester.sql`), reads `golf_academic_exclusions` for the date,
and returns a discriminated `{ access: 'detail' | 'free_busy' | 'none' }`. No table changes. Unsynced classes
expanded from `golf_player_classes` (`availability.ts:947`) carry no `eventId`, so the person dialog passes
`classId` when the interval id encodes it; the coordinator adds an optional `classId` to `ScheduleInterval`.

States: loading (skeleton with the same header geometry); detail; free/busy-only; not found ("This class is no
longer in Helm" with Close); excluded occurrence; unsynced; failed read (Retry); offline (last snapshot with
"checked at" label, Edit class still deep-links).

Microinteractions: opening from a lane block scales the block to 1.02 for 120ms before the sheet enters (240ms,
`EASE_CINEMATIC`); the status pill crossfades; no shared-element animation is attempted when the source is not
mounted (§18). Haptic `light` on open.

Accessibility: `aria-labelledby` the class name; time uses tabular numerals with a full-text `aria-label`; the
free/busy variant announces "Busy, class details are private"; focus returns to the lane block or row.

Tests: component tests for all seven states at 320px and desktop; **NEW**
`src/app/golf/actions/__tests__/class-detail.test.ts` modelled on `__tests__/scheduling.test.ts` (owner, coach of
active member, teammate, other team, missing class, exclusion applied).

### 2.5 Attendance (S5)

Purpose: record who was there, quickly and forgivingly. Primary action: **Save attendance** with a persistent
"N unsaved" count.

Mobile: from Event detail's Attendance section into a full-height `ModalShell`. Search at top; roster in stable
order grouped by RSVP (Accepted / Tentative / Declined / No response) with each row offering Present / Late /
No-show as a 44px `Segmented`. A status change marks the row pending without moving it. Bulk "Mark selected
present" shows the selected count. Desktop: replaces the inspector body with a back control; wider rows show
RSVP time and check-in time.

Files: **NEW** `attendance/CalendarAttendanceScreen.tsx`, **NEW** `attendance/AttendanceRow.tsx`, **NEW**
`attendance/useAttendanceDraft.ts` (pending map, save reconciliation), **NEW** `attendance/AttendanceNoteEditor.tsx`
(gated N1), **NEW** `attendance/__tests__/CalendarAttendanceScreen.test.tsx`; `FairwayEventDetailDrawer.tsx` drops
the legacy `AttendancePanel` import once this ships.

Data: `getAttendanceReport` (`attendance.ts:762`, strips other players' notes for player callers `:713-720`),
`markAttendance` (`:388`), `bulkCheckIn` (`:559`). Save is not atomic: check-ins go through `bulkCheckIn` in one
call, Late/No-show go row by row through `markAttendance`. The screen reports per-row results ("3 saved, 1 failed,
still pending") exactly as §18 requires until a batch action exists. Note writing: no note-write action was found
in `attendance.ts` exports; N1 adds `updateAttendanceNote` under the existing
`golf_event_attendance_update_coach_or_player` policy (baseline line 19076; verify its WITH CHECK first).

States: loading; empty (no invitees: `EmptyState` with "Invite players from Edit event"); player view (own row
only, private notes never shown for others); partial save; failed load (Retry); offline (edits kept pending,
Save disabled with reason).

Microinteractions: segment change is immediate with a 120ms pill slide (`SegmentedPill`), haptic `selection`;
pending rows show a quiet left rule, not a colour flood; Save keeps width and shows "Saving…"; per-row failure
shows an inline reason with Retry. Row order never changes while the coach is working.

Accessibility: each row is a `group` labelled by the player's name; the unsaved count is a polite live region
updated on settle; bulk action announces the count it will affect.

### 2.6 Files on an event (S6)

Purpose: see and attach the documents an event needs. Primary action: coach **Attach file**.

Composition: a section inside Event detail (count in the heading) and the Essentials stage of the editor. Rows
show title, type, size, attached date, and note. Tap opens the authorized `file_url` in the platform viewer; there
is no in-page preview of arbitrary types. Attach opens a picker over the team library (`ModalShell`, search,
category filter). Remove is explicit and detaches only the link (`detachDocumentFromEvent`), never the source file.

Files: **NEW** `files/EventFilesSection.tsx`, **NEW** `files/EventFilePicker.tsx`, **NEW**
`files/__tests__/EventFilesSection.test.tsx`.

Data: `getEventDocuments` (`event-documents.ts:121`), `attachDocumentToEvent` (`:218`), `detachDocumentFromEvent`
(`:284`); RLS `golf_event_documents_*` (baseline 19087–19099) restricts writes to team coaches. Upload with
per-file progress (§9, §18) is not possible from the calendar today: the legacy section states "no upload here",
attachments reference existing `golf_documents`. This plan ships attach-from-library and records upload-in-place
as gate G5 (reuse `src/app/golf/actions/documents.ts` upload path; unverified whether it is callable here).

States: loading; empty ("No files attached" with Attach for coaches, plain text for players); attach failure
(row not shown, inline Retry, draft untouched); detach failure; offline (list from cache, Attach disabled).

Microinteractions: new row enters with `.enter` (240ms), removed row fades 160ms; no skeleton shimmer beyond 4s,
then explicit Retry. Haptic `light` on attach success.

### 2.7 My availability and busy time (S7)

Purpose: keep personal busy time accurate so comparisons are honest. Primary action: **Add busy time**.

Mobile: full-height `ModalShell` from the calendar header overflow. `Segmented` Busy time | Sources. Busy time
lists blocks grouped by day with title, time or All day, repeat summary; tap edits. Add opens `BusyTimeEditor`:
title, all-day, start/end via `DateChooser`/`TimeChooser`, repeat weekly with weekday chips and an end rule,
optional private note, visibility line "Shown to your team as Busy only", explicit Save. Sources lists Helm events,
Classes, Personal blocks, and Calendar feeds (outbound) each with a state and last-checked time. Desktop: dedicated
inspector panel with the list on the left and the editor on the right.

Files: **NEW** `availability/MyAvailabilityScreen.tsx`, **NEW** `availability/BusyTimeEditor.tsx`, **NEW**
`availability/SourceStatusList.tsx`, **NEW** `availability/useBlockedTime.ts`, **NEW**
`availability/__tests__/MyAvailabilityScreen.test.tsx`, `availability/__tests__/BusyTimeEditor.test.tsx`.

Data (coach): `getCoachBlockedTime` (`golf.ts:6343`), `addCoachBlockedTime` (`:6133`), `updateCoachBlockedTime`
(`:6284`), `deleteCoachBlockedTime` (`:6201`). Columns present: `title`, `description`, `all_day`, `start_date`,
`end_date`, `start_time`, `end_time`, `recurrence_rule` (authoritative; `is_recurring` kept in sync per the feature
doc). RLS "Coaches can manage their own blocked time" (baseline 16851) is self-only, so the visibility line is
accurate: other people only ever see the derived Busy interval through `getScheduleWindow`.

Data (player): none. `golf_player_availability_blocks` does not exist (feature doc, verified 2026-08-19). Until gate
G1 lands, the player screen shows `FeatureUnavailable` ("Personal busy time is coming; your classes already count")
and never sends a player write to the coach table.

Source status: the snapshot exposes one `verification` per person, not per source. Phase 1 shows "Based on Helm
schedules · checked HH:MM" from `snapshot.checkedAt`; per-source states need a P1 contract addition (gate G6) and
are hidden until then rather than guessed.

States: loading; empty ("No busy time added"); save/delete failure with preserved input; player gated state;
offline (read-only list, Add disabled).

Microinteractions: a saved block settles into its day group with a 200ms slide; delete asks once via
`DiscardChangesModal`-style confirm; haptic `success` on save. Reduced motion: state changes only.

### 2.8 Conflict center and conflict detail (S8)

Purpose: turn overlaps into decisions. Primary actions: center **Resolve selected conflict**; detail **Review new
time** (opens the editor with the proposal, existing `onChoose` path `FairwayCalendar.tsx:1272-1276`).

Mobile center: full-screen list grouped by date, each row showing the event, occurrence, affected people count,
overlapping minutes, source type, and verification. Filters: Needs attention | Unverified (Reviewed appears only
once gate G2 exists). Mobile detail: event and occurrence at top; the shortest timeline that explains the overlap
(`SchedulingWorkspace` embedded with the affected people and a new `referenceInterval` prop drawing the current
time as a dashed "Current" band, §17B); affected people expandable to authorized sources; alternatives from the
existing `evaluateSelection` (`scheduling/evaluate.ts`); a single primary action. Desktop: center as the main list
with the detail in the right inspector; alternatives stay visible while the band moves.

Files: **NEW** `conflicts/ConflictCenter.tsx`, **NEW** `conflicts/ConflictRow.tsx`, **NEW**
`conflicts/ConflictDetail.tsx`, **NEW** `conflicts/AcknowledgeForm.tsx` (gated G2), **NEW**
`conflicts/__tests__/ConflictCenter.test.tsx`, `conflicts/__tests__/ConflictDetail.test.tsx`;
`scheduling/SchedulingWorkspace.tsx` gains `referenceInterval` and an `affectedOnly` filter with "Show everyone".

Data: **NEW** `src/app/golf/actions/conflict-inbox.ts` `getConflictInbox({ teamId, from, to })`, coach-only for
team scope, player scope limited to the caller's own events. It bounds the window to 14 days and 50 events, loads
attendees per event in one query, and reuses `checkEventConflicts` (`src/lib/calendar/conflicts.ts:70`) with
`excludeEventId`, returning per-event groups, all overlaps per person, and per-person verification. Class titles are
included only for viewers with class detail access (same rule as §2.4). **NEW** `src/hooks/golf/use-conflict-inbox.ts`
keys by team and window, keeps the last result visible while refreshing, and never presents a cached result as a
fresh all-clear (label "checked HH:MM", explicit Refresh).

States: loading; none ("No overlaps in the next 14 days" plus the unverified count if any); unverified only;
partial (some people failed: rows hatched, never green); failed (Retry); offline (stale list with label, Resolve
disabled).

Microinteractions: selecting a row on desktop slides the inspector 200ms without moving the list; the "Current"
band is static and the proposal band tracks the pointer with transform only; alternatives animate only the band,
never the page; haptic `light` on "Review new time".

Accessibility: rows are buttons with a full sentence label ("Practice, Thursday 3–5 PM, 2 overlaps, 1 unverified");
the timeline keeps its semantic alternative list from the existing workspace; acknowledgement (when gated work
lands) is a plain form with a labelled reason field.

### 2.9 Calendar subscriptions and source settings (S9)

Purpose: add Helm to a personal calendar app without implying two-way sync. Primary action: **Copy link** per feed.

Mobile: `Sheet` (bottom) with feed rows (Team, Personal, Tournaments, All events), each with state, created date,
Copy link, Regenerate, Remove; step-by-step instructions per platform in a collapsed section; the header reads "Add
to your calendar app · one-way". Desktop: `ModalShell size="md"`. Tokens appear masked in the row and are never
logged or put in analytics.

Files: **NEW** `settings/CalendarSubscriptionsSheet.tsx`, **NEW** `settings/FeedRow.tsx`, **NEW**
`settings/SubscriptionSteps.tsx`, **NEW** `settings/__tests__/CalendarSubscriptionsSheet.test.tsx`;
`FairwayCalendar.tsx` loses `FairwaySubscribeSheet` (`:1289-1449`) and the legacy `dynamic` import (`:91-99`).

Data: `getCalendarFeeds` (`calendar-feeds.ts:151`), `createCalendarFeed` (`:218`), `regenerateCalendarFeed`
(`:277`), `deleteCalendarFeed` (`:325`). RLS `golf_calendar_feeds_*` (baseline 18822–18834) scopes to the owner.
No new action.

States: loading; empty (create the first feed inline, no monolith card); failed load (Retry); coach-only team feed
(players see personal only, as today `:1299`); offline (copy works from cache, mutations disabled).

Microinteractions: Copy shows a 1.2s "Copied" label swap with haptic `light`; Regenerate requires a confirm and
keeps the row height; no bouncing badges.

### 2.10 Event detail depth (S10)

Purpose: answer the first five questions immediately, then go deeper without leaving. Primary action: player
**RSVP**; coach **Edit**.

Mobile: keep the bottom `Sheet` but restructure into the §18 order: header (type, title, date/time with timezone),
response or Edit, location, then well-spaced sections with counts: Description, People (invited and status),
Files, Attendance (prominent for coaches from one hour before start), History (hidden until G2). Destructive
actions live in an anchored `PopoverPanel` "More" menu. Desktop: `Sheet side="right"` inspector (360px) so the
week grid keeps its selected date; sections are the same components.

Files: `FairwayEventDetailDrawer.tsx` (compose), **NEW** `detail/EventPeopleSection.tsx`, **NEW**
`detail/EventActionsMenu.tsx`, **NEW** `detail/__tests__/EventPeopleSection.test.tsx`; reuses
`files/EventFilesSection.tsx` and opens §2.5.

Data: `getEventRSVP` (`golf.ts:6045`) for the people list, `getEventDocuments`, existing `respondToEvent`
(`golf.ts:5179`) via the parent. Requests stay keyed by event id (`drawerRequestRef`, `FairwayCalendar.tsx:1212`).
Capacity: `max_attendees` renders as "Limit 20" beside the accepted count; no "seats left" promise while the server
treats capacity as advisory (§2 repair 9).

States: loading (header renders immediately; sections show fixed-height skeletons); no description; no invitees;
no files; RSVP locked with server reason (existing); cancelled (existing badge); failed section loads with
per-section Retry; offline (cached event, RSVP disabled with reason).

Microinteractions: sheet enter 220ms, inspector slide 200ms, both retain the selected date; RSVP choice compresses
then shows the saved check with haptic `success`; section counts fade in rather than shift layout; the More menu
scales from its trigger in 160ms.

## 3. Shared material and microinteraction vocabulary

`CalendarSurfaces.module.css` is the single home for calendar material. Coordinator-owned additions, all
token-based and covered by the existing reduced-motion and reduced-transparency blocks:

| Class | Purpose | Motion target (§10/§20) |
| --- | --- | --- |
| `.press` | Button and row compression | transform 0.98, 90ms, `EASE_TAP` |
| `.dock` | Task dock in focused workflows | chrome material, one per screen, never with global nav |
| `.inspector` | Desktop right panel | slide/fade 200ms, no reflow of the grid |
| `.reference` | Dashed "Current" band | static, token border, no shadow |
| `.hatch` | Unverified rows and intervals | gray hatch plus visible "Not verified" text |
| `.pending` | Unsaved attendance or draft rows | quiet left rule, no colour flood |
| `.settle` | Band and label settle after release | 200ms, minimal overshoot |

Rules: no new one-off shadows or blur in component files; glass only on chrome, dock, floating label, and menus;
never animate `backdrop-filter`, `box-shadow`, or hundreds of cells; `.enter` stagger is capped at eight rows.

## 4. Waves and exclusive ownership

At most four active agents including the coordinator (PARALLEL-EXECUTION-PLAN §4). Ownership is exclusive per
wave; a worker who needs a file outside their list submits a patch description to the coordinator. Legacy
components are read-only for everyone.

### Wave A: editor depth, people and class, services (three workers)

| Worker | Screens | Exclusive owned paths |
| --- | --- | --- |
| W-Editor (P5) | S1, S2 | `FairwayEventEditor.tsx`, `EventWhenFields.tsx`, **NEW** `editor/**`, `__tests__/FairwayEventEditor*.test.tsx` |
| W-People (P4) | S3, S4 UI on fixtures | **NEW** `people/**`, **NEW** `class/**`, `CalendarPersonDialog.tsx`, `FairwayCalendarMemberRail.tsx`, their tests |
| W-Services (P7) | S4 action, S8 action, N1 | **NEW** `src/app/golf/actions/class-detail.ts`, **NEW** `conflict-inbox.ts`, `attendance.ts`, their `__tests__`, **NEW** `src/test/fixtures/calendar-screens.ts` |
| Coordinator (P0) | §1.2 commit, §3 CSS, contracts | `FairwayCalendar.tsx`, `CalendarSurfaces.module.css`, `scheduling-contracts.ts` (`classId`, `access`, optional `title`), `scheduling.ts`, feature doc |

Gate A1 (contract freeze): `ScheduleInterval` gains optional `classId` and `access`, and `title` becomes optional
when `access !== 'detail'`; `scheduling.ts` stops defaulting `title` to "Busy" for redacted intervals. Frozen
before W-People starts rendering. Gate A2 (class detail service): action tests pass for owner, coach, teammate,
other team; then S4 leaves fixtures. Gate A3 (editor): existing editor suites plus new stage tests pass at 320px
and 1024px.

### Wave B: detail, attendance, files, availability, subscriptions, conflicts UI

| Worker | Screens | Exclusive owned paths |
| --- | --- | --- |
| W-Detail (P5) | S10, S5, S6 | `FairwayEventDetailDrawer.tsx`, **NEW** `detail/**`, `attendance/**`, `files/**`, their tests |
| W-Availability (P4) | S7, S9 | **NEW** `availability/**`, `settings/**`, their tests |
| W-Conflicts (P2) | S8 UI | **NEW** `conflicts/**`, `scheduling/SchedulingWorkspace.tsx`, **NEW** `src/hooks/golf/use-conflict-inbox.ts`, their tests |
| Coordinator | Integration | `FairwayCalendar.tsx` wiring for S3–S10 entry points, removal of `FairwaySubscribeSheet` and the legacy imports, feature flag |

Gate B1: no legacy import remains under `src/components/fairway/pages/calendar/`. Gate B2: every S-screen has
loading, empty, failed, and no-access states rendered in tests. Gate B3: the coordinator's integrated build
passes `npm run typecheck` and the focused suites once.

### Wave C: motion pass, gated schema work, review

| Worker | Scope | Exclusive owned paths |
| --- | --- | --- |
| W-Motion (P2) | §3 vocabulary applied across S1–S10, haptics, dark/reduced modes | Every file under `src/components/fairway/pages/calendar/**` for the duration of this pass only; no other worker edits the tree |
| W-Schema (P6) | G1, G2, G3 after live inspection | Assigned migration files, `supabase/tests/rls/**` for those tables, `src/lib/calendar/availability.ts` for G1 consumption |
| Reviewers (P8) | `ui-polish-reviewer`, `security-reviewer`, `db-migration-reviewer` for W-Schema | No feature edits |

Gate C1: physical iOS and desktop review of S1, S4, S8, S10 at 320/390/430 and 1024/1440; reduced motion and
transparency variants recorded. Gate C2: schema items reviewed and RLS tests green before any player-block or
acknowledgement UI leaves its gated state.

### Dependency summary

```text
Coordinator: land polish pass, freeze contract (A1)
   |-- W-Editor (S1, S2)  -----------------------------\
   |-- W-People (S3, S4 on fixtures) -- A2 --> S4 live   |--> Coordinator integration (B3)
   |-- W-Services (class-detail, conflict-inbox, N1) ---/            |
                                                   Wave B: W-Detail, W-Availability, W-Conflicts
                                                                    |
                                                   Wave C: W-Motion (exclusive), W-Schema (G1-G3), reviews
```

## 5. Gated items requiring schema, RLS, or contract work

Each item is separate from the screen that wants it, ships behind an honest gated state, and needs the listed
verification before its UI is enabled. This is a Golf/Baseball/Lift Lab shared production database: additive
migrations only, reviewed by `db-migration-reviewer`, with pgTAP under `supabase/tests/rls/`, and `HELD.md`
conventions followed. No destructive migration is planned anywhere in this document.

| Gate | Need | Verification required |
| --- | --- | --- |
| G1 | `golf_player_availability_blocks` (owner, team scope, start/end or rule, timezone, note) with owner-write RLS and coach free/busy read via active membership; `availability.ts` consumes it | Live column/policy inspection; migration review; RLS tests for owner, coach, teammate, other team; `npm run docs:schema-drift` updated in `memory/features/calendar-events.md` |
| G2 | `golf_event_conflict_acknowledgements` (event, occurrence date, fingerprint, actor, reason, referenced revisions) | Same as G1; fingerprint invalidation test when the event or source interval changes |
| G3 | Required/optional invitee flag on `golf_event_attendance` | Confirm the column is absent on the live table before proposing an additive column; until then comparison-only |
| G4 | Event revision for stale-edit detection (§12) | Inspect `golf_events` for an existing version mechanism; propose `updated_at` precondition in `updateGolfEvent` before adding a column |
| G5 | Upload-in-place for event files | Verify `src/app/golf/actions/documents.ts` exposes a reusable upload; otherwise keep attach-from-library |
| G6 | Per-source verification in `ScheduleSnapshot` | P1 change to `getUserBusyPeriodsWithStatus` to report completeness per source; contract addition frozen through the coordinator |
| N1 | `updateAttendanceNote` action | No schema change; confirm the update policy's WITH CHECK covers coaches |
| F1 | Server-controlled per-team feature flag (§14) | No flag infrastructure was found under `src/lib` or the golf actions (unverified); Phase 1 gates the new screens with a server-computed prop from `page.tsx` |

## 6. Where the current code cannot support the design, stated plainly

- §11's `ScheduleInterval` sketch (`source`, `state`, `sourceRevision`, optional `title`) differs from the shipped
  contract (`type`, required `title`, no access). Gate A1 adds only what the screens need; `sourceRevision` is not
  added because no revision source exists.
- §9 file upload with progress: not reachable from the calendar today (G5).
- §8 player busy blocks and §7 acknowledgements: no tables (G1, G2).
- §12 stale-revision responses: no revision column and no `stale` outcome from the actions (G4).
- §18 atomic attendance batch: `bulkCheckIn` covers check-in only; mixed marks are per row.
- §3 desktop inspector for event detail: the drawer is a bottom sheet on every viewport today; S10 changes it.
- §17D task dock replacing global navigation: overlays already sit above the shell; whether the bottom nav is
  hidden or merely covered during a focused workflow is unverified and is checked in Gate C1.
- §21 per-source summary: the snapshot has one flag per person (G6).
- The lead's note that Fairway has no attendance UI is nearly right: the legacy panel is embedded in the drawer,
  so S5 replaces an existing mount rather than adding a first one.

## 7. Documentation and CI hygiene for this plan

- This file opens with `<!-- markdownlint-disable MD013 -->`, the precedent set by `AGENTS.md:1`, and uses
  space-padded table pipes so MD060's compact style is consistent. It must add zero violations under
  `npm run markdown:ratchet`.
- Bring the two existing plan docs back under baseline without touching `.markdownlint-baseline.json`: add the
  same MD013 disable comment as the first line of `DESIGN-PLAN.md` and `PARALLEL-EXECUTION-PLAN.md`, and rewrite
  their delimiter rows from `|---|` to `| --- |` (the MD060 findings all point at delimiter-row spacing). Re-run
  `npm run markdown:ratchet` and confirm MD013 and MD060 counts are at or below baseline. Do not run `--update`.
- After the docs settle: `npm run docs:regen`, `npm run knowledge:doc-inventory`, `npm run knowledge:world-model`,
  then `npm run docs:check`. The `check-schema-invariants.sh` false positive at `scheduling.ts:37` is a separate
  fix and is not addressed by this plan.
- `docs:path-drift` scans `memory/`, `.claude/rules/`, `CLAUDE.md`, `AGENTS.md`, and `docs/REPO_MAP.md` only
  (`scripts/check-doc-path-drift.mjs:52-53`), so the **NEW** paths in this file do not trip it. Anyone copying
  these paths into `memory/features/calendar-events.md` must do so only after the files exist.
- `memory/features/calendar-events.md` is updated per wave by the coordinator with shipped behaviour only; this
  plan never masquerades as shipped behaviour.

## 8. Definition of done for this plan's scope

S1–S10 work for both roles on 320–430px and at 1024/1440 with keyboard, VoiceOver, dark mode, reduced motion and
reduced transparency; no legacy import remains under the Fairway calendar tree; every screen has intentional
loading, empty, filtered-empty, no-access, partial, failed, and offline states; class titles never render for a
free/busy-only viewer; no verified-green state comes from partial data; gated items remain visibly gated until their
verification is recorded; and the physical-device review in Gate C1 is complete. A polished screenshot is not done.
