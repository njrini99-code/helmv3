# 2026-11-15 — home

## 2026-11-15 — QA tasks and posts no longer wait on the coach

```text
Design package: none (launch readiness 2026-11-15, DD-14 and DF-P-14; Batch 4)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/home-queue.ts`: the overdue-task count reads `is_test = false`. A post
  marked `is_test` is not counted among the posts
  waiting on an acknowledgement.
- Team Hub and Messages already hide both.
- `lib/coachhelm/v3/chat/landing-rows.ts`: the rows a CoachHelm draft card lands
  between (qualifiers, tasks, announcements, trips)
  leave out rows marked `is_test`.

### Why

- DD-14: Home's "Waiting on you" counted a QA run's overdue task and
  unacknowledged post, and Ask's qualifier card listed test
  qualifiers as neighbours.
- DF-P-14: the same landing rows, for qualifiers.

### Screenshots

- None: no layout changed. The counts and the neighbour rows lose the test rows.

### Verification

- `__tests__/home-data-completeness.test.ts`: the task read asks for `is_test =
  false`, and a QA post nobody acknowledged is not
  counted.
- `lib/coachhelm/v3/chat/__tests__/landing-rows.test.ts`: the qualifier, task,
  announcement and trip reads leave out test rows.
- Not checked in a browser or on a device in this change.
