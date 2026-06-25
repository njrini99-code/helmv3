# Claude Ultracode Master Prompt

```text
You are Claude Ultracode working inside the existing `njrini99-code/helmv3` repo. You are implementing BaseballHelm V2, but only Phase 0 and Phase 1. Do not attempt the entire product roadmap.

Read these files first:

Read the V12 live visibility layer before everything else. V12 is the controlling Task 0 layer. Before repo audit, migrations, auth edits, UI edits, stats work, lifting work, or CoachHelm work, create the BaseballHelm Ultracode Command Center as a fully wired cream/green Agent City / Factory Floor interface, wire local telemetry, start it locally, open it in Google Chrome, verify it, and log `command_center_verified`.

- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/README.md
- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/source_ultracode_agent_city_command_center_spec.md
- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/v12_agent_city_baseballhelm_adaptation.md
- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/v12_claude_task_zero_live_command_center.md
- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/v12_command_center_ui_ux_and_tabs.md
- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/v12_telemetry_contract_agent_visibility.md
- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/v12_chrome_open_acceptance_gate.md

Task 0 is not optional. Build a local cream/green premium command center that uses the Agent City source spec as the ambition reference and the BaseballHelm adaptation as the visual/implementation contract. It must show Mission Control, Agent City, Factory Floor, Agent Tower, Agent Cockpit, Codebase City, Control Tower, Data District, Integration Harbor, QA Lab, Context Reactor, Decision Ledger, Memory Library, Flight Recorder, and Handoff Ledger. It must use no black or generic dark-control-room theme. It must run locally from the `Downloads/helmv3` repo, open in Chrome, and show seeded BaseballHelm work packets before the main build starts.

Fully wired means real local wiring, not a static mock: local server, health endpoint, event ingestion, append-only event log, summary state, hook receiver endpoint, hook bridge script, git/repo watcher or polling, risk classifier, seeded agents/packets, live event timeline, test/proof state, basic Flight Recorder replay state, Chrome verification, and packet progress events for the rest of the BaseballHelm build.

After the V12 command center gate is verified, read the V11 final auth, staff-role, lifting coach, player-lift, and current-app grounding layer. V11 is the controlling layer for login, signup, team joins, staff invites, assistant coach accounts, strength/lifting coach accounts, Performance/Lifting dashboard, player lift delivery, and efficient implementation inside the current `Downloads/helmv3` BaseballHelm app.

- docs/baseballhelm_revolution_plan_v2/26_final_auth_lifting_current_app_v11/README.md
- docs/baseballhelm_revolution_plan_v2/26_final_auth_lifting_current_app_v11/v11_auth_team_join_staff_roles.md
- docs/baseballhelm_revolution_plan_v2/26_final_auth_lifting_current_app_v11/v11_strength_coach_premium_lifting_system.md
- docs/baseballhelm_revolution_plan_v2/26_final_auth_lifting_current_app_v11/v11_current_baseballhelm_context_for_claude.md
- docs/baseballhelm_revolution_plan_v2/26_final_auth_lifting_current_app_v11/v11_claude_final_touch_execution_prompt.md

Then read the V10 premium UI and Baseball CoachHelm correction layer. V10 is the controlling layer for premium UI, advanced stat visuals, GolfHelm-to-BaseballHelm translation, and scope corrections. It supersedes the legacy AI-generation modes named in V10. Build the V10 replacements instead: source-backed action recommendations, Staff Decision Room, Player Development Briefs, Postgame Action Review, Practice Prescription, and Practice Effectiveness Review.

- docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/README.md
- docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_repo_grounding_and_golfhelm_translation.md
- docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_premium_ui_system_by_tab.md
- docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_baseball_stat_visual_contracts.md
- docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_advanced_coachhelm_engine_and_integrations.md
- docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_claude_prompt_delta_and_scope_corrections.md

Then read the V9 execution layer before the older broad strategy files. V9 is the organized implementation map for every tab, subsystem, integration adapter, data loop, permission boundary, and Claude work packet:

- docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/README.md
- docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/v9_tab_by_tab_subsystem_plan.md
- docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/v9_integration_adapter_contracts.md
- docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/v9_cross_subsystem_data_signal_action_map.md
- docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/v9_claude_work_packet_backlog.md

1. docs/baseballhelm_revolution_plan_v2/README.md
2. docs/baseballhelm_revolution_plan_v2/00_v2_index/ULTRACODE_SESSION_STRUCTURE.md
3. docs/baseballhelm_revolution_plan_v2/13_implementation_plan_v2/claude_ultracode_one_shot_runbook.md
4. docs/baseballhelm_revolution_plan_v2/13_implementation_plan_v2/repo_verified_execution_map.md
5. docs/baseballhelm_revolution_plan_v2/07_tab_architecture_v2/recommended_final_navigation.md
6. docs/baseballhelm_revolution_plan_v2/08_data_model_v2/data_model_v2_overview.md
7. docs/baseballhelm_revolution_plan_v2/09_import_system_v2/import_system_v2_strategy.md
8. docs/baseballhelm_revolution_plan_v2/10_coachhelm_ai_v2/coachhelm_ai_v2_strategy.md
9. docs/baseballhelm_revolution_plan_v2/12_phase_plan_v2/phase_1_true_mvp.md
10. docs/baseballhelm_revolution_plan_v2/13_implementation_plan_v2/acceptance_criteria_v2.md
11. docs/baseballhelm_revolution_plan_v2/16_detail_expansion_v2/README.md
12. docs/baseballhelm_revolution_plan_v2/16_detail_expansion_v2/v2_feature_detail_matrix.md
13. docs/baseballhelm_revolution_plan_v2/16_detail_expansion_v2/v2_role_permission_matrix.md
14. docs/baseballhelm_revolution_plan_v2/16_detail_expansion_v2/v2_data_contracts_expanded.md
15. docs/baseballhelm_revolution_plan_v2/16_detail_expansion_v2/v2_import_template_field_dictionary.md
16. docs/baseballhelm_revolution_plan_v2/16_detail_expansion_v2/v2_screen_acceptance_specs.md
17. docs/baseballhelm_revolution_plan_v2/16_detail_expansion_v2/v2_ai_output_contracts.md
18. docs/baseballhelm_revolution_plan_v2/16_detail_expansion_v2/v2_one_shot_quality_gate.md
19. docs/baseballhelm_revolution_plan_v2/17_market_driven_feature_upgrade_v3/README.md
20. docs/baseballhelm_revolution_plan_v2/17_market_driven_feature_upgrade_v3/market_research_feature_takeaways_2026.md
21. docs/baseballhelm_revolution_plan_v2/17_market_driven_feature_upgrade_v3/next_level_feature_systems.md
22. docs/baseballhelm_revolution_plan_v2/17_market_driven_feature_upgrade_v3/one_shot_market_backed_product_spec.md
23. docs/baseballhelm_revolution_plan_v2/17_market_driven_feature_upgrade_v3/feature_depth_requirements_by_surface.md
24. docs/baseballhelm_revolution_plan_v2/17_market_driven_feature_upgrade_v3/anti_slop_quality_rubric.md
25. docs/baseballhelm_revolution_plan_v2/18_massive_program_os_v4/README.md
26. docs/baseballhelm_revolution_plan_v2/18_massive_program_os_v4/v4_current_helmv3_structure_map.md
27. docs/baseballhelm_revolution_plan_v2/18_massive_program_os_v4/v4_complete_program_os_feature_spec.md
28. docs/baseballhelm_revolution_plan_v2/18_massive_program_os_v4/v4_strength_lifting_performance_system.md
29. docs/baseballhelm_revolution_plan_v2/18_massive_program_os_v4/v4_program_type_variants_high_school_college_showcase.md
30. docs/baseballhelm_revolution_plan_v2/18_massive_program_os_v4/v4_settings_admin_integrations_permissions.md
31. docs/baseballhelm_revolution_plan_v2/18_massive_program_os_v4/v4_premium_ui_ux_product_system.md
32. docs/baseballhelm_revolution_plan_v2/18_massive_program_os_v4/v4_implementation_contract_for_massive_build.md
33. docs/baseballhelm_revolution_plan_v2/18_massive_program_os_v4/v4_plan_coverage_and_upgrade_index.md
34. docs/baseballhelm_revolution_plan_v2/19_breakthrough_product_systems_v5/README.md
35. docs/baseballhelm_revolution_plan_v2/19_breakthrough_product_systems_v5/v5_breakthrough_manifesto.md
36. docs/baseballhelm_revolution_plan_v2/19_breakthrough_product_systems_v5/v5_competitive_system_blueprints.md
37. docs/baseballhelm_revolution_plan_v2/19_breakthrough_product_systems_v5/v5_performance_lifting_breakthrough_system.md
38. docs/baseballhelm_revolution_plan_v2/19_breakthrough_product_systems_v5/v5_practice_development_operating_engine.md
39. docs/baseballhelm_revolution_plan_v2/19_breakthrough_product_systems_v5/v5_player_passport_and_recruiting_showcase_system.md
40. docs/baseballhelm_revolution_plan_v2/19_breakthrough_product_systems_v5/v5_ai_automation_and_decision_engine.md
41. docs/baseballhelm_revolution_plan_v2/19_breakthrough_product_systems_v5/v5_premium_interaction_design_spec.md
42. docs/baseballhelm_revolution_plan_v2/19_breakthrough_product_systems_v5/v5_claude_ultracode_delta_prompt.md
43. docs/baseballhelm_revolution_plan_v2/20_stats_integrations_coachhelm_deep_dive_v6/README.md
44. docs/baseballhelm_revolution_plan_v2/20_stats_integrations_coachhelm_deep_dive_v6/v6_current_app_supabase_deep_dive.md
45. docs/baseballhelm_revolution_plan_v2/20_stats_integrations_coachhelm_deep_dive_v6/v6_elite_baseball_stat_universe.md
46. docs/baseballhelm_revolution_plan_v2/20_stats_integrations_coachhelm_deep_dive_v6/v6_stats_data_model_and_import_contract.md
47. docs/baseballhelm_revolution_plan_v2/20_stats_integrations_coachhelm_deep_dive_v6/v6_vendor_integration_matrix.md
48. docs/baseballhelm_revolution_plan_v2/20_stats_integrations_coachhelm_deep_dive_v6/v6_video_classes_automation_system.md
49. docs/baseballhelm_revolution_plan_v2/20_stats_integrations_coachhelm_deep_dive_v6/v6_baseball_coachhelm_engine.md
50. docs/baseballhelm_revolution_plan_v2/20_stats_integrations_coachhelm_deep_dive_v6/v6_agent_efficiency_map.md
51. docs/baseballhelm_revolution_plan_v2/22_deeper_workflows_research_v7/README.md
52. docs/baseballhelm_revolution_plan_v2/22_deeper_workflows_research_v7/v7_research_findings_stats_acquisition.md
53. docs/baseballhelm_revolution_plan_v2/22_deeper_workflows_research_v7/v7_tool_specific_parser_and_storage_strategy.md
54. docs/baseballhelm_revolution_plan_v2/22_deeper_workflows_research_v7/v7_practice_plan_generator_and_scrimmage_lineup_builder.md
55. docs/baseballhelm_revolution_plan_v2/22_deeper_workflows_research_v7/v7_coach_onboarding_assistant_roles_and_accounts.md
56. docs/baseballhelm_revolution_plan_v2/22_deeper_workflows_research_v7/v7_player_profile_snapshot_system.md
57. docs/baseballhelm_revolution_plan_v2/22_deeper_workflows_research_v7/v7_coachhelm_practice_effectiveness_engine.md
58. docs/baseballhelm_revolution_plan_v2/22_deeper_workflows_research_v7/v7_lifting_dashboard_and_multisport_performance_os.md
59. docs/baseballhelm_revolution_plan_v2/22_deeper_workflows_research_v7/v7_cool_efficiency_features_backlog.md
60. docs/baseballhelm_revolution_plan_v2/23_autosync_strategy_v8/README.md
61. docs/baseballhelm_revolution_plan_v2/23_autosync_strategy_v8/v8_autosync_feature_plan.md

Your mission:

Transform the existing baseball product from a mixed recruiting/team-management surface into the Massive BaseballHelm Program OS: a market-backed, source-linked baseball operating platform for college, high school, showcase, and JUCO contexts. It must support staff operations, player daily use, strength/lifting, practice intelligence, stats/postgame review, imports, role-safe settings, source trust, AI, and premium UX at professional engineering scale.

The V6 files are binding for stats, uploads, video, classes, integrations, and Baseball CoachHelm depth. Do not ship shallow batting/pitching CSV upload as the final stats system. BaseballHelm must track official stats, development metrics, pitch/swing/batted-ball events, catching/fielding/baserunning, strength/readiness, classes, video evidence, source trust, import rollback, and evidence-backed CoachHelm actions.

The V7 files are binding for the next workflow depth layer. BaseballHelm must support source-specific stats acquisition, GameChanger college XML and season CSV pathways, StatCrew/Presto/SIDEARM/NCAA XML pathways, tool-specific parsers, game vs scrimmage stat separation, a practice plan generator, drag-and-drop scrimmage lineups with position labels, calendar-attached practice plans, assistant coach accounts, role-based onboarding, player profile snapshots, lifting/weight/soreness tracking, and CoachHelm practice effectiveness analytics.

The V8 AutoSync files are binding for the official stats automation layer. BaseballHelm must be designed as a professional downstream destination for official stat files and feeds: SFTP/FTP, HTTPS upload, post-game email inbox, local sync agent, official XML parsing, raw file storage, provider detection, player matching, validation, confidence-based auto-commit, correction diffs, monitoring, and postgame CoachHelm reports.

Build Phase 0:

- Execute Task 0 from V12 first: create, wire, run, and open the cream/green Agent City BaseballHelm Ultracode Command Center in Chrome. Log `command_center_verified` before changing main BaseballHelm product code.
- Audit current baseball routes, sidebar navigation, auth flow, middleware, current Supabase types, migrations, baseball server actions, and reusable components.
- Write the audit findings before editing code.
- Use `18_massive_program_os_v4/v4_current_helmv3_structure_map.md` as the starting map, then verify it live.
- Identify recruiting/watchlist surfaces that must be hidden, archived, or gated from the Phase 1 team-ops experience.
- Define a canonical capability model for head coach, assistant coach, pitching coach, hitting coach, strength staff, director of ops, academic viewer, player, and admin.
- Define program-type behavior for college, high school, showcase, and JUCO. Do not make them shallow text swaps.
- Verify existing baseball tables before creating migrations.
- Reconcile the current `baseball_stat_uploads` schema/action mismatch before extending stats upload.
- Audit current `baseball_player_stats`, `baseball_player_aggregates`, `baseball_box_score_*`, `baseball_player_classes`, and `baseball_videos` against V6 requirements.
- Add missing loading/error/empty states only for routes touched by Phase 1.

Build Phase 1:

- Coach Command Center as the default coach landing page.
- Signal Inbox with source-backed operational signals.
- Player Today as the default player landing page.
- Source Trust Badges and source drawers on signals, imports, stats, and AI cards.
- Roster, canonical player identity, player profile, and player timeline.
- Calendar/team ops around events, acknowledgements, tasks, and conflict visibility.
- Practice Planner Lite with publish, blocks/stations, attendance, staff assignments, human-entered completion capture, and practice-effectiveness review.
- Practice Plan Generator with time slots on the left, required headline, optional description, station/player/staff assignments, calendar attachment, AI generation from CoachHelm signals, and drag/drop scrimmage lineup builder with defensive position labels.
- Practice Intelligence Board that can convert market-backed signals into practice blocks.
- Login/signup/complete-signup upgrades that preserve existing Baseball auth, preserve invite return paths, handle player and staff invites, resolve active team context, and route assistant coaches/lifting coaches based on staff capabilities.
- Staff account foundation for head coach, assistant coach, pitching coach, hitting coach, catching coach, defensive coach, strength coach, director of ops, analyst, and trainer-style access where enabled.
- Staff invite and capability matrix with role presets, player/group/position scope, audit logging, and server-side/RLS enforcement.
- Stats Center Lite with official stats imports, game logs, season summaries, and source-labeled tables.
- Elite stat foundation: official batting/pitching/fielding/catching/baserunning, development facts, pitch events, swing events, batted-ball events, strength/readiness, class conflicts, and video event references.
- Source-specific import profiles for GameChanger college XML, GameChanger season CSV, StatCrew XML, Presto/SIDEARM/NCAA XML, TrackMan, Rapsodo, 6-4-3, Synergy, TRAQ exports where available, TeamBuildr, Teamworks classes, ArmCare, and generic CSV/XLSX/PDF/manual review.
- Postgame Action Review that turns official stats/imports into source-cited action review, player timeline updates, staff decision items, and practice focus.
- Premium Performance OS foundation with strength coach dashboard, strength groups, exercise library, training block builder, live weight room mode, lift calendar, lift assignments/results, player lift UX, wellness/readiness check-ins, soreness/bodyweight, availability, pitcher/two-way handling, practice impact, imports, and staff action integration.
- Import Dossier MVP with upload, column mapping, player matching, preview, validation, duplicate detection, commit, rollback, audit log, affected objects, and source confidence.
- Embedded CoachHelm AI cards for daily brief, flags, decision ledger suggestions, Postgame Action Review, practice prescriptions, practice-effectiveness review, and import cleanup.
- Baseball CoachHelm engine foundation with source-backed generators for two-strike chase, game-vs-practice contact quality gap, pitcher velocity/command decay, workload/readiness risk, class/lift/practice conflict, and postgame-to-practice focus.
- Practice Effectiveness Engine that measures what was practiced against future practice, scrimmage, and official-game statistical movement with honest sample/confidence language.
- Staff Decision Room driven by signals, timelines, availability, imports, and tasks. Do not generate standalone meeting prose; every recommendation must be source-backed, assignable, and reviewable.
- Settings foundation for program type, roles/capabilities, player access, guardian access, showcase/scout access, import sources, integrations, AI review, notifications, appearance, audit, and demo mode.
- Demo seed data for a realistic college baseball program.

Hard constraints:

- Do not build direct vendor integrations.
- Do not build a recruiting marketplace.
- Do not build a full compliance engine.
- Do not build a full strength platform or large exercise library.
- Do not build a nutrition product.
- Do not create a parallel clean-room schema when existing `baseball_*` tables can be extended.
- Do not implement AI as the primary chatbot tab.
- Do not expose staff-only notes, private academic details, or health-adjacent details to players.
- Do not copy golf-specific CoachHelm assumptions into baseball without renaming and revalidating them.

Implementation requirements:

- Prefer existing routes, actions, hooks, and components where practical.
- Use `src/hooks/use-baseball-auth.ts`, `src/lib/supabase/middleware.ts`, and `src/components/layout/sidebar.tsx` as first auth/nav inspection points.
- Inspect `src/app/baseball/actions`, `src/components/baseball`, `src/lib/queries/baseball-dashboard.ts`, and `src/lib/baseball/csv-utils.ts`.
- Inspect `src/lib/coachhelm/v2`, `src/lib/coachhelm/v3`, `src/app/golf/actions/stats-intelligence.ts`, and the golf insight event ledger before designing Baseball CoachHelm.
- Inspect `supabase/migrations`, `supabase/migrations_archive/pre_20260527`, and `supabase/tests/rls` before writing migrations.
- Separate official game stats from development metrics.
- Create a canonical player external-ID/import matching model.
- Every imported row must be traceable to an import run and rollback-capable.
- Every stat, video clip, class conflict, lift result, and CoachHelm insight must expose source and confidence when available.
- Every vendor/tool source should be handled through import adapters/settings first: GameChanger XML, StatCrew/NCAA XML, Presto/SIDEARM, TrackMan, Rapsodo, Synergy, 6-4-3 Charts, AWRE, Blast, Diamond Kinetics, TeamBuildr, Teamworks, ArmCare, OnForm, Google Sheets, generic CSV/XLSX/PDF/manual.
- Every AI output must cite source objects and store confidence, visibility, generated_at, and disposition.
- Every sensitive write must be auditable.
- Every primary page you touch must have empty, loading, and error states.
- Every role must be tested for visibility boundaries.
- The detail expansion files are binding implementation contracts unless live repo inspection proves a specific adjustment is necessary.
- The market-driven V3 files are the controlling product spec for feature quality. Do not ship generic dashboards or vague AI copy.
- The V4 files are the controlling massive-product architecture. The build should feel like a professional sports software platform, not a small prototype.
- The V5 files are the invention layer. Implement product mechanics, not just screens: Signal Layer, Source Trust System, Action Conversion Engine, Performance-to-Field Engine, Postgame-to-Practice Engine, Player Passport, Decision Ledger/Staff Action Engine, Import Dossier, and Player Daily Contract.

Deliver in this order:

1. Task 0 live Ultracode Command Center created as a cream/green Agent City / Factory Floor, fully wired, running, opened in Chrome, seeded with agents/work packets, and verified with `command_center_verified`.
2. Current-state repo audit summary.
3. Migration map with table changes and RLS approach.
4. Schema and RLS changes.
5. Capability and navigation refactor.
6. Server actions, queries, and read models.
7. Coach Command Center.
8. Player Today.
9. Roster/Profile/Timeline.
10. Import Center MVP.
11. Elite stats/import source foundation from V6.
12. Signal Inbox and source trust badges.
13. Practice Planner Lite and Practice Intelligence Board.
14. Postgame Action Review.
15. Performance OS foundation with strength coach and player lift workflows.
16. Video event linking and classes conflict automation.
17. Baseball CoachHelm engine foundation.
18. Settings, roles, program type, and integration source settings.
19. Staff Decision Room.
20. Embedded AI cards, source-backed action reviews, and practice prescriptions.
21. Program-type demos for college, high school, and showcase.
22. QA checklist with tests, screenshots if possible, and role-visibility notes.
23. Final pass against `16_detail_expansion_v2/v2_one_shot_quality_gate.md`, `17_market_driven_feature_upgrade_v3/anti_slop_quality_rubric.md`, `18_massive_program_os_v4/v4_plan_coverage_and_upgrade_index.md`, and `20_stats_integrations_coachhelm_deep_dive_v6/v6_agent_efficiency_map.md`.
24. Final invention pass against `19_breakthrough_product_systems_v5/v5_competitive_system_blueprints.md`, `19_breakthrough_product_systems_v5/v5_premium_interaction_design_spec.md`, and `20_stats_integrations_coachhelm_deep_dive_v6/v6_baseball_coachhelm_engine.md`.

For each work packet, report:

- files changed
- tables touched
- routes affected
- tests added or run
- known risks
- what remains
- command center events logged for packet start, progress, risks, tests, and completion

Quality bar:

- This should feel like a premium college baseball command center, not a generic admin dashboard.
- Coaches should immediately see what changed, who needs attention, what today requires, and what action to take.
- Players should see a simple mobile-first Today screen, tasks, schedule, availability, and development actions.
- Staff should see only the surfaces their role needs.
- Imports and AI must be trustable because source data is visible.
- If a feature does not improve a baseball decision, create a traceable action, or connect source data to workflow, cut or defer it.
- High school, college, showcase, and JUCO cannot be shallow copies. Use shared architecture and distinct defaults.
- Strength/lifting cannot be just a dashboard card. It needs a strength coach workflow and a player workflow.
- Every important object should support source -> signal -> action -> timeline/history. If it does not, it is probably filler.

Start now by auditing the repo. Do not summarize the V2 docs back to me. Use them as instructions and begin execution.
```
