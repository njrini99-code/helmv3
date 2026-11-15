# 2026-11-15 — calendar

## 2026-11-15 — Test players are not invitees

```text
Design package: none (prod audit 2026-11-15, PV-41)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     none
```

### Changed

- `data/calendar.ts`: the team list an event offers as invitees reads each member’s `is_test` and leaves test players out, as Ask’s roster does.

### Why

- Test accounts were offered as invitees on new events.

### Verification

- The Calendar suites; not checked in a browser or on a device in this change.
