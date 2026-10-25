# 2026-10-24 — MenuSheet: the phone's menu sheet, exported

## 2026-10-24 — ui/ContextMenu exports MenuSheet for a page's own phone menu

```text
Design package: none (Clubhouse A+ handoff, section 0.4 Calendar, row 81)
PR/commit:      agent/aplus-lane-d
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `MenuSheet` (ui/ContextMenu.tsx) is the long-press menu's bottom sheet, now
  usable by a page for its own menu of actions: the same rows, keys and Modal.
  The phone Calendar's coach More is its first user. The context menu itself is
  unchanged.

### Why

- One sheet for a phone menu, not a second one written for Calendar.

### Verification

- calendar.test › row 81; the context menu's own tests are unchanged.
