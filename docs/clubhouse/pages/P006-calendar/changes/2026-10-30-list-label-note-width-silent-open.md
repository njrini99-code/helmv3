# 2026-10-30 — Calendar: List, the change note and silent opens

## 2026-10-30 — One noun for the list view; the change note keeps its width; opening is silent (F-0028, F-0053, F-0071, F-0010)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0028, F-0053,
                F-0071, F-0010; fix plan PR 9)
PR/commit:      claude/audit-fix-09-messages-calendar-craft (#2420)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Calendar.tsx: the desktop view option says List, as the phone does; its
  value stays agenda, so addresses don’t change (owner decision 6 default)
  (F-0053). CONTRACT §16 and catalog CH-6604 say List.
- calendar.css: .ch-in-wrap is a size container and @container (max-width:
  420px) puts the change note’s actions under its text, so the text keeps the
  panel’s width instead of a one-word column (F-0028).
- Opening an event (desktop week blocks and lane bars, the phone day agenda)
  is a plain navigation tap and is silent (owner decision 5 default, D-70);
  day headers, view and List rows still tick. Catalog CH-6701 updated
  (F-0071).
- F-0010 (no change): a place-only change keeps "Moved" (owner decision 8
  default) and the week grid’s "Was" line is the moved event’s own; both are
  pinned by tests.

### Verification

- calendar-parity (List), calendar-premium (container rule) and calendar.test
  CH-6701 and 61901 (silent): red on main, green after. F-0010 pins in
  change-mark.test and calendar-change-marks.test.
