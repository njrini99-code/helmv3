# 2026-11-13 — the sidebar keeps lit the section a page was opened from

```text
Design package: none (coach audit, 13 Nov 2026, §8 #7)
PR/commit:      agent/coach-fix-roster
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `activeNavItemFrom(pathname, search, role, features)`: an address whose query
  names a section of the role (`from=roster`) keeps that section lit; any other
  `from` is ignored. The Sidebar takes the frame's `search`. A player opened
  from Roster had lit Stats.
