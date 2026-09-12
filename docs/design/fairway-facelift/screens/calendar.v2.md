# Calendar (coach), /golf/dashboard/calendar v2 spec

<!-- Synthesized by the facelift design panel (three concepts, one judge) on 2026-09-10. -->

## Purpose

Answer the owner's verdict directly: this pass replaces the current sparse column of boxed controls and one floating event card with a screen built from four distinct, data-driven visual instruments plus a considered typographic masthead, so the page reads as one designed instrument, not "basic cards." Every visual renders from data already resident on this screen (the range-events hook, the eager conflict-inbox snapshot) or from one new, narrowly-scoped server action. No nested cards, no repeated identical card grid, no side-stripe borders, no dots-on-a-rail slider, no gradient text, no hero-metric card, no em dash anywhere in copy.

Current state, verified against the live capture (`ui-intelligence/facelift/captures/coach/calendar__desktop__full.png`, `calendar__phone__month__fold.png`, `calendar__phone__week__fold.png`): one masthead row whose period-title text is currently invisible (a lone chevron floats alone above a second row that holds a boxed Day/Week/Month/Agenda pill, the ‹ › steppers, and four loose labeled icon buttons), one boxed "Team schedule · 8 people" hairline row, one single floating bordered event card for the entire visible range, then roughly 700px of bare cream. Month view's empty state is a dashed-border card; Week view's empty state is a large bordered card with a centered icon. This is the literal "basic cards" the owner is describing, and the data behind it is deliberately sparse (one event in the whole period), the fix has to make a quiet period still look like an instrument, not a void.

## First question

"What's coming, and where's the trouble?", answered by the Tempo strip and the Attention chip before the coach touches anything, even on a week with nothing on it.

## Data verification (source of truth, checked by rg against this worktree)

- `FairwayCalendar.tsx:73` imports `useCalendarRangeEvents` from `src/hooks/golf/use-calendar-range-events.ts`, this, not `useCalendarEvents.ts`, is the hook actually driving this screen. `mapGolfEventRow` (`use-calendar-range-events.ts:90-109`) populates `event_type`, `start_time`/`end_time`, `location`, `requires_rsvp`, `all_day`, `parent_event_id` on every event already in memory, zero extra fetch.
- CONFIRMED NEGATIVE: `rsvp_confirmed_count` / `rsvp_maybe_count` / `rsvp_declined_count` / `rsvp_pending_count` / `rsvp_total_count` are declared as optional fields on the `CalendarEvent` type in `useCalendarEvents.ts:25-29`, but `mapGolfEventRow` never sets them. They are `undefined` on every event this screen renders today. Any RSVP figure in this spec comes only from the new batched action below, never from those fields.
- `src/app/golf/actions/conflict-inbox.ts:78-94`, `ConflictGroup { event: {id,title,start,end,type}, overlaps[], unverifiedAttendeeIds[], verification: 'complete'|'partial' }`, window clamped to `MAX_WINDOW_DAYS = 14` and `MAX_EVENTS = 50` (`conflict-inbox.ts:38-39`). `FairwayCalendar.tsx:761-775` already builds `conflictRequest` and calls `getConflictInbox` eagerly for a coach, exposing `conflictInbox.snapshot.groups` and the derived `homeConflictCount` (`:771-775`), already in memory, already used to badge the existing "Conflicts" toolbar action and the banner at `:1269-1277`.
- `src/lib/calendar/timezone.ts:213` `eventDaySpan` is the one canonical day-bucketing helper, already imported by `FairwayDayStrip.tsx:57`, `FairwayMonthGrid.tsx:39`, `FairwayAgendaView.tsx:42`, `FairwayMonthOverview.tsx:32`. The new Tempo strip reuses this, not a fifth bucketing implementation.
- `src/components/fairway/pages/calendar/eventPresentation.ts` is the one type→label/tone/icon table (`TYPE_META`), already the single source `FairwayEventCard.tsx` and `FairwayMonthGrid.tsx` import from.
- `src/app/golf/actions/golf.ts:6057` `getEventRSVP(eventId)` → `getEventRSVPStats` → `getEventRSVPSummary` (`src/lib/calendar/rsvp.ts:82-116`), which queries `golf_event_attendance` filtered by `.eq('event_id', eventId)` and returns `{ total, accepted, declined, tentative, pending, attendees }`. This is genuinely per-event, one call per drawer open (confirmed, not batched), a new `getEventRSVPSummaries(eventIds)` action generalizing the same table with `.in('event_id', eventIds)` grouped in JS is new code, not new wiring of existing data, and inherits the same RLS scoping the single-event call already relies on (no app-level privacy filter beyond the `event_id` predicate is visible in either path, so batching does not weaken it).
- `FairwayEventDetailDrawer.tsx` (module doc, lines 10-13, and the body at `:356-637`) already composes header → "Your response" InsetGroup (player) → metadata InsetGroup → response `StatMatrix` (coach) → `EventPeopleSection` (People InsetGroup rows) → Attachments/Attendance row → sticky `Sheet.Footer` CTA. This is the calendar.mobile.md dossier plan and it has already landed, this pass does not touch the event sheet beyond the one row addition noted below. Do not rebuild it.
- `FairwayCalendarMemberRail.tsx:41-46` (`teamMembers`, `selectedPlayerIds`, `onSelect`, `onOpenPerson`) is the existing one-hairline "who is this schedule for" row (module doc: "no card, no shadow"). This pass extends its props, it does not replace the component.
- `src/styles/design-tokens.css:421-426`, `--fw-viz-seq-0` through `-3` (cream → helm green) is the tokenized sequential ramp for the month density cells. `:175-196` and the tailwind bridge (`tailwind.config.ts:107-121`) confirm `fw-success`, `fw-warning`/`fw-warning-ink`/`fw-warning-ring`, `fw-danger-ink` are the sanctioned semantic classes, no raw `amber-*`/`red-*` anywhere in this spec.
- `src/components/fairway/modules/MatrixBoard.tsx:104-106,207-220` confirms `onRowSelect`/`selectedId`/`hideOnMobile` already exist on `MatrixBoard`, noted for completeness; this spec does not use `MatrixBoard`, see Removed/Not-doing below.
- `src/components/fairway/modules/SignalChip.tsx`, `tone: 'hot'|'watch'|'quiet'`, plain pill, no built-in click handler, confirmed the right shape for a status-only Attention chip.

