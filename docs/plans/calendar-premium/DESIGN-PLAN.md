# GolfHelm calendar: complete product and engineering design

Design specification · 8 September 2026 · Revision 2: complete experience refinement · Draft for implementation

**Reading guide:** Sections 1–15 establish the product and engineering foundation. Sections 16–22 refine the signature design, every major transition, screen composition, workflow, and acceptance criteria. Where a refinement explicitly changes an earlier layout default, the refinement is authoritative. All new capabilities remain proposed until implemented and verified.

**Execution companion:** [PARALLEL-EXECUTION-PLAN.md](PARALLEL-EXECUTION-PLAN.md) contains the reverified source map, contract corrections, exclusive file ownership, parallel waves, dependency gates and worker handoff requirements. Use it when assigning implementation. Its current-source corrections supersede shorthand descriptions of plumbing in this design narrative.

## 1. Product decision

Build a shared scheduling workspace around three questions: **What is happening? When can we meet? What needs resolving?** Preserve GolfHelm’s warm ivory, golf green, native typography, and restrained glass. The signature interaction is a translucent time window that moves across aligned schedules and explains availability as it moves.

This is a redesign of the active Fairway calendar, not a second calendar application. Mobile and desktop share event truth, permissions, conflict semantics, selected dates, and mutation contracts. Their layouts and input methods differ intentionally.

The approved images are visual references, not production specifications or proof of working features. Sample faces, names, dates, and availability must never enter production as placeholders. The latest concept’s oversized luminous button and branding should be moderated in implementation: keep the material quality, recover content space, and meet contrast requirements.

### Success criteria

- A coach can compare their schedule with players, find a suitable time, review conflicts, and publish without leaving the calendar workflow.
- A player can understand their next commitment, respond, see their own class conflicts, and manage supported availability without learning a desktop grid.
- Every avatar interaction has a clear destination. Opening a person and selecting people for comparison are separate actions.
- “Everyone available” means every included required person was successfully checked. Missing information never becomes free time.
- Opening details, changing dates, and returning from a subscreen preserve the user’s context without flashes, unnecessary remounts, or jumps to Today.
- Material and motion reinforce hierarchy. Calendar information stays crisp while controls feel tactile.

## 2. Evidence and current foundation

Source reviewed in canonical checkout on `agent/bridge-incident-wiring`. This document changes no product code. The feature document’s database inventory was verified historically on 19 August; this planning pass did not query the live database. Verify current schema and RLS before migration design is finalized.

| Area | Current source evidence | Design implication |
|---|---|---|
| Active route | `src/app/golf/(dashboard)/dashboard/calendar/page.tsx` renders `FairwayCalendar` | Extend the active tree; do not resurrect the legacy calendar |
| People rail | `FairwayCalendarMemberRail.tsx` performs coach-only multiselection, normally capped at eight; All can exceed the cap | Replace ambiguous avatar selection with explicit person drill-in and Compare mode; remove color-driven functional limits |
| Availability | `src/lib/calendar/availability.ts` combines events, accepted attendance, owned classes and coach blocked time | Reuse domain rules, normalize identities, batch reads, and preserve per-source completeness |
| Conflict check | `FairwayEventEditor.tsx` calls `checkScheduleConflicts` → `checkEventConflicts` | Detection is wired today; the complete tracker/resolution experience is new |
| Partial data | `ConflictResult.partial` exists; editor normalization discards it | Repair before releasing visual all-clears |
| Suggestions | `findCommonAvailability` uses the helper that returns periods without completeness status | Suggestions need the same verified-data contract as conflict results |
| All-day events | Editor skips checking when allDay is true | Include all-day intervals and date-based semantics |
| Recurrence | Stored on `golf_events`; `recurring-events.ts` supports occurrence scopes | Keep the current model; repair incomplete field propagation and partial series updates |
| Detail | Fairway drawer provides RSVP and attendance | Recompose existing functions into responsive details, rather than rebuild mutations |
| Academic exceptions | Exclusion actions exist but are not consumed by availability | Wire exceptions into one canonical occurrence-expansion path |
| Blocked time | Coach CRUD exists without current Fairway UI | Add a proper management surface and investigate safe extension to player availability |
| External calendars | Feature documentation describes subscription feeds and class materialization, not Google/Outlook two-way sync | Label subscriptions accurately; external ingestion is a separate integration project |

Existing documented calendar tables: `golf_events`, `golf_event_attendance`, `golf_event_documents`, `golf_academic_exclusions`, `golf_attendance_summary`, `golf_calendar_feeds`, `golf_calendar_notifications`, `golf_coach_blocked_time`. Classes also depend on the existing class domain. New entities below are proposals, not claims that tables already exist.

### Repairs required before expanding the experience

1. Preserve partial/failed identity and schedule reads through server adapters and UI.
2. Check all-day events; include the organizer even when no players are invited.
3. On time or duration changes, recheck all affected attendees. On attendee-only edits, incremental checking is acceptable only against an unchanged verified event interval.
4. Return every relevant overlap, not just the first per person. Group overlaps for presentation without losing underlying facts.
5. Make recurring edits atomic for the supported scope; propagate event type, all-day state, RSVP settings, and attendee changes consistently.
6. Align all-day RSVP lock rules between UI and server. Return capability and lock reason from the authoritative server path.
7. Key detail requests by event ID and discard stale results when switching events.
8. Apply academic exclusions in availability expansion; avoid double counting materialized and unsynced class occurrences.
9. Decide whether capacity is enforced. Do not present a hard remaining-seat promise while the server treats capacity as advisory.

## 3. Information architecture and navigation

Keep the existing calendar route and app shell. Proposed route/query state: date, view, event, person, and mode. These are validated navigation identifiers, never serialized private schedule data or feed tokens. Deep links authorize on the server before revealing content. Back restores previous date, filters, scroll, and selection.

