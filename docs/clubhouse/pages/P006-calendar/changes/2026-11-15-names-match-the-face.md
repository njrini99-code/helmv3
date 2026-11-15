# 2026-11-15 — calendar

## 2026-11-15 — Every event, day head and the people control is named by what it shows

```text
Design package: none (production audit 2026-11-15, CLUBHOUSE-PROD-AUDIT-FINAL.md P2-222 SWP-03; no visible change)
PR/commit:      claude/project-thread-7ygzj3 (the follow-up to #2538)
Contract IDs:   CH-6801 (how it is named; its words unchanged)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Week and day blocks, all-day bars, month chips and ribbons, and phone rows are named by their content: the title they
  draw, then hidden words with the round, the time and any state (ended, overlap, cancelled, moved). The drawn time, the
  R pill, the old values and the phone row's place line and badge are for the eye (`aria-hidden`), as the pill already
  was. An `aria-label` named each in other words than its face ("Strength, 6:30 – 7:30 AM" over "Strength" and
  "6:30 AM – 7:30 AM").
- A round's name says "cancelled" once (it said it twice), and a month chip's time follows the 24-hour setting.
- A week day head reads "Sun 11" (the space between the day and its number is not drawn).
- The people control is named "Everyone Team schedule · 6 players, choose people": its words, then what it does. The
  faces' initials are for the eye.
- The shared `Badge` takes `decorative` for a badge its control already says in words
  (`docs/clubhouse/changes/2026-11-15-badge-decorative.md`).

### Why

- P2-222 SWP-03 (S2): axe `label-content-name-mismatch` (WCAG 2.5.3 Label in Name) on every Calendar state the UI sweep
  opened (20 on the week, 19 with an event open, 17 for the player and with partial data, 8 empty, 1 failed). A Voice
  Control user who said what they saw reached nothing.

### Verification

- `src/clubhouse/screens/calendar/__tests__/label-in-name.test.tsx` (jsdom): every state the sweep opened, desktop and
  phone, holds no control whose face is missing from its name (22 of its 25 cases fail on the old code), and every
  event's name opens with the title it draws.
- `src/clubhouse/__tests__/calendar*.test.tsx` read each event's computed name, not its attribute.
- Tier W (WebKit) and tier D (a real iPhone with Voice Control) are still owed.
