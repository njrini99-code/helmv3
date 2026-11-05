# 2026-10-27 — Calendar review must-fixes

## 2026-10-27 — Four calendar must-fixes from review

```text
Design package: review handoff of 2026-10-27 (items 1, 2, 3, 4b)
PR/commit:      fix/clubhouse-cal-must-fixes
Contract IDs:   none new
Actions:        none
Data impact:    none (no schema, no new reads; the iCal feed writes nothing new)
Held items:     none
```

### Changed

- A qualifier's change glyph (the week block's top-right mark and the month
  chip's mark) was the soft ivory meant for the filled tournament, on the
  qualifier's paper chip. It now takes the quiet ink (`--ch-ink-500`), the same
  ink as the qualifier's struck value, in light and dark. The tournament keeps
  the soft ivory on its green fill.
- The iCal team feed leads an event's description with the change line only
  while Clubhouse is on for the feed's team (`golf_clubhouse_ui` and the
  `HELM_CLUBHOUSE_TEAMS` allowlist, `isClubhouseForTeam`). With the flag off the
  feed is exactly what it was before change marks existed.
- A player's round ref says `published` only once `lineup_published_at` is set
  and reached (the same reveal the Tournaments page uses). A locked lineup that
  is not published, or whose publish is scheduled later, reads "Lineup: Not
  published yet"; the inspector no longer reads `locked` as Published for a
  player. The coach's words are unchanged.
- A move waiting for a connection is dropped when the coach leaves the
  Calendar inside the app, as its toast says: the window `online` listener is
  removed on unmount, and a move still in its Undo window is dropped rather
  than queued when the page unmounts offline (the `pagehide` rule, now also on
  unmount). Leaving online still writes the held move at once.

### Why

- Review must-fixes: an ivory glyph on paper all but vanished in light (1.14:1;
  the quiet ink reads 6.39:1 in light and 6.44:1 in dark); the feed would
  have changed for every subscriber on the next deploy with Clubhouse off;
  a player could read a lock as a published lineup; an offline move could
  write after the coach had left.

### Verification

- `src/clubhouse/__tests__/calendar-change-marks.test.tsx` (the qualifier glyph
  measured against paper from the stylesheet, light and dark),
  `src/app/api/calendar/feeds/[token]/__tests__/feed-change-line.test.ts` (flag
  off, allowlist, flag on),
  `src/clubhouse/data/__tests__/calendar-rounds.test.ts`
  and `src/clubhouse/__tests__/calendar-rounds.test.tsx` (lineup word),
  `src/clubhouse/__tests__/calendar-held-moves.test.tsx` (offline and leaving).
  Source inspection and unit tests only; no screenshots were captured in this
  change.
