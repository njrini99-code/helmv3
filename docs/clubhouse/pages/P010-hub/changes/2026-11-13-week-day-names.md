# 2026-11-13 — hub

## 2026-11-13 — Today in the week strip is named "Today 14, Tue: …"

```text
Design package: none (audit 2026-11-13, F-0011; no visible change)
PR/commit:      agent/ch-look-a11y
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Today's day in the next 7 days reads "Today 14, Tue: 2 events" (was "Today, Tue 14:
  2 events"), so its name opens with its face, Today and 14. Other days were already
  "Wed 15: 1 event".

### Why

- Audit 2026-11-13 F-0011 (S2, axe `label-content-name-mismatch`, WCAG 2.5.3 Label in
  Name): the name a screen reader and Voice Control use did not hold the words on the
  control, so a voice-control user who said what they saw could not reach it.

### Verification

- `screens/hub/__tests__/hub-redesign.test.tsx`; `ui/__tests__/WeekStrip.test.tsx`.
