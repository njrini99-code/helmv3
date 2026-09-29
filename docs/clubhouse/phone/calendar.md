# Phone design: Calendar (coach and player)

Status: draft (awaiting owner approval)

A seven-column week grid is unreadable at 390px. The phone calendar is built around the agenda and a day view instead.

## Layout
1. Top bar: the month and year as the title (tap opens the jump-to-date sheet); trailing action: New event (coach), or Add to calendar app (player).
2. Week strip: seven day pills (Sun to Sat) with a dot under days that have events; swipe the strip to change weeks; today filled green. Tapping a day scrolls the list to it.
3. Default view: Agenda for the selected week, grouped by day, with the "Now" divider on today. Each row is 64px: time, dot, title, place, and an Overlap badge (coach).
4. A segmented control switches Agenda and Day. Day is the hour grid for one day at full width (the desktop day view, 44px per hour), with lanes for overlaps. Month is not offered on phone; the jump sheet covers it.
5. Filter (coach): a "People" button opens the people picker as a sheet.

## Event detail
Tapping an event pushes a full-height sheet with the desktop panel's content in the same order: facts, overlap notice, responses, invitees. Coach actions (Edit, Attendance) sit in a bottom bar above the home indicator. A player's reply (Going, Maybe, Can't make it) is a full-width segmented control.

## Editor (coach)
A full-height sheet in one column: title, type chips (wrapping), native date and time pickers, All day, Repeat, location, notes, then invitees and the verify line. Find a time becomes a per-person list of busy blocks with the proposed time highlighted; dragging a band is not used on phone.

## Attendance (coach)
A full-height sheet: one row per player with Present, Late and No-show as 44px segments; Mark all present at the top; Save pinned at the bottom.
