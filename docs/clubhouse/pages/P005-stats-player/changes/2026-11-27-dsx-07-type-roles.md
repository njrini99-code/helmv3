# P005-stats-player — Changelog

## 2026-11-27 — Text sits on the nine type roles

```text
Design package: design lab foundation 1 (QUEUE dsx-07, batch 2)
PR/commit: claude/project-thread-yzx7s4 (#2660)
Contract IDs: none new
Actions: none
Data impact: none
Held items: none
```

### Changed

- Goals: every numeric type step (`--ch-type-11` to `-22`) now reads the
  nearest of the nine roles (caption, footnote, callout, body, headline,
  title, the row figure), the desktop value in a desk or shared rule and the
  phone value in a phone rule. Each rule keeps its old weight through
  `--ch-fw-*`, so emphasis and hierarchy hold.
- Sizes move by at most 2px; most are unchanged on a desk (12, 13, 14, 15
  and 16 map onto roles of the same size). On a phone shared rules take the
  role's phone size (headline 17, callout 15), as the type system sets. The
  15 step reads the subhead, `--ch-type-subhead` (15/20 on phone and desk),
  not the body, so secondary text keeps its 15 on a phone, a step under the
  17 body, and its 20 leading on a desk.

### Why

The cross-page entry, `docs/clubhouse/changes/2026-11-27-dsx-07-type-roles.md`.
Staging before and after shots are owed before this lands.
