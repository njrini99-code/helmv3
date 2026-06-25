# V12 Agent City BaseballHelm Adaptation

This file adapts `source_ultracode_agent_city_command_center_spec.md` into the required BaseballHelm Task 0 implementation.

The source spec is binding for ambition, interaction depth, live wiring, observability, replay, safety, and the "little working city" metaphor. This adaptation is binding for BaseballHelm-specific scope, visual direction, implementation cutline, and the no-black cream/green brand requirement.

## Core Instruction

Claude must build the BaseballHelm Ultracode Command Center as an Agent City / Factory Floor experience before starting BaseballHelm product implementation.

It must not be a basic dashboard. It must feel like a premium autonomous software factory running inside `Downloads/helmv3`, with BaseballHelm-specific work packets, BaseballHelm agent lanes, BaseballHelm repo/subsystem districts, and live evidence that the build is actually progressing.

## Visual Override: No Black

The source Agent City spec mentions dark control-room styling. For BaseballHelm, override that.

Do not use:

- black backgrounds
- near-black app chrome
- cyberpunk navy/black
- generic dark SaaS dashboard styling
- neon-on-black terminal aesthetics
- all-black panels with green text

Use:

- cream canvas
- parchment/off-white surfaces
- deep green structure
- turf green accents
- warm tan/gold active states
- clay/amber risk states
- muted teal informational states
- ink text
- soft olive shadows
- fine green/cream grid lines

The result should feel like GolfHelm's premium cream/green world translated into a BaseballHelm build-operations city.

Recommended tokens:

```css
:root {
  --city-cream-0: #fffdf6;
  --city-cream-50: #fcf8ec;
  --city-cream-100: #f4ecd8;
  --city-cream-200: #e7dcc2;
  --city-ink: #122018;
  --city-ink-muted: #425246;
  --city-green-950: #0e2a1d;
  --city-green-900: #123522;
  --city-green-800: #17432d;
  --city-green-700: #1f5b3d;
  --city-green-600: #2c7650;
  --city-turf: #3c9361;
  --city-mint: #dcefe3;
  --city-gold: #c8a24a;
  --city-tan: #d6c393;
  --city-clay: #b86a3d;
  --city-amber: #b88916;
  --city-red: #b84035;
  --city-teal: #3f7775;
  --city-line: rgba(18, 32, 24, 0.12);
  --city-line-strong: rgba(18, 53, 34, 0.24);
  --city-shadow-soft: 0 18px 45px rgba(18, 53, 34, 0.12);
  --city-shadow-lifted: 0 28px 80px rgba(18, 53, 34, 0.18);
}
```

Allowed dark accents:

- deep green headers
- deep green text
- deep green outlines
- small dark-green terminal blocks if absolutely needed for command output

Even terminal blocks should sit inside cream/green shells and should not make the whole product read as black.

## Required Product Identity

Use:

- Product name: `BaseballHelm Ultracode Command Center`
- Main visual mode: `Agent City`
- Process mode: `Factory Floor`
- Risk mode: `Control Tower`
- Deep-dive mode: `Agent Cockpit`
- Repo mode: `Codebase City`
- Replay mode: `Flight Recorder`

Secondary labels:

- `Build City`
- `BaseballHelm Build OS`
- `Factory Floor`
- `Mission Control`

## Fully Wired Means Fully Wired

Claude must not ship a static mock.

Task 0 is complete only when the command center has real local wiring:

- local server running from the repo
- Chrome opened to the command center URL
- health endpoint working
- event ingestion working
- event log persisted
- summary state persisted
- seeded agents visible
- seeded work packets visible
- live event timeline updating
- git status visible
- changed files visible
- test/proof state visible
- risk state visible
- command center verification event logged
- later packets required to log progress events

The ideal first version should also include:

- Git watcher or periodic git polling
- file watcher or periodic file-status reconciliation
- hook receiver endpoint
- command/event CLI helper
- browser screenshot/proof slot
- checkpoint/risk logging
- replay data structure, even if full visual replay is first shipped as event playback

## Recommended Implementation Level For Task 0

For this BaseballHelm one-shot, build a local web command center first. Do not attempt a full Tauri desktop app before BaseballHelm work begins.

Required now:

- Local Node server
- Static premium web UI
- SSE or WebSocket live events
- Append-only event log
- JSON state summaries
- Git/repo polling
- Event CLI helper
- Hook receiver endpoint
- Agent City view
- Factory Floor view
- Control Tower view
- Test/Proof Lab
- Flight Recorder event replay

Allowed after the main BaseballHelm build:

- Tauri shell
- SQLite/Drizzle persistence
- PixiJS full isometric renderer
- Monaco diff viewer
- xterm terminal replay
- OpenTelemetry collector
- full Claude hook installation into global user settings

