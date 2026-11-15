# 2026-11-15 — calendar

## 2026-11-15 — The team trip is on the calendar

```text
Design package: none (prod audit 2026-11-15, P1-20, N13P-24; same cause N13C-91)
PR/commit:      claude/project-thread-vledif
Contract IDs:   60104 (meaning extended: trips read beside events)
Actions:        none new (reads only)
Data impact:    none (golf_travel_itineraries read by team, is_test false; no rows changed)
Held items:     none
```

### Changed

- `data/calendar.ts`, `data/calendar-trips.ts` (new, pure): the loader reads the team's trips beside the events, by team, never a
  test trip, those that overlap the loaded window. A trip planned in Team Hub with no calendar event is an all-day Travel row on each
  day it covers (with its span, as an all-day event), named as Team Hub and Home name it. A trip linked to an event shows once, as
  that event, whose detail already links the trip. A failed trip read is reported and draws no trip, as on Home; with the events
  failed, no trip is drawn either, so a trip never reads as the team's whole calendar.
- `screens/calendar/inspector.tsx`: a trip opens a read-only detail: its days, "Leaves 6:30 AM · back 7:00 PM" in the team's zone
  when times were saved, its place, and View itinerary to Team Hub's Travel with the trip scrolled to. No replies, files, attendance
  or event actions: it is not an event, and it is planned and changed in Team Hub.
- `screens/calendar/extras.tsx`: `TripLink`, the "View itinerary" line, shared by the linked trip and the trip's own detail.
- `screens/calendar/model.ts`: `ChCalEvent.trip` (id, departure and return hours).

### Why

The team trip was missing from Week, Month and List, and the rail said nothing was on the team calendar on the travel day, while the
Week legend listed Travel (N13P-24). Calendar read golf_events only; Home was fixed the same way in 3b6b0079e.

### Verification

- `src/clubhouse/__tests__/calendar-trips.test.tsx` (new): the rows and their days, span and times; a linked, test or out-of-window
  trip never shows; the loader's filters (team, is_test, window); a failed trip or event read draws no trip and is reported; an open
  trip shows its times, place and itinerary link and reads no files, replies or linked trip (checked by removing the trip branch:
  the case fails).
- The calendar suites (31 files, 480 tests) and `tsgo --noEmit` pass.
- Not checked in a browser or on a device in this change.
