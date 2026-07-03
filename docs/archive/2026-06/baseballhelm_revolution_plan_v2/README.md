# BaseballHelm Revolution Plan V2

Generated: 2026-06-23

This is the enhanced second-pass audit and build-ready product architecture package for BaseballHelm inside `njrini99-code/helmv3`.

## Brutal verdict

The original archive was valuable but not safe to treat as a one-shot build plan. It had breadth, but the key weakness was decision quality: too many tabs, too much speculative feature coverage, not enough repo-aware execution detail, and not enough ruthless separation between build now, import only, attach/link only, defer, and do not build.

V2 turns BaseballHelm into a college-baseball-specific operating system centered on:

1. Coach Command Center
2. Player Today
3. Roster + Player Timeline
4. Practice Intelligence Loop
5. Stats-to-Practice Loop
6. Performance/Availability Loop
7. Import-to-Insight Engine
8. Staff Decision Room
9. Embedded CoachHelm AI briefs/flags/action reviews
10. Demo-ready program data

## Folder map

- `00_v2_index/` — executive summary, critical findings, usage guide, next-agent prompt.
- `01_zip_audit/` — V1 inventory, gaps, duplicate/weak/overbuilt sections, scorecards.
- `02_repo_crosscheck/` — current repo vs plan alignment, conflicts, migration risks.
- `03_market_research_refresh/` — refreshed competitor research and build/import/ignore decisions.
- `04_revolutionary_product_strategy/` — positioning, wedge, adoption, retention, demo logic.
- `05_integrated_workflow_review/` — real operating loops by role, season, and object.
- `06_feature_by_feature_critical_review/` — brutal review and improved spec per feature.
- `07_tab_architecture_v2/` — final role-based navigation.
- `08_data_model_v2/` — implementation-grade schema direction and migration sequence.
- `09_import_system_v2/` — import-first architecture.
- `10_coachhelm_ai_v2/` — embedded AI architecture, safety, prompts, outputs.
- `11_ui_ux_v2/` — premium UX systems and screen-level patterns.
- `12_phase_plan_v2/` — ruthless phased roadmap.
- `13_implementation_plan_v2/` — one-shot build plan, task sequence, QA, DoD.
- `14_sales_demo_and_adoption_v2/` — demo storyboards, objections, onboarding.
- `15_final_agent_prompts_v2/` — executable prompts for build/database/frontend/import/AI/QA/demo agents.
- `16_detail_expansion_v2/` — dense implementation contracts for features, roles, schema, imports, screens, AI, demo seed data, and one-shot quality gates.
- `17_market_driven_feature_upgrade_v3/` — market-backed product enhancement layer defining the Baseball Staff Operating Graph, Signal Inbox, Import Dossier, Postgame Action Review, and anti-slop build standards.
- `18_massive_program_os_v4/` — massive multi-program BaseballHelm OS spec based on the current `Downloads/helmv3` baseball structure, with high school/college/showcase/JUCO variants, strength coach/performance system, settings, integrations, UI/UX, and implementation architecture.
- `19_breakthrough_product_systems_v5/` — invention layer defining source trust, signals, action conversion, Performance-to-Field, Postgame-to-Practice, Player Passport, Decision Ledger/Staff Action Engine, and premium interactions that make the product compete with category leaders.
- `20_stats_integrations_coachhelm_deep_dive_v6/` — repo-verified app/Supabase deep dive, complete elite baseball stat universe, source-aware import contract, vendor integration matrix, video/classes automation, and Baseball CoachHelm engine specification.
- `21_visuals_and_pitch_assets/` — SVG product maps, feature diagrams, and conceptual UI visuals for pitching, selling, and aligning the build.
- `22_deeper_workflows_research_v7/` — deeper research pass for stats acquisition, GameChanger/StatCrew/Presto/6-4-3/TRAQ workflows, source-specific parsers, practice generator, drag/drop scrimmage lineups, assistant coach onboarding, player profile snapshots, practice effectiveness analytics, and lifting/performance expansion.
- `23_autosync_strategy_v8/` — zero-touch official stats AutoSync strategy using SFTP/HTTPS/email/local-agent ingest, official XML/file pipelines, confidence-based commits, corrections, monitoring, and postgame AI reports.
- `24_subsystem_execution_blueprint_v9/` — final Claude execution organization layer planning every staff/player tab, integration adapter, source-to-signal-to-action data loop, read model, permission boundary, and work packet.
- `25_premium_ui_coachhelm_v10/` — final premium UI, advanced baseball stat visual, GolfHelm-to-BaseballHelm translation, and CoachHelm correction layer. V10 removes legacy generated meeting prose and AI-authored practice summaries from scope, then replaces them with Staff Decision Room, decision ledger, practice prescription, and practice-effectiveness review.
- `26_final_auth_lifting_current_app_v11/` — final auth, team join, staff invite, assistant coach, lifting coach, player lift, current app structure, and Claude execution grounding layer. V11 is the first-read layer for logins, program joins, strength coach dashboards, and current `Downloads/helmv3` implementation efficiency.
- `27_live_ultracode_command_center_v12/` — Task 0 live-build visibility layer. V12 now includes the Agent City / Factory Floor source spec and BaseballHelm adaptation. Claude must create a fully wired cream/green, no-black BaseballHelm Ultracode Command Center, open it in Chrome, seed agent/work-packet telemetry, verify it, and keep it updated before starting the main build.
- `BASEBALLHELM_FULL_FEATURE_PRODUCT_PLAN.pdf` — 14-page full-page feature plan overview covering all major feature systems, roles, integrations, video intelligence, advanced data, stats, CoachHelm, lifting, player profiles, settings, and build phases.
- `BASEBALLHELM_BRANDED_PRODUCT_OVERVIEW.pdf` — 4-page BaseballHelm-branded overview for friends, investors, coaches, and quick product storytelling.
- `BASEBALLHELM_OFFICIAL_OVERVIEW.pdf` — longer color-coded overview PDF with broader plan coverage.

