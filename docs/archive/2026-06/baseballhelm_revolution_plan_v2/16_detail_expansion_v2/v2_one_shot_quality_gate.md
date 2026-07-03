# V2 One-Shot Quality Gate

Use this as the final review checklist before calling the Claude Ultracode session successful.

## Build-Readiness Gate

| Gate | Pass condition |
|---|---|
| Repo audit | Written route/schema/auth/component audit exists before edits |
| Migration safety | Existing tables and generated types inspected before schema changes |
| No parallel schema | New tables only fill verified gaps |
| RLS | Player/staff/admin policies tested or smoke-tested |
| Capability model | Server-side capability checks exist for sensitive actions |
| Navigation | Sidebar and redirects reflect V2 role model |
| Empty states | Primary pages are useful with no data |
| Error states | Primary data failures are scoped and recoverable |
| Import audit | Every committed row traces to import run/row |
| Rollback | Import-created objects can be rolled back or marked reverted |
| AI grounding | AI cards include source refs and confidence |
| AI safety | No medical, private academic, or staff-only leakage |
| Demo data | Realistic program story seeded |
| Tests | Typecheck plus targeted role/import/AI tests run where possible |

## Phase 1 Must Pass

- Coach Command Center shows today, risks, action queue, import status, and AI brief.
- Player Today shows only player-safe daily actions.
- Roster can resolve import identity conflicts.
- Player Profile has a source-backed timeline.
- Practice Lite can publish a plan and record attendance.
- Stats Lite separates official stats from development metrics.
- Performance Lite connects lift/wellness/availability without pretending to be a medical tool.
- Import Center supports mapping, matching, preview, commit, rollback, and audit.
- Staff AI brief can be dismissed or converted into an action.

## Automatic Fail Conditions

- Players can see staff-only notes.
- AI output has no source refs.
- Import commits without preview.
- Same file can duplicate records silently.
- Build adds direct vendor integration stubs as if they are working.
- Recruiting marketplace becomes part of Phase 1.
- Navigation exposes 15+ top-level tabs to a coach.
- The app only works with seeded data and fails empty states.

## Final Agent Report Required

The build agent must report:

- files changed
- migrations added
- tables touched
- RLS policies added/changed
- routes added/changed/hidden
- imports implemented
- AI outputs implemented
- tests run
- screenshots or browser verification notes
- known risks
- deferred items
