# 2026-10-30 — Calendar: Publish shows the event at once

## 2026-10-30 — A new one-off event is drawn the moment it is published (F-0029)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0029; fix plan
                PR 7)
PR/commit:      claude/audit-fix-07-speed (#2418)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- editor.tsx and Calendar.tsx: Publish on a new one-off event closes the
  editor and draws the block at once; the page’s re-read replaces it. A
  failure takes the block back and reopens the editor on what was typed (seed
  copyOf with resend), which still asks before closing, and a resend keeps the
  request id so a Retry can’t publish twice. A series, a run of days, an edit
  or a tournament waits as before. The block opens nothing until it is stored.

### Verification

- calendar.test F-0029 (2 cases): red before, green after; the calendar suites
  pass (398 tests).