| Surface | Mobile | Desktop | Main action |
|---|---|---|---|
| Calendar home | Agenda + compact week strip; month expands inline | Week default, agenda/day/month alternatives | New event for coach; respond to next invitation for player |
| Person schedule | Full-screen drill-in | Right inspector; expand into main schedule when comparing | Find a time |
| Find a time | Full-screen touch timeline | Wide comparison workspace with suggestion inspector | Use this time |
| Conflict center | Full-screen list grouped by urgency/date | Main list with optional detail inspector | Resolve selected conflict |
| Conflict detail | Full-screen overlap explanation + alternatives | Comparison workspace with focused affected rows | Review new time |
| Event detail | Full-screen compact detail, swipe-back where supported | Right inspector, expandable | RSVP or Edit, depending on role |
| Event editor | Full-screen staged form with persistent draft | Spacious dialog or main editor for complex series | Review event |
| People picker | Searchable full screen for long rosters | Popover/inspector with keyboard selection | Compare selected / Apply attendees |
| Attendance | Event drill-in | Detail tab/inspector | Save attendance |
| Files | Event drill-in, native preview when available | Detail tab and preview | Attach file for authorized coach |
| My availability | Full-screen schedule/settings | Dedicated panel | Add busy time |
| Calendar subscriptions | Settings drill-in | Settings dialog | Add to calendar |

Context menus float near their trigger. Long workflows do not masquerade as giant bottom sheets. Use a small anchored menu for event actions; use full screens for editing, comparison, and conflict resolution. On constrained screens, an anchored menu may reposition within the viewport; it must never cover the selected time or trap the close control under a safe area.

## 4. Visual system

### Materials and hierarchy

Reuse `src/styles/design-tokens.css`, Fairway primitives, existing system font stack, and icon family. Current glass tokens already include warm champagne tint, regular/strong fills, specular borders, saturation, and dark-mode variants. Extend semantic tokens only when an existing token cannot express a required state.

Three material levels:

1. **Content plane:** warm matte ivory, minimal shadow, crisp text and grid. Most schedule content lives here.
2. **Interactive plane:** translucent date controls, selected tabs, time readout, and action dock. Fine bright top rim, soft lower edge, controlled blur.
3. **Focused plane:** selected time window and anchored contextual options. Slightly more depth and a restrained emerald reflection; do not blur the data required to make a scheduling decision.

Reserve strong green for selection and the primary action. Busy is muted slate blue; tentative uses a patterned/light variant; conflict uses amber plus a label/icon; unavailable data uses gray hatching plus “Not verified.” Color never carries the entire meaning. Red is reserved for destructive actions or truly blocking validation.

Avoid glossy styling on every event, cards inside cards, decorative portraits, oversized logos, multiple glowing CTAs, and blank hero areas. Real photos may be used; absent photos get a neutral person glyph with a visible name, not fabricated identity. Event categories use small labeled accents rather than a rainbow per player.

### Layout targets

- Mobile support: 320–430 CSS pixels, portrait and landscape, safe areas, keyboard, large text. Default 16px gutters, 8px spacing rhythm, 44px minimum touch targets.
- Body text: approximately 16px; supporting text 13–14px where readable; no essential schedule meaning in tiny labels. Use tabular numerals for times.
- Compact title: 24–28px, not a marketing hero. Event titles wrap before controls shrink.
- Desktop: 1024px and wider uses a central canvas with a 300–360px inspector when space permits. Between mobile and wide desktop, collapse the inspector into a drill-in rather than compress the time grid.
- Main canvas uses available height. Exactly one owner applies each safe-area inset. Sticky controls and scroll regions use shared shell measurements, not guessed header offsets.
- Reduced transparency uses opaque token-backed surfaces; dark mode uses graphite surfaces and subdued emerald, not bright cream panels.

## 5. Calendar home

### Mobile

Compact header: Calendar, date/month control, one plus action for coaches. A week strip follows. Agenda begins immediately below; do not stack a hero, metrics, filters, avatar rail, view controls, and a large warning above it.

A Team / Mine scope control is role-aware. People comparison is entered through a labeled People action. A compact people rail can appear when deliberately expanded, with names beneath photos. Tap a person to open their schedule. Compare invokes a distinct picker with checkboxes; tapping an avatar never silently changes the entire calendar into another mode.

Agenda rows have a consistent time gutter, event title, location, and concise status. Consecutive events remain easy to scan. Classes use a quiet treatment and follow privacy policy. All-day and multi-day events occupy a compact section above timed events. Invitation status is visible without requiring every detail screen to be opened.

Show a single actionable conflict summary only when relevant: “Practice tomorrow: 2 overlaps.” An unknown-data warning is different: “2 schedules could not be checked.” No global red alert for every soft overlap.

Swiping the week strip changes weeks; tapping a day selects it; horizontal motion is not captured while the user is vertically scrolling the agenda. Month expands in place and collapses after selecting a day. Returning from an event preserves exact context.

### Desktop

Week canvas is the default coaching workspace. Left rail contains a small date navigator and scope/filter controls; center contains the calendar; right inspector appears only when needed. Support day, week, month, and agenda using one projection of the same events.

Click opens detail. Dragging an event produces a proposed move, never an immediate silent save: show old/new time, conflict count, and review confirmation. Resize handles expose duration on hover/focus. Keyboard users have equivalent Move and Change duration actions. Month overflow opens that day’s agenda instead of cramming illegible titles.

## 6. Signature Find a time workflow

### Entry points and retained context

Enter from New event, event conflict detail, a person’s schedule, or Compare people. Carry selected date, organizer, attendees, duration, event being edited, and recurrence scope. Returning to the editor preserves unsaved title, location, documents, and invitation settings.

### Timeline construction

- Pin a name column and an hourly time ruler; all people share precisely aligned time coordinates.
- Put You first, then required people, then optional people. Expose participant roles clearly.
- Busy intervals are rounded blocks with no decorative distortion of their start/end positions.
- The proposed interval is one translucent vertical band spanning the rows, with a floating time label and accessible start/end controls.
- Empty space is “Available” only for verified sources. Hatch unknown intervals/rows. Distinguish tentative from confirmed busy.
- Show all-day constraints in the row context and include them in calculations; do not draw a misleading blank timed row.
- Preserve private titles: permitted viewers can see class/event details; others see Busy. Availability access and event-detail access are separate capabilities.

### Mobile gestures

Default visible span: about four hours, with 60–80px of pinned identity and enough width for readable hour labels. Horizontal pan scrolls time; vertical pan scrolls people. A deliberate touch on the selection grip enters move mode. While moving, the band tracks the finger immediately; it snaps to 15-minute increments on release. Edge auto-pan is bounded and stops on release or cancellation.

