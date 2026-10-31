# 2026-10-30 — Stats (team): night contrast

## 2026-10-30 — Chart callouts and tab counts readable at night (F-0037, F-0015)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0037, F-0015;
                fix plan PR 3)
PR/commit:      claude/audit-fix-03-night-contrast (#2414)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- stats.css: chart callouts (Best, -5.4) sit on a green-900 halo 7px wide,
  4.5:1+ (was 2.6-3.4:1, F-0037); tab counts use the tab ink, and the phone
  count is calc(12 * var(--ch-type-k)).

### Verification

- src/clubhouse/__tests__/contrast-tokens.test.ts (new APCA Lc and WCAG pairs,
  one per finding, plus an opacity-on-text ratchet): red on main, green after.
