# 2026-10-30 — Calendar: Publish returns before the invitations

## 2026-10-30 — Publishing an event no longer waits for the invitation notices (F-0029)

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

- calendar-events.ts and lib/calendar/rsvp.ts: createGolfEvent passes
  sendEventInvitations a deferNotices option and runs the notice upsert in
  after(), so the response returns once the event and its attendance rows are
  written.

### Verification

- rsvp-defer-notices.test (new): red on main, green after.