Resize grips use expanded invisible touch targets. If the interval is too narrow for two independent grips, show start/end buttons instead. A tap on an empty slot proposes a time without committing it. Always provide explicit date, start time, end time, and duration controls as a non-gesture alternative.

The name column stays visible. Very large text switches to fewer visible hours and taller rows; it must not shrink text. No eight-person comparison limit based on color: virtualize long rosters and keep the selection summary accurate for all included people.

### Desktop interaction

Display a wider working-day range, pinned people, sticky ruler, wheel/trackpad pan, and a right suggestions inspector. Pointer drag moves the band; handles resize. Arrow keys move by the snap interval, with an announced time/status update after settling. Escape cancels a drag and restores the prior interval. Clicking a person opens a compact inspector without losing the comparison.

### Suggestions and ranking

Rank deterministically: verified required availability first; then optional availability; then proximity to requested date/time; then preferred working hours and explicit buffers. Return reasons, not a mysterious score. Example: “12 required available · 2 optional unavailable · 30 min later.”

Do not label a partially checked candidate “best for everyone.” Display “10 verified free, 2 unverified.” Offer Refresh and proceed-to-review with explicit disclosure where allowed. Academic or required-event overlaps require a deliberate override acknowledgement and recorded reason; draft saving remains available.

Changing the band updates local highlights using the fetched snapshot; it does not call the server on every pointer move. Debounce settled selection checks, discard out-of-order responses, and revalidate before publication.

## 7. Conflict center and resolution

The conflict center is an actionable inbox derived from calendar truth, not a permanently cached red-badge table. Group by event and occurrence; show affected people, overlapping minutes, source type, and verification state. Filters: Needs attention, Unverified, Reviewed. Sort upcoming unresolved commitments first.

Open a conflict to see the proposed event, affected rows, overlap geometry, and plain-language reasons. Distinguish academic obligation, existing team event, personal busy block, tentative commitment, and optional attendee overlap. Severity is a product policy separate from the mathematical overlap result.

Actions: choose another time, change attendees, edit duration, review a recurrence scope, or keep the time with an explanation. Do not silently remove a player to produce an all-clear. Do not expose a class title to someone allowed only free/busy access.

Review screen shows before/after time and timezone, affected occurrences, attendees added/removed, unresolved overlaps, unverified data, and notification recipients/count. Primary action is specific: “Move practice” or “Publish event.” Cancellation keeps the original event unchanged.

An acknowledgement applies to a fingerprint of the event revision, occurrence, affected person and overlapping source revision. If the schedule changes, the conflict is reevaluated. Old acknowledgements cannot conceal new overlaps. Event detail keeps a quiet “Conflict reviewed” history entry with authorized access to the reason.

## 8. Player schedule and availability subscreens

Person header uses a real name/photo and role; no giant biography hero. Day/week views show commitments, free gaps, timezone, and source completeness. Coaches can compare with their own schedule; players see only the team-approved level of another person’s schedule. My schedule includes own class detail and personal blocks.

Tap an authorized commitment to open event detail. Tap a free gap to seed Find a time. A private busy block opens only its interval and visibility explanation. Never imply that the coach can edit a player’s academic schedule from this view.

My availability contains personal busy time, working/preferred hours, and calendar-source status. Add busy time has start/end, repeat, visibility, optional private note, and an explicit save action. Coach blocked time reuses the existing backend where appropriate. Player blocks require new persistence and RLS; do not send player writes to a coach-only table.

Academic exceptions include semester breaks, cancelled occurrences, and schedule corrections through the appropriate owner/coach capabilities. Show exactly which class occurrence changes; changing an exception must invalidate both the calendar and availability projections.

## 9. Event creation, details, and related screens

### Create/edit

Mobile stages: Essentials → People & time → Review. Fields include title, supported type, location, date/time/timezone, all-day, duration, recurrence, attendees, RSVP requirements/deadline, documents, and supported linked travel/qualifier context. Advanced settings expand deliberately; no long accordion maze. Desktop places essentials beside people/time and opens the comparison canvas when requested.

Draft stays local to the authenticated user/session, with an explicit unsaved-changes choice on exit. Do not store confidential descriptions in a shared browser key. A future server draft can be added as a separate entity if cross-device drafts become a requirement.

Recurrence editor covers frequency, interval, weekdays, ending rule, and preview count. Editing offers This occurrence / This and following / Entire series with precise impact summary. Large series changes use bounded preview and atomic or explicitly staged server execution; do not claim success for partially updated rows.

### Event detail

Readable title, date/time including timezone, location/directions, organizer, description, invited people and status, documents, links to travel/qualifiers, and relevant conflicts. Player action area shows Going / Maybe / Cannot attend and authoritative lock reason. Coach area shows Edit and attendance entry. Close/back restores the calendar, not a fresh route reload.

### Attendance and invitees

Separate invitation response from actual attendance. Coach view supports search and grouped Accepted / Tentative / Declined / No response, then check-in/absence controls where authorized. Bulk actions require an explicit selection summary. A player sees their own attendance and permitted roster information; private absence notes remain restricted.

### Documents and linked features

Files show name, type, size, and upload state. Preview in the appropriate native/browser viewer; downloads use authorized URLs. Failed uploads are retryable without losing the event draft. Removal is explicit and does not delete shared source files blindly. Travel and qualifier links deep-link into their existing domain; calendar scheduling must not duplicate those entities.

### Search, notifications, cancellation, settings

Search covers authorized event titles, locations, and people with date/type filters. Results restore route context on back. Notification links open the exact event/occurrence and handle deleted or inaccessible events gracefully. Cancellation shows scope, affected people, and notification effects before commit. Subscription settings distinguish “Add this feed to your calendar” from two-way sync, provide revoke/regenerate, and never expose tokens in telemetry.

## 10. Motion and microinteraction specification

Values are starting targets to tune on physical iPhones, not claims about measured performance.

