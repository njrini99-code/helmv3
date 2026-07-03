# BaseballHelm Revolution Plan

Created: 2026-06-23

This folder is the build-ready planning system for transforming `njrini99-code/helmv3` into a premium, import-first, AI-assisted college baseball operating system.

**Recommended positioning:** BaseballHelm is the import-first, AI-assisted operating system for college baseball programs: Teamworks-level organization, baseball-specific development depth, and CoachHelm intelligence without enterprise bloat.

**Hard constraints:** no required direct live integrations in Phase 1; support manual entry, CSV/Excel imports, file uploads, PDF/report uploads, image/video link storage, athlete-entered data, coach-entered data, admin-entered data, and future integration readiness only.

## Folder map

- `00_index/` — executive summary, source bibliography, assumptions, next-agent instructions.
- `01_repo_audit/` — current app, route, component, auth, data flow, and technical debt audit.
- `02_market_research/` — competitor research, market landscape, weakness matrix, and build-vs-import-vs-ignore decisions.
- `03_college_baseball_operations_deep_dive/` — how real college programs operate by role and season rhythm.
- `04_future_product_architecture/` — coach/player architecture, navigation, role model, tasks, roadmap.
- `05_tab_specs_coach_account/` — detailed build specifications for every future coach tab.
- `06_tab_specs_player_account/` — detailed build specifications for every future player tab.
- `07_import_system/` — import architecture, mapping logic, validation, rollback, CSV templates, sample CSVs.
- `08_data_architecture/` — recommended tables, columns, RLS, migrations, seed strategy.
- `09_coachhelm_ai_architecture/` — CoachHelm AI modules, prompts, guardrails, examples.
- `10_ui_ux_design_system/` — premium visual system and UX patterns.
- `11_build_plan/` — implementation sequence, QA, testing, deployment, rollback.
- `12_agent_prompts/` — copy/paste prompts for future agents.

## Non-negotiable product principle

BaseballHelm should not become a thin wrapper around vendor APIs. The strongest wedge is to become the place where a college staff consolidates scattered baseball operations, player development signals, lift compliance, practice plans, class conflicts, travel plans, and CoachHelm AI briefs even when each upstream system exports data differently.
