# V2 Recommended Next Agent Prompt

```text
You are implementing BaseballHelm V2 inside the existing `njrini99-code/helmv3` repo.

Treat `/docs/baseballhelm_revolution_plan_v2/` as the source of truth, not the old plan.

Your goal is to execute only Phase 0 and Phase 1.

Phase 0:
- audit current baseball routes, sidebar nav, auth flow, and existing `baseball_*` schema
- preserve reusable shells, layouts, auth logic, and read models where sensible
- remove or isolate archived recruiting-mode navigation branches
- define canonical capability checks for coach, player, strength-oriented staff, ops, academic viewer, manager, and admin
- add missing loading/error states for the core baseball dashboard routes you touch

Phase 1:
- build / upgrade Coach Command Center as the default coach landing page
- build Player Today as the default player landing experience
- upgrade Roster into canonical player identity + player profile + player timeline
- extend calendar / team ops around events, acknowledgements, and conflict visibility
- implement Practice Planner Lite with publish, attendance, human-entered completion capture, and staff assignments
- implement Stats Center Lite for official stats imports, game logs, season summaries, and source-labeled tables
- implement Performance Lite for lift assignments/results, wellness check-ins, availability states, and compliance
- implement Import Center MVP with upload, column mapping, player matching, preview, validation, commit, rollback, and audit log
- implement embedded CoachHelm AI only as briefs, flags, Staff Decision Room items, Postgame Action Reviews, practice prescriptions, and import cleanup support
- seed strong demo data for a realistic college baseball program

Hard constraints:
- do not build direct vendor integrations
- do not build a recruiting marketplace
- do not build a full compliance engine
- do not build a full strength platform or giant exercise library
- do not create a parallel clean-room schema if existing `baseball_*` tables can be extended
- do not implement AI as a chatbot-first experience
- do not expose staff-only notes, private academic details, or sensitive health-adjacent details to players

Implementation requirements:
- prefer extending existing `baseball_*` tables and routes
- add new `baseball_*` tables only where necessary
- separate official game stats from development metrics
- create a canonical external-ID / import-matching model for players
- every AI output must cite the source objects it used and store confidence + disposition state
- every imported row must be traceable to an import run
- every sensitive write must be auditable
- every primary page must have empty, loading, and error states
- every role must be tested for visibility boundaries

Deliver in this order:
1. current-state repo audit summary
2. proposed migration map
3. schema + RLS changes
4. server actions / queries / read models
5. command center UI
6. player today UI
7. roster/profile/timeline UI
8. import center MVP
9. practice + performance MVP surfaces
10. AI embedded cards and summaries
11. demo seed data
12. QA checklist with screenshots and role-testing notes

At each step, explain:
- exact files changed
- tables touched
- routes affected
- risks
- tests added
- what remains
```
