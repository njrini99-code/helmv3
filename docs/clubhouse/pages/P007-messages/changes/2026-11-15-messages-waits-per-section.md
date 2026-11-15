# P007 Messages — 2026-11-15

## 2026-11-15 — Each part of Messages waits on its own and gives up at 15 seconds

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-11)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   70290 (CH-7490); CH-7201, CH-7206 rows updated
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `screens/messages/use-announcements-read.ts`, `announcements.tsx`: a slow
  announcements read shows its own wait (`AnnouncementsWait`, CH-7490) while the
  inbox and threads draw; after 15 s it is the failure (CH-7206) with Try again.
- `src/hooks/golf/use-golf-messages.ts`: the threads read gives up after 15 s
  too, and says so (CH-7201), instead of spinning.

### Why

- GAP-S-11: one slow read held the whole page on a spinner with no end.

### Verification

- `src/clubhouse/__tests__/messages-announcements-wait.test.tsx` (CH-7490), `use-golf-messages` tests.
