# V10 Claude Prompt Delta And Scope Corrections

## Purpose

This file is the exact correction layer Claude should read after V9 and before implementation. It resolves older wording that could cause generic AI output, shallow UI, or baseball-inaccurate workflows.

## V10 Supersedes These Older Phrases

If older files mention any of the following, Claude must replace the idea with the V10 wording:

| Older phrase | V10 replacement |
|---|---|
| meeting points generation | Staff Decision Room with source-backed agenda filters, decision ledger, and staff action queue |
| talking points | sourced decision items and action cards |
| AI talking points | source-backed action recommendations |
| meeting summary generation | decision ledger and action outcome capture |
| practice summary generation | practice effectiveness review and human-entered completion capture |
| summarize practice recap | measure practice effectiveness from planned block, attendance, later data, and confidence |
| generic game recap | Postgame Action Review |
| Staff Meeting Mode as generated prose | Staff Decision Room as a decision workspace |
| AI as chatbot tab | embedded structured CoachHelm cards and source drawers |

Game recaps may exist only as source-backed Postgame Action Review cards. Practice recaps may exist only as human-entered completion notes and effectiveness measurement, not generated narrative summary.

## New Claude Read Order

Claude must read this V10 folder first, then V9, then older files.

1. `docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/README.md`
2. `docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_repo_grounding_and_golfhelm_translation.md`
3. `docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_premium_ui_system_by_tab.md`
4. `docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_baseball_stat_visual_contracts.md`
5. `docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_advanced_coachhelm_engine_and_integrations.md`
6. `docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_claude_prompt_delta_and_scope_corrections.md`
7. `docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/README.md`
8. `docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/v9_tab_by_tab_subsystem_plan.md`
9. `docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/v9_integration_adapter_contracts.md`
10. `docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/v9_cross_subsystem_data_signal_action_map.md`
11. `docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/v9_claude_work_packet_backlog.md`
12. `docs/baseballhelm_revolution_plan_v2/20_stats_integrations_coachhelm_deep_dive_v6/README.md`
13. `docs/baseballhelm_revolution_plan_v2/22_deeper_workflows_research_v7/README.md`
14. `docs/baseballhelm_revolution_plan_v2/23_autosync_strategy_v8/README.md`
15. `docs/baseballhelm_revolution_plan_v2/15_final_agent_prompts_v2/CLAUDE_ULTRACODE_MASTER_PROMPT.md`

## Claude Prompt Delta

Paste this block into the master Claude prompt after the opening "Read these files first" section:

```text
V10 is the controlling premium UI and Baseball CoachHelm correction layer. Read it before V9 and before implementing any UI, stats, imports, practice, video, lifting, or CoachHelm work.

V10 supersedes any older request for generated meeting points, talking points, meeting summaries, or practice-summary generation. Do not build those as generated AI features. Build Staff Decision Room, Decision Ledger, Staff Action Queue, Player Development Briefs, Postgame Action Review, Practice Prescription, and Practice Effectiveness Review instead.

Work from the live GolfHelm architecture in `Downloads/helmv3`:

- `src/components/fairway/app-shell/*`
- `src/components/fairway/charts/*`
- `src/components/fairway/pages/coachhelm/*`
- `src/components/fairway/pages/calendar/*`
- `src/app/golf/actions/stats-intelligence.ts`
- `src/lib/coachhelm/v2`
- `src/lib/coachhelm/v3`

Translate those patterns into BaseballHelm-specific components, tokens, routes, and facts. Do not copy golf labels, golf metrics, or golf assumptions.

The BaseballHelm UI must be premium because it is efficient and source-backed:

- Command Center shows what changed, who needs attention, what today requires, and what action to take.
- Signals show source, evidence, confidence, status, owner, and action conversion.
- Stats Lab uses baseball-specific visuals: zone heatmaps, pitch-shape maps, command maps, EV/LA matrix, spray charts, workload overlays, lifting progression, readiness strips, and practice-effectiveness boards.
- Practice Planner includes left time slots, required block headline, optional description, station/player/staff assignments, calendar attachment, and drag/drop scrimmage lineups with defensive position labels.
- Lifting/Performance includes strength coach dashboard, lift presets, player lift logging, bodyweight/load trends, soreness/readiness, pitcher/two-way handling, and future multi-sport-ready settings.
- Video is evidence infrastructure: chart points and CoachHelm signals can open linked clips.
- Imports use source-specific adapters, raw file storage, parser confidence, player matching, validation, commit/rollback, and source drawers.
- Player profiles are snapshots of everything, with role-safe timeline, stats, video, practice, performance, readiness, classes, actions, and source freshness.

Every advanced stat or AI signal must cite source objects and expose sample size/confidence. No starved metric may render as a real 0. Every chart must have a table fallback. Every role boundary must be server-enforced.
```

## Updated Phase 1 Work Packets

### Packet 1: Premium Foundation

Build:

- BaseballHelm design token scope or wrapper around Fairway primitives.
- Baseball command shell.
- Shared source chip.
- Shared confidence chip.
- Shared source drawer.
- Shared chart frame wrapper.
- Shared insufficient-data state.
- Shared action conversion menu.

Acceptance:

- Baseball pages no longer look like a disconnected generic dashboard.
- Shell supports desktop coach density and mobile player clarity.
- Controls meet touch/keyboard/accessibility requirements.

### Packet 2: Source And Import Foundation

Build:

- source registry
- external IDs
- import runs/files/rows/mappings/player matches/warnings
- provider profiles
- raw file storage path contract
- commit/rollback audit path
- source badges and source drawers

Acceptance:

- Existing baseball CSV upload is not the final import system.
- GameChanger/StatCrew/Presto/NCAA XML, Rapsodo, TrackMan, Blast, Diamond Kinetics, Synergy, 6-4-3, TeamBuildr, Teamworks/classes, ArmCare, OnForm, Google Sheets, generic CSV/XLSX/PDF/manual all have adapter settings and source profiles.
- Direct live sync is not required for Phase 1, but the import architecture is ready.

### Packet 3: Command Center And Signals

Build:

- Command Center default coach landing.
- Signals workspace.
- source-backed signal cards.
- staff action queue.
- action conversion.
- player attention grid.
- source health rail.

Acceptance:

- Coach can move from signal to action in two clicks.
- Every signal has source and confidence.
- Staff action queue replaces vague meeting output.

### Packet 4: Player Today And Player Snapshot

Build:

- Player Today.
- Player profile snapshot.
- Role-safe timeline.
- Stats/video/practice/performance panels.
- Player-facing development actions.

Acceptance:

- Player sees only their schedule, assignments, readiness/lift tasks, visible feedback, and approved development actions.
- Staff-only notes, private academic details, and sensitive performance/readiness details do not leak.

### Packet 5: Practice Planner And Scrimmage Workspace

Build:

- practice plan generator from source-backed signals
- left time slot rail
- required headline
- optional description
- station/player/staff assignments
- calendar attachment
- scrimmage lineup builder with positions labeled
- game vs scrimmage stat separation
- practice effectiveness review

Acceptance:

- Coach can create and publish a practice plan.
- Coach can drag players into scrimmage batting orders and defensive positions.
- Practice output can attach to a calendar event.
- Practice effectiveness is measured later with sample/confidence, not auto-summarized.

### Packet 6: Stats Lab And Advanced Visuals

Build:

- official game stats view
- scrimmage stats view
- practice metrics view
- hitting lab
- pitching lab
- catching/defense/baserunning views
- source coverage
- import history
- baseball-specific chart components from V10 visual contracts

Acceptance:

- Coaches can see official vs scrimmage vs practice separately.
- Advanced Rapsodo/TrackMan/Blast/Diamond Kinetics style data has canonical storage and visual targets.
- Every chart has table fallback and source drawer.

### Packet 7: Video Evidence

Build:

- video events
- clip references
- chart-to-video linking
- CoachHelm signal evidence rail
- player-visible clip actions

Acceptance:

- A CoachHelm signal can cite a video clip.
- A chart point can open an evidence clip when source exists.

### Packet 8: Performance And Lifting

Build:

- strength coach dashboard
- lift presets
- lift assignments/results
- player lift UX
- soreness/readiness check-ins
- bodyweight trends
- workload overlays
- pitcher/catcher/two-way handling
- multi-sport-ready settings base

Acceptance:

- Strength coach has a real workflow, not a card.
- Player can log weight used over time.
- Readiness/lift/workload can influence CoachHelm signals with source caveats.

### Packet 9: Baseball CoachHelm Engine

Build:

- metric registry
- generator families
- composite rules
- ranking
- source citations
- output lifecycle
- action outcomes
- practice effectiveness ledger

Acceptance:

- CoachHelm generates source-backed baseball signals for hitting, pitching, catching, defense, baserunning, practice, lifting/readiness, import quality, and video evidence.
- CoachHelm clearly states what it can and cannot infer.

### Packet 10: Decision Room And Reports

Build:

- Staff Decision Room.
- Decision Ledger.
- Staff Action Queue.
- Player Development Brief.
- Postgame Action Review.
- Practice Effectiveness Review.

Acceptance:

- No generated meeting points.
- No generated talking points.
- No meeting-summary generation.
- No practice-summary generation.
- Every report-like surface creates or reviews decisions/actions with source evidence.

## Build Quality Gate

Before final delivery, Claude must verify:

- V10 files were read and followed.
- No new UI uses golf-specific text in BaseballHelm.
- Command Center is the coach default.
- Player Today is the player default.
- Practice plan generator has time slots, headline, optional description, assignments, calendar attachment, and scrimmage lineup.
- Stats distinguish game, scrimmage, practice, and sensor sources.
- Lifting tracks assignment, results, bodyweight/load over time, RPE, soreness, readiness, and player logging.
- Assistant coach accounts and capabilities exist.
- Source drawers appear on import, stat, signal, AI, and video surfaces.
- CoachHelm outputs are source-backed and action-oriented.
- The removed generated outputs are not implemented.
- Role visibility is tested.
- Typecheck/lint/targeted tests are run if available.

## Anti-Slop Bar

Reject the implementation if:

- it only adds cards without workflows
- it only adds AI text without source refs
- it treats Rapsodo/TrackMan as generic CSV
- it merges official games and scrimmages without labels
- it builds practice planning without calendar attachment
- it builds lifting without player logging and weight history
- it hides data quality warnings
- it shows fake zeros
- it copies GolfHelm labels into BaseballHelm
- it ignores assistant coach/staff capability roles
- it makes the player profile a static bio page instead of an operating snapshot

