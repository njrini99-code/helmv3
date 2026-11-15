# P008 Settings — 2026-11-15

## 2026-11-15 — The skeleton opens the section the link names

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-17)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   CH-8401 row updated
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `SettingsSkeleton` / `SettingsRouteSkeleton` and the settings `loading.tsx`
  files read `?section=` (or the route's own: Notifications, a coach's
  CoachHelm): that section is marked on the rail with its cards, and on the
  phone it loads already pushed open instead of on the list.

### Why

- GAP-S-17: a link to a section loaded the list, then jumped into the section.

### Verification

- `route-skeleton-address.test.tsx`, `settings-server.test.tsx`, `settings.test.tsx`.
