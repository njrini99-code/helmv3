# 2026-10-24 — Messages: desktop rows keep their seam after a sheet

## 2026-10-24 — A mounted Mute or Delete dialog no longer drops a line

```text
Design package: none (review of #2361, ConvRow seams)
PR/commit:      agent/clubhouse-aplus-phase2
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The desktop rail's seam is drawn on every later row in a card
  (`.ch-ms-row ~ .ch-ms-row`), so a row's Mute or Delete `<dialog>`, which
  stays mounted beside it after it first opens, no longer takes the line off
  the row below.
- A selected or hovered row still hides its neighbour's seam across one or two
  of those dialogs. The phone was fixed earlier.

### Verification

- `screens/messages/__tests__/conv-row-seams.test.tsx`: two desktop cases.
  Owed: a look in desktop Safari after opening Mute on a row.
