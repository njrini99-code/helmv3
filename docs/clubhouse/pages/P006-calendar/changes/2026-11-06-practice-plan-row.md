# 2026-11-06 — P006

## 2026-11-06 — A practice shows its plan

```text
Design package: design-refresh/redesign-ui-sweep-2026-11-06
PR/commit:      agent/ch-practice
Contract IDs:   none new
Actions:        none new
Data impact:    reads golf_practice_plans and golf_practice_plan_versions
Held items:     N-00 migrations, behind the Practice flag
```

With Practice on, a practice's detail has a Plan row (N-00 4.17): a coach sees
"No plan yet" with Build plan, or the plan's state with Open plan, and a player
sees it once a plan is published. A practice with a live plan carries a small
target on the calendar. With Practice off, or the tables not there yet, nothing
changes.

Screenshots: in the PR body.
