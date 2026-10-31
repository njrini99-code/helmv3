# 2026-10-25 — Qualifiers: the course picker, shared with tournaments

## 2026-10-25 — P-5: options the calendar's tournament section uses

```text
Design package: P-5 build plan (P-05-tournaments-from-calendar)
PR/commit:      claude/clubhouse-tournaments-from-calendar
Contract IDs:   CH-6340 (calendar catalog)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `CoursePicker` takes optional `title`, `allowNoTee` (a Pick tees later row),
  `allowTyped` (when nothing matches, offer the typed words as the course name),
  `recentFirst` (Recent, then All courses) and `onPickLoose`. The qualifier
  screens pass none of them, so they are unchanged.
- A course option carries `saved` (the team's saved courses).
