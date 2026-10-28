# 2026-10-27 — Polish pass: Tournaments

## 2026-10-27 — One back on the phone; History's head and chart lines

```text
Design package: none (production polish pass before launch); phone board design/handoff/tour-m.jsx
PR/commit:      agent/clubhouse-polish
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none (golf_tournaments_v1 stays off in production; see below)
```

### Changed

- Phone event desk and Review drew two backs: the top bar's "‹ Tournaments" (or
  "‹ Oakmont") and the body crumb under it. The crumb is now desktop only, as the
  event form already did (`EventDesk.tsx`, `Review.tsx`; the phone crumb rule is
  removed from `styles/tournaments.css`). This departs from the phone board, whose
  top bar backs to "More" and leaves the crumb in the body; the built top bar
  already backs to Tournaments, so the crumb only repeated it.
- Phone History: the "Across seasons" toggles (lineup mode, measured against) sat
  in the section head beside the title, overran it and ran off the right edge. On
  the phone they take two full-width rows under the heading (`History.tsx`,
  `styles/tournaments-review.css`).
- The trend's subtitle, key and note had their margins zeroed by `.ch-root p`
  (base.css outranks a one-class rule), so the note touched the bar labels and the
  key touched the axis. The rules now carry two classes.
- The key names the dotted line: "The dotted line is the average of the points
  shown." In a chart titled "against course rating" it otherwise read as the
  rating (0), but it sits at the mean.

### Why

- One back per screen; nothing runs off the phone; a reference line says what it is.

### Verification

- `__tests__/tournaments-history.test.tsx` updated for the key; all Tournaments
  tests pass (450 with Recruiting). WebKit at 390 and 1280.

### Not changed (owner)

- Five views are still the base's placeholders ("… isn't built yet"): Lineup, Link
  rounds, Live round, Edit event and the player's view. "Build lineup", "Edit
  lineup" and "Follow live" lead to them. `golf_tournaments_v1` is off in
  production; it should stay off until those views are built.
