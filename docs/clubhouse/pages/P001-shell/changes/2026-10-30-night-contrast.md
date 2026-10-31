# 2026-10-30 — Shell: night contrast

## 2026-10-30 — Breadcrumbs and search read on the secondary ink (F-0035, F-0041)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0035, F-0041;
                fix plan PR 3)
PR/commit:      claude/audit-fix-03-night-contrast (#2414)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- shell.css: the top bar breadcrumbs and the search placeholder line move from
  the tertiary to the secondary ink, which reaches Lc 75 at night.

### Verification

- src/clubhouse/__tests__/contrast-tokens.test.ts (new APCA Lc and WCAG pairs,
  one per finding, plus an opacity-on-text ratchet): red on main, green after.
