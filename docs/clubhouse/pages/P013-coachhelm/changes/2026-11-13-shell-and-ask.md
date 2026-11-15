# 2026-11-13 — quick chat, Ask and the read drawer, after the coach audit

## 2026-11-13 — The plan card is styled wherever it is drawn

```text
Design package: none (coach audit, 13 Nov 2026, §2 quick chat #3)
PR/commit:      agent/coach-fix-shell
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Fixed

- `plan/PlanCard.tsx` imports `coachhelm-plan.css` itself. The sheet loaded
  only with the CoachHelm and Practice routes, so a plan asked for from Home
  with ⌘J came back unstyled ("4:4020 min", times run into lengths). Quick chat
  loaded `coachhelm-ask-v2.css`, which has one of the card's 363 rules.
