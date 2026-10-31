# 2026-10-30 — Qualifiers: an open qualifier past its last day

## 2026-10-30 — "Waiting on n rounds", not "Ended", under Active (F-0068)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0068; fix plan
                PR 9)
PR/commit:      claude/audit-fix-09-messages-calendar-craft (#2420)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- model.ts endedLabel: "Waiting on n rounds", or "Past last day" when nothing
  is outstanding or the count didn’t load; "Ended" stays the word for a
  completed qualifier. Comments in parts.tsx, QualifierDetail.tsx,
  QualifierSections.tsx and live.ts, and DESIGN.md (D3 wording), updated.
  Confirm squad order untouched.

### Why

- The list files every qualifier that isn’t completed under Active, where an
  "Ended" badge contradicted its group.

### Verification

- qualifiers-premium.test (it pinned "rounds outstanding"): red on main, green
  after.
