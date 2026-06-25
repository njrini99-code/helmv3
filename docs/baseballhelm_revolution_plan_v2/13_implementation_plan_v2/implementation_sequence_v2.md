# Implementation Sequence V2


## Execution order

1. Task 0 live BaseballHelm Ultracode Command Center, fully wired as a cream/green no-black Agent City / Factory Floor, opened in Chrome and verified.
2. Current-state repo audit summary.
3. Proposed migration map.
4. Schema + RLS changes.
5. Server actions / queries / read models.
6. Coach Command Center UI.
7. Player Today UI.
8. Roster/Profile/Timeline UI.
9. Import Center MVP.
10. Practice + Performance MVP surfaces.
11. AI embedded cards and summaries.
12. Demo seed data.
13. QA checklist with role-testing notes.

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
- No clean-room parallel schema unless proven necessary.
- No AI without source refs.
- No sensitive data leakage.
- No top-level tab bloat.
- No primary page without empty/loading/error state.
- No main BaseballHelm implementation before the V12 live command center is running, open in Chrome, and verified.
