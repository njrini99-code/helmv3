# Rollback Plan V2


## Execution order

1. Current-state repo audit summary.
2. Proposed migration map.
3. Schema + RLS changes.
4. Server actions / queries / read models.
5. Command Center UI.
6. Player Today UI.
7. Roster/Profile/Timeline UI.
8. Import Center MVP.
9. Practice + Performance MVP surfaces.
10. AI embedded cards and summaries.
11. Demo seed data.
12. QA checklist with role-testing notes.

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