However, the visual should still look like an Agent City on day one. Use SVG/CSS/HTML/Canvas as needed to create districts, roads, task crates, agent pods, risk radar, and activity flows without waiting for a heavy graphics stack.

## BaseballHelm City Districts

Translate the source spec's city districts into BaseballHelm build districts.

### Prompt Plaza

Mission contract for BaseballHelm V2.

Shows:

- current mission
- Task 0 gate
- Phase 0 and Phase 1 cutline
- forbidden scope
- required read order
- definition of done
- no-main-work-before-command-center rule

### Planning Hall

Shows the BaseballHelm work packet DAG.

Includes:

- V12 Command Center
- V11 auth/team join/staff/lifting
- V10 premium UI/stat visuals/CoachHelm corrections
- V9 subsystem work packets
- V8 AutoSync strategy
- V7 practice/stats acquisition/lifting workflows
- V6 stats/video/classes/CoachHelm deep dive

### Agent Residential Tower

Shows all build agents:

- Orchestrator
- Repo Cartographer
- Auth and Staff Access Agent
- Supabase and RLS Agent
- UI Systems Agent
- Stats and Integrations Agent
- Practice and Team Ops Agent
- Performance and Lifting Agent
- CoachHelm Engine Agent
- QA and Visibility Agent
- Agent City Systems Agent
- Risk and Scope Warden
- Memory Librarian

Each agent shows:

- state
- task
- district
- files touched
- tables touched
- routes touched
- tests
- risk events
- context/notes
- last meaningful update

### Code Quarry

Shows repo reading/searching.

BaseballHelm lenses:

- `src/app/baseball`
- `src/components/baseball`
- `src/hooks/use-baseball-auth.ts`
- `src/app/baseball/actions`
- `src/lib/coachhelm`
- `src/lib/baseball`
- `supabase/migrations`
- `supabase/migrations_archive/pre_20260527`
- `supabase/tests/rls`

Show worn paths for files repeatedly read or searched.

### Component Foundry

Shows frontend build work.

BaseballHelm component lines:

- Coach Command Center
- Player Today
- Staff invite/settings
- Practice planner
- Scrimmage lineup builder
- Stats Center
- Import Dossier
- Performance/Lifting Dashboard
- Player lift execution
- CoachHelm cards
- Source drawers
- Command Center itself

### Backend Machine Shop

Shows server logic:

- server actions
- auth actions
- team join actions
- staff invite actions
- import parser actions
- practice actions
- lifting actions
- CoachHelm generators
- read models

### Data District

Shows Supabase work:

- existing tables verified
- migrations added
- RLS policies touched
- generated types
- import/source tables
- staff/capability tables
- performance/lifting tables
- stat fact/source-ref tables
- AI source/confidence tables

This district must show planned versus actually created tables clearly.

### Integration Harbor

Shows import/source readiness:

- GameChanger college XML
- GameChanger season CSV
- StatCrew XML
- NCAA/Presto/SIDEARM XML
- TrackMan
- Rapsodo
- 6-4-3 Charts
- Synergy
- TRAQ
- TeamBuildr
- Teamworks classes
- ArmCare
- OnForm
- Google Sheets
- generic CSV/XLSX/PDF/manual review

Ships arriving at harbor are not direct APIs unless credentials exist. Label direct sync as deferred when appropriate.

### QA Lab

Shows:

- typecheck
- lint
- unit tests
- integration tests
- RLS tests
- Playwright/browser checks
- screenshot checks
- accessibility checks
- role visibility checks
- command center Chrome verification

Failed checks create repair bay tickets.

### Permission Control Tower

Shows full-throttle risk:

- auth edits
- RLS edits
- migrations
- deletes
- package installs
- shell commands
- files outside mission scope
- commands outside repo
- `.env`/secret risk
- large diffs
- generated file churn

The tower must include visible pause/kill/freeze/checkpoint controls even if they initially log intent rather than programmatically controlling Claude.

### Git Depot

Shows:

- branch
- dirty state
- changed files
- diff stat
- worktrees
- merge/conflict state
- checkpoints
- commit trains
- final handoff status

### Shipping Dock

Shows:

- packets done
- artifacts ready
- tests passed
- risks resolved
- final handoff bundle
- zip/package status when relevant

### Memory Library

Shows:

- decisions
- scope corrections
- plan read completion
- milestone summaries
- compaction notes if available
- final packet summaries
- build handoff ledger

### Observatory

Shows:

- elapsed time
- tool/event volume
- file churn
- repeated searches
- risk velocity
- test pass rate
- context/memory pressure when available
- progress versus confidence

### Broadcast Center

Shows a human-readable feed:

- what changed
- what is running
- what failed
- what is blocked
- what is next

