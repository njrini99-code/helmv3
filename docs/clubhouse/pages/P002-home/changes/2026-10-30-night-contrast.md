# 2026-10-30 — Home: night contrast

## 2026-10-30 — No faded text on Home (F-0038, F-0036)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0038, F-0036;
                fix plan PR 3)
PR/commit:      claude/audit-fix-03-night-contrast (#2414)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- home.css: the agenda row drops its opacity: 0.8; a struck old time on the
  next row inherits its line ink (.ch-h-agenda__row.is-next .ch-was), as Up
  next does (F-0038: was 3.4:1).
- home.css: the desktop New event shortcut hint uses the shared dark kbd rule
  in ui.css instead of its own 10% white wash (F-0036).

### Verification

- src/clubhouse/__tests__/contrast-tokens.test.ts (new APCA Lc and WCAG pairs,
  one per finding, plus an opacity-on-text ratchet): red on main, green after.
