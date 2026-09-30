# Phone design: Calendar (coach and player)

Status: approved. The owner's v2 phone board is the spec (D-22): `design/handoff/Coach - Calendar - Mobile.html`, `m-cal.jsx`, `m.css`. It replaces the earlier draft in this file. Built 2026-09-30 as `src/clubhouse/screens/calendar/CalendarPhone.tsx`, inside the desktop `Calendar` container (state, writes and dialogs shared). The iPhone pass is open.

The boards: Day (week strip, agenda with classes), Event detail (conflict and suggested times), Month (competition days marked), New event (class-schedule check).

## Layout

| Board piece | Built as |
| --- | --- |
| Top bar "Calendar" with + | Coach: the tab root (D-66 makes Calendar a coach tab) titled Calendar, with New event. Player: "‹ More" (Calendar opens from More), with Add to calendar app |
| The month and Day, Month, List | `h2` month and a `Segmented`; the desktop's week and day views are the phone's Day, agenda is List |
| Day: week strip, day heading with counts, agenda | `DayView`: the anchor's week (Sun to Sat) with dots, the day's events and class or busy blocks, the now line on today, overlap marks (coach), Now on a live event |
| Event detail sheet | The desktop detail panel (`EventDetail`, `Attendance`, `Overlap`) in a `Modal` sheet: type, facts, overlap with Review (suggested open times), responses, invitees, files, Edit and Attendance (coach), the player's reply |
| Month | `MonthGrid`: dots, competition days dark; a day opens its Day view |
| List | The desktop `AgendaView` |
| New event sheet | The desktop `EventEditor` (a sheet on the phone), with its class-schedule check |

## Differences from the board (Q-67)

- **Top bar.** The board draws "‹ More"; D-66 made Calendar a coach tab, so the coach's top bar is the tab root. A player still comes from More.
- **Message invitees** (the event sheet's footer): Messages has no link that starts a group with chosen people, so it isn't built. A one-invitee event could link to that direct thread; left for the Messages owner.
- **New event** is the full desktop editor as a sheet, not the board's compact form: every field and its checks stay (the owner's rule for phone forms, D-33 by analogy).
- **Workout** type: there is none (as on Home, Q-66).

## States

The failed-read notices are the desktop's (CH-6201 to CH-6203, CH-6212). A day with nothing: CH-6308. The list's empty range: CH-6301. The view crashes on its own (CH-6210), the sheet likewise (CH-6211).

## Gestures and haptics

Selection on a day, a view change and opening an event; the sheet drags shut (the shell's CH-1611). Reduced motion turns the press and reveal off.
