# 2026-10-30 — Messages: a new conversation opens at once

## 2026-10-30 — Start conversation selects the thread before the list reads again (F-0045)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0045; fix plan
                PR train)
PR/commit:      claude/audit-fix-train (the audit fix train)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Messages.tsx: once the server returns the one-to-one thread, it is shown as
  a provisional row and selected at once; the list reads again behind it (not
  awaited), and its next read replaces the row. The refusal of a group or
  channel answer (F-0003, CH-7002) still runs first.

### Why

- The audit timed Start DM at 1.8 s: the thread opened only after the whole
  list had read again.

### Verification

- messages.test "F-0045 the new thread opens as soon as it is made": red
  before, green after; Messages suites pass.
