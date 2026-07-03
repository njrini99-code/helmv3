# V12 Claude Task Zero - Live BaseballHelm Ultracode Command Center

## Task Zero Mission

Claude's first task is to build a live local command center for the BaseballHelm ultracode session.

This command center must be created, wired, run, and opened in Google Chrome before Claude begins the actual BaseballHelm product implementation. It should become the owner-facing window into the entire build.

The artifact should feel like a premium sports-operations Agent City: cream background, deep greens, restrained gold/tan accents, dense but readable data, high-confidence hierarchy, live build intelligence, and a little working software city where agents, files, tests, risks, and tasks visibly move through BaseballHelm's build process. It should not look like a generic admin dashboard, a basic TODO page, a toy progress bar, or a black/dark control-room clone.

Use `source_ultracode_agent_city_command_center_spec.md` as the ambition reference and `v12_agent_city_baseballhelm_adaptation.md` as the project-specific contract. If those conflict, the BaseballHelm adaptation wins.

## Product Name

Use this name in the artifact:

`BaseballHelm Ultracode Command Center`

Short labels may use:

- `Build Command`
- `Ultracode HQ`
- `BaseballHelm Build OS`
- `Agent City`
- `Factory Floor`

## Primary User

The primary user is Rick, watching the BaseballHelm one-shot build unfold.

The user wants:

- full visibility into what Claude and worker agents are doing
- confidence that the zip is being followed
- confidence that each major subsystem is receiving real implementation attention
- a beautiful Chrome artifact that feels specific to BaseballHelm
- cream/green premium UI with no black overall theme
- an Agent City / Factory Floor view, not just cards and logs
- a live sense of motion, without fake vanity animation
- feature-level completion, risks, touched files, tests, and agent focus

## Strategic Principle

The artifact is a build observability product.

It should answer these questions at any moment:

1. What is Claude working on right now?
2. Which agent lane owns each subsystem?
3. Which BaseballHelm features are started, blocked, testing, or done?
4. What exact files, routes, migrations, tables, actions, and components changed?
5. Which planned features are still untouched?
6. What risks or schema conflicts have been found?
7. Which tests passed, failed, or have not been run?
8. Which role boundaries have been verified?
9. Which user-facing screens have browser screenshots?
10. Is the build following V12, V11, V10, V9, V8, V7, and V6?
11. Which city district is currently active?
12. Where are the risks, failed checks, and scope-drift boundaries?

## Recommended Implementation

Create a local, repo-contained artifact in `Downloads/helmv3`.

Recommended files:

```text
scripts/baseballhelm-command-center.mjs
scripts/baseballhelm-build-event.mjs
scripts/baseballhelm-command-center-hook.mjs
tools/baseballhelm-command-center/index.html
tools/baseballhelm-command-center/styles.css
tools/baseballhelm-command-center/app.js
.ultracode/baseballhelm/events.ndjson
.ultracode/baseballhelm/state.json
.ultracode/baseballhelm/work-packets.json
.ultracode/baseballhelm/agents.json
.ultracode/baseballhelm/qa.json
.ultracode/baseballhelm/risks.json
.ultracode/baseballhelm/decisions.json
.ultracode/baseballhelm/artifacts.json
.ultracode/baseballhelm/replay.json
.ultracode/baseballhelm/handoff.json
.ultracode/baseballhelm/screenshots/
```

### Server

`scripts/baseballhelm-command-center.mjs` should:

- bind to `127.0.0.1`
- default to port `4877`, with auto-increment if busy
- serve the static dashboard assets
- expose `GET /api/state`
- expose `GET /api/events`
- expose `GET /api/repo`
- expose `GET /api/health`
- expose `GET /api/replay`
- expose `GET /api/artifacts`
- expose `POST /api/events`
- expose `POST /hooks/claude`
- expose `GET /events` as Server-Sent Events when practical
- read `.ultracode/baseballhelm/*.json`
- tail or re-read `.ultracode/baseballhelm/events.ndjson`
- periodically compute safe local repo facts using non-destructive commands:
  - `git status --short`
  - `git diff --stat`
  - `git diff --name-only`
  - optional `git log -1 --oneline`
- never expose environment variables
- never bind publicly
- never require production Supabase credentials

### Hook Bridge

`scripts/baseballhelm-command-center-hook.mjs` should:

- read JSON from stdin
- post it to `http://127.0.0.1:{port}/hooks/claude`
- fail silently or append fallback JSONL if the receiver is offline
- preserve raw payload in event metadata
- never crash Claude or block a build if the dashboard is temporarily unavailable

Claude must create the hook receiver and hook bridge during Task 0 even if full hook installation is left as a documented follow-up.

### Event CLI

`scripts/baseballhelm-build-event.mjs` should append one JSON object per line to:

```text
.ultracode/baseballhelm/events.ndjson
```

It should support a simple command shape like:

```bash
node scripts/baseballhelm-build-event.mjs \
  --type packet_started \
  --agent orchestrator \
  --packet command-center \
  --title "Building live command center" \
  --detail "Creating local SSE dashboard and seeded work packets"
```

It should update summary JSON files after appending, or the server should derive summary state. Do whichever is simpler and reliable.

### Opening Chrome

After the server starts, Claude must open Chrome with:

```bash
open -a "Google Chrome" "http://127.0.0.1:4877"
```

If port `4877` is busy and the server chooses another port, open that actual URL.

Claude must confirm the page is reachable before proceeding. If possible, it should use a browser or screenshot check. If not possible, it must at least verify:

- server health endpoint returns OK
- Chrome open command ran successfully
- event `command_center_verified` was appended with URL and timestamp

## Required Agent City Modes

The first Chrome version must include these visible modes or tabs:

- `Mission Control`
- `Agent City`
- `Factory Floor`
- `Agent Tower`
- `Agent Cockpit`
- `Codebase City`
- `Control Tower`
- `Data District`
- `Integration Harbor`
- `QA Lab`
- `Context Reactor`
- `Decision Ledger`
- `Memory Library`
- `Flight Recorder`
- `Handoff Ledger`

The city can be implemented with HTML/CSS/SVG/Canvas if that is fastest. It does not need full PixiJS/Tauri before BaseballHelm work starts, but it must visually read as a living work city and must be wired to real local events.

## Required City Districts

The Agent City must include BaseballHelm-specific districts:

- Prompt Plaza
- Planning Hall
- Agent Residential Tower
- Code Quarry
- Component Foundry
- Backend Machine Shop
- Data District
- Integration Harbor
- QA Lab
- Permission Control Tower
- Git Depot
- Shipping Dock
- Memory Library
- Observatory
- Broadcast Center

Each district must show honest empty/loading/active/error states.

## Initial Seeded Agent Lanes

The command center must show seeded agent lanes before the rest of the work begins. These lanes are a visibility model; Claude may implement them as actual subagents, worker queues, or orchestrated work streams depending on the environment.

### Orchestrator

Owns overall order, stop conditions, read order, build ledger, and final acceptance.

Initial focus:

- create Command Center
- enforce V12 Chrome-open gate
- read V11/V10/V9/V8/V7/V6 in correct order
- prevent broad feature drift

### Repo Cartographer

Owns current app inspection.

Initial focus:

- baseball routes
- dashboard shell
- auth hooks
- team join pages
- server actions
- current Supabase migrations
- reusable components

### Auth and Staff Access Agent

Owns login/signup/team join/staff invite/lifting coach account flow.

Initial focus:

- `use-baseball-auth.ts`
- `auth-store.ts`
- `actions/auth.ts`
- `actions/onboarding.ts`
- `actions/teams.ts`
- `/baseball/join/[code]`
- staff invite capability model

### Supabase and RLS Agent

Owns schema, RLS, migrations, generated types, and data safety.

Initial focus:

- existing `baseball_*` tables
- player/team/staff membership
- source registry
- import run tables
- performance/lifting tables
- AI source refs
- role visibility tests

### UI Systems Agent

Owns premium cream/green interface quality.

Initial focus:

- app shell consistency
- dense coach desktop UI
- mobile player UI
- source drawers
- stat visuals
- performance dashboards
- command center itself

### Stats and Integrations Agent

Owns stats universe and import adapters.

Initial focus:

- official game stats
- scrimmage stats
- development metrics
- pitch/swing/batted-ball facts
- GameChanger XML/CSV
- StatCrew/NCAA/Presto/SIDEARM XML
- TrackMan/Rapsodo/6-4-3/Synergy/TRAQ imports

### Practice and Team Ops Agent

Owns calendar, practice planning, scrimmage lineups, acknowledgements, tasks, and event flows.

Initial focus:

- practice plan generator
- time-slot builder
- drag/drop defensive lineup
- staff assignments
- player groups
- calendar attachment
- game/scrimmage separation

### Performance and Lifting Agent

Owns strength coach dashboard, groups, lifts, readiness, soreness, bodyweight, player lift execution.

Initial focus:

- lifting coach dashboard
- exercise library
- program builder
- live weight room
- player lift screen
- weight history
- readiness/soreness/bodyweight
- pitcher/two-way modifications

### CoachHelm Engine Agent

Owns source-backed baseball intelligence.

Initial focus:

- decision ledger
- Staff Decision Room
- Postgame Action Review
- practice prescription
- practice effectiveness review
- workload/readiness insights
- source citations and confidence

### QA and Visibility Agent

Owns tests, screenshots, command center truthfulness, role checks, and final verification.

Initial focus:

- dashboard opened in Chrome
- typecheck/lint/test status
- route browser checks
- role visibility matrix
- screenshot ledger
- unresolved risk list

### Agent City Systems Agent

Owns the command center implementation itself.

Initial focus:

- local server
- event store
- hook receiver
- git/repo polling
- Agent City view
- Factory Floor
- Flight Recorder
- cream/green visual system

### Risk and Scope Warden

Owns full-throttle visibility, risk classification, and scope drift detection.

Initial focus:

- risky commands
- auth/RLS/migration changes
- product-code-before-Task-0 guard
- protected files
- checkpoint reminders
- kill/freeze controls

### Memory Librarian

Owns decisions, artifacts, compaction notes, and handoff memory.

Initial focus:

- Decision Ledger
- Memory Library
- milestone summaries
- replay artifacts
- final handoff ledger

## Initial Seeded Work Packets

Seed these work packets with percent complete `0`, status `planned`, and weights. The command center must display them from the beginning.

| Packet | Weight | Owner lane | Initial status |
|---|---:|---|---|
| Task 0 - Live Ultracode Command Center | 8 | Orchestrator/UI/QA | active |
| Task 0A - Agent City and Factory Floor UI | 4 | Agent City Systems Agent | active |
| Task 0B - Hook receiver, event store, git watcher, replay state | 4 | Agent City Systems Agent | active |
| Repo audit and current-state map | 7 | Repo Cartographer | planned |
| Auth, login, team join, staff invite | 8 | Auth and Staff Access Agent | planned |
| Staff roles and capability matrix | 6 | Auth and Staff Access Agent | planned |
| Supabase schema and RLS safety | 10 | Supabase and RLS Agent | planned |
| Source registry and import foundation | 8 | Stats and Integrations Agent | planned |
| Stats Center and official/scrimmage separation | 8 | Stats and Integrations Agent | planned |
| Practice planner, scrimmage lineups, calendar attach | 8 | Practice and Team Ops Agent | planned |
| Performance OS and lifting coach dashboard | 10 | Performance and Lifting Agent | planned |
| Player lift execution and readiness | 6 | Performance and Lifting Agent | planned |
| Coach Command Center | 7 | UI Systems Agent | planned |
| Player Today | 5 | UI Systems Agent | planned |
| Roster, profiles, player timeline | 6 | Repo Cartographer/UI Systems Agent | planned |
| Video event linking and classes conflicts | 5 | Stats and Integrations Agent | planned |
| CoachHelm source-backed intelligence | 9 | CoachHelm Engine Agent | planned |
| Staff Decision Room and action ledger | 6 | CoachHelm Engine Agent | planned |
| Demo seed data | 5 | QA and Visibility Agent | planned |
| QA, tests, screenshots, role visibility | 8 | QA and Visibility Agent | planned |

## Feature Completion Logic

Feature progress must be meaningful. Do not show fake completion based only on elapsed time.

Each packet should calculate progress from checklist items:

- `read_plan`
- `audited_current_repo`
- `designed_contract`
- `schema_ready`
- `server_actions_ready`
- `ui_ready`
- `empty_loading_error_states_ready`
- `source_or_data_traceability_ready`
- `role_visibility_ready`
- `tests_run`
- `browser_verified`
- `risks_resolved`

Not every packet needs every item, but each packet must declare its checklist so the percentage is traceable.

Recommended status weights:

| Checklist state | Percent contribution |
|---|---:|
| Not started | 0 |
| Reading/planning | 10 |
| Audited/current-state verified | 20 |
| Contract designed | 30 |
| Implementation started | 45 |
| UI or server path complete | 65 |
| Integrated with data/roles/source refs | 78 |
| Tests running | 86 |
| Browser/role verified | 95 |
| Done with evidence | 100 |