## Read first

1. `27_live_ultracode_command_center_v12/README.md`
2. `27_live_ultracode_command_center_v12/source_ultracode_agent_city_command_center_spec.md`
3. `27_live_ultracode_command_center_v12/v12_agent_city_baseballhelm_adaptation.md`
4. `27_live_ultracode_command_center_v12/v12_claude_task_zero_live_command_center.md`
5. `27_live_ultracode_command_center_v12/v12_command_center_ui_ux_and_tabs.md`
6. `27_live_ultracode_command_center_v12/v12_telemetry_contract_agent_visibility.md`
7. `27_live_ultracode_command_center_v12/v12_chrome_open_acceptance_gate.md`
8. `PRODUCT_SUMMARY_AND_SALES_NARRATIVE.md`
9. `26_final_auth_lifting_current_app_v11/README.md`
10. `26_final_auth_lifting_current_app_v11/v11_auth_team_join_staff_roles.md`
11. `26_final_auth_lifting_current_app_v11/v11_strength_coach_premium_lifting_system.md`
12. `26_final_auth_lifting_current_app_v11/v11_current_baseballhelm_context_for_claude.md`
13. `26_final_auth_lifting_current_app_v11/v11_claude_final_touch_execution_prompt.md`
14. `25_premium_ui_coachhelm_v10/README.md`
15. `25_premium_ui_coachhelm_v10/v10_repo_grounding_and_golfhelm_translation.md`
16. `25_premium_ui_coachhelm_v10/v10_premium_ui_system_by_tab.md`
17. `25_premium_ui_coachhelm_v10/v10_baseball_stat_visual_contracts.md`
18. `25_premium_ui_coachhelm_v10/v10_advanced_coachhelm_engine_and_integrations.md`
19. `25_premium_ui_coachhelm_v10/v10_claude_prompt_delta_and_scope_corrections.md`
20. `21_visuals_and_pitch_assets/visual_product_overview.md`
21. `22_deeper_workflows_research_v7/README.md`
22. `22_deeper_workflows_research_v7/v7_visual_overview.md`
23. `23_autosync_strategy_v8/README.md`
24. `23_autosync_strategy_v8/v8_autosync_feature_plan.md`
25. `24_subsystem_execution_blueprint_v9/README.md`
26. `24_subsystem_execution_blueprint_v9/v9_tab_by_tab_subsystem_plan.md`
27. `24_subsystem_execution_blueprint_v9/v9_integration_adapter_contracts.md`
28. `24_subsystem_execution_blueprint_v9/v9_cross_subsystem_data_signal_action_map.md`
29. `24_subsystem_execution_blueprint_v9/v9_claude_work_packet_backlog.md`
30. `BASEBALLHELM_FULL_FEATURE_PRODUCT_PLAN.pdf`
31. `BASEBALLHELM_BRANDED_PRODUCT_OVERVIEW.pdf`
32. `BASEBALLHELM_OFFICIAL_OVERVIEW.pdf`
33. `00_v2_index/v2_executive_summary.md`
34. `00_v2_index/v2_critical_findings.md`
35. `02_repo_crosscheck/repo_vs_plan_alignment.md`
36. `04_revolutionary_product_strategy/why_baseballhelm_wins.md`
37. `07_tab_architecture_v2/recommended_final_navigation.md`
38. `08_data_model_v2/data_model_v2_overview.md`
39. `09_import_system_v2/import_system_v2_strategy.md`
40. `10_coachhelm_ai_v2/coachhelm_ai_v2_strategy.md`
41. `12_phase_plan_v2/phase_cutline_decisions.md`
42. `13_implementation_plan_v2/one_shot_build_plan_v2.md`
43. `15_final_agent_prompts_v2/prompt_for_next_build_agent_v2.md`

