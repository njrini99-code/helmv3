# 2026-11-15 — the Day drag holds up no scroll; the card composites in hand

## 2026-11-15 — Blocking touchmove on movable rows only (MOT-02, MOT-19)

```text
Design package: none (production audit 2026-11-15, Batch 3 items 1 and 7, spec S4.2, S4.6)
PR/commit:      mot/touch (51e62985f)
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     the hand test on the iPhone (D tier): a held card must not scroll the page
```

### Changed

- `screens/calendar/day-timeline.tsx`: the root's `touchmove` is passive (it
  only reads the finger). The one non-passive listener is `holdCardStill`, a ref
  on each movable row (`CalendarPhone.tsx`), registered with the row and
  cancelling nothing until the hold has lifted the card (`touchClaim`), so a
  scroll that starts anywhere else on the day never waits on script.
- `styles/calendar.css`: `.ch-tl__card` has no standing `will-change`; the
  engine sets it from the unfold (or an Adjust grip press) until the drop or the
  release.

### Why

- One non-passive touchmove on the whole Day view made every touch on it wait on
  script (MOT-02), and the card kept a layer permanently (MOT-19).

### Verification

- `__tests__/calendar-drag-touch.test.tsx`: the only blocking touchmove is on
  `.ch-calm-ev.is-movable`; a move before the lift is not cancelled, one after
  it is; the card's `will-change` is set while held and cleared on the drop.
- Source and jsdom only; no browser or device run.
