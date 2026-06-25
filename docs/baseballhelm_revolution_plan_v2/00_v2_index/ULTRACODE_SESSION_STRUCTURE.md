# Claude Ultracode Session Structure

Use this file to run BaseballHelm V2 as a controlled one-shot build session. The goal is not to tell Claude to build everything in the V2 folder. The goal is to make Claude execute the highest-leverage Phase 0 and Phase 1 slice without drifting into speculative features.

Before implementation, Claude must read `27_live_ultracode_command_center_v12/` and execute Task 0. V12 requires a fully wired cream/green Agent City / Factory Floor BaseballHelm Ultracode Command Center to be created, wired to local telemetry, opened in Google Chrome, and verified before any main product work starts. The source Agent City spec controls the ambition; the BaseballHelm adaptation controls the no-black cream/green visual direction and local wiring cutline. After the V12 gate is open, Claude must read `26_final_auth_lifting_current_app_v11/`, then `25_premium_ui_coachhelm_v10/`, then `24_subsystem_execution_blueprint_v9/`. V11 is the final auth, staff-role, team-join, lifting coach, player-lift, and current-app grounding layer. V10 is the premium UI, advanced baseball stat visual, GolfHelm translation, and CoachHelm scope-correction layer. V9 is the execution map that organizes every staff tab, player tab, integration adapter, source-to-signal-to-action loop, read model, permission boundary, and work packet. Older V2-V8 files remain binding source material, but V12, V11, V10, and V9 are the fastest way to understand what to build, how it should feel, and how the owner can watch it happen.

## Session Goal

Transform the existing `helmv3` baseball product from a mixed recruiting/team-management surface into a college-baseball operating system MVP.

The one-shot session should produce:

- a live cream/green no-black BaseballHelm Ultracode Command Center opened in Chrome before the main build
- Agent City, Factory Floor, Agent Tower, Agent Cockpit, Codebase City, Control Tower, Data District, Integration Harbor, QA Lab, Context Reactor, Decision Ledger, Memory Library, Flight Recorder, and Handoff Ledger modes
- local telemetry for agent lanes, work packets, feature progress, repo pulse, migrations, tests, risks, screenshots, replay, decisions, artifacts, and handoff notes
- a repo audit note committed into the work product
- a migration plan before schema changes
- role/capability-aware navigation
- login/signup/team join/staff invite flow that supports players, assistant coaches, and lifting coaches
- Coach Command Center default landing
- Player Today default player landing
- canonical roster/player profile/timeline foundation
- Import Center MVP
- Practice Planner Lite
- Performance Lite
- premium lifting coach dashboard with groups, program builder, live weight room, readiness, soreness, bodyweight, and player lift execution
- source-cited CoachHelm AI cards
- premium baseball stat visual contracts
- Staff Decision Room instead of legacy generated meeting prose
- demo seed data
- acceptance tests and role visibility checks
- the V9 subsystem map reflected in the implementation order

## Hard Cutline

Build now:

- Command Center
- Player Today
- Roster/Profile/Timeline
- Calendar events plus acknowledgements
- Practice Planner Lite
- Stats Center Lite
- Performance Lite
- V11 auth/team join/staff invite/lifting coach/player lift/current-app execution layer
- Import Center MVP
- Embedded CoachHelm briefs/flags/action reviews
- V10 premium UI contracts for Command Center, Signals, Practice, Stats Lab, Video, Performance/Lifting, Import Center, Player Snapshot, and Staff Decision Room
- Demo mode seed data
- V9 foundations for source registry, integration adapter settings, signal actions, video evidence, performance, practice effectiveness, and role-safe player workflows

Do not build now:

- direct TrackMan/Rapsodo/GameChanger/Teamworks integrations
- recruiting marketplace
- full compliance engine
- full nutrition platform
- full strength platform
- full drill marketplace
- medical injury management
- unrestricted AI chat as the primary product

Still build the adapter architecture, settings, import profiles, source badges, and storage contracts for those integrations. The cutline is direct live vendor sync without credentials, not import-ready subsystem planning.

## Suggested Claude Ultracode Flow

### Block 0 - Live Build Command Center

Claude must complete this block before repo audit or code edits.

Build:

- local command center server, preferably `scripts/baseballhelm-command-center.mjs`
- local event logger, preferably `scripts/baseballhelm-build-event.mjs`
- local hook bridge, preferably `scripts/baseballhelm-command-center-hook.mjs`
- dashboard assets under `tools/baseballhelm-command-center/`
- telemetry directory under `.ultracode/baseballhelm/`
- seeded agent lanes and V11/V10/V9/V8/V7/V6 work packets
- cream/green no-black Agent City and Factory Floor UI inspired by the source Agent City spec
- Mission Control, Agent City, Factory Floor, Agent Tower, Agent Cockpit, Codebase City, Control Tower, Data District, Integration Harbor, QA Lab, Context Reactor, Decision Ledger, Memory Library, Flight Recorder, and Handoff Ledger tabs or modes
- Git/repo watcher or polling, event ingestion, risk classifier, hook receiver, and replay state

Required verification:

- run local server on localhost
- open the dashboard in Google Chrome
- verify seeded data renders
- log `command_center_verified`
- report the URL
- continue working while logging packet events

### Block 1 - Repo Intake

Ask Claude to inspect:

- `src/app/baseball`
- `src/components/baseball`
- `src/components/layout/sidebar.tsx`
- `src/hooks/use-baseball-auth.ts`
- `src/lib/supabase/middleware.ts`
- `src/lib/queries/baseball-dashboard.ts`
- `src/app/baseball/actions`
- `src/lib/baseball/csv-utils.ts`
- `src/lib/types/database.ts`
- `src/lib/types/database.types.ts`
- `src/lib/coachhelm/v2`
- `src/lib/coachhelm/v3`
- `supabase/migrations`
- `supabase/migrations_archive/pre_20260527`
- `supabase/tests/rls`

Required output before edits:

- route map
- current baseball table map
- role/auth map
- reusable component map
- recruiting logic to isolate
- missing loading/error state list
- current stats/upload contract mismatches, especially `baseball_stat_uploads`
- current official stats, development metrics, video, classes, and CoachHelm gaps
- V9 gap map: where current repo lacks tab ownership, source registry, integration adapters, signal lifecycle, player timeline, video evidence, practice effectiveness, or performance workflow

### Block 2 - Migration Design

Claude must propose SQL before writing it.

Required tables or extensions should stay narrow:

- player external IDs
- source registry
- import runs/import rows/import mappings
- player timeline events
- event acknowledgements
- practice headers/blocks/attendance
- official stat source refs
- pitch/swing/batted-ball/event facts where needed
- video event references
- AI insight sources/confidence/disposition
- availability/wellness/lift-lite tables only if existing schema cannot be reused

Reject any migration that creates a parallel clean-room schema for entities already present.

### Block 3 - Foundation Refactor

Order:

1. capability helper
2. V2 nav registry
3. V9 source registry and external ID foundation
4. player landing redirect
5. query/read-model layer
6. shared empty/loading/error primitives
7. signal/action lifecycle helpers

### Block 4 - MVP Screens

Order:

1. Coach Command Center
2. Player Today
3. Player Profile and Timeline
4. Import Center MVP
5. Practice Planner Lite
6. Performance Lite
7. Video Evidence layer
8. Staff Decision Room and Player Development Briefs
9. Program mode demo variants

### Block 5 - AI Layer

AI must be embedded. It should appear as:

- daily brief
- risk/attention flags
- import cleanup suggestions
- practice prescription
- Postgame Action Review
- Player Development Brief
- weekly staff action report
- baseball CoachHelm source-backed signals: chase trend, game-vs-practice contact gap, pitcher command/velocity decay, workload/readiness risk, class/lift/practice conflict, and postgame-to-practice focus

Every AI output must store:

- source object references
- confidence
- generated_at
- visibility
- disposition
- user action taken

### Block 6 - Verification

Claude must run:

- typecheck
- lint if available
- targeted tests
- RLS tests or SQL policy smoke tests where available
- role visibility walkthrough for coach/player/staff/admin
- screenshot or browser verification for primary pages if dev server can run

## One-Shot Session Budgeting

If Claude cannot safely complete all of Phase 1 in one session, it should stop after these deliverables:

1. audited repo map
2. migrations and RLS
3. nav/capability refactor
4. V9 source/import/signal foundation
5. Command Center
6. Player Today
7. Import Center skeleton with audit trail

Those seven are the minimum useful output.

## Operator Instructions

Paste `15_final_agent_prompts_v2/CLAUDE_ULTRACODE_MASTER_PROMPT.md` into Claude Ultracode.

Attach or point Claude to:

- this full V2 folder
- the `helmv3` repo
- current Supabase migration directory

Tell Claude: "Do not summarize the docs. Execute Task 0, Phase 0, and Phase 1 only. Start by creating the fully wired cream/green no-black Agent City BaseballHelm Ultracode Command Center, opening it in Chrome, logging `command_center_verified`, and then auditing the repo and writing the route/schema/auth findings."