| Interaction | Behavior | Target |
|---|---|---|
| Button press | Slight scale/compression, release cleanly | 80–120ms feedback |
| Selection drag | Direct finger/pointer tracking; no spring lag during drag | Display-frame update, transform only |
| Selection release | Settle to nearest valid time, floating label settles with it | 180–240ms, minimal overshoot |
| Availability change | Color/status crossfade; check appears once after verified result | 140–180ms |
| Date change | Short directional shift, retain shell and dimensions | 180–220ms |
| Person drill-in | Small horizontal transition; header continuity where feasible | 220–280ms |
| Context menu | Origin-aware scale/opacity from its trigger | 140–180ms |
| Desktop inspector | Short slide/fade without shifting the selected time | 180–220ms |
| Save success | Pending label → check → stable detail | No artificial delay |

Use the existing motion library and shared primitives. Do not nest page animation, layout animation, and sheet animation on the same surface. Avoid animating backdrop blur, box-shadow, or the layout of hundreds of cells. Keep glass layers few and bounded. Haptics are brief and event-driven: selection settled, verified available slot, successful save. Never vibrate continuously during panning.

Reduced motion removes spatial movement and overshoot; retain immediate state changes or short fades. Reduced transparency removes blur. Focus follows navigation predictably. Screen-reader announcements are throttled to settled times/results, not each frame. A static concept cannot validate this behavior; physical-device profiling is a release requirement.

## 11. Domain plumbing and proposed contracts

### One normalized scheduling model

Create a scheduling service around existing `availability.ts`, `conflicts.ts`, timezone utilities, and mutation actions. Fairway views consume a shared read model; legacy components must not provide a second set of rules.

Proposed transport types use ISO timestamps and IANA timezone names, not serialized JavaScript Date assumptions:

```ts
type ParticipantRef = {
  kind: 'coach' | 'player';
  id: string; // domain ID; resolved to auth user server-side
  required: boolean;
};
type ScheduleInterval = {
  id: string;
  participantKey: string;
  start: string;
  end: string;
  source: 'event' | 'class' | 'personal_block' | 'coach_block';
  state: 'busy' | 'tentative';
  title?: string; // omitted when viewer only has free/busy access
  detailEventId?: string;
  sourceRevision: string;
};
type ScheduleSnapshot = {
  teamId: string;
  timeZone: string;
  window: { start: string; end: string };
  participants: Array<{
    key: string;
    access: 'detail' | 'free_busy' | 'none';
    verification: 'complete' | 'partial' | 'failed';
    intervals: ScheduleInterval[];
  }>;
  checkedAt: string;
  revision: string;
};
```

Completeness should be tracked by source internally, with safe user-facing explanations. “Not connected” is not the same as “connected but failed.” If the product only knows Helm schedules, the interface says “Based on Helm schedules”; it cannot promise knowledge of all outside commitments.

### Service boundaries

1. `getScheduleWindow`: authorize viewer/team/people; batch identity, event, attendance, class, exclusion and block reads; normalize intervals; redact private data; return completeness.
2. `evaluateScheduleProposal`: validate proposed interval and attendee scope; exclude the event/occurrences being edited; return all overlaps, unknown participants and source revisions.
3. `suggestScheduleSlots`: reuse the same snapshot/evaluation logic; rank candidates with explanations and availability counts. No separate helper that drops partial status.
4. `previewCalendarChange`: describe recurrence scope, capability failures, conflicts, attendee changes and notification effects without writing.
5. `commitCalendarChange`: authorize again, validate current revisions, apply the change transactionally, and enqueue notifications idempotently.

These are proposed boundaries, not existing exported APIs. Adapt existing actions behind them to avoid an unnecessary wholesale rewrite. Existing callers can migrate through compatibility adapters.

### Time and occurrence rules

- Timed intervals use half-open bounds `[start, end)`: an event ending at 3 does not conflict with one starting at 3 unless a configured buffer applies.
- Store instants consistently; retain event timezone for recurrence. Never substitute a fixed UTC offset for an IANA zone across DST.
- Existing all-day storage uses inclusive last-date semantics. Keep that compatibility at the adapter boundary and normalize to a half-open interval for calculations; use existing `eventDaySpan` behavior for display.
- Recurrences expand only for bounded requested windows, honoring timezone, semester limits, exceptions and occurrence edits.
- Deduplicate class occurrences by stable source identity, not title. Materialized and unsynced copies must not double count.
- Travel buffers are explicit configurable constraints, shown separately from actual event time. Do not invent journey durations from a location string.

## 12. Persistence, authorization, and concurrency

### Proposed schema work

First inspect live columns, foreign keys, policies and indexes. The following are logical additions whose final names depend on that inspection:

- **Personal availability blocks:** owner, team/visibility scope, start/end or recurrence, timezone, optional private note, revision. Reuse compatible infrastructure if verified; otherwise add a dedicated table with owner-write and authorized free/busy projection.
- **Conflict acknowledgements:** event/occurrence, conflict fingerprint, actor, reason, created time, referenced revisions. No need to persist every derived conflict as a permanent record.
- **Mutation revisions/idempotency:** reuse existing revision/idempotency infrastructure if present; otherwise add the minimum support for optimistic concurrency and repeat-safe submits.
- **Notification delivery outbox:** reuse an existing durable mechanism if available. If absent, introduce transaction-linked delivery records so event saves do not depend on synchronous push/email success.

Do not create polling or external-sync tables in the core makeover. Availability polls and Google/Microsoft ingestion are separate later modules with OAuth, token storage, delta sync, revocation, retries, webhook renewal and source completeness of their own.

### Access matrix

| Actor | Team event | Own schedule | Other player schedule | Event management |
|---|---|---|---|---|
| Authorized team coach | Detail within managed team | Own detail | Team-approved detail/free-busy | Create/edit/cancel and attendance within team |
| Team player | Detail for permitted team/invited events | Own detail and blocks | Free/busy only if team policy allows; otherwise unavailable | Own RSVP and own availability only |
| Other team/user | No access | Own authorized domain only | No access | None |

Server actions and database policies enforce this; hidden UI is not enforcement. Resolve coach/player IDs explicitly before auth-user queries. Do not accept arbitrary user IDs from the browser as authority. Keep Baseball/Lift Lab data boundaries intact.

### Concurrency and saves

