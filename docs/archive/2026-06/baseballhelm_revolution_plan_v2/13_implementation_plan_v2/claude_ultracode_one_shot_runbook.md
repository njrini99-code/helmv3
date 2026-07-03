# Claude Ultracode One-Shot Runbook

## Purpose

This runbook turns the V2 strategy package into an executable Claude Ultracode session. It is intentionally stricter than the broad product plan.

The V12 live Ultracode Command Center layer is now the first layer for this runbook. Claude should read `27_live_ultracode_command_center_v12/README.md`, `source_ultracode_agent_city_command_center_spec.md`, `v12_agent_city_baseballhelm_adaptation.md`, `v12_claude_task_zero_live_command_center.md`, `v12_command_center_ui_ux_and_tabs.md`, `v12_telemetry_contract_agent_visibility.md`, and `v12_chrome_open_acceptance_gate.md`, then execute Task 0 before the main build. After the cream/green no-black Agent City command center is fully wired, opened in Chrome, and verified with `command_center_verified`, Claude should read `26_final_auth_lifting_current_app_v11/README.md`, `v11_auth_team_join_staff_roles.md`, `v11_strength_coach_premium_lifting_system.md`, `v11_current_baseballhelm_context_for_claude.md`, and `v11_claude_final_touch_execution_prompt.md` before V10. Then Claude should read `25_premium_ui_coachhelm_v10/README.md`, `v10_repo_grounding_and_golfhelm_translation.md`, `v10_premium_ui_system_by_tab.md`, `v10_baseball_stat_visual_contracts.md`, `v10_advanced_coachhelm_engine_and_integrations.md`, and `v10_claude_prompt_delta_and_scope_corrections.md` before V9. Then Claude should read `24_subsystem_execution_blueprint_v9/README.md`, `v9_tab_by_tab_subsystem_plan.md`, `v9_integration_adapter_contracts.md`, `v9_cross_subsystem_data_signal_action_map.md`, and `v9_claude_work_packet_backlog.md` before applying the packet list below.

## The Build Thesis

BaseballHelm should win as an import-first, baseball-specific operating layer for college programs. It should not attempt to replace Teamworks, TRAQ, TeamBuildr, GameChanger, or TrackMan. It should ingest or attach the outputs coaches already have and convert them into daily decisions, player timelines, staff meetings, practice adjustments, and player action items.

## One-Shot Deliverable

Build Task 0, Phase 0, and Phase 1 only.

Task 0:

- create the BaseballHelm Ultracode Command Center
- implement Agent City and Factory Floor modes from the source spec, adapted to cream/green BaseballHelm with no black theme
- wire local telemetry under `.ultracode/baseballhelm/`
- add hook receiver, hook bridge, git/repo watcher or polling, risk classifier, and Flight Recorder state
- seed agent lanes and work packets from V12/V11/V10/V9/V8/V7/V6
- open it in Google Chrome
- verify it with a health check and `command_center_verified`
- log all later packet progress into the command center

Phase 0:

- audit repo
- lock navigation/capability model
- isolate old recruiting gravity
- verify schema and migration safety
- create shared route state primitives

Phase 1:

- Command Center
- Signal Inbox and source-to-action lifecycle
- Player Today
- Roster/Profile/Timeline
- Calendar acknowledgements
- Practice Planner Lite
- Stats Center Lite
- Performance Lite
- Video Evidence foundation
- Import Center MVP
- embedded CoachHelm AI cards
- integration adapter settings and source registry
- premium stat visuals, source drawers, Staff Decision Room, and practice-effectiveness review from V10
- demo data
- QA evidence

## Claude Work Packets

### Packet 0 - Live Ultracode Command Center

Claude must build this before the repo audit.

Required output:

- `scripts/baseballhelm-command-center.mjs` or equivalent local server
- `scripts/baseballhelm-build-event.mjs` or equivalent event logger
- `scripts/baseballhelm-command-center-hook.mjs` or equivalent hook bridge
- `tools/baseballhelm-command-center/` dashboard files
- `.ultracode/baseballhelm/` seeded telemetry
- hook receiver endpoint
- Git/repo polling
- risk classifier
- basic replay state
- Chrome-open verification
- `command_center_verified` event

Required dashboard tabs:

- Mission Control
- Agent City
- Factory Floor
- Agent Field
- Agent Cockpit
- Codebase City
- Control Tower
- Feature Scoreboard
- Repo Pulse
- Supabase Tower
- Build Timeline
- Test and Proof Lab
- QA Lab
- Context Reactor
- Decision Ledger
- Memory Library
- Flight Recorder
- CoachHelm Intelligence Monitor
- Integration Radar
- Performance Build Room
- Practice and Game Ops Room
- Handoff Ledger

Acceptance:

- Chrome shows the cream/green BaseballHelm command center.
- Ten agent lanes render.
- V11/V10/V9/V8/V7/V6 work packets render.
- Feature completion and confidence are visible.
- Repo status is visible.
- Tests and migrations show honest not-run/not-changed states.
- Event stream has at least one event.
- The command center remains running while the build proceeds.

### Packet A - Audit and Plan

Claude must inspect the actual repo and produce a short written audit before editing.

Required audit sections:

- current routes
- current auth and role model
- current baseball tables and generated types
- reusable components
- old recruiting/watchlist surfaces
- missing route states
- technical debt that can block Phase 1
- V9 subsystem gaps by tab and integration

### Packet B - Schema and RLS

Claude should add the smallest set of tables needed for traceability and workflows.

Priority tables:

- `baseball_sources`
- `baseball_player_external_ids`
- `baseball_import_runs`
- `baseball_import_files`
- `baseball_import_rows`
- `baseball_import_mappings`
- `baseball_import_player_matches`
- `baseball_import_warnings`
- `baseball_player_timeline_events`
- `baseball_signals`
- `baseball_signal_sources`
- `baseball_staff_actions`
- `baseball_event_acknowledgements`
- `baseball_practices`
- `baseball_practice_blocks`
- `baseball_practice_attendance`
- `baseball_video_events`
- `baseball_ai_insight_sources` or equivalent extension of existing insights

Conditional tables after live schema check:

- availability statuses
- wellness check-ins
- lift assignments/results
- class schedule conflicts
- pitch/swing/batted-ball/development fact tables
- practice effectiveness reviews
- AutoSync endpoint/status tables

### Packet C - Navigation and Capabilities

Create a narrow role/capability model:

- head coach
- assistant coach
- pitching coach
- hitting coach
- strength staff
- director of ops
- academic viewer
- player
- admin

Every screen should check capability, not just generic user role.

Use the tab ownership and permission boundaries in `24_subsystem_execution_blueprint_v9/v9_tab_by_tab_subsystem_plan.md` and `24_subsystem_execution_blueprint_v9/v9_cross_subsystem_data_signal_action_map.md`.

### Packet D - Core Screens

Build screens in this order:

1. Command Center
2. Signal Inbox
3. Player Today
4. Player Profile and Timeline
5. Import Center
6. Practice Planner Lite
7. Performance Lite
8. Video Evidence
9. Staff Decision Room

### Packet E - AI

Implement AI as structured cards, not chatbot-first UI.

Every AI card needs:

- title
- source references
- confidence
- summary
- recommended action
- owner or role visibility
- dismiss/resolve status
- action conversion target when applicable
- explicit limitations when sample/source is weak

### Packet F - Demo Data and QA

Seed a realistic college baseball demo:

- 35-42 players
- pitchers, hitters, two-way players, injured/limited players
- games and practices
- lift completions
- wellness check-ins
- academic conflicts
- messy CSV import examples
- AI flags that prove the product story
- video evidence links/uploads
- practice effectiveness before/after examples
- source trust and import review examples

QA must verify:

- coach sees staff-only data
- player does not see staff-only data
- strength staff sees performance but not private academic detail
- academic viewer sees conflicts but not private performance notes
- import rollback works
- AI source refs render

## Stop Conditions

Claude should stop and ask for direction only if:

- the V12 command center cannot be created, run, opened in Chrome, or verified after reasonable local fixes
- generated Supabase types are missing or stale and cannot be regenerated
- existing schema conflicts with required RLS in a way that risks data exposure
- the app cannot install or typecheck because of unrelated repo breakage
- migrations cannot be validated locally and would be risky to guess

Otherwise, Claude should keep moving.

## Success Definition

The session is successful when the app has a coherent Phase 1 BaseballHelm experience with a small number of polished screens, traceable imports, role-safe visibility, source-cited AI, premium baseball stat visuals, practice-effectiveness measurement, and a demo story that makes the product immediately legible to a college baseball staff.
