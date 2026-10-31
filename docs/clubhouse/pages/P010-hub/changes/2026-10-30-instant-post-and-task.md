# 2026-10-30 — Team Hub: a post and a task show at once

## 2026-10-30 — Provisional rows for New announcement and Assign a task; the pulse starts sooner (F-0045, F-0033)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0045, F-0033;
                fix plan PR 7)
PR/commit:      claude/audit-fix-07-speed (#2418)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- TeamHub.tsx and sheets.tsx: Post and Assign close their sheet at once and
  draw the row first in its list ("Posting…" CH-10402, "Assigning…" CH-10404,
  no menu) until the page reads again; a failure takes the row back and
  reopens the sheet with what was typed (CH-10005, CH-10007).
  data/hub-shape.ts: PROVISIONAL_ID and isProvisional.
- data/hub.ts: the roster is read once as a promise, and the coach’s 30-day
  pulse starts as soon as the roster and the clock are in, instead of after
  the second wave (F-0033 step 2).

### Why

- The audit timed assign at 1.8 s and an announcement at 2.2 s before anything
  changed on screen.

### Verification

- hub.test "instant writes" (2 cases) and hub-waves "30-day pulse": red
  before, green after; the hub suites pass.
