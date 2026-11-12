# 2026-11-12 — tournaments

## 2026-11-12 — The first run leads with the calendar's tournaments, and sets the first one up (W36, W38)

```text
Design package: none (preview walk fixes, PREVIEW_ISSUES.md W36 and W38)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   CH-16352 (copy and actions when untracked tournaments exist)
Actions:        none
Data impact:    none
Held items:     "3 tournament rounds not linked to an event": the home read carries no unlinked-round count, so it needs a
                data change; the empty-state design itself is Q3 (Nick's), unchanged
```

### Changed

- With untracked tournaments on the calendar, the first run's title reads "2 tournaments on your calendar to set up"
  and its body "Set one up and it shows here with its rounds, lineup and results."
- Its primary is "Set up <first one's name>", which opens the calendar editor on that tournament with Track on (the
  same link as its row in Set up from calendar). "Add a tournament" is the secondary. "Set up from calendar (2)", which
  only jumped to the list already on screen, is gone.
- With nothing on the calendar the first run is unchanged.

### Why

- Nick's walk: W36, the top button looked dead; W38, "Your season starts on the calendar" while two tournaments waited
  below.

### Verification

- `tournaments-p5.test.tsx` (CH-16352 case updated); tournaments suites 40 files, 657 tests, exit 0; eslint exit 0.
