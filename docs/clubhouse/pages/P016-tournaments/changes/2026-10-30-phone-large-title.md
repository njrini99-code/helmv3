# 2026-10-30 — Tournaments: one title on the phone

## 2026-10-30 — New event names itself once (F-0054)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0054; fix plan
                PR 9)
PR/commit:      claude/audit-fix-09-messages-calendar-craft (#2420)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- TourHead passes large to PageIntro on the phone, so its heading is the
  page’s large title (.ch-large-title) and the bar hides its own copy until it
  scrolls under; the phone New event drops the Tournaments eyebrow, which
  repeated the back label.

### Verification

- tournaments-eventform.test F-0054: red on main, green after.
