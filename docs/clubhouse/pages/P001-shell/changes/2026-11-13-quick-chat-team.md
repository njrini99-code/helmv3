# 2026-11-13 — quick chat picks up only this team's recent thread

## 2026-11-13 — Quick chat opens fresh unless this team's thread is under 30 minutes old; New chat

```text
Design package: none (coach audit, 13 Nov 2026, §2 quick chat #1, #2, #5)
PR/commit:      agent/coach-fix-shell
Contract IDs:   none new
Actions:        none new
Data impact:    none (one localStorage key, ch.qc.teams, in the browser)
Held items:     none
```

### Changed

- `quick-chat/qc-team.ts`: the browser remembers which team each quick chat
  began on (the conversations table has no team). `readTodayThread(now,
  teamId)` picks a thread up again only when it is this team's and was touched
  in the last 30 minutes (`QC_RESTORE_MS`, Nick to confirm the 30); another
  team's thread, or one with no team on record here (begun on another device),
  opens fresh. With Guilford active, ⌘J had opened a Demo University thread,
  with an old plan card's live Publish.
- `QuickChatThread` records the team when a new thread gets its id.
- `QuickChatSession`: a New chat key (pen icon) in the head once there is a
  conversation; it drops a picked-up thread and starts over in the panel.