Capture an event revision and schedule snapshot revision at review. Recheck current state on commit. If the event changed, return a conflict response with current values and preserve the draft for review. If relevant schedule data changed, recompute and ask the user to review newly discovered conflicts rather than applying stale approval.

An all-clear is a verified observation at a time, not a perpetual reservation. To prevent concurrent event edits from slipping between check and commit, use a transaction and deterministic participant/occurrence locking for scheduling mutations where feasible; ensure relevant write paths participate. External/class updates can still change availability afterward, so invalidate and surface resulting conflicts. Do not claim impossible universal locking across external systems.

Recurring writes use one transaction/RPC or a durable staged operation with explicit pending/partial state. Notifications are emitted after the successful event transaction through an idempotent outbox. Retry never creates a duplicate event or duplicate notification batch.

## 13. Client state, loading, offline and performance

Shared client state separates navigation, server snapshots, editor draft, and transient gesture state. Gesture coordinates stay local; they do not remount the route. Cache keys include team, viewer/visibility, people, timezone, window and relevant revisions. Clear user-scoped data on logout/account/team switch.

SSR/initial data should hydrate into the same cache entry instead of triggering a second blank screen. Background refresh keeps current content visible with a quiet updating state. A first load skeleton matches final geometry. Differentiate genuinely empty, filtered empty, no access, stale cached, partial data and failed fetch.

Batch roster reads; do not fan out one full query chain per row. Bound date windows, prefetch adjacent days/weeks, and cancel obsolete requests. Virtualize large desktop grids/rosters while preserving focused rows and accessibility. Index only after examining actual query plans; likely needs include team/time event lookup, attendance membership, class ownership and block time ranges.

Offline permits viewing authorized cached data with a stale label and keeping a local draft. It does not show a new verified all-clear or silently queue a published schedule change. Retry reconnects and revalidates. RSVP optimistic feedback must roll back clearly on rejection. Availability confirmations and event publication wait for authoritative success.

Proposed performance budgets: immediate press feedback within 100ms, drag updates without network dependency, smooth 60Hz interaction target on supported physical devices, no unexpected layout shift when detail data arrives. Measure rather than promise. Log action latency, read completeness, suggestion duration, query counts, stale-response rejection, conflicts after recheck and delivery failures without private titles or tokens.

## 14. Delivery plan and release gates

| Phase | Deliverable | Exit condition |
|---|---|---|
| 0: Contract repair | Partial status, all-day checks, organizer inclusion, stale-response guard, RSVP parity | Focused domain and component regressions pass |
| 1: Shared engine | Normalized snapshot, privacy projection, batched reads, verified suggestions | Coach/player access tests, interval/timezone fixtures, query evidence |
| 2: Find a time | Mobile/desktop timelines, gestures + keyboard alternatives, suggestions, editor handoff | Real-device interaction review; draft survives round trip |
| 3: Calendar and people | Responsive home, person drill-in, details, search and context persistence | Route/back/scroll and responsive acceptance matrix |
| 4: Conflict resolution | Inbox, full overlap detail, preview, acknowledgements, safe commit | Stale revision, repeat-submit and notification tests |
| 5: Complete subscreens | Recurrence repair, availability blocks, exclusions, attendance/files/settings | Database/RLS verification and series atomicity checks |
| 6: Polish and rollout | Motion tuning, dark/reduced modes, telemetry, gradual enablement | Physical iOS + desktop QA and observed production health |

Use a server-controlled feature flag, ideally per team, with compatibility-preserving schema changes. Start with internal/QA accounts, then a small team cohort. A UI rollback must leave created data readable by the old route; do not roll back by deleting customer records. Release mobile and desktop against the same server contracts. Native changes require the actual app distribution process; a web deployment alone is not proof a native binary shipped.

### Required acceptance coverage

- Scheduling: adjacent intervals, nested overlaps, multiple conflicts per person, zero attendees, organizer-only event, optional attendees, excluded edited occurrence, cross-midnight, all-day multi-day, DST transitions, semester boundaries, exceptions and duplicated class materialization.
- Reliability: failed identity/class/event reads, stale snapshots, out-of-order responses, rapid event A→B switch, reconnect, duplicate submission, concurrent edits and partial notification failure.
- Privacy: cross-team attempts, player attempting coach mutation, private title redaction, free/busy-only access, revoked membership and feed-token handling.
- Recurrence: all scopes, mixed fields and attendee changes, future rule change, atomic failure behavior and notification counts.
- UI: 320/390/430 mobile widths, landscape, keyboard, large text, notch/home indicator, desktop 1024/1440+, touch scroll versus drag, keyboard-only workflow, VoiceOver, reduced motion/transparency, dark mode.
- Product: return from details preserves selection and scroll; no double-load flash; every visible button has a real action; no seeded identity or fabricated availability; all uncertainty is represented truthfully.

### Definition of done

The makeover is complete only when the core flow and the connected subscreens work for both roles, the shared engine handles incomplete data honestly, recurring changes are safe, and motion is verified on the mobile app. A polished timeline screenshot alone is not completion.

## 15. Implementation map and references

Primary source targets:

- `src/components/fairway/pages/calendar/FairwayCalendar.tsx`: orchestration and responsive composition; progressively extract state/domain adapters.
- `FairwayCalendarMemberRail.tsx`: explicit open-person versus compare semantics.
- `FairwayEventEditor.tsx`: draft, conflict state, Find a time handoff and review.
- `FairwayEventDetailDrawer.tsx`: responsive detail and authoritative capabilities.
- `src/lib/calendar/availability.ts`, `conflicts.ts`, `timezone.ts`: normalized availability, completeness, overlaps and temporal rules.
- `src/app/golf/actions/golf.ts`, `recurring-events.ts`, `calendar-sync.ts`, `attendance.ts`, `event-documents.ts`, `calendar-feeds.ts`: preserve/adapt existing domain writes.
- `src/styles/design-tokens.css` and shared Fairway shell/overlay primitives: materials, safe areas and motion consistency.
- `memory/features/calendar-events.md`: update the actual contract alongside implementation; do not let this planning document masquerade as shipped behavior.

External interaction references:

- [Microsoft Scheduling Assistant](https://support.microsoft.com/en-us/outlook/use-the-scheduling-assistant-and-room-finder-for-meetings-in-outlook): aligned free/busy comparison informs Find a time.
- [Apple Calendar view guidance](https://support.apple.com/en-gb/guide/iphone/iphfd1054569/ios): multiple calendar views inform progressive density rather than compressing a week grid onto every phone.
- [Fantastical proposals](https://flexibits.com/fantastical/help/proposals): useful precedent for explicit proposed alternatives; polling remains later scope here.

Visual references generated in this task:

- Approved scheduling direction: `/Users/ricknini/.codex/generated_images/01a08104-c3b1-7810-bf85-e61c26cd961e/exec-ee1bddc0-5db4-42c3-baf8-2b4d6b4da090.png`.
- Refined glass/material direction: `/Users/ricknini/.codex/generated_images/01a08104-c3b1-7810-bf85-e61c26cd961e/exec-c54381db-a87b-4c31-ad31-e227888686bd.png`.
- Initial home/person/conflict flow: `/Users/ricknini/.codex/generated_images/01a08104-c3b1-7810-bf85-e61c26cd961e/exec-81ef8e88-6486-4bfa-8132-7dab3bcc01dc.png`.

Planning defaults are intentionally decided here: 15-minute snapping, team timezone as primary, required versus optional attendees, private free/busy projection, and explicit conflict review. Change these through product decisions and tests, not ad hoc per-screen behavior.

## 16. Design review: what the first plan still needed

The first revision correctly covered screens and infrastructure, but screen coverage alone does not produce a distinctive experience. Five improvements now define the product:

1. **Make availability understandable before opening every schedule.** Introduce an aggregate availability strip aligned to the timeline. It reveals useful windows while retaining access to individual evidence.
2. **Keep comparison stable while exploring alternatives.** Introduce a reference marker for the original time, a proposed time window, and a reversible local selection history. Users can see exactly what they are changing.
3. **Give each screen one dominant purpose.** Avoid making Calendar home a dashboard, player profiles a biography, or event detail a wall of settings.
4. **Design the transitions as part of the information architecture.** A person, event, or selected time should remain recognizable as it moves into detail. The shell should not restart around it.
5. **Make uncertainty and recovery feel composed.** Missing data, failed saves, empty schedules, and interrupted gestures are first-class designed states with the same visual quality as success.

Premium is defined here as clarity, confidence, continuity, tactile control, and careful material. More blur, more movement, or more controls are not independent goals. The user should feel that the app understands the task and remembers where they are.

## 17. Signature experience: the availability lens

### A. The team availability strip

Place a slim aggregate strip directly below the time ruler, aligned to the same time coordinates as individual rows. It shows the number of verified free required participants in each interval. Use discrete tonal steps and counts on focus/selection, not a misleading continuous decorative gradient.

For a selected 60-minute duration, the strip evaluates the entire candidate interval beginning at each position. Label this explicitly as “60-min windows.” Otherwise a free-looking instant can mislead someone into choosing a period that overlaps later. If duration changes, recompute the strip and keep the current proposal visible.

Tap a promising position to move the proposal. “Next shared opening” jumps to the next verified candidate and moves the timeline just enough to reveal it. It does not silently change the date, duration, or invited people. If the next opening is tomorrow, announce and display that date before the user commits.

Unknown people remain visible in the denominator: “10 free · 2 unverified.” A full-height green strip never conceals missing data. Optional attendees appear in a secondary count. For very large teams, this summary remains visible while the roster scrolls.

### B. Original versus proposed time

When rescheduling, keep the existing interval as a thin dashed reference with “Current” in the ruler. The new interval is the emerald glass window. A concise comparison reads “30 minutes later · 2 overlaps removed.” Only claim removed conflicts after evaluating the same participants and complete data sources for both intervals.

Offer “Reset time” and local undo/redo for unsaved time and attendee changes. These operations alter the proposal only. A published reschedule is a new server mutation; it must not be presented as a harmless local Undo after notifications have gone out.

The selection window has a quiet inner tint, a fine leading edge, and a floating readout. Its shadow should separate it from the grid without making the band look like an event. Busy blocks remain legible through it. Amber intersection segments identify affected rows; the entire canvas does not turn alarming orange because one optional person is busy.

### C. Stable comparisons and explanations

During a drag, keep row order fixed. Never move a conflicting player under the user’s finger. After settling, a “Show 2 overlaps” control can intentionally filter the roster. “Show everyone” restores the exact order and scroll position.

Selecting a suggestion animates the time window to its location, not the entire page. If the destination is offscreen, use one short pan and settle; a large date jump uses a crossfade with a persistent date label. Do not fly through hours of intermediate content.

Every suggestion has a clear explanation: all required people free; one optional person busy; earliest shared opening; or closest to requested time. Avoid unsupported labels such as “Perfect time” or unexplained AI scores.

### D. Better use of phone space

Refine the earlier four-hour default: **390px and wider starts with four visible hours; narrow phones start with three.** Allocate approximately 88–104px for names, adjusted for text size. Short names stay readable; long names truncate with an accessible full label and open-person action. Never reduce the essential time scale to illegible slivers.

Keep only the compact header, date/duration row, and timeline ruler sticky. Suggestions live below the roster, with a compact “3 alternatives” jump link if the roster is long. The action dock shows selected time plus one primary action; it is not another large summary card. On a short viewport, reduce decorative padding before hiding functional information.

In a focused editor/comparison workflow, replace global bottom navigation with the task dock. On Calendar home, keep global navigation and use a header action instead. There must never be two floating bottom bars competing for the same thumb area.

## 18. Screen composition and interaction contracts

### Calendar home: a calm daily briefing

**First viewport:** compact title/actions, date strip, then the first useful event. At most one attention row appears above the agenda. It chooses the most urgent actionable item and offers access to the rest; it does not stack several banners.

The agenda’s visual rhythm alternates precise time labels with open space. Event rows get emphasis from content and status rather than a heavy shadow on every item. The next event can have a slightly stronger edge and a quiet “Next” label. The current time marker appears only when relevant and does not force automatic scrolling.

**Quiet day:** “No team events today” with the date retained, an available-window summary only if verified, and one role-appropriate action. A player is not offered coach-only event creation. A filtered-empty view shows “No events match these filters” with Clear filters; it does not suggest the whole day is free.

**Month:** readable day cells, a limited number of event indicators, clear selected/today distinction. Selecting a crowded day opens its agenda. Month is orientation; agenda/day is detail. Long-pressing a date offers Create event or Find a time where authorized.

### Player schedule: see the person in context

**First viewport:** back, compact identity, date strip, schedule. Identity should not push commitments below the fold. Show free/busy visibility and timezone quietly, with source status available through a labeled info action.

On desktop, opening a player preserves the main date context. On mobile, the shared avatar/name can transition into the compact header when the source is mounted; otherwise use the normal short navigation transition. Never delay navigation to manufacture a shared-element animation.

Footer action is “Compare with my schedule” or “Find a time,” depending on entry context. A player with no readable schedule shows “Schedule unavailable,” not an empty timeline. A player with a complete empty Helm schedule shows “No commitments in Helm,” not a claim about their entire life.

### People picker: purposeful selection

Search remains fixed at the top. Selected count and required/optional controls remain visible. Results show real name, role, and a clear checkbox; the avatar itself is not the checkbox. Offer team groups only where backed by real membership data. All/None is scoped to the displayed selection with an explicit count.

For comparisons, keep You included by default with an explicit option to remove yourself. For a team event, organizer inclusion remains a separate domain rule and does not disappear just because the picker filter hides the coach.

Done returns to the exact timeline position and performs one refreshed evaluation. Cancel restores the previous participant set. Keyboard selection, search clearing, and empty results all have clear states.

### Conflict detail: understanding before action

Top: event and occurrence. Middle: the shortest timeline that explains the overlap. Below: affected people and better alternatives. Bottom: one context-specific action. A conflict spanning multiple days gets a day selector rather than a compressed multiday chart.

Expand a person’s overlap to see authorized sources and exact times. If multiple periods overlap, show them all with a count and expandable detail. A small legend differentiates actual event, buffer, tentative interval, and unknown source.

Keeping the time opens a focused acknowledgement form with a brief explanation and unresolved impact summary. This form returns to review; it does not write immediately. If the user changes the proposal afterward, invalidate the acknowledgement when its fingerprint no longer matches.

### Review and publish: certainty without friction

Use a compact receipt-like layout: What, When, Where, Who, and unresolved issues. For an edit, highlight only changed fields and show previous values where meaningful. Recurrence scope and timezone are never buried in secondary copy.

Show notification channels/count only when known. If delivery is asynchronous, successful save says “Event updated · Notifications queued,” not “Everyone notified.” An event save failure leaves the exact draft and review state intact with a retry action. A revision conflict shows a readable field comparison and lets the coach revise their proposal.

### Event detail: progressive depth

The first view answers title, date/time, location, response, and who is involved. Description, people, files, attendance, and history follow as well-spaced sections with counts. Avoid horizontally scrolling tabs for a handful of critical sections on mobile; use short anchor links only when the content is genuinely long.

Actions are role-specific. For a player awaiting response, the RSVP choices dominate. For a coach preparing the event, Edit is primary; attendance becomes prominent near event time without changing server permissions. Destructive actions remain in the labeled overflow menu.

### Attendance: fast and forgiving

Use a stable roster with large controls and a persistent unsaved-changes count. Changes remain visibly pending until saved. Preserve the list position when a status changes; do not immediately move a player into another group while the coach is checking names. Bulk “Mark selected present” shows the selected count and does not affect absent/unselected people.

Private notes open a dedicated small editor with clear access labeling. A player’s attendance display cannot reveal other players’ private reasons. On failure, retain pending edits and identify which writes succeeded if the backend cannot yet guarantee atomicity; the intended final contract is an atomic selected batch.

### File, source, and settings screens

File preview has a consistent back path, readable loading/error state, and retry. Uploads show individual progress and permit cancellation before attachment completion. An event must not appear to have a document that failed to upload.

Source status lists Helm events, classes, personal blocks, and any future connected provider separately. Each has last checked time and a meaningful state. Refresh is available without dumping the user into configuration. A subscription screen explicitly explains export direction; it never uses a misleading Connected badge for an outbound-only feed.

## 19. Workflow choreography

| Journey | Sequence | Context that must survive |
|---|---|---|
| Schedule a practice | Calendar → New event → People/time → Find a time → Review → Event detail | Draft fields, people, duration, date, selected interval |
| Compare one player | Avatar → Player schedule → Compare → Choose interval → Editor | Person identity, selected day, return location |
| Resolve an overlap | Attention row → Conflict → Alternatives → Review change → Updated event | Original interval, affected occurrence, scope, acknowledgement |
| Respond as player | Invitation/event → RSVP → Confirmed detail → Calendar | Event row position, applied response, authoritative lock state |
| Record attendance | Event → Attendance → Select/update → Save → Event | Roster scroll, pending changes, server result |
| Add personal busy time | My schedule → Add busy time → Repeat/visibility → Save | Owner, timezone, intended date, source invalidation |
| Change a series | Event → Edit scope → Edit → Preview occurrences → Review → Commit | Scope, excluded occurrence IDs, revision, draft |

### State ownership and interruption behavior

The navigation frame owns the return destination. The workflow owns a draft ID and local history. The timeline owns gesture state. The server owns capability, completeness, revision and final mutation state. Do not put all four into one effect-driven component.

Switching apps, receiving a native interruption, resizing the viewport, or losing pointer capture cancels the active gesture to the last settled proposal. It must not publish or leave a stuck drag overlay. Resuming refreshes stale data without clearing the draft.

Opening a keyboard shrinks the usable viewport and keeps the focused input and relevant action reachable. Dismissal restores geometry without a second mount. Browser Back and native Back follow the same logical stack; unsaved editor exit gets one clear Keep editing / Discard choice. A read-only detail closes immediately.

One overlay is active at a time. An anchored menu closes before a full-screen flow opens. Focus moves after the new surface is ready and returns to the invoking control when dismissed. If that control no longer exists, focus moves to the nearest stable heading or event row.

## 20. Motion, material, and perceived performance refinement

### A consistent motion grammar

- **Touch:** small compression, immediate response, no delayed click waiting for animation.
- **Move:** direct tracking while interacting; gentle settle after release.
- **Navigate:** short directional movement with the shell retained.
- **Inspect:** anchored emergence or a small inspector transition.
- **Confirm:** a restrained check/status change, never confetti or a full-screen success page for routine scheduling.

One motion coordinator should decide whether a transition is navigation, layout, or local state. An event card opening into detail cannot also run a parent page fade and an independent overlay entrance. Cancellation must stop in-flight animations cleanly, including rapid back-to-back taps.

Do not delay fetched data to complete a flourish. Render available information immediately and transition only the changed region. Preserve the dimensions of names, response controls, and summary lines while supplementary data arrives. Long loading states become explicit with retry; they do not shimmer indefinitely.

### Microinteraction details

| Detail | Expected response |
|---|---|
| First use of time lens | One dismissible contextual hint beside the grip, not a tutorial carousel |
| Press selection handle | Handle gains contrast; readout lifts slightly; capture starts only after intended gesture |
| Cross a time increment | Visual snap guide; no repeated haptic storm |
| Settle on verified free time | One subtle haptic and status transition, only when state changes |
| Tap a suggested time | Selected marker moves; time band follows; current choice remains visible |
| Tap an avatar | Immediate pressed state, then predictable person drill-in |
| Change required/optional | Count updates locally; verification indicator refreshes without clearing rows |
| Save pending | Button retains width; label becomes Saving; duplicate activation prevented |
| Save failure | Inline explanation near action; preserved input; explicit Retry |
| Notification count changes | Gentle opacity change, not bouncing badges |

### Glass implementation budget

Keep the grid matte and the selection translucent; reserve true backdrop filtering for the top control surface, floating label/menu, and task dock where visible. Avoid nested full-screen blur layers. Use opaque fallbacks when transparency support or accessibility settings require them. Shadows and rim highlights should be token-based, not dozens of one-off literals.

The selected band must not multiply its opacity when crossing a sticky name column or ruler. Clip it to the correct canvas and draw the readout in a coordinated overlay layer. Give sticky intersections a deliberate background so scrolling text does not bleed through the wrong control.

Every polished state needs an unpolished-device test: small viewport, large text, low battery/older phone, heavy roster, slow network, and rapid repeated input. Blur quality never justifies a stalled drag. Profile compositor layers and long tasks; if necessary reduce material complexity before reducing interaction fidelity.

## 21. Engineering additions required by the refined design

### Aggregate strip and proposal evaluation

Build a normalized interval index per participant from the shared snapshot. Calculate candidate occupancy over the full requested duration, not just the leading instant. Track verified-required-free, required-busy, optional-free/busy, and unknown counts separately. The strip, suggestion cards, selected-band status and review screen consume the same evaluator.

Client evaluation provides responsive feedback for the current snapshot; the server independently revalidates the proposal. Never send a client-calculated free count as proof of validity. Large workloads should be profiled before introducing a worker; preserve one testable pure interval implementation and equivalent server semantics.

### Navigation and draft contracts

Introduce a typed workflow context with origin, selected date/view, scroll anchor, event/occurrence ID, draft ID and comparison selection. Store navigation identifiers in route state where appropriate, and private draft data in authenticated local state. Restore by stable event/person IDs, not fragile pixel offsets alone; use the pixel offset only as a fallback when the anchor remains present.

Use explicit state transitions: idle → loading snapshot → ready/partial/failed; ready → dragging → settled → verifying; editor → reviewing → committing → success/conflict/failure. A new selection invalidates the previous in-flight verification. A successful response can update the UI only if its request identity still matches the current proposal.

### Source evidence and accessibility contracts

Add a safe source-summary projection with checkedAt, completeness and permitted explanation. It supports the source-status screen and the “Based on Helm schedules” wording without exposing raw database errors.

The interactive grid has a semantic alternative: a readable participant list with busy intervals, current proposed time, and explicit adjust-time controls. Keyboard/screen-reader users must not have to navigate hundreds of decorative cells. Provide a concise textual summary for aggregate availability and each conflict; do not announce every background refresh.

### Additional analytics, without sensitive content

Measure time to first useful calendar content, comparison entry-to-selection, selection-to-review, review-to-success, suggestion acceptance, backtracking, failed verification recovery and accidental gesture cancellation. Record aggregate counts and durations, not event titles, private notes, class names, portraits, or feed URLs. Use these to find friction, not to manufacture a premium-success score.

## 22. Design completion checklist and next deliverables

Before implementation is considered visually specified, produce responsive frames for:

1. Mobile Calendar home: populated, quiet day, invitation, conflict, loading and filtered empty.
2. Desktop week: normal, event inspector, month overflow and narrow-width fallback.
3. Find a time: all free, overlap, tentative, unverified, long roster, small phone and desktop.
4. Person schedule: own, coach-visible detail, free/busy-only and unavailable.
5. People picker: search, selected, required/optional and empty result.
6. Conflict center/detail: multiple overlaps, changed source, acknowledged and no issues.
7. Editor/review: new, recurring, reschedule, validation error, stale revision and save failure.
8. Event detail: coach/player, RSVP pending/locked, attendance and documents.
9. Availability/source settings: personal block, recurrence, exception, source failure and subscription.
10. Dark, large-text, reduced-motion and reduced-transparency variants of the core flows.

These frames are still required; the existing generated concepts do not cover them all. A clickable interaction prototype should then demonstrate drag, resize, suggestion selection, avatar drill-in, back restoration and the entire review/save loop. Static images cannot establish smoothness or gesture correctness.

### Release-blocking design criteria

- One unmistakable primary action per focused screen; no duplicate bottom surfaces.
- Readable time and participant labels at 320px and increased text size.
- No invisible gesture-only functionality; explicit alternatives are present.
- No motion-induced content jumps, automatic scroll resets, or double entrance animations.
- No private detail revealed by timeline, suggestions, source status or conflict explanations.
- No verified-green state from unknown data, cached stale approval or incomplete suggestion checks.
- Every error, empty state and loading state has an intentional layout and recovery path.
- Every critical workflow returns the user to a recognizable place with their work preserved.

The intended signature is now clear: **a calm calendar that becomes a precise, tactile scheduling instrument when needed.** The visual availability lens, stable comparison, explainable alternatives and seamless return paths create the distinctive experience; glass and motion make those behaviors feel finished.
