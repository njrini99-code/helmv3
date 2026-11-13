# 2026-11-12 — stats (player)

## 2026-11-12 — On a wide desk the chosen card's detail opens out to the right edge

```text
Design package: none (owner's preview walk, 11 Nov 2026)
PR/commit:      agent/preview-fixes-ui
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The detail beside the cards was 360px to 420px wide at every screen size, and
  the page stopped at its 1200px measure, so a 1920 screen had a blank band to
  the
  right of a narrow detail. Above 1180px the page has no width cap while a
  detail is
  open (no fourth page width: row 39 keeps three), keeping the left edge every
  page shares. The cards keep about
  their 1440 width (up to 680px) and the detail takes the rest (420px at least).
  At 1440 nothing moves. The same grid serves Team stats (P004).

### Why

- The owner, 11 Nov: "clicking on stat should open up the screen fully to the
  right, its too narrow".

### Verification

- WebKit on `/clubhouse-preview/player?state=self`, Short game open: at 1920 the
  detail measured 420px before and 728px after, its right edge 40px from the
  window's; at 1440 it measured 420px both times; at 2560, 1048px.
- `spacing-scale.test.ts` (three page widths, no px page width): 32 passed.
