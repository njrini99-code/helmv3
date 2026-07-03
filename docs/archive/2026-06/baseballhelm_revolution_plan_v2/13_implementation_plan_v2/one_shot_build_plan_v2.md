# One Shot Build Plan V2


## Execution order

1. Task 0 live BaseballHelm Ultracode Command Center, fully wired as a cream/green no-black Agent City / Factory Floor, opened in Chrome and verified.
2. Current-state repo audit summary.
3. V10 premium UI and CoachHelm correction map.
4. V9 subsystem gap map by tab, integration, source, signal, action, role, and route.
5. Proposed migration map.
6. Schema + RLS changes.
7. Source registry, external IDs, import run/file/row/mapping foundation.
8. Server actions / queries / read models.
9. Capability and navigation refactor.
10. Coach Command Center UI.
11. Signal Inbox and source-to-action lifecycle.
12. Player Today UI.
13. Roster/Profile/Timeline UI.
14. Import Center MVP and adapter registry.
15. Practice Planner, Scrimmage Builder, and Practice Intelligence Board.
16. Stats foundation, advanced stat visuals, and Postgame Action Review.
17. Performance OS foundation.
18. Video Evidence foundation.
19. Baseball CoachHelm embedded cards, practice prescriptions, and action reviews.
20. Staff Decision Room.
21. Program-mode demo seed data.
22. QA checklist with role-testing notes.

## For every major build area include

- exact objective
- likely files involved
- existing code to inspect
- new components needed
- new tables needed
- server actions/API needs
- UI states
- edge cases
- tests
- acceptance criteria
- dependencies
- failure risks

## Non-negotiables

- No direct vendor integrations.
- Yes to import-ready adapter settings and source contracts for every planned integration.
- No clean-room parallel schema unless proven necessary.
- No AI without source refs.
- No sensitive data leakage.
- No top-level tab bloat.
- No main BaseballHelm implementation before the V12 live command center is running, open in Chrome, and verified.
- No primary page without empty/loading/error state.
- No subsystem that does not connect to source, signal, action, timeline, or measurable outcome.
- No legacy generated meeting prose, generic discussion prose, or AI-authored practice summaries.
- Yes to source-backed action recommendations, Staff Decision Room, and Practice Effectiveness Review.
- Yes to Staff Decision Room, decision ledger, staff action queue, Postgame Action Review, practice prescription, and practice-effectiveness review.