## Composition, region by region

### 1. Masthead (role: toolbar), rebuilt, not just re-skinned

The current desktop control (`FairwayCalendarHero.tsx:583-651`) is visibly broken in the capture: the period-title span collapses to zero width and only its trailing `ChevronDown` renders, floating alone above the Segmented row. This pass rebuilds the row rather than patching around a broken control, and adds the one thing the owner is missing: a verdict a coach can read without opening anything.

**Visual.** One `Toolbar` (`frame="bare"`, sticky, frost only while stuck, unchanged material contract). Leading cluster: `‹ ›` `IconButton` stepper, then the period title as a `PopoverPanel` trigger (`weekRangeTitleParts`/month format, same helper, given an explicit `shrink-0` treatment on the trigger's label span so the "zero-width truncate" collapse cannot recur; the engineer verifies the root cause against `FairwayCalendarHero.masthead.test.tsx` before shipping the fix), then `Today` when off-today. Under the title, ONE verdict line in `text-body-lg font-fw-sans`: `"{events.length} events this period"` plus `" · {homeConflictCount} conflict(s) flagged"` only when `homeConflictCount > 0`, else the sentence stands alone, built only from `events.length` and `homeConflictCount`, both confirmed in memory; no RSVP clause, since no RSVP aggregate reaches this screen today. `viewToggle`: the existing `Segmented` (Day/Week/Month/Agenda), unchanged. Trailing: the existing "Conflicts" secondary action stays wired to `onConflicts` (unchanged callback), but "Find a time," "My availability," "Subscribe," "Add to phone" collapse into one overflow `Menu`, cutting the current four loose labeled icons down to one, per the audit's own note that this toolbar carries too many peer icons. `+ New event` (`accent-650`) stays the page's one primary action, in the `ViewHeader` row above.

**Data mapping.** `events.length`, the range-events array already rendered. `homeConflictCount`, `FairwayCalendar.tsx:771-775`, already computed. No new fetch.

**Desktop (1440).** Row 1: `ViewHeader` (eyebrow, "Calendar," Today/+New event), unchanged. Row 2: this rebuilt `Toolbar`, ~72px (title + verdict line stacked on the left, Segmented centered/right, Menu trailing), sticky, full width of the ~1125px content column.

**Phone (390).** Title row: date-jump trigger + Today + overflow Menu (unchanged shell). Second row: the verdict sentence, wrapping to at most 2 lines. Third row: the Segmented. All matte, no frost over the scrolling stage (existing perf contract, `AUDIT.md` §Mobile performance, unchanged).

### 2. Context strip (role: section), extends the existing MemberRail, does not replace it

**Visual.** `FairwayCalendarMemberRail` keeps its exact current composition (AvatarGroup + "Team schedule · N people" + People-menu chevron + Compare), one hairline row, no card. New: a trailing `SignalChip` (`tone="watch"` when `homeConflictCount > 0`, else `tone="quiet"`) reading `"{N} conflict(s) · checked {relative(checkedAt)}"` or `"No conflicts flagged"` when clean and already checked, or nothing at all before the first check resolves (honest-empty-state rule, never show "clear" before the check ran). This is grafted from the third concept's Attention-visibility idea, kept intentionally informational (not a second click target) so "Conflicts" stays the one action, wired once, in the Toolbar's kept secondary action, no duplicate interaction surface, no new test risk beyond one new prop and one new rendered chip.

**Data mapping.** `homeConflictCount`, `conflictInbox.snapshot.checkedAt`, both already computed by `FairwayCalendar.tsx:761-775`; threaded down as two new optional props on `FairwayCalendarMemberRailProps` (`conflictCount?: number | null`, `conflictCheckedAt?: string | null`).

**Desktop.** Same single hairline row, unchanged height (~44px), chip appended after Compare.

**Phone.** Same one-line row; chip wraps to its own line only if it must (rare, the string is short).

### 3. Tempo strip (role: section), THE new visual, answers the owner's "where's the thought" directly

This is the one genuinely new component this pass adds. It replaces nothing that exists today (there is no equivalent region in the current build), it is the fix for the ~700px of bare cream the capture shows on a quiet week, and it is legible even on the sparsest data this account has, because it always draws 14 (7 on phone) columns whether or not anything is scheduled on them.

**Visual.** A 14-day horizontal band, one column per day. Each column stacks up to 4 thin type-tinted segments (from `typeMeta(event_type).tone`, the canonical table, never a new color map), sized by that day's per-type event count via `eventDaySpan` bucketing (the same helper `FairwayDayStrip`/`FairwayMonthGrid` already use, no fifth bucketing implementation). A tabular-nums date numeral sits below the stack. A 4px `fw-warning` dot renders under any day present in `conflictInbox.snapshot.groups`, and ONLY for days inside the checked window (`conflict-inbox.ts`'s own `MAX_WINDOW_DAYS = 14` clamp), a day outside that window gets no mark at all, never a fabricated "clear" tick, matching the module's own honesty rule for unverified attendees. Today's column carries an accent-tinted background; the selected day is a filled island (the exact today/selected vocabulary `FairwayDayStrip` already uses, extended with the stacked segments). Tapping a column calls the existing `onSelectDate`/navigate handlers, no new interaction model, no new gesture.

