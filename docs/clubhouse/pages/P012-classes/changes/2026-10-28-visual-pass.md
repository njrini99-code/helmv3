# 2026-10-28 — Classes: visual pass

## 2026-10-28 — Class days sit under the header's days; cards on 16

```text
Design package: none (Clubhouse visual pass 2026-10-28, area D; RUBRIC H11, H17,
                4.8)
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none (visual only)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Desktop ledger below a 1000px container (a 1280 window with the sidebar open):
  each class's days now go under its
  name, in the same column as the timetable header's days. The rule changed the
  grid's columns to two but kept the wide
  row's three-column areas, so the days fell into an implicit column at the
  right edge while the header's Mon to Fri
  spread across the whole name column: nothing lined up. Above 1000px (1512) and
  below 640px nothing changes.
- Cards sit on the card radius, 16 (was 20): the term band, a class card, Add a
  class, the side cards, the overlaps
  card and the import drop zone (RUBRIC 4.8, `classes.css:339`).
- At night today's band down the timetable is champagne at 10% (was 24%, which
  laid a heavy olive slab down the list);
  light is unchanged.

### Why

- Nick, 2026-10-28: every screen perfect at every size. The misaligned timetable
  was the most visible fault at 1280.

### Verification

- stylelint (classes.css), classes and classes-parity tests. Before and after
  captures in Chromium at 393 and 1280,
  light and dark (`/home/claude/vp/before`, `/home/claude/vp/after-D`).