## Claude Ultracode one-shot path

For a Claude Ultracode build session, read these newer execution addenda first:

1. `27_live_ultracode_command_center_v12/README.md`
2. `27_live_ultracode_command_center_v12/source_ultracode_agent_city_command_center_spec.md`
3. `27_live_ultracode_command_center_v12/v12_agent_city_baseballhelm_adaptation.md`
4. `27_live_ultracode_command_center_v12/v12_claude_task_zero_live_command_center.md`
5. `27_live_ultracode_command_center_v12/v12_command_center_ui_ux_and_tabs.md`
6. `27_live_ultracode_command_center_v12/v12_telemetry_contract_agent_visibility.md`
7. `27_live_ultracode_command_center_v12/v12_chrome_open_acceptance_gate.md`
8. `26_final_auth_lifting_current_app_v11/README.md`
9. `26_final_auth_lifting_current_app_v11/v11_auth_team_join_staff_roles.md`
10. `26_final_auth_lifting_current_app_v11/v11_strength_coach_premium_lifting_system.md`
11. `26_final_auth_lifting_current_app_v11/v11_current_baseballhelm_context_for_claude.md`
12. `26_final_auth_lifting_current_app_v11/v11_claude_final_touch_execution_prompt.md`
13. `25_premium_ui_coachhelm_v10/README.md`
14. `25_premium_ui_coachhelm_v10/v10_repo_grounding_and_golfhelm_translation.md`
15. `25_premium_ui_coachhelm_v10/v10_premium_ui_system_by_tab.md`
16. `25_premium_ui_coachhelm_v10/v10_baseball_stat_visual_contracts.md`
17. `25_premium_ui_coachhelm_v10/v10_advanced_coachhelm_engine_and_integrations.md`
18. `25_premium_ui_coachhelm_v10/v10_claude_prompt_delta_and_scope_corrections.md`
19. `24_subsystem_execution_blueprint_v9/README.md`
20. `24_subsystem_execution_blueprint_v9/v9_tab_by_tab_subsystem_plan.md`
21. `24_subsystem_execution_blueprint_v9/v9_integration_adapter_contracts.md`
22. `24_subsystem_execution_blueprint_v9/v9_cross_subsystem_data_signal_action_map.md`
23. `24_subsystem_execution_blueprint_v9/v9_claude_work_packet_backlog.md`
24. `00_v2_index/ULTRACODE_SESSION_STRUCTURE.md`
25. `13_implementation_plan_v2/claude_ultracode_one_shot_runbook.md`
26. `13_implementation_plan_v2/repo_verified_execution_map.md`
27. `18_massive_program_os_v4/README.md`
28. `18_massive_program_os_v4/v4_current_helmv3_structure_map.md`
29. `18_massive_program_os_v4/v4_complete_program_os_feature_spec.md`
30. `18_massive_program_os_v4/v4_strength_lifting_performance_system.md`
31. `18_massive_program_os_v4/v4_program_type_variants_high_school_college_showcase.md`
32. `18_massive_program_os_v4/v4_settings_admin_integrations_permissions.md`
33. `18_massive_program_os_v4/v4_premium_ui_ux_product_system.md`
34. `18_massive_program_os_v4/v4_implementation_contract_for_massive_build.md`
35. `19_breakthrough_product_systems_v5/README.md`
36. `19_breakthrough_product_systems_v5/v5_competitive_system_blueprints.md`
37. `19_breakthrough_product_systems_v5/v5_performance_lifting_breakthrough_system.md`
38. `19_breakthrough_product_systems_v5/v5_practice_development_operating_engine.md`
39. `19_breakthrough_product_systems_v5/v5_premium_interaction_design_spec.md`
40. `20_stats_integrations_coachhelm_deep_dive_v6/README.md`
41. `20_stats_integrations_coachhelm_deep_dive_v6/v6_current_app_supabase_deep_dive.md`
42. `20_stats_integrations_coachhelm_deep_dive_v6/v6_elite_baseball_stat_universe.md`
43. `20_stats_integrations_coachhelm_deep_dive_v6/v6_stats_data_model_and_import_contract.md`
44. `20_stats_integrations_coachhelm_deep_dive_v6/v6_vendor_integration_matrix.md`
45. `20_stats_integrations_coachhelm_deep_dive_v6/v6_video_classes_automation_system.md`
46. `20_stats_integrations_coachhelm_deep_dive_v6/v6_baseball_coachhelm_engine.md`
47. `20_stats_integrations_coachhelm_deep_dive_v6/v6_agent_efficiency_map.md`
48. `21_visuals_and_pitch_assets/visual_product_overview.md`
49. `22_deeper_workflows_research_v7/README.md`
50. `22_deeper_workflows_research_v7/v7_research_findings_stats_acquisition.md`
51. `22_deeper_workflows_research_v7/v7_tool_specific_parser_and_storage_strategy.md`
52. `22_deeper_workflows_research_v7/v7_practice_plan_generator_and_scrimmage_lineup_builder.md`
53. `22_deeper_workflows_research_v7/v7_coachhelm_practice_effectiveness_engine.md`
54. `23_autosync_strategy_v8/README.md`
55. `23_autosync_strategy_v8/v8_autosync_feature_plan.md`
56. `17_market_driven_feature_upgrade_v3/README.md`
57. `17_market_driven_feature_upgrade_v3/one_shot_market_backed_product_spec.md`
58. `17_market_driven_feature_upgrade_v3/anti_slop_quality_rubric.md`
59. `16_detail_expansion_v2/README.md`
60. `15_final_agent_prompts_v2/CLAUDE_ULTRACODE_MASTER_PROMPT.md`

These files narrow the broad V2 plan into a Phase 0 and Phase 1 implementation run. They are intentionally more operational than the strategy files.