Raw JSON remains available but is not the primary user experience.

## Required Modes/Tabs

The final Task 0 command center must include these named modes or tabs:

1. `Mission Control`
2. `Agent City`
3. `Factory Floor`
4. `Agent Tower`
5. `Agent Cockpit`
6. `Codebase City`
7. `Control Tower`
8. `Data District`
9. `Integration Harbor`
10. `QA Lab`
11. `Context Reactor`
12. `Decision Ledger`
13. `Memory Library`
14. `Flight Recorder`
15. `Handoff Ledger`

Existing V12 tabs such as Feature Scoreboard, Repo Pulse, Supabase Tower, Test and Proof Lab, CoachHelm Intelligence Monitor, Performance Build Room, and Practice/Game Ops Room may appear as sections inside these modes or as additional tabs.

## BaseballHelm-Specific Agent City Visuals

Use the source spec's living-city metaphor, but make it BaseballHelm-specific:

- Cream blueprint floor instead of black control-room floor.
- Deep green district outlines.
- Turf-green active roads.
- Gold task crates for active build packets.
- Clay/amber risk pings.
- Data District uses migration cranes and table towers.
- Integration Harbor uses docks for stat/video/lift/class imports.
- QA Lab uses green lights for passing checks and clay smoke for failing checks.
- Performance/Lifting work should animate through a weight-room/factory district.
- Practice/Game Ops work should animate through a field-planning district.
- CoachHelm work should animate through an intelligence observatory.
- Completed milestones move to the Shipping Dock and Memory Library.

Do not make it childish. It should feel like a high-end technical operations map with subtle sports-program flavor.

## Event-To-City Mapping

Use this mapping at minimum:

| Event | BaseballHelm City Action |
|---|---|
| `command_center_started` | City boots and Prompt Plaza lights up |
| `command_center_verified` | Task 0 Gate opens |
| `plan_read_started` | Planning Hall opens source folders |
| `plan_read_completed` | Mission contract locks |
| `repo_audit_started` | Code Quarry agents begin scanning |
| `file_read` / `grep` | Building revealed in Codebase City |
| `file_changed` | File building pulses gold |
| `route_touched` | Road/pipe lights up |
| `migration_added` | Data District crane moves |
| `table_touched` | Table tower lights up |
| `policy_touched` | Control Tower radar ping |
| `risk_added` | Clay/amber radar blip |
| `risk_resolved` | Radar blip moves to archive |
| `test_started` | QA machine starts |
| `test_passed` | QA machine powers district lights |
| `test_failed` | Repair Bay ticket appears |
| `browser_check_passed` | Screenshot/proof card moves to QA Lab |
| `packet_started` | Task crate enters Factory Floor |
| `packet_progress` | Task crate advances |
| `packet_blocked` | Conveyor stop marker appears |
| `packet_completed` | Crate ships to dock and Memory Library |
| `handoff_note` | Broadcast Center publishes update |

## Required Real Wiring For Task 0

Claude should create:

```text
scripts/baseballhelm-command-center.mjs
scripts/baseballhelm-build-event.mjs
scripts/baseballhelm-command-center-hook.mjs
tools/baseballhelm-command-center/index.html
tools/baseballhelm-command-center/styles.css
tools/baseballhelm-command-center/app.js
.ultracode/baseballhelm/events.ndjson
.ultracode/baseballhelm/state.json
.ultracode/baseballhelm/agents.json
.ultracode/baseballhelm/work-packets.json
.ultracode/baseballhelm/risks.json
.ultracode/baseballhelm/qa.json
.ultracode/baseballhelm/decisions.json
.ultracode/baseballhelm/artifacts.json
.ultracode/baseballhelm/replay.json
.ultracode/baseballhelm/handoff.json
.ultracode/baseballhelm/screenshots/
```

The server should expose:

```text
GET  /
GET  /api/health
GET  /api/state
GET  /api/events
GET  /api/repo
GET  /api/replay
GET  /api/artifacts
POST /api/events
POST /hooks/claude
GET  /events
```

If SSE is easier than WebSockets, use SSE. If both are easy, use SSE first and keep the protocol simple.

## Hook Integration Requirement

The command center must include a hook receiver and a hook script.

Claude should not rely only on manual event logging. Manual `baseballhelm-build-event.mjs` logging is required, but hook receiver support is also required so future Claude Code hook events can flow into the city.

Minimum hook support:

- `POST /hooks/claude`
- `scripts/baseballhelm-command-center-hook.mjs`
- normalize payload into command-center events
- never crash Claude if receiver is offline
- preserve raw payload in event metadata

The docs should include an example Claude settings snippet or a `docs/COMMAND_CENTER_HOOKS.md` file generated by Claude during Task 0 showing how to install the hook.

