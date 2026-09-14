# Lane A07 — Calendar, event actions, timezone, and temporal consistency

Baseline: `3c90f9f174ac103af5fafc600aebecd98243decc`. Evidence labels used below are
restricted to `SOURCE`, `RISK`, `PROPOSAL`, `NOT_RUN` per the worker brief — no
device/runtime/screenshot evidence was available or used.

**Context that shapes every finding below:** this calendar surface has already
been through multiple prior audit passes. Nearly every file read carries
detailed comments citing specific prior findings (`#9`, `#16`, `#18`, `#20`,
`#25`, `#37/#166/#185/#83`, `#1493-1496`, `P232`, `P238`, `P240`, `audit W1`,
Finding 4) with the fix and its rationale in place. The RSVP write path
(`src/lib/calendar/rsvp.ts`), the range-fetch hook
(`src/hooks/golf/use-calendar-range-events.ts`), and the timezone helpers
(`src/lib/calendar/timezone.ts`) are unusually well-hardened and should be
kept as-is — several are cited below as the correct pattern that a sibling
surface fails to follow. My findings are concentrated on the places that
pattern wasn't yet applied consistently, plus one true interaction race and
one cross-lane fork.

## Top 5 actionable findings

1. A07-001 (P1, SOURCE+RISK) — Player "Respond" primary action is bound to a
   memoized "most imminent un-RSVP'd" event that can retarget between the
   moment the user decides to tap and the moment the tap actually fires (a
   realtime-triggered router.refresh() recomputes it), and the button never
   shows which event it targets. FairwayCalendar.tsx:939-976,
   FairwayCalendarHero.tsx:196-206,241-251.
2. A07-002 (P2, SOURCE) — The event detail drawer and edit editor hold a
   frozen snapshot of the event, never re-synced to live data while open — a
   cancellation/reschedule/deadline change made elsewhere is invisible until
   the user's own write attempt is server-rejected. FairwayCalendar.tsx:704-705,830-887,
   FairwayEventDetailDrawer.tsx:191-223.
3. A07-003 (P2, SOURCE) — Agenda/Month's honest-empty state is gated only on
   totalEvents === 0, with no awareness of isLoadingRange — navigating to an
   unfetched range can show "No upcoming events" and "Loading events..."
   simultaneously. FairwayAgendaView.tsx:236-285, FairwayCalendar.tsx:1038-1170.
