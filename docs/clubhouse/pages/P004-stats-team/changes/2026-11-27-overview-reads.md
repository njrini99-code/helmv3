# P004 — Changelog

## 2026-11-27 — Team scoring reads at a glance: three labels, one chart, labelled chips

```text
Design package: none (design lab pilot P2, QUEUE lay-02 / dsx-03; prod audit 2026-11-15 STATS-P-06, STATS-TS-03, STATS-TS-07, STATS-TS-08, STATS-D-07, SYS-04)
PR/commit: claude/project-thread-2f9vkq
Contract IDs: none
Actions: none changed
Data impact: none; the same figures, labelled differently
Held items: none
```

### Changed

- The team scoring chart labels three heights (best day, the dashed par or
  round-day average, toughest day) instead of one every stroke or two, and
  its key says "Lower is better".
- Team scoring's "By round day" draws the same chart as the overview card,
  so the "Round-day avg" pill no longer sits on the line. The ribbon is no
  longer drawn for the team.
- The round's change chips say what they are measured against on the chip
  ("−3 vs prev 10"); the "Chips: …" sentence is gone and hole coverage is
  in the card's meta ("18 of 25 with holes").
- The players card is titled "Strokes gained by player". When everyone is
  below zero, only the worst loss is amber and the rest are in ink.

### Why

- The Nov 15 production audit rows rebuilt by lay-02: one team scoring line,
  no prose legends, and "least" and "most" no longer drawn alike.
