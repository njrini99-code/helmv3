# 2026-10-28 — Rounds: the course page's hole map on a phone

## 2026-10-28 — Three rows of six, each tile a 56 px target

```text
Design package: P-7 build plan, owner call 2 (settled: version (b)), 4.2.4,
                6.2, 7.4
PR/commit:      fix/hole-map-phone-grid
Contract IDs:   none new
Actions:        none
Data impact:    none; shot tracking unchanged
Held items:     iPhone check of the grid at 375 and 390, and at the largest
                Text Size (where the List takes over)
```

### Changed

- Under 600 px the hole map shows again, as three rows of six
  (`repeat(6, minmax(0, 1fr))`, gap 4). Each tile is its own tap target:
  56 tall (60 from 414), about 54 wide at 375 and 56 at 390.
- Before this, a phone showed the List alone while owner call 2 was open.
- Out and In share one caption line above the grid, since the turn lands
  mid row two. A hairline seam in the gap before 10 marks it.
- No scrub and no stepper on a phone: every tile is a full target, and a
  pan over the map only scrolls.
- Up and down arrows move one row of six on a phone and one nine from
  600 px, wrapping in the same column.
- The fit gate is now 15.2 em for six across. Nine across keeps 22.9 em from
  600 px. Past the fit (a large Text Size) the List shows alone, as before.
- A nine-hole course draws its nine tiles only (six, then three on a
  phone), with no empty In row, from 600 px as well.
- From 600 px the map is unchanged.

### Verification

- `hole-map.test.tsx`, `course-page-css.test.ts`.