4. A07-004 (P2, SOURCE) — The day-strip's density dots bucket by start-day
   only, not eventDaySpan like every sibling view (Month, Agenda) — a
   multi-day event's dot disappears after day 1, reintroducing the exact bug
   class (#1493-1496) already fixed everywhere else in this file family.
   FairwayDayStrip.tsx:108-166.
5. A07-005 (P2, SOURCE) — The hero's "N this week/month/in view" count uses
   start-timestamp membership only for week/month/agenda views, while the
   body directly below uses span-overlap — a multi-day event in progress can
   be visible in the list but excluded from the header's own count of it.
   FairwayCalendar.tsx:717-751.

Also flagged (see full findings): A07-006 confirms A04's cross-lane report of
a forked, fallback-less formatEventTime on the player Home card
(player-dashboard-parts.tsx:104) that reopens the exact SSR/CSR timezone
mismatch class the canonical src/lib/calendar/timezone.ts helper exists to
prevent; A07-007 — silent deep-link miss for ?event=<id>; A07-008 —
first-viewport chrome stack (composition confirmed, pixel cost NOT_RUN);
A07-009 — a dead-code duplicate formatter, recorded and explicitly not
counted as live.

## All findings

See findings.jsonl in this directory for the full structured records
(A07-001 through A07-009); each includes mechanism, exact file:line ranges,
expected/actual, proposed fix, and negative-test references. Summarized:

### Temporal definition sheet

| Concept | Meaning | Source |
| --- | --- | --- |
| focusDate | The calendar day the user is currently positioned on (drives Day/Week/Month/Agenda framing). Seeded from zonedMidnight(serverNow, teamTimezone) for SSR/CSR byte-identity, promoted to the real client "today" post-mount only if the user hasn't navigated away from the seeded day. | FairwayCalendar.tsx:206-225 |
| nowRef | Reference "now" for all today/past/future comparisons in the hero, day-strip, and agenda labels. Same seed-then-promote pattern as focusDate; never Date.now() directly in a render path (that would race SSR). | FairwayCalendar.tsx:210-225 |
| selectedDate | Currently always equal to focusDate in this shell (the hero prop is separate from focusDate in name only) — there is no independent "selected but not focused" day concept. | FairwayCalendar.tsx:986 |
| visibleWindow | The fetch/render window for the active lens: Month = calendar month; Agenda = focusDate +/- 3 months (deliberately wide, "shows the demo's full season"); Day/Week = the calendar week containing focusDate. Day's window is a fetch-buffer implementation detail reusing the week range — the hero label layer (isDayView) exists specifically so this doesn't leak into copy ("today" not "this week"). | FairwayCalendar.tsx:232-245, FairwayCalendarHero.tsx:96-111 |
| loadedRangeStart/End | The server's original +/-3-month fetch window (page.tsx), used by the range hook to know what's already covered without re-fetching. | page.tsx:453-454, use-calendar-range-events.ts:279-293 |
| upcomingCount (prop) | Server-computed count of events with start_time/start_date >= serverNow and status !== 'cancelled', from the full +/-3-month payload — superseded at render time (kept only for the prop/SSR contract). | page.tsx:430-436 |
| liveUpcomingCount | The count actually rendered in the hero: same "future, not cancelled" rule as upcomingCount, applied to the live client-merged events list, additionally excluding class-meeting rows (documented rationale: mixing team commitments with a player's personal class schedule made two on-screen counts ~150x apart). A genuinely different set definition from the server prop, by design — not a bug. | FairwayCalendar.tsx:753-777 |
| windowCount | "N this week/month/in view" — the count next to liveUpcomingCount. Day view: span-overlap against focusDate (correct, matches the body). Week/Month/Agenda: start-timestamp only, does not use span-overlap — see A07-005. | FairwayCalendar.tsx:717-751 |
| Day-strip density dot count | Per-day event count for the aria-label and up to 3 type dots — start-day only (ev.start_date || ev.start_time, no span logic) — see A07-004. | FairwayDayStrip.tsx:108-166 |
| Agenda totalEvents | Sum of bucketed rows across all day buckets in the visible range — a multi-day event is counted once per day it spans, a third distinct definition from windowCount (unique events) and liveUpcomingCount (unique events). Used only to decide the honest-empty branch, not displayed as a number to the user, so the differing definition is low-risk as-is. | FairwayAgendaView.tsx:174,236,260 |
| "Zero events" vs "unqueried" vs "failed read" | Server events fetch (page.tsx) throws to the route error boundary on failure — never renders a cheerful empty calendar (documented fix, audit finding #20 at the server layer). Client range fetch (use-calendar-range-events.ts) exposes rangeError/isLoadingRange distinctly from a genuinely empty events result — but the body components never consume isLoadingRange, so "confirmed empty" and "not yet asked" collapse into the same UI at the Agenda/Month layer. See A07-003. | page.tsx, use-calendar-range-events.ts |
| Week-start rule | Sunday (weekStartsOn: 0), applied consistently across FairwayDayStrip and every startOfWeekFn/endOfWeekFn call in FairwayCalendar.tsx (visibleWindow, availWindow). No divergence found within the calendar surface. Whether this agrees with Home's own week framing is A04's territory (DayScheduleSwipe, out of my lease) — not verified here. | FairwayDayStrip.tsx:55,104, FairwayCalendar.tsx:242-243,363-370 |

### Event action matrix

| Action | Target binding | Optimistic behavior | Failure reconciliation | What is preserved |
| --- | --- | --- | --- | --- |
| Player RSVP (Going/Maybe/Decline) | Named event.id passed explicitly through onRespond(eventId, status) — not a globally-scoped action. But the choice of which event the primary "Respond" CTA opens is itself re-derived reactively (A07-001). | Local userRsvpStatuses map updated only after server confirms (handleRespond in FairwayCalendar.tsx:892-931); a pendingStatus per-button busy state disables all 3 buttons during the round-trip. No optimistic "already accepted" flash before the server responds. | Server enforces deadline/started/cancelled locks independently in updateRSVP (src/lib/calendar/rsvp.ts:378-474) regardless of what the client believed; typed code (rsvp_deadline_passed/event_started/event_cancelled) maps to specific copy via rsvpLockMessage. Confirmed the client (useRSVP.ts) and server (lib/calendar/rsvp.ts) codes are correctly translated at the action boundary (golf.ts:5118-5150), not a mismatch as first suspected. | Drawer stays open on failure with the error shown inline; does not auto-close, does not lose the player's other in-progress state. Does not re-check whether the event itself changed while open (A07-002). |
| Coach create/edit/delete/restore event | editorEvent.id (single) or parent_event_id/recurrence_rule-derived series root (recurring scopes) — resolved server-side in editRecurringEventImpl/deleteRecurringEventImpl. | None client-side; isSavingEvent disables the form during the round-trip. | router.refresh() and refetchVisibleRange() both called on success (documented reason: an edit landing outside the fresh SSR window can leave the client range-cache showing a stale row until a realtime echo arrives) — a deliberate double-invalidation, not redundant. A stale-deployment ("server action not found") error triggers a hard reload rather than surfacing a generic error. | editorEvent/drawerEvent frozen at open time (A07-002); originalStartDate for thisAndFuture scope is similarly frozen. |
| ICS export / subscribe (Add to phone) | Independent FairwaySubscribeSheet state (feeds, feedsLoading, feedsError) — no shared state with RSVP or the editor. | N/A (list/create/regenerate/delete of feed rows). | Own retry affordance (loadFeeds re-invoked by a Retry button); a create/regenerate/delete failure sets feedsError without touching any RSVP or event-editor state. | Confirmed export/subscribe failures cannot cross-contaminate RSVP state — different server actions, different component subtree. |
| Deep link (?event=<id>) | initialEventId prop, matched by id against whatever events happen to already be loaded. | N/A. | None — a miss is silent (A07-007), not an explicit "unavailable" state. | Guarded by autoOpenedRef so it only attempts once per mount (won't re-open after the user closes it). |

### Range/query tests (source-derived; all NOT_RUN for actual execution — no backend/device this phase)

- T-range-1 (empty vs unqueried, week/month/agenda): Navigate to a date range outside both the server's +/-3-month window and any previously-visited client range. Expect: per A07-003, the honest-empty copy can render before the fetch resolves, alongside the loading banner.
- T-range-2 (multi-day span vs day-strip): Fixture a 4-day event (start_time Fri, end_time Mon, all_day true). Expect: Month/Agenda show it all 4 days (confirmed by source, eventDaySpan); day-strip shows a density dot only on Friday (A07-004).
- T-range-3 (windowCount vs body, spanning event): Same fixture, view the following week (event started before the window, still running inside it). Expect: body shows the event; windowCount for week/month/agenda excludes it (A07-005); day view's windowCount correctly includes it.
- T-range-4 (1000-row cap): Both the server page fetch and the client range hook paginate via fetchAllRowsResult with a stable .order('id') tie-break specifically to survive the PostgREST 1000-row cap — confirmed present in both page.tsx:232-242 and use-calendar-range-events.ts:385-405. PASS (already correctly implemented; no bare .limit() found).
- T-range-5 (race-safe merge): use-calendar-range-events.ts's generation-tagged merge (eventVersions) plus per-fetch epoch guard (fetchEpochRef) plus prune-only-within-queried-window delete logic are all present and specifically documented against the exact race class (#37/#166/#185/#83) the work order asks about. PASS — this is the strongest piece of the calendar's data layer; do not replace it.
- T-range-6 (team switch): Switching teamId resets both loadedRef (interval bookkeeping) and eventVersions (event map) in the same render, specifically to avoid the two failure modes documented in the hook's own comments (women's/men's team bleed, or believing an already-visited month is covered under the new team). PASS.
- T-range-7 (class privacy on client fetch): A player's client-side range fetch scopes class rows to their own via an .or() filter server-side RLS cannot express from the browser key alone (a coach gets the unfiltered query). PASS — confirmed present, not merely commented.

### Calendar transformation specimens

Not authored this phase — no PROPOSAL visual specimens were drafted, since the
existing composition (single hero plinth, Fairway tokens throughout) is
already the Wave-2 direction and the defects found are behavioral/data
(counts, staleness, empty-state gating), not material/token gaps. A07-008
records the one compositional (first-viewport chrome stack) observation;
resolving it is a layout change A03 should review for token/primitive
consistency (dependencies: C08), not a new visual system.

## Coverage ledger

| Path/component | Status |
| --- | --- |
| src/app/golf/(dashboard)/dashboard/calendar/page.tsx | PASS (server fetch/error handling reviewed; throws on primary read failure, degrades gracefully on secondary reads, per documented audit history) |
| src/app/golf/(dashboard)/dashboard/calendar/error.tsx | NOT_RUN:not-read (route error boundary; not required for this pass's findings) |
| src/app/golf/(dashboard)/dashboard/calendar/loading.tsx | NOT_RUN:not-read |
| src/components/fairway/pages/calendar/FairwayCalendar.tsx | FINDING:A07-001, FINDING:A07-002, FINDING:A07-005, FINDING:A07-007, FINDING:A07-008 |
| src/components/fairway/pages/calendar/FairwayCalendarHero.tsx | FINDING:A07-001 (contributing file) |
| src/components/fairway/pages/calendar/FairwayDayStrip.tsx | FINDING:A07-004 |
| src/components/fairway/pages/calendar/FairwayAgendaView.tsx | FINDING:A07-003; span-overlap bucketing itself PASS |
| src/components/fairway/pages/calendar/FairwayMonthGrid.tsx | PASS (span-overlap rendering confirmed correct via source read of import/usage; not fully line-read) |
| src/components/fairway/pages/calendar/FairwayEventDetailDrawer.tsx | FINDING:A07-002; RSVP lock gating itself PASS |
| src/components/fairway/pages/calendar/FairwayEventEditor.tsx | PASS (edit-scope picker copy reviewed; recurring edit math reviewed via server action; contributing to A07-002 on staleness) |
| src/components/fairway/pages/calendar/FairwayCalendarMemberRail.tsx | NOT_RUN:not-fully-read (role-filter/exclusion logic referenced from FairwayCalendar.tsx and taken as PASS on that basis; not independently opened) |
| src/components/fairway/pages/calendar/FairwayAvailabilityList.tsx | NOT_RUN:not-fully-read (timezone-formatting imports confirmed canonical; body not fully read) |
| src/components/fairway/pages/calendar/EventWhenFields.tsx | NOT_RUN:not-read |
| src/hooks/golf/use-calendar-range-events.ts | PASS (race-safety, pagination, team-switch reset, privacy filter all confirmed correct; contributing to A07-003 on the missing isLoadingRange threading) |
| src/hooks/golf/use-calendar-keyboard.ts | NOT_RUN:not-read |
| src/lib/calendar/rsvp.ts | PASS (server-side lock enforcement, write-integrity check on upsert, per-player notification dedupe key all confirmed correct) |
| src/lib/calendar/timezone.ts | PASS — canonical helper; used as the reference implementation against which A07-004/A07-006 forks/gaps are measured |
| src/lib/golf/timezone.ts | PASS (DST-safe offset computation, wallClockInZone, todayIsoInZone; a distinct, complementary set of helpers, not a duplicate of lib/calendar/timezone.ts — different responsibility: wall-clock<->instant conversion for writes vs instant->display formatting for reads) |
| src/lib/utils/timezone.ts | PASS (canonical for the Home/dashboard family — formatTimeInTz; A07-006 is about a component that failed to import it, not a defect in this file) |
| src/lib/calendar/recurrence.ts | PASS (types-only stub; already self-documents that the real engine is src/lib/golf/recurrence.ts — no action needed) |
| src/lib/golf/recurrence.ts | NOT_RUN:not-fully-read (RRULE parse/serialize; referenced correctly from recurring-events.ts, not independently line-audited) |
| src/app/golf/actions/recurring-events.ts | PASS (edit-scope math, end-after-start invariant, zero-row detection, notification idempotency all reviewed and correct); contributing to A07-002 on originalStartDate staleness |
| src/app/golf/actions/calendar-feeds.ts | NOT_RUN:not-fully-read (verified separation from RSVP state via FairwaySubscribeSheet usage; action bodies not line-audited) |
| src/app/golf/actions/calendar-sync.ts | NOT_RUN:not-read |
| src/lib/calendar/ical.ts | NOT_RUN:not-fully-read (export formatting; function inventory only) |
| src/lib/calendar/class-events.ts | PASS (ownership-resolution guard against false "nobody owns this" reviewed via page.tsx/FairwayCalendar.tsx call sites) |
| src/lib/calendar/conflicts.ts | NOT_RUN:not-read |
| src/lib/calendar/availability.ts | NOT_RUN:not-read (943 lines; out of budget this pass — coach availability-overlay feature, not core temporal correctness) |
| src/lib/calendar/premium-utils.ts | NOT_RUN:not-read |
| src/lib/calendar/write-integrity.ts | PASS (referenced/used correctly by rsvp.ts's requireWriteSuccess) |
| src/lib/golf/date-only.ts, src/lib/utils/date-only.ts | NOT_RUN:not-read (two files with similar names — flagging for A00/A03 to confirm they are not another canonical/fork pair; not verified this pass) |
| src/components/golf/calendar/PremiumCalendarClient.tsx + legacy grid tree (MobileEventCard, CalendarDayViewSwipeable, WeekView, DayView, MonthView, EventCard, CalendarAvatarSidebar, EventDetailModal) | OUT_OF_SCOPE:dead-for-golf-route — confirmed retired (imported as a value only by its own test file); see A07-009. Baseball's calendar route may still use parts of this tree — out of GolfHelm scope, not verified. |
| src/app/golf/actions/golf.ts (respondToEvent, getEventRSVP, getPlayerEventRSVP) | PASS (lock-code translation from lib/calendar/rsvp.ts's untranslated codes to the client's prefixed codes confirmed correct at the action boundary) |

## Contracts requested

- C02 (Scoped read): A07-003 and A07-007 both need a documented distinction between "no result for this scoped read yet" and "confirmed empty," expressed as a field the range hook/deep-link fetch can set, so downstream views can gate honest-empty rendering on it consistently rather than each view improvising its own interpretation of isLoadingRange.
- C04 (View/return state): Not directly needed by A07 — the calendar's own focusDate/view state is component-local and works for same-session navigation; whether it needs to survive a full unmount/return (e.g., leaving to Home and back) is A02's return-state infrastructure, not verified here.
- C06 (Feedback): A07-001's proposed fix (freezing the primary-action target for the duration of a gesture) would benefit from a documented "gesture-in-flight" contract shared with A01's haptic dispatch, rather than a one-off debounce local to this component.

## Shared changes requested

- src/components/fairway/pages/dashboard/player-dashboard-parts.tsx:104-114, owned by A04: delete the local formatEventTime fork and import formatEventTime from @/lib/calendar/timezone instead (same signature: (iso, timezone)). Confirms A04's own flag; recorded here with the exact mechanism (missing DEFAULT_TIMEZONE fallback vs the canonical helper) so the fix is a one-line import swap, not a rewrite. See A07-006.
- src/components/fairway/pages/dashboard/DayScheduleSwipe.tsx, owned by A04: not edited or proposed against per the stated boundary; flagging only that its week-start convention (if any) should be checked for agreement with the Calendar's weekStartsOn: 0, or explicitly labeled as intentionally different, per the work order's "label it where it varies" instruction. Not independently verified this pass (file not opened, per boundary).

## Open questions for the owner

1. Should the player "Respond" CTA always name its target event (A07-001's proposed fix), or is a generic CTA an intentional simplicity choice that should instead be protected by freezing the target for the duration of the gesture without changing the label? Both close the race; only the first also closes the "which event is this?" ambiguity when there's no race at all.
2. Is the windowCount/day-strip-density disagreement with multi-day events (A07-004/A07-005) worth a coordinated fix now, or should it wait behind other Wave-1/2 work given its P2 severity and the fact the underlying eventDaySpan primitive already exists and is proven?
3. For A07-002 (stale drawer/editor), is "This event was removed" an acceptable UX for the rare hard-delete-while-drawer-open case, or does the product want an explicit reconciliation flow (e.g., "This event's time changed — here's the new time")?

## Messaging referrals

None. No messaging-adjacent code was encountered while reading the calendar
surface, RSVP path, timezone helpers, or recurring-event actions.

## NOT_RUN ledger

| Check | Missing dependency | Next owner |
| --- | --- | --- |
| Any OBSERVED/REPRODUCED evidence (all findings) | No device, simulator, running app, or database this phase | A12 (device/integration verification) |
| First-viewport pixel cost (A07-008) | Real browser/device viewport at 390x844 | A11/A12 |
| Accessibility (VoiceOver) confirmation that A07-001's retarget is silent to screen-reader users | A device/VoiceOver session | A12 |
| FairwayMonthGrid.tsx, FairwayCalendarMemberRail.tsx, FairwayAvailabilityList.tsx, EventWhenFields.tsx, use-calendar-keyboard.ts full line-by-line read | Time budget this pass; spot-checked via imports/usage only | A07 (follow-up pass) or A12 |
| src/lib/calendar/availability.ts (943 lines), conflicts.ts, premium-utils.ts, ical.ts full read | Time budget this pass | A07 (follow-up pass) |
| src/lib/golf/date-only.ts vs src/lib/utils/date-only.ts — possible canonical/fork pair | Not compared this pass | A00/A03 |
| Recurrence duplicate-expansion and deleted-occurrence UI behavior beyond the edit-scope picker's copy | Would need a running app + fixture series to exercise generateOccurrences/getExpandedEvents end-to-end | A12 |
| T-range test fixtures actually executed against a database | No running Supabase instance this phase | A10/A12 |
