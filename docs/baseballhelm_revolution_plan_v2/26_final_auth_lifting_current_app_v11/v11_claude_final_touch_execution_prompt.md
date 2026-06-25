# V11 Claude Final Touch Execution Prompt

Paste this above the master Claude Ultracode prompt.

```text
You are Claude Ultracode working inside the existing `njrini99-code/helmv3` repo. Before implementing BaseballHelm product work, read and execute the V12 live command center layer first:

- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/README.md
- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/source_ultracode_agent_city_command_center_spec.md
- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/v12_agent_city_baseballhelm_adaptation.md
- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/v12_claude_task_zero_live_command_center.md
- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/v12_command_center_ui_ux_and_tabs.md
- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/v12_telemetry_contract_agent_visibility.md
- docs/baseballhelm_revolution_plan_v2/27_live_ultracode_command_center_v12/v12_chrome_open_acceptance_gate.md

Create the BaseballHelm Ultracode Command Center as a fully wired cream/green no-black Agent City / Factory Floor experience, wire local telemetry, add hook receiver/bridge, add git/repo watcher or polling, add risk classification and replay state, open it in Chrome, and log `command_center_verified` before touching main BaseballHelm app features.

After V12 is verified, read the V11 final-touch layer:

- docs/baseballhelm_revolution_plan_v2/26_final_auth_lifting_current_app_v11/README.md
- docs/baseballhelm_revolution_plan_v2/26_final_auth_lifting_current_app_v11/v11_auth_team_join_staff_roles.md
- docs/baseballhelm_revolution_plan_v2/26_final_auth_lifting_current_app_v11/v11_strength_coach_premium_lifting_system.md
- docs/baseballhelm_revolution_plan_v2/26_final_auth_lifting_current_app_v11/v11_current_baseballhelm_context_for_claude.md
- docs/baseballhelm_revolution_plan_v2/26_final_auth_lifting_current_app_v11/v11_claude_final_touch_execution_prompt.md

V11 is the controlling layer for login, signup, team joins, staff invites, assistant coach accounts, strength/lifting coach accounts, performance/lifting dashboard, player lift delivery, and current-app implementation grounding.

Then read V10 and V9:

- docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/README.md
- docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_repo_grounding_and_golfhelm_translation.md
- docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_premium_ui_system_by_tab.md
- docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_baseball_stat_visual_contracts.md
- docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_advanced_coachhelm_engine_and_integrations.md
- docs/baseballhelm_revolution_plan_v2/25_premium_ui_coachhelm_v10/v10_claude_prompt_delta_and_scope_corrections.md
- docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/README.md
- docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/v9_tab_by_tab_subsystem_plan.md
- docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/v9_cross_subsystem_data_signal_action_map.md
- docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/v9_claude_work_packet_backlog.md
- docs/baseballhelm_revolution_plan_v2/24_subsystem_execution_blueprint_v9/v9_one_shot_agent_handoff_prompt.md

Final-touch implementation rules:

1. Do not replace existing Baseball auth. Extend `/baseball/login`, `/baseball/signup`, `/baseball/complete-signup`, `/baseball/join/[code]`, `src/app/baseball/actions/auth.ts`, `src/app/baseball/actions/onboarding.ts`, `src/app/baseball/actions/teams.ts`, and `src/hooks/use-baseball-auth.ts`.
2. Do not create a separate auth identity for lifting coaches. A lifting coach is a `baseball_coaches` row joined to a team through `baseball_team_coach_staff` with staff role and capabilities.
3. Do not overload `coach_type` with job title. `coach_type` is the program market type. Staff job role belongs on team staff membership or a staff profile extension.
4. Add staff invite acceptance for assistant coaches, position coaches, strength coaches, analysts, director of ops, and other staff roles.
5. Add a premium Performance/Lifting module as a first-class dashboard surface, not as a tiny card hidden under team ops.
6. Build lifting groups, exercise library, training blocks, lift assignment, player lift execution, readiness, soreness, bodyweight, PR tracking, live weight room mode, and performance-to-baseball analytics.
7. Ensure player lift assignments show up in Player Today and calendar.
8. Ensure strength coach dashboards support creating groups, assigning lifts, monitoring live execution, modifying loads, reviewing readiness, and seeing progress charts.
9. Use source-backed CoachHelm performance signals only after data exists. Store source refs, confidence, and limitations.
10. Preserve current Baseball shell, CommandPalette, mobile bottom nav, role guard, and Supabase server/client patterns.
11. Use RLS and server-side capability checks for every staff/player operation.
12. Generate TypeScript types after migrations and use the generated shape instead of guessing.
13. Build for high school, college, JUCO, and showcase program differences.
14. Keep UI premium, dense, role-aware, mobile-safe, accessible, and chart-backed with table fallbacks.

Required implementation order:

1. Inspect the current repo files named in V11.
2. Inspect current generated database types.
3. Add migrations for staff capabilities, staff invites, and performance/lifting tables.
4. Add RLS helpers and policies.
5. Add server actions for staff, performance, lifting, and readiness.
6. Extend auth/signup/onboarding/join for invite-aware flows.
7. Add staff settings and staff invite UI.
8. Add Performance Dashboard routes and components.
9. Add player lift and readiness routes.
10. Add Player Today and calendar integration.
11. Add CoachHelm performance signals and source drawers.
12. Add tests for permissions, joins, lifting assignments, and player logging.
13. Run typecheck, lint, and targeted tests.

Acceptance checklist:

- Head coach can create program, invite staff, invite players, manage roles, and see access audit.
- Assistant coach can log in with scoped access.
- Strength coach can log in, land on Performance Dashboard, create groups, create lift programs, assign lifts, run live weight room, and review readiness.
- Player can join team, see assigned lift, complete readiness check-in, log sets, and see completion/history.
- Player cannot see other players' private readiness or lift data.
- Strength coach cannot see private academic notes unless explicitly granted.
- Head coach can connect performance state to practice, availability, and CoachHelm action items.
- The UI looks integrated with the current BaseballHelm app, not bolted on.
```

## Claude Reminder

If the implementation gets too large, build the foundation in the correct order rather than creating polished but disconnected screens.

The correct foundation is:

1. Auth and staff/team context.
2. Permissions and RLS.
3. Lifting/performance data model.
4. Actions.
5. UI.
6. CoachHelm intelligence.
7. Tests.
