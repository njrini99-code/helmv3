# 2026-10-30 — Stats (player): night contrast

## 2026-10-30 — The Rounds tab count and the big figure readable at night (F-0015, F-0005, F-0062)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0015, F-0005,
                F-0062; fix plan PR 3)
PR/commit:      claude/audit-fix-03-night-contrast (#2414)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- stats.css: the profile Rounds tab count uses the tab ink (was 4.2:1 at
  night, F-0015); the section numbers and the big Stats figure stay on the
  pale forest ink at night (F-0005, F-0062: the figure faded to 1.0-2.9:1).

### Verification

- src/clubhouse/__tests__/contrast-tokens.test.ts (new APCA Lc and WCAG pairs,
  one per finding, plus an opacity-on-text ratchet): red on main, green after.
