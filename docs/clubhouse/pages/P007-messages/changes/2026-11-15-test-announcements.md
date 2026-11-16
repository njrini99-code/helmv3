# 2026-11-15 — messages

## 2026-11-15 — Test announcements stay out of Messages

```text
Design package: none (prod audit 2026-11-15, DM-02, MSG-L-08)
PR/commit:      claude/project-thread-vledif
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none (reads only)
Held items:     QA messages have no is_test column; the list to delete is in the PR for Nick
```

### Changed

- `screens/messages/model.ts` `shownAnnouncements`, used by
  `routes/messages.tsx` and `Messages.tsx`: an announcement marked `is_test`
  is left out, as Team Hub leaves it out (`data/hub.ts`).

### Why

- QA announcements showed in the coach's and players' Messages while Team Hub
  hid them.

### Verification

- The Messages suites; not checked in a browser or on a device in this change.
