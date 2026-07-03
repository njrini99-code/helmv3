# V6 Stats, Integrations, Video, Classes, and Baseball CoachHelm Deep Dive

Generated: 2026-06-23

This section is the deep implementation pass requested after inspecting the current `Downloads/helmv3` app and Supabase shape. It exists to prevent the next build agent from doing generic "baseball stats" work. BaseballHelm must become a source-aware baseball operating system where official stats, player development metrics, video, strength, classes, availability, and staff actions all connect.

## What This Layer Adds

- A repo-verified map of the current baseball app, current Supabase types, archived baseball migrations, and golf CoachHelm architecture to reuse.
- A complete elite baseball stat universe: official scoring, advanced offensive/pitching/defense/catching/baserunning, pitch-level tracking, batted-ball, swing sensors, practice, strength, wellness, academics, class conflicts, recruiting/showcase, and video-derived events.
- A source-aware stats and upload architecture: raw file preservation, import runs, rows, mappings, player identity resolution, validation rules, duplicate handling, rollback, audit logs, confidence, and downstream recalculation.
- A vendor and tool integration matrix grounded in current market behavior: GameChanger XML, StatCrew/NCAA XML, Presto/SIDEARM workflows, TrackMan, Rapsodo, Synergy, 6-4-3 Charts, AWRE, Blast Motion, Diamond Kinetics, Teamworks, TeamBuildr, ArmCare, OnForm, Google Sheets, CSV/XLSX/PDF/manual.
- A baseball-specific CoachHelm engine that mirrors the depth of GolfHelm while using baseball-native concepts: plate-appearance sequencing, pitch design, swing decisions, catcher run prevention, pitcher workload, player readiness, class conflicts, lift response, practice prescription, lineup implications, and evidence-backed action loops.

## Read Order

1. `v6_current_app_supabase_deep_dive.md`
2. `v6_elite_baseball_stat_universe.md`
3. `v6_stats_data_model_and_import_contract.md`
4. `v6_vendor_integration_matrix.md`
5. `v6_video_classes_automation_system.md`
6. `v6_baseball_coachhelm_engine.md`
7. `v6_agent_efficiency_map.md`
8. `v6_market_research_source_log.md`

## Controlling Principle

Every stat must answer four questions:

1. Where did it come from?
2. How trustworthy is it?
3. What baseball decision does it affect?
4. What action, timeline event, practice block, player task, lineup note, or staff meeting topic did it create?

If a metric cannot answer those questions, it can still be stored, but it should not drive CoachHelm recommendations.