**Data mapping.** `events` (already in memory) bucketed per day via `eventDaySpan` + `typeMeta().tone`; `conflictInbox.snapshot.groups` (already in memory) for the per-day conflict dot, gated to the groups' own checked window.

**New primitive: `TempoStrip`.** Props: `days: Array<{ date: Date; isToday: boolean; isSelected: boolean; typeCounts: Partial<Record<FwStatusTone, number>>; totalCount: number; hasConflict: boolean; conflictChecked: boolean }>`, `onSelectDay: (date: Date) => void`, `maxSegments?: number` (default 4, overflow shows "+N"). Registered in `src/components/fairway/registry.ts` (category `data-viz`, status `new`, archetype `E`, `bestFor: ['how busy is the next two weeks, at a glance']`, `avoidFor: ['fewer than 5 visible days']`) so it is discoverable per the registry's own "consult before adding UI" rule.

**Desktop.** Full width, under the Toolbar, ~72px band, 14 columns at ~78px each within the ~1125px column. Not sticky, it scrolls away normally with the page; the existing `--fw-calendar-hero-h` sticky-offset contract (measured on the Toolbar/Hero alone) is unaffected, since only the Toolbar is sticky above the Stage.

**Phone.** Horizontal scroll (the existing `useScrollFade` pattern already used elsewhere in this directory), 7 visible columns at ~52px, capped at 56px band height so the first event row still sits above the fold, the phone question order stays "what's next, who's coming, where" (`calendar.mobile.md:10`) before anything else.

