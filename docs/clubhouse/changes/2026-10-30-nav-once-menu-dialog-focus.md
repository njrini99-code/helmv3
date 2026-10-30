# 2026-10-30 — One navigation per tap, steady menus, quiet dialog focus

## 2026-10-30 — lib/nav-once, Menu anchor, dialog fallback focus (F-0009, F-0026, F-0058)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0009, F-0026,
                F-0058; fix plan PR 6)
PR/commit:      claude/audit-fix-06-shell-nav (#2417)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- lib/nav-once.ts (new): useNavOnce, a window-capture click guard that holds a
  repeated tap on the same link for one second, and usePushOnce(router), which
  returns push’s result so a busy state can end on it (F-0026).
- ui/Menu.tsx: a menu keeps its trigger’s rect and closes on scroll only when
  the trigger has actually moved more than 1px, so the first click on a Team
  Hub row’s More opens it (F-0009).
- lib/dialog-lifetime.ts: a fallbackFocus option, and the opener is marked
  quiet before close, so focus returning after Cancel or Delete never opens
  another event’s menu or peek (F-0058).

### Verification

- nav-once, menu-scroll and dialog-focus-quiet tests (new): red on main, green
  after.