## Watcher Requirement

The command center must reconcile with the repo even if events are missed.

Minimum:

- poll `git status --short`
- poll `git diff --stat`
- poll `git diff --name-only`
- optionally use `fs.watch` or a lightweight file watcher
- map changed files into Codebase City districts

Do not require a third-party package if package install would slow Task 0. Native Node polling is acceptable.

## Risk System Requirement

The command center must classify and display risk.

Initial deterministic risk rules:

- `auth`, `middleware`, `rls`, `policy`, `supabase/migrations` paths are high attention.
- `rm -rf`, `git reset --hard`, `git checkout --`, force push, table drops, broad deletes, commands outside repo are high/critical.
- `.env`, secret, token, credential reads are high/critical.
- package installs are medium.
- generated type churn is medium.
- product code edits before Task 0 verification are critical.

The UI must show risk as:

- Control Tower radar blip
- risk card
- timeline event
- affected files/tables/routes
- suggested mitigation/checkpoint

## Kill Switch Requirement

The command center must show a persistent kill/freeze area.

At Task 0, the buttons may record requested actions if they cannot directly control Claude:

- pause all agents
- freeze file writes
- freeze shell commands
- checkpoint now
- export handoff

But the UI must clearly say whether the control is active control or logged intent. Do not fake control.

## Flight Recorder Requirement

Create a basic replay model from the beginning.

Minimum:

- event list sorted by timestamp
- scrubber over events
- filter by agent/packet/file/risk/test
- jump to first failure
- jump to first edit of a file
- export replay JSON

Full animated timelapse can be a later enhancement, but the data structure and UI mode must exist before BaseballHelm product work starts.

## Context Reactor Requirement

Show context/memory state honestly.

If direct context/token metrics are not available, show:

- unavailable state
- manual milestone capsules
- plan-read completion
- handoff notes
- compaction events if hooks provide them
- file revisit count as a proxy for navigation drag

Do not invent token usage.

## Progress Must Be Earned

Completion cannot be based on vibes.

BaseballHelm packet progress must derive from:

- required plan read
- current repo audit evidence
- schema/action/component implementation
- files touched
- tests run
- browser proof
- role visibility proof
- risk resolution
- handoff artifacts

Confidence must drop when:

- tests missing
- browser proof missing
- RLS not checked
- source refs missing
- role visibility untested
- packet has open high risk
- no recent meaningful progress

## Chrome Verification Requirement

Before main BaseballHelm work starts, Claude must:

1. Start the command center.
2. Open it in Google Chrome.
3. Verify health endpoint.
4. Verify seeded agents and packets render.
5. Log `command_center_verified`.
6. Set Task 0 to complete.
7. Report URL.
8. Continue into V11/V10/V9 reading while logging events.

If Chrome cannot be opened or the dashboard does not render, Claude must fix it before moving forward.

## Premium Acceptance Checklist

Task 0 is acceptable only if:

- It looks premium in cream/green.
- It uses no black/dark overall theme.
- Agent City is present.
- Factory Floor task conveyor is present.
- Control Tower risk system is present.
- QA Lab is present.
- Codebase City/repo map is present.
- Agent Cockpit is present.
- Flight Recorder is present.
- Decision Ledger or Memory Library is present.
- Local telemetry is wired.
- Hook receiver is present.
- Git/repo status is present.
- Chrome is opened and verified.
- Events update the UI.
- It remains running while the main build proceeds.

## What To Cut If Time Gets Tight

Do not cut the wiring.

If Task 0 needs to stay efficient, simplify visuals first:

- use CSS/SVG city rather than PixiJS
- use event replay list rather than full timelapse
- use native Node polling rather than package installs
- use a simple graph instead of React Flow
- use static agent icons instead of sprite animation

Never cut:

- Chrome verification
- event ingestion
- git/repo status
- seeded agents/packets
- risk cards
- tests/proof state
- source work packet state
- no-black cream/green visual system

## BaseballHelm Task 0 Final Prompt Delta

Claude should treat this as the first paragraph of the build prompt:

```text
Before any BaseballHelm implementation, build the BaseballHelm Ultracode Command Center as a cream/green Agent City / Factory Floor command view. Use the attached UltraCode Agent City source spec as the ambition reference, but override its dark palette: no black or dark control-room theme. Build a local server, hook receiver, event logger, git/repo watcher, seeded agent/work-packet telemetry, Agent City, Factory Floor, Control Tower, QA Lab, Codebase City, Agent Cockpit, Flight Recorder, Memory Library, and Handoff Ledger. Open it in Google Chrome and verify it works before touching app product code. Log command_center_verified, then keep updating the dashboard throughout the entire BaseballHelm build.
```

