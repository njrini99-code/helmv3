<!-- markdownlint-disable MD013 -->
# Calendar — `/golf/dashboard/calendar` (desktop; mobile spec is calendar.mobile.md by helmv3-20)

Files: `src/components/fairway/pages/calendar/FairwayCalendar.tsx` (1489), `FairwayCalendarHero.tsx`, `FairwayDayStrip.tsx`, `FairwayCalendarMemberRail.tsx`, `FairwayAgendaView.tsx`, `FairwayMonthGrid.tsx`, `FairwayMonthOverview.tsx`, `FairwayEventCard.tsx`, `FairwayEventDetailDrawer.tsx` + `detail/*`, `CalendarSurfaces.module.css`.

## What the capture shows (phone; desktop pending)

Masthead: month title + "⋯" pill, then a Day/Week/Month/Agenda Segmented as a large raised control; a "Team schedule · 8 people" people row as its own raised card; a day heading; each event as a floating card with a time column, chevron and shadow; a green FAB. Four containers before the first event. The event sheet is matte with three cards (details, responses, people) and a full-pill CTA.

## SCREEN

- Archetype: E (chronology) + F (event detail).
- Dominant object: the calendar stage (month grid / week / day / agenda) on matte.
- Supporting: one masthead toolbar (period title + navigation + mode Segmented + Today + New event), one people rail (avatars + "All players" filter).
- Tertiary: subscriptions, availability, export (overflow Menu).
- Floating: the masthead is the ONE frosted region (subtle tier, bar), sticky. Desktop has no FAB (header primary action).
- Modal: event Sheet — docked right on desktop (matte), frost bottom sheet on phone (helmv3-20).

## EXISTING FAIRWAY

ViewHeader (kept as the h1 owner), Toolbar material="frost" (masthead row), Segmented, Button, IconButton, Menu, AvatarGroup, FilterPill, Surface (stage), Sheet, InsetGroup, StatMatrix, StatusPill, EmptyState.

## CONTAINERS TO REMOVE

1. Segmented as a separate raised block → inside the masthead Toolbar (viewToggle slot).
2. People row card → a quiet rail directly under the masthead on canvas: AvatarGroup + "Team schedule · 8" + a FilterPill "All players ▾" (opens the existing people picker) + Compare (md+). No border, no shadow; a hairline below.
3. Event cards → timeline rows inside ONE matte stage Surface: time column (tabular, start bold / end quiet), a 2px type-tinted rail, title, meta line; rows separated by hairlines; only the hovered/selected row lifts (Elevated tone). Day headings are sticky seam headers with the date and "in 4 days".
4. Month grid: quiet cells (`rounded-fw-sm`), no per-cell borders, today = tinted ring, selected = tinted fill; event chips as thin bars, not pills.
5. Event sheet: three cards → header block (type Chip + overflow Menu, title, when line), InsetGroup (venue with map link, description, invited count), StatMatrix (Accepted · Maybe · No · Pending), People as seam rows (no per-person cards), Attachments as one row, sticky CTA `Button shape="block"`. Desktop docks right, matte.

## COMPOSITION (desktop 1440)

```text
ViewHeader   CALENDAR · Demo University Golf                     [Today] [+ New event] [⋯]
Toolbar(frost, sticky)  ‹ September 2026 ›      [Day · Week · Month · Agenda]     [Subscribe]
People rail  ●●● +6  Team schedule · 8      [All players ▾]  [Compare]
Stage (matte Surface, rounded-card)
  Sun 13 · in 4 days ────────────────────────────────────────────────
  7:00 PM │ End-of-Season Team Banquet          Meeting · University Ballroom    ›
  10:00 PM│
  Mon 14 ────────────────────────────────────────────────────────────
  (month mode: 7-col grid, cells 8/10px radius, chips as bars; week/day: time grid)
```

## STATES

- Empty period: stage shows a single quiet EmptyState row "Nothing scheduled this week" with the New event action (coach) — no card.
- Loading: masthead stable, stage skeleton rows.
- Range error: one InlineNotice row at the top of the stage; never stacked with the conflict banner (mutual exclusion guard).

## RISKS

- Sticky offset chain (`--golf-mobile-header-offset` → `--fw-hub-subnav-offset` → `--fw-calendar-hero-h` → nav height) and the swipe/FAB tests must keep passing; pinned tests are listed in the session notes (FairwayCalendar.swipe, FairwayCalendarHero.masthead, FairwayMonthGrid chip structure, MemberRail row, EventDetailDrawer strings and barrel mock).
- helmv3-20 owns the phone masthead/sheet; desktop changes must keep the shared components' mobile branches intact.