Display both:

- `completion_percent`
- `confidence_percent`

Completion answers "how much is built." Confidence answers "how sure are we that it is correct."

Confidence should drop when:

- migrations are unverified
- tests are missing
- role visibility is untested
- a source parser is mocked
- no browser screenshot exists for a visual route
- the current repo diverges from plan assumptions

## Required Build Events

Claude must log these events at minimum:

- `command_center_started`
- `command_center_files_created`
- `command_center_server_started`
- `command_center_chrome_opened`
- `command_center_verified`
- `command_center_hook_received`
- `city_district_activated`
- `factory_crate_moved`
- `flight_recorder_event_added`
- `plan_read_started`
- `plan_read_completed`
- `repo_audit_started`
- `repo_audit_completed`
- `packet_started`
- `packet_progress`
- `packet_blocked`
- `packet_unblocked`
- `packet_completed`
- `file_changed`
- `migration_added`
- `table_touched`
- `route_touched`
- `test_started`
- `test_passed`
- `test_failed`
- `browser_check_started`
- `browser_check_passed`
- `browser_check_failed`
- `risk_added`
- `risk_resolved`
- `handoff_note`

## Required Initial Visual States

On first open, before any repo work is done, the dashboard should show:

- command center status as active
- V12 gate as in progress
- all planned agent lanes
- all planned packets
- Agent City mode visible
- Factory Floor mode visible
- Control Tower visible
- QA Lab visible
- Flight Recorder visible
- read order stack: V12, V11, V10, V9, V8, V7, V6, older V2 layers
- "No tests run yet" as an honest state
- "No migrations changed yet" as an honest state
- "No product files changed yet" as an honest state
- current local repo path
- current command center URL
- current git branch if available

## What Makes It Cool

Add tasteful, useful visual concepts:

- Agent lane cards with live heartbeat, current focus, queue depth, and recently touched files.
- A feature stadium board showing packet progress like a scoreboard, grouped by BaseballHelm subsystem.
- A cream/green Agent City where districts represent Prompt Plaza, Planning Hall, Code Quarry, Component Foundry, Backend Machine Shop, Data District, Integration Harbor, QA Lab, Control Tower, Git Depot, Shipping Dock, Memory Library, Observatory, and Broadcast Center.
- A Factory Floor task conveyor where BaseballHelm packets move from planned to shipped.
- Worktree islands and commit trains if worktrees/commits are detected.
- Context Reactor and Memory Library cards for plan reads, compaction notes, and milestone summaries.
- A build diamond map where bases represent Audit, Schema, Product, QA, and runners advance only when evidence exists.
- A source-to-action rail showing whether imports, stats, video, lifting, practice, and CoachHelm loops are wired.
- A live event ribbon with filters by agent, feature, file, table, route, test, and risk.
- A "What changed since last glance" panel.
- A "Risk radar" that separates schema risk, UI risk, auth risk, role/privacy risk, and integration risk.
- A "Confidence ledger" that explains why each packet is or is not trustworthy.
- A "Chrome verification card" showing the dashboard URL, server health, last heartbeat, and gate status.
- A "Next three actions" panel generated from the current backlog and risk state.
- A "Screenshots and proof" wall for browser verifications as they happen.

Use motion sparingly:

- subtle pulse for live status
- smooth tab transitions
- progress bars that animate on real value changes
- event stream rows that slide/fade in
- no flashing, no distracting arcade effects, and respect reduced motion

## Done Definition For Task Zero

Task Zero is done only when:

- the command center files exist
- the command center starts locally
- the dashboard loads in Chrome
- the UI is cream/green and does not use black/dark theme as the primary visual system
- Agent City, Factory Floor, Control Tower, QA Lab, Codebase City, Agent Cockpit, Flight Recorder, Memory Library, and Handoff Ledger are visible
- seeded agents and work packets render
- live events render or poll correctly
- hook receiver and hook bridge exist
- git/repo status renders
- replay state exists
- local repo status renders
- at least one command center verification event is logged
- the command center shows Task 0 as complete
- Claude reports the URL and then continues into V11/V10/V9 reading

If the command center cannot be opened in Chrome, Claude must not proceed silently. It must fix the issue or record an explicit blocker.
