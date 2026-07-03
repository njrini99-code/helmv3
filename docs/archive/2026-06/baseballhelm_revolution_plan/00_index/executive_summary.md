# Executive Summary

**Recommended positioning:** BaseballHelm is the import-first, AI-assisted operating system for college baseball programs: Teamworks-level organization, baseball-specific development depth, and CoachHelm intelligence without enterprise bloat.

The current Helm repository already has a broad multi-sport foundation and meaningful baseball surface area, but the product is not yet organized around the daily reality of a college baseball staff. The future product should stop feeling like a set of disconnected dashboards and become a single command center for the program.

## Current-state diagnosis


## Static repo audit evidence

The audit used public GitHub connector inspection and the existing repository route inventory. Key evidence:

- `package.json` identifies a Next.js / React / Supabase app with Next 16, React 19, `@supabase/ssr`, `@supabase/supabase-js`, `ai`, `@ai-sdk/anthropic`, Capacitor, Radix UI, TanStack Table, Recharts, Framer Motion, Vitest, and Playwright.
- `src/components/layout/sidebar.tsx` shows current baseball navigation split by coach/player roles and coach type. It includes Dashboard, Roster, Stats, Videos, Dev Plans, Calendar, Messages, Announcements, Tasks, Documents, Travel, Academics for JUCO, and archived recruiting branches.
- `docs/architecture/ROUTE_INVENTORY.md` reports 68 pages, 29 layouts, 3 API routes, 33 loading states, 26 error boundaries, 7 route groups, 8 orphaned pages, 35 missing loading states, and 42 missing error boundaries as of its generated report.
- `src/lib/types/database.ts` is generated from Supabase types and shows a large mixed baseball/golf schema surface.
- `src/lib/queries/baseball-dashboard.ts` still contains older recruiting/watchlist dashboard logic with `baseball_watchlists`, `baseball_player_engagement_events`, `baseball_messages`, and `baseball_conversation_participants`.
- `src/app/baseball/(dashboard)/dashboard/academics/page.tsx` explicitly notes that academic fields like credits, standing, and eligibility status are not in the DB schema yet and are currently defaulted in UI state.


## Market diagnosis

College baseball programs operate with fragmented systems:

- Teamworks / ARMS style platforms own athletic department operations, compliance, communication, travel, calendars, forms, and roster workflows.
- GameChanger / StatCrew / NCAA scorebook conventions own scoring and official stat logic.
- TrackMan / Rapsodo / Blast / Diamond Kinetics / BaseballCloud / Driveline TRAQ own narrow player-development data and training workflows.
- TeamBuildr / BridgeAthletic / TrainHeroic own strength workout assignment, compliance, readiness, and reporting.
- Coaches still use Google Sheets, Excel, whiteboards, PDFs, notebooks, and text threads because none of the above tools creates a simple baseball-specific daily operating view.

## Strategic wedge

Do **not** try to beat every vendor feature-for-feature. Win by becoming the baseball-specific command layer:

1. **Daily operations:** Today, practice, calendar, availability, tasks, announcements, travel, academics.
2. **Baseball development identity:** Roster and player profiles as the central identity layer.
3. **Import-first intelligence:** Bring in stats, pitch metrics, swing metrics, lifting, wellness, class schedules, and travel data through CSV/manual/report uploads.
4. **CoachHelm AI:** Summarize what changed, who needs attention, what the staff should review, and why each recommendation is grounded in entered/imported data.

## Final architecture recommendation

Build two role-specific experiences on one shared data model:

### Coach account

Dense, desktop/tablet-first command workspace with command center, roster, player profiles, calendar, practice planner, lifting, stats, hitting, pitching, defense/baserunning, availability, academics, communication, travel, recruiting, reports, import center, CoachHelm AI, and admin settings.

### Player account

Mobile-first daily app with Today, schedule, tasks, lifts, practice, stats, development, arm care, wellness, academics, goals, messages, and profile. Players should see clear next actions, constructive feedback, and permitted AI summaries without staff-only notes.

## Phase plan

### Phase 1: Core BaseballHelm Operating System

Auth/roles cleanup, coach command center, player Today page, roster, player profiles, calendar, practice planner, stats center, lifting tracker, availability/wellness, import center, CoachHelm basic summaries, permissions, and seed/demo data.

### Phase 2: Player Development Depth

Hitting development, pitching development, arm care, advanced imports, development timelines, coach notes, player reflections, AI trend analysis, and reports.

### Phase 3: Program Operations

Academics, travel, communication, acknowledgements, weekly team health, advanced reports.

### Phase 4: Recruiting / Advanced AI

Recruiting board, prospect imports, roster needs analysis, advanced CoachHelm AI, more sophisticated risk engine, premium reports.

## Build-agent instruction

Start with `11_build_plan/one_shot_build_plan.md`, then read `01_repo_audit/reuse_refactor_replace_matrix.md`, `08_data_architecture/recommended_tables.md`, `04_future_product_architecture/future_navigation_and_tabs.md`, `05_tab_specs_coach_account/00_coach_command_center/README.md`, and `12_agent_prompts/prompt_for_build_agent.md`.
