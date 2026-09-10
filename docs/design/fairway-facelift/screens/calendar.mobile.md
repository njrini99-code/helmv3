<!-- markdownlint-disable MD013 -->
# SCREEN · Calendar (mobile) — preflight

Route: `/golf/dashboard/calendar` (coach + player). Viewports: 393×852 first, 430×932.
Owner: helmv3-20 (mobile). Desktop composition: helmv3-7f.
Evidence: `ui-intelligence/facelift/captures/coach/calendar__phone__{fold,full,day,week,month,event-sheet}.png` (2026-09-09 run).

## What a coach does here on a phone

At the range between groups: "what is next, who is coming, where". Three questions, in that order. Open the app, glance at today, tap one event, see the responses, get back. Creating an event is rarer and already has its own editor.

## What is wrong today (from the captures + map)

Four containers before the first event: hub tabs (Calendar | Travel), a title row with a round "…" button, a raised full-width Segmented (Day/Week/Month/Agenda), then a raised "Team schedule" people row. Then the schedule itself is a bordered, shadowed day-group card per day, the month view is a lifted card, and the empty state is a dashed card. The event sheet stacks up to six bordered cards (RSVP, details, responses, people with a card per attendee, files, attendance) and ends in a pill CTA. Three glass recipes are in play (`.fw-glass-chrome` masthead, sheet header, sticky day headings with their own backdrop-blur). Arbitrary `z-[8]` / `z-[9]` / `z-[19]`, `rounded-xl`, inline `[box-shadow:…]` in feature code.

## SCREEN

- **Archetype:** E chronology (schedule) + F drill (event sheet).
- **Dominant object:** the schedule for the period in focus — the timeline rows. Everything above it is one bar.
- **Supporting:** the period title + view switch + date rail (one composed toolbar); the people context (who is being compared) as a quiet hairline row, not a raised card.
- **Tertiary:** relative day cues ("in 4 days"), RSVP status pills, the now-line.
- **Floating:** the dock and the "+" FAB. The masthead is a MATTE sticky bar (`bg-surface` + foot hairline), not frost: a backdrop-filter that sits over the scrolling stage is re-blurred on every scroll frame on a phone (owner perf requirement, 2026-09-10). The screen's one frosted region is therefore the open event sheet (modal tier). `.fw-frost-static` (the blur-free frost look the peer is adding) replaces the matte bar when it lands.
- **Modal:** the event sheet — frost bottom sheet (`Sheet material="frost"`, side bottom), sticky `Button shape="block"` CTA in `Sheet.Footer`.
- **EXISTING FAIRWAY:** Sheet (frost, Body/Footer), InsetGroup + InsetGroup.Row, StatMatrix (first consumer), Button shape="block", Segmented, PopoverPanel, StatusPill, AvatarGroup/Avatar, EmptyState, Surface (matte stage), PressTarget, FairwayEventCard (already a timeline row, keep), FairwayAgendaView sticky headings (keep the `--fw-calendar-hero-h` contract).
- **NEW FAIRWAY NEEDED:** none. The `.fw-glass-chrome` usage in calendar is gone (masthead matte, sheet header matte inside the frost sheet). `.fw-frost-static` (peer) is the only follow-up.
- **PERFORMANCE (owner hard requirement):** no backdrop-filter on anything that translates or that sits over the scrolling stage — the only blur is the settled `Sheet material="frost"` panel, applied by the primitive. The event sheet mounts header · response · metadata immediately and mounts People and Files only after the sheet settles (`onAnimationEnd`, with a 360 ms fallback for reduced motion). One `getEventRSVP` per open: the coach's attendees ride on the orchestrator's call (`attendees` prop → `EventPeopleSection`), the section fetches for itself only for a player or as its Retry path. The agenda's minute clock lives in today's rows only (`TodayRows`); every day's rows are a memoized `BucketRows`, `FairwayEventCard` is memoized, and `visibleBuckets` is memoized with a Set. No framer `layout` anywhere under `pages/calendar/**`; no hand-set `will-change`.
- **UNDERLYING KIT:** vaul (through Sheet), react-day-picker (through CalendarSurface) — unchanged.
- **CONTAINERS TO REMOVE / MERGE:**
  1. Member rail card → a hairline row on the canvas (AvatarGroup + label + chevron), no border/shadow; "Compare" stays in its popover.
  2. Day-group cards → one matte stage: `Surface` once around the whole period, day headings as sticky seams inside it, rows separated by hairlines. Not a card per day.
  3. Month card → the day-picker sits on the matte stage, not in a lifted card; the selected-day list continues beneath it inside the same stage.
  4. Dashed empty-state card → `EmptyState` on the stage, no dashed frame.
  5. Event sheet: RSVP card + details card + responses card + people card(+ card per attendee) + files card + attendance card → header (type pill + overflow, title, time) · **Your response** as a 3-up `Segmented`-style choice inside one InsetGroup (player) · **metadata InsetGroup** (owner / location → Maps / notes / linked trip) · **response StatMatrix** (coach: Accepted / Maybe / No / Pending, 2×2 on phone) · **People** as InsetGroup rows (avatar, name, status pill), no per-row card · **Files** and **Attendance** as InsetGroup rows with chevrons · sticky block CTA (coach: Edit event; coach within 1h: Record attendance).
- **VISUALIZATIONS:** the response StatMatrix (numbers as one object); the density dots on the date rail stay; the now-line stays.
- **MOBILE:** masthead is one bar: title (date-jump) · Today · overflow; second row is the Segmented view switch; Day view adds the date rail as a continuous strip (no per-day pills — the selected day is a tinted island on a continuous rail). Period turns by swipe (existing). FAB remains the one primary action. 44px on every control in the bar (date-jump trigger, Today, overflow, Segmented segments, rail days). Haptic `selection` on view change and day select; `light` on opening the sheet. Sheet close preserves focusDate/view/scroll (state lives in FairwayCalendar, verified). Reduced motion: no title rise, no thumb slide.
- **DESKTOP:** untouched here (helmv3-7f). Everything below `md` only; desktop branches keep their classes.
- **STATES:** loading — `FairwayCalendarSkeleton` must mirror the new first paint (one bar, one hairline people row, one stage with three rows); empty — EmptyState on the stage, one action (coach: the FAB is the action, so no second button); error — route `error.tsx` unchanged; RSVP save error stays local in the sheet.
- **RISKS:** (1) `FairwayCalendarHero.masthead.test.tsx` / `FairwayCalendarHero.test.tsx` / `FairwayAgendaView*.test.tsx` / `FairwayEventDetailDrawer.test.tsx` / `FairwayCalendarMemberRail*.test.tsx` pin text, roles and some classes — run them after each file. (2) The `--fw-calendar-hero-h` ResizeObserver contract must survive. (3) The coach availability-overlay Month branch renders the desktop grid on phones (behaviour gap, not visual) — note in AUDIT, do not change in this pass. (4) No server-action or hook change: the server actions, `useCalendarRangeEvents` and `getItineraryForEvent` stay exactly as they are; the only data-flow change is that the coach's `getEventRSVP` result is now shared with the People section instead of fetched twice. (5) Three copies of the event-type presentation table (eventPresentation.ts, the drawer, FairwayDayStrip) — the drawer and strip import the canonical one in this pass.
