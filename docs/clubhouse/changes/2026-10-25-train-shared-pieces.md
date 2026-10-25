# 2026-10-25 — Shared pieces for the A+ train (P-4, P-7, P-14)

## 2026-10-25 — Drag, change-mark and course-history helpers

```text
Design package: none (Clubhouse premium features, build plans P-4, P-7 and P-14)
PR/commit:      claude/aplus-preview
Contract IDs:   none (the pages that use these log their own contracts)
Actions:        none
Data impact:    none (the change-marks cookie is read and written on the
                device only)
Held items:     none
```

### Changed

- `lib/touch-claim.ts`: who owns the current touch (`idle`, `pending`,
  `lifted`), so a calendar drag and pull to refresh never both act on it.
- `lib/smooth-scroll.ts`: `chDragScroller` and `chDragScrollBy` scroll the
  canvas or, on a phone, the document, in step with Lenis and never through
  `canvasScrollNow`.
- `lib/dates.ts`: `zonedWallTime` returns the day and decimal hour of an
  instant in a zone, as the calendar loader reads it.
- `lib/season-start.ts`: `seasonStartOfDay` gives the 1 August season start of
  a calendar date, by string arithmetic with no zone.
- `lib/marks-cookie.ts`, `lib/use-change-marks.tsx` and `lib/phone-hint.ts`
  (`marksHint`): which change marks this browser has seen or cleared, kept in a
  cookie so a seen mark paints as seen on the first frame.
- `ui/WasValue.tsx` (with `.ch-was` in `styles/ui.css`): the old value of a
  changed event, struck. A new mark draws once with a CSS animation; a seen one
  never moves. Read aloud as "was 3:00 PM".
- `ui/Peek.tsx`: an optional `lift` lets a hold pick the target up instead of
  opening the peek; a 10 px move after the lift is a drag and a release in
  place opens the peek. The slop is 10 px, and a scroll before the lift
  cancels the hold.
- `ui/ScrollPager.tsx` and `ui/WeekStrip.tsx`: a `frozen` prop holds the strip
  still during a drag, and `dropDate` marks the day a dragged card is over.

### Why

- P-4 needs a drag that coexists with scroll, Lenis and pull to refresh; P-7
  needs a season key without a zone; P-14 needs a mark that remembers it was
  seen. Each piece is used by more than one page.

### Verification

- `lib/__tests__/marks-cookie.test.ts`, the calendar, rounds and Home screen
  tests, and `npm run clubhouse:check`.