### 4. Stage (role: stage), the dominant object, now carrying two more real visuals

One matte `Surface`, unchanged material and hairline-seam discipline. Two additions, both rendering off data already resident, one gated behind the new batched action:

**Month mode.** Cells shade by same-day event density using the tokenized sequential ramp `--fw-viz-seq-0` (0 events) through `--fw-viz-seq-3` (3+ events) instead of flat cream, every cell in a 35-cell grid carries information even on a month with one event, rather than 34 blank cells and one chip. A multi-day event (travel, a tournament) renders as ONE spanning tone-tinted bar across the exact days `eventDaySpan` reports it covers, instead of a repeated chip per day. Single-day events keep the existing thin type-tinted bar, not a pill. On the account's actual sparse state (one event, one occupied day in the visible month), this reads as one tinted cell against 34 near-cream `--fw-viz-seq-0` cells and a single thin bar, an honest, calibrated "quiet month," not a void and not a fabricated crisis.

**Agenda/Day/Week rows (`FairwayEventCard`).** Under the existing time-column/type-rail/title/meta row, add one slim 3-segment RSVP-readiness bar, Accepted (`fw-success`) / Pending+Tentative (neutral, `fw-warning-bg` wash) / Declined (`fw-danger-ink`), with tabular-nums counts, rendered ONLY when `event.requires_rsvp === true` and only once the new batched summary has resolved for that event. Data mapping: `getEventRSVPSummaries(eventIds)` → `{ accepted, declined, tentative, pending }` per event id (the exact `RSVPSummary` shape `src/lib/calendar/rsvp.ts:109-116` already returns per event, batched by the new action). Fetched once for the visible range's `requires_rsvp` events, not per row.

**Removed from Stage.** The dashed-border Month empty-state card and the large bordered Week/Day empty-state card (both visible in the current capture), replaced by the existing `EmptyState` primitive rendered directly on the matte Stage, no dashed frame, no second bordered box (this is a straight application of the already-documented `calendar.desktop.md`/`calendar.mobile.md` rule that has evidently not landed for these two empty branches yet).

**Desktop.** Fills the remaining column width under the Tempo strip; min-height so a quiet week still reads as a page, not a stub.

**Phone.** Full width, edge-to-edge Surface, sticky day-heading seams, unchanged contract.

### 5. Event sheet, unchanged this pass

Verified already-landed (`FairwayEventDetailDrawer.tsx`, module doc + body): header, "Your response" InsetGroup (player), metadata InsetGroup, response `StatMatrix` (coach), People InsetGroup rows via `EventPeopleSection`, Attachments/Attendance row, sticky `Sheet.Footer` CTA. The only change here: when `event.requires_rsvp` and the batched summary is already in memory from the Stage's fetch (same event id, same shape), seed the sheet's `StatMatrix` from it optimistically instead of waiting on its own `getEventRSVP` round-trip, a small perf win, not a redesign. Everything else in the sheet is out of scope; do not rebuild what has already shipped.

## Explicitly not doing (say why, so it doesn't get re-added to "look sophisticated")

