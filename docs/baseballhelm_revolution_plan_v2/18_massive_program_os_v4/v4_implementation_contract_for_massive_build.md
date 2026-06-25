# V4 Implementation Contract For Massive Build

This file tells the build agent how to treat BaseballHelm as a major engineering project. The user expects this to be massive. That does not mean random code volume. It means mature architecture, clear layers, durable data contracts, role-safe behavior, testable modules, and product depth across every surface.

## Build Philosophy

The codebase may eventually be very large. The first massive pass should create the architecture that can support that scale.

Do:

- build clear feature modules
- reuse current baseball routes and actions
- add route groups intentionally
- create server read models
- keep client components small
- enforce permissions server-side
- add data provenance
- add tests
- seed demo data
- document decisions

Do not:

- dump giant components into one file
- create duplicate schemas
- fork high school/college/showcase into separate apps
- create generic dashboards
- overpromise direct integrations
- hide security in UI only

## Recommended Folder Additions

Within `src/components/baseball`:

- `program-os/`
- `signals/`
- `source-trust/`
- `imports/`
- `practice/`
- `performance/`
- `meetings/`
- `settings/`
- `player-today/`

Within `src/app/baseball/actions`:

- `signals.ts`
- `imports.ts`
- `practice.ts`
- `performance.ts`
- `meetings.ts`
- `settings-capabilities.ts`
- `source-refs.ts`

Within `src/lib/baseball`:

- `capabilities.ts`
- `program-types.ts`
- `source-trust.ts`
- `signals.ts`
- `import-validation.ts`
- `player-matching.ts`
- `visibility.ts`
- `readiness.ts`
- `practice-intelligence.ts`
- `demo-data.ts`

Within routes:

- `dashboard/today`
- `dashboard/signals`
- `dashboard/imports`
- `dashboard/practice`
- `dashboard/performance`
- `dashboard/meetings`
- `dashboard/settings/roles`
- `dashboard/settings/integrations`
- `dashboard/settings/player-access`

## Read Model Pattern

Every major screen should have a read model:

- `getCommandCenterModel`
- `getPlayerTodayModel`
- `getSignalInboxModel`
- `getImportDossierModel`
- `getPracticePlannerModel`
- `getPerformanceDashboardModel`
- `getStaffMeetingModel`
- `getPlayerProfileModel`

Read models should:

- accept user/team/program context
- apply permissions
- return typed UI data
- include empty-state hints
- include source references where needed

## Server Action Pattern

Actions should:

- check auth
- check capability
- validate input
- write audit log for sensitive actions
- revalidate affected paths
- return structured error

Action examples:

- createSignal
- resolveSignal
- convertSignalToPracticeBlock
- createImportRun
- commitImportRun
- rollbackImportRun
- publishPractice
- markPracticeAttendance
- submitPlayerCheckIn
- logLiftResult
- updatePlayerAvailability
- createStaffMeetingItem
- approveAIInsight

## Data Model Additions

Exact SQL depends on live schema, but V4 requires objects for:

- program settings
- program type
- capabilities
- source references
- signals
- import runs
- import rows
- import mappings
- timeline events
- practice plans
- practice blocks
- practice attendance
- lift assignments
- lift results
- wellness check-ins
- availability statuses
- staff meeting items
- AI insight sources/dispositions
- audit log

Where existing tables exist, extend them rather than duplicate.

## Testing Requirements

Unit tests:

- capability checks
- player matching
- import validation
- source trust
- readiness calculation
- signal derivation
- visibility filtering

Integration tests:

- import commit/rollback
- player cannot see staff-only note
- strength coach cannot see academic private detail
- academic viewer cannot see wellness detail
- signal converts to practice block
- AI output requires source refs

Browser tests:

- coach command center
- player today mobile
- import flow
- performance dashboard
- practice planner
- staff meeting

RLS tests:

- players own visible data only
- staff scoped by team/program
- role changes affect access
- import audit not player-visible

## Demo Data Requirements

Seed at least:

- college demo
- high school demo
- showcase demo
- strength coach demo state

College demo:

- roster 38
- practice
- lift
- check-ins
- class conflict
- travel
- stat import
- performance import
- AI brief
- signals

High school demo:

- roster 24
- schedule
- stats
- player exposure profiles
- announcements
- basic lift assignment

Showcase demo:

- event roster 60
- measurables
- video links
- scout packet
- imports

## QA Gates By Program Type

College:

- Command Center shows practice/performance/academics/travel/stats signals
- player Today works
- strength coach view works

High school:

- exposure/profile features visible
- guardian settings safe
- simpler academics

Showcase:

- event command visible
- measurables/profile/scout packet work
- no unnecessary college team ops clutter

## Anti-Bloat Rule

Massive project does not mean every feature is Phase 1.

The build should create foundations for:

- roles
- program types
- source refs
- imports
- signals
- settings
- performance

But it can stage full feature depth behind flags.

## Final Build Report Required

The build agent must report:

- actual files inspected
- current route changes
- current schema changes
- new routes
- new components
- new actions
- new tables
- RLS changes
- program type behavior
- strength coach workflow
- player workflow
- import workflow
- settings added
- UI/UX decisions
- tests run
- risks
- deferred features

No final report, no successful one-shot.
