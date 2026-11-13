# 2026-11-13 — search lights the name typed, and finds tournaments and qualifiers

## 2026-11-13 — Ranked by name; Events in the palette

```text
Design package: none (coach audit, 13 Nov 2026, §2 Search)
PR/commit:      agent/coach-fix-shell
Contract IDs:   none new
Actions:        getPaletteEvents (new, 'use server'; read when the palette opens, coaches only)
Data impact:    two reads when the palette first opens per team (tournaments, non-test qualifiers: id, name, first day)
Held items:     none
```

### Changed

- The palette ranks rows itself (`command/rank.ts`); cmdk no longer filters.
  cmdk had scored every row on scattered letters and kept the groups in the
  order they're written, so "larsen" lit "Qualifiers" (Go to) above Larsen
  Gallimore, and Enter opened Qualifiers.
  - Order: a name typed whole, then a name's start, then a word of the name
    ("gruse"), then the row's other words.
  - Scattered-letter matches ("rostr", "calndr") are offered only when nothing
    matches by name.
  - The groups follow their best row, and the first row is always the lit one,
    including when players or events land after the first keystrokes.
- Events: a coach's tournaments (to the event desk, where Tournaments is on)
  and qualifiers (to the qualifier), by name, with "Tournament · Oct 25, 2026".
  "tar" finds the Tar Heel Shootout and no longer offers Sawyer Slate.
- Not changed: the no-match line's nearest-section guess, and rounds, courses,
  documents, messages and drills, which are still not searched.