- **No `InstrumentPanel`/`Readout` accent gauge cluster.** The strongest single-instrument idea in the three concepts (first concept's InstrumentRail) rests on an "RSVPs open" readout that has no data source on this screen today, confirmed by rg, the fields are undefined. Its "Next travel" readout also goes dim on the exact sparse state the owner's capture shows. Dropping it keeps the one-green-focal-region discipline (`InstrumentPanel`'s own `avoidFor: more than one per screen`, there is already no accent instrument elsewhere on this route) intact and avoids adding a component that reads as a hero-metric card with a fresh coat of paint.
- **No `ResizableWorkspace` two-pane split / persistent Inspector / Attention `MatrixBoard`.** The third concept's spatial reframe is architecturally the most ambitious of the three, but it self-reports 8 engineer-days, explicitly needs reconciling with the active `calendar-desktop` lane's own desktop spec before building (not built in parallel against it), and its Attention board risks tripping `MatrixBoard`'s own `avoidFor: fewer than 3 rows` on a team with 0-2 open conflicts. Out of scope for a one-week, one-engineer pass; the Attention *visibility* idea survives as the Context strip's `SignalChip`, without the pane.
- **No `DayNumeralSeam` sticky-heading rebuild.** The first concept's idea to re-skin the sticky day heading with a `Readout` numeral is a nice touch but adds a fifth visual instrument this pass does not need to clear the "at least three" bar (Tempo strip, month density shading, month span bars, and the RSVP-readiness bar already total four) and touches the sticky-offset chain for no functional gain. Left as a candidate for a later pass.

## Desktop grid (1440)

```text
Row 1  ViewHeader        eyebrow · "Calendar" · [Today] [+ New event]
Row 2  Masthead Toolbar  ‹ period title › (verdict line beneath)   [Day·Week·Month·Agenda]   [⋯ overflow]
Row 3  Tempo strip       14 day-columns, stacked type segments, conflict dots, full width
Row 4  Context strip     avatars · "Team schedule · N" · [All players ▾]  [Compare]  [SignalChip]
Row 5  Stage (Surface)   fills remaining height, Agenda/Day/Week rows w/ RSVP bar, or Month grid w/ density + span bars
```

Content column ≈ 1125px (viewport minus the 260px sidebar rail and page gutters, matching the capture). Rows 2-4 are non-card, hairline-closed bands, only row 5 is a bordered/matte `Surface`. Only row 2 is sticky.

## Phone flow (390, reflow)

```text
Title row      date-jump trigger · Today · overflow Menu
Verdict line   "{N} events this period · {M} flagged" (wraps to 2 lines max)
Segmented      Day · Week · Month · Agenda
Tempo strip    7 visible day-columns, horizontal scroll, 56px cap
Context strip  avatars · "Team schedule · N" · chevron          [SignalChip below if it doesn't fit]
Stage          full width, sticky day seams, RSVP bar on requires_rsvp rows
FAB            + (unchanged, z-[var(--fw-z-sticky)])
```

First event row sits above the fold even with the Tempo strip present (56px cap enforced). Event sheet: unchanged frost bottom sheet, unchanged detents.

## Primitives

**Existing, reused as-is:** `ViewHeader`, `Toolbar`, `Segmented`, `Button`, `IconButton`, `Menu`, `PopoverPanel`, `AvatarGroup`, `FilterPill`, `SignalChip`, `Surface`, `EmptyState`, `Sheet`, `InsetGroup`, `StatMatrix`, `StatusPill`.

**New (2, at the stated budget):**

1. `TempoStrip`, new UI component, registered in `registry.ts` as above. The only new visual primitive this pass introduces.
2. `getEventRSVPSummaries(eventIds: string[])`, new server action (not a UI primitive, counted separately since the budget is about components): lives in `src/app/golf/actions/golf.ts` beside `getEventRSVP`, or a new `src/app/golf/actions/calendar-rsvp-summary.ts`; calls a new `getEventRSVPSummariesForEvents(eventIds, supabase)` helper in `src/lib/calendar/rsvp.ts` that runs `.in('event_id', eventIds)` once and groups the rows by `event_id` in JS, reusing the exact per-attendee mapping `getEventRSVPSummary` already does. Same RLS scope as the existing single-event query, no new privacy surface, since neither path applies an app-level filter beyond the event predicate.

## Typography

`font-fw-display` for the period title and the "Calendar" H1 (system SF Pro, unchanged). `font-fw-sans` for the verdict sentence, row titles, meta lines (`text-body-lg` for the verdict, `text-caption` for meta, no new type role). `font-fw-mono tabular-nums` (Fragment Mono) for every number that must align in a column: Tempo strip date numerals, RSVP-bar counts, agenda time columns, unchanged convention, extended to the two new numeric surfaces.

## Color

Warm cream canvas throughout (unchanged `--fw-gradient-canvas`). The Stage stays matte with hairline seams. `accent-650` is spent on exactly one thing: the `+ New event` button, there is no second green focal region on this screen (no accent `InstrumentPanel` was added, by design, see above). Conflict signal is `fw-warning`/`fw-warning-ink` everywhere it appears (Tempo strip dot, Context-strip chip, the unchanged Toolbar "Conflicts" badge), one semantic color for one meaning. RSVP-readiness bar uses `fw-success` (accepted), a neutral warning wash (pending/tentative), `fw-danger-ink` (declined), all tokenized, no raw `red-*`/`amber-*`. Month density cells use the tokenized `--fw-viz-seq-0..3` ramp, cream to helm green, never a bespoke opacity trick. Event-type identity (Tempo strip segments, month bars) stays on `eventPresentation.ts`'s existing tone table.

## Motion

Toolbar's frost tier fades in only once stuck (existing `IntersectionObserver` contract, unchanged). Tempo-strip column select uses the same `--fw-ease-soft`/`--fw-dur-fast` (180ms) plain-CSS transition `FairwayDayStrip` already uses for its own selection state, no framer `layout` on the 14-column row (the audit's standing rule for this directory). Month density-cell shading and span bars are static, no entrance animation, since they paint on every render. RSVP-bar fill-in on first load uses the same 180ms soft ease. Reduced motion: no slide/scale on Tempo-strip column select, matching `useReducedMotionGuard()` (the repo's mandated pattern, never raw `useReducedMotion()`).

## Removed from the current build

- The dashed-border Month empty-state card and the large bordered Week/Day empty-state card (both visible in the current capture), replaced by the plain `EmptyState` primitive directly on the Stage's matte surface.
- The boxed Day/Week/Month/Agenda pill sitting on its own visually-separate row from a broken, textless title control, replaced by one rebuilt Toolbar row where the title renders correctly and the Segmented lives in the Toolbar's own `viewToggle` slot.
- Four loose labeled icon buttons ("Find a time," "My availability," "Subscribe," "Add to phone"), three of the four fold into one overflow `Menu`; "Conflicts" stays a direct action, now doubled by the Context strip's informational chip.
- Flat, information-free month cells and a per-day repeated chip for a multi-day travel/tournament block, replaced by density-shaded cells and one spanning bar.
- The ~700px of bare cream below a single event on a quiet week, the Tempo strip and the density-shaded Stage mean the screen never again reads as "one card and a void," even on the sparsest week this account has.

## Risks (named, not hidden)

- The Masthead title-collapse bug is live in the current build (verified in the capture: a lone floating chevron, no title text). This pass's Toolbar rebuild must ship a working title, and the engineer should git-blame/bisect the collapse before assuming the rebuild alone fixes it, it may be a regression in a shared flex/truncate pattern that reappears elsewhere.
- `FairwayCalendarHero.masthead.test.tsx` and `FairwayCalendarHero.test.tsx` pin markup/roles for the exact toolbar being rebuilt, rewrite alongside, not after, per the audit's own standing instruction.
- `FairwayCalendarMemberRail*.test.tsx` needs a new assertion for the appended `SignalChip` and the two new optional props; existing assertions about the row's structure should otherwise hold since the row's own markup is unchanged.
- `FairwayMonthGrid`'s existing chip-structure test needs updating for density-cell classes and the new spanning-bar markup, the multi-day span lane adds height to a month week-row and must degrade to the existing phone "3 chips + N more" behavior rather than always reserving a lane.
- `FairwayAgendaView*.test.tsx`/`FairwayEventCard` tests need a new case for the RSVP-readiness bar's conditional render (`requires_rsvp === true` and summary resolved) and must confirm it never renders before the batched fetch resolves (no flash of an empty bar).
- New test: the batched `getEventRSVPSummaries` action needs its own coverage confirming grouping-by-event-id correctness and that it returns nothing for an event id the caller has no access to, mirroring whatever the existing single-event `getEventRSVP` test already asserts for privacy.
- Tempo-strip's conflict dot must only mark days inside the conflict-inbox's own checked window (`MAX_WINDOW_DAYS = 14`), a day 15 out gets no mark, not a fabricated "clear," and this bound must be re-verified if the strip's own visible horizon is ever changed independently of the inbox's fetch window.
- Density-cell and span-bar computation must stay memoized at the same O(events) discipline this directory's 2026-09-10 perf pass already established (`BucketRows`/`FairwayEventCard`/`visibleBuckets` memoization), no new full-array recompute per render.

## Implementation plan

**Files to edit:**

- `src/components/fairway/pages/calendar/FairwayCalendarHero.tsx`, rebuild the desktop Toolbar's leading title cluster (fix the collapse, add `shrink-0` to the title span), add the verdict-sentence line, fold three secondary actions into one `Menu`, keep "Conflicts" wired to the unchanged `onConflicts` callback. Mirror the phone branch (title row / verdict line / Segmented row).
- `src/components/fairway/pages/calendar/FairwayCalendarMemberRail.tsx`, add `conflictCount?: number | null` and `conflictCheckedAt?: string | null` props; render the trailing `SignalChip`.
- `src/components/fairway/pages/calendar/FairwayMonthGrid.tsx`, add per-cell density class from `--fw-viz-seq-0..3` keyed on that day's event count; replace repeated per-day chips for a multi-day event with one spanning bar computed from `eventDaySpan`; swap the dashed empty-state card for `EmptyState`.
- `src/components/fairway/pages/calendar/FairwayAgendaView.tsx` / `FairwayEventCard.tsx`, add the 3-segment RSVP-readiness bar under the meta line, gated on `requires_rsvp` and a resolved batched summary passed down as a prop map (`Record<eventId, RSVPSummary>`); swap the bordered Week/Day empty-state card for `EmptyState`.
- `src/components/fairway/pages/calendar/FairwayCalendar.tsx`, compute the Tempo strip's per-day bucket data (`eventDaySpan` + `typeMeta().tone`) memoized off `events`; fetch `getEventRSVPSummaries` once for the visible range's `requires_rsvp` event ids, memoized and only refetched when that id set changes; thread the resulting summary map into `FairwayAgendaView`/`FairwayMonthGrid`/`FairwayEventDetailDrawer`; pass `homeConflictCount`/`checkedAt` into the extended `FairwayCalendarMemberRail`.
- `src/lib/calendar/rsvp.ts`, add `getEventRSVPSummariesForEvents(eventIds, supabase)`, generalizing `getEventRSVPSummary`'s query to `.in('event_id', eventIds)` grouped by id in JS.
- `src/app/golf/actions/golf.ts`, add `getEventRSVPSummaries(eventIds: string[])` server action calling the new lib helper, following the existing `getEventRSVP` action's error-handling shape.
- `src/components/fairway/registry.ts`, add the `TempoStrip` entry (category `data-viz`, status `new`, archetype `E`).

**Files to create:**

- `src/components/fairway/pages/calendar/FairwayCalendarTempoStrip.tsx`, the new `TempoStrip` component (props as specified above), plus phone horizontal-scroll variant using the existing `useScrollFade` pattern.
- `src/components/fairway/pages/calendar/FairwayCalendarTempoStrip.test.tsx`, new coverage for column rendering, segment sizing, the conflict-window gating rule, and the reduced-motion path.
- A new test file for `getEventRSVPSummaries` (e.g. `src/app/golf/actions/__tests__/calendar-rsvp-summaries.test.ts`) covering grouping correctness and access scoping.

**Tests to update (per AUDIT.md's own instruction, alongside, not after):** `FairwayCalendarHero.masthead.test.tsx`, `FairwayCalendarHero.test.tsx`, `FairwayCalendarMemberRail*.test.tsx`, `FairwayMonthGrid`'s chip-structure test, `FairwayAgendaView*.test.tsx`, `FairwayEventDetailDrawer.test.tsx` (only if the optimistic `StatMatrix` seed changes its loading-state assertions).

**Effort:** 5-6 engineer-days, 1 new UI component, 1 new server action + 1 lib helper, four existing files touched for the density/span/RSVP-bar visuals, one existing file (Toolbar) rebuilt to fix a live defect and add the verdict line. No lane collision: this pass does not touch `ResizableWorkspace`, `MatrixBoard`, or the event sheet's own layout, so it does not need reconciling with the active `calendar-desktop` agent's parallel work on this route.
