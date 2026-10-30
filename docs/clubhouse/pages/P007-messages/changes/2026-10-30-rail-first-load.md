# 2026-10-30 — Messages: the rail’s first load

## 2026-10-30 — The inbox reads only the active team’s conversations on first load (F-0014)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0014; fix plan
                PR 7)
PR/commit:      claude/audit-fix-07-speed (#2418)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- routes/messages.tsx reads getGolfActiveTeamConversationIds on the server and
  passes it as ChMessagesData.activeConversationIds; useGolfConversations(…, {
  allowIds }) seeds its first load with it, so loadGolfConversationRail no
  longer waits on that server action in the browser (part of F-0014).

### Why

- The audit measured a cold inbox skeleton of up to 14 s; the serial chain
  began with this read.

### Verification

- use-golf-messages.rail-allow-seed.test (new): red on main, green after.
