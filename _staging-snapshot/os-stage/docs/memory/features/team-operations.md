# Feature: Team Operations

```yaml
feature_id: team_operations
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: not_started
```

## Purpose

Tasks, documents, and travel — the operational objects coaches assign and
players act on — plus the player-facing Team Hub that assembles them into a
daily workflow. Distinct from `roster_team` (who's on the team) and
`team_communications` (messages/announcements), though all three share
routes and tables at the edges.

## User Contract

- A coach can assign a task to specific players and see completion state per
  player, not per team.
- A player completing a task only ever updates their own assignment.
- A document has version history; uploading a new version doesn't destroy the
  old one.
- Travel itinerary detail (flights, hotels, rooming, uniforms) is treated as
  sensitive — visibility should be intentional, not default-open.
- The player Team Hub never reports "no tasks / no trips / no announcements"
  when the real state is "the read failed" — a failed read must show as
  retryable, not as a cheerful empty state.

## Current Behavior

**Two different "hub" routes exist and are easy to conflate — they are not
the same thing.** `/golf/dashboard/hub` is a legacy redirect only: the
standalone player Hub was merged into `/golf/dashboard` itself on 2026-07-09
(nav-consolidation wave) as an "Action center" section
(`getPlayerHubSummaryData` + `FairwayPlayerDashboard`'s `hubData` prop); the
route file is a pure `redirect()`, reinforced at the framework layer by
`next.config.mjs`. `/golf/dashboard/team-hub` (`FairwayTeamHub`) is the
separate, still-active player operations destination described in Primary
Journeys below. Do not describe the old Hub as "now Team Hub" — they were
built independently and only one is a live destination.

Tasks: `createTask()`, `createRecurringTask()`, `completeTask()`,
`deleteTask()`, plus reminder and template management, all in `tasks.ts`
(confirmed exports, `src/app/golf/actions/tasks.ts`).

Documents: full CRUD plus versioning in `documents.ts` —
`createDocument`/`saveTextDocument`/`updateDocument`/`deleteDocument`,
`uploadNewVersion`/`getDocumentVersions`/`revertToVersion`/`compareVersions`,
and a parallel `golf`-prefixed set (`uploadGolfDocument`,
`createGolfDocument`, etc.) — two naming generations coexist in the same
file; check which one a call site actually uses before assuming behavior.

Travel: itinerary CRUD, **and real expense/budget functionality** —
`createTravelExpense`, `updateTravelExpense`, `getExpensesForTeam`,
`getExpenseSummary`, `uploadExpenseReceipt`, `exportExpensesToCSV`,
`setBudget`, `getBudgetsForItinerary` are all present in `travel.ts`. This is
more built than the prior generation of this doc suggested ("Travel expense
split support is incomplete" was accurate but read as if expense tracking in
general were unbuilt — it is not). The specific gap is narrower: see Known
Debt.

## Invariants

- Coach task/document/travel writes are team-scoped.
- Player task completion only updates that player's own assignment row.
- Task templates produce defaults; the assigned task record is the
  operational truth, not the template.
- Documents need visibility controls and non-destructive versioning.
- Empty and failed reads are different states in the Team Hub; only a
  genuinely successful empty read may say "no tasks/trips/classes/announcements."

## Primary Journeys

1. **Task create/complete**: `createTask()` → `golf_tasks` +
   `golf_task_assignments` per player → player calls `completeTask()` →
   updates that assignment's status/upload/notes.
2. **Document upload/version**: create/upload → `golf_documents` or
   `golf_document_versions`; may link to an announcement or event.
3. **Travel create**: `createGolfTravelItinerary()` → `golf_travel_itineraries`,
   optional `event_id` link to the calendar; expenses/budgets attach via the
   functions listed above.
4. **Player Team Hub**: resolves active team membership, then reads task
   assignments, travel, announcements, classes, and team timezone in
   parallel; presents an Overview plus Tasks / Announcements / Travel / Class
   schedule detail tabs. "Next trip" is derived from `departure_date >=`
   today's *team-local* date; past itineraries stay visible only in the
   Travel detail tab. `completeTask()` is the only write in this surface and
   stays in the client wrapper. A failed task/travel/class/announcement read
   renders as a retryable load failure, never as an empty state.

## Architecture/Data Flow

```txt
Task create
  -> createTask() -> INSERT golf_tasks -> INSERT golf_task_assignments per player
Task complete
  -> completeTask() -> UPDATE golf_task_assignments (status/upload/notes)

Document upload/version
  -> documents action/storage flow -> WRITE golf_documents or golf_document_versions
  -> may link to announcements or events

Travel create
  -> createGolfTravelItinerary() -> WRITE golf_travel_itineraries
  -> optional event_id link to calendar
Travel expense
  -> createTravelExpense() -> WRITE golf_travel_expenses
  -> setBudget() -> WRITE golf_travel_budgets

Player Team Hub
  -> resolve active team membership
  -> parallel reads: task assignments, travel, announcements, classes, team timezone
  -> Overview + Tasks/Announcements/Travel/Class tabs
  -> derive "next trip" from departure_date >= team-local today
  -> completeTask() is the only write, stays in the client wrapper
  -> failed read -> retryable load-failure state (never a cheerful empty state)
```

## Permissions/Tenancy

Team-scoped writes for coaches; own-assignment-only writes for players.
Enforced through the shared RLS + server-action-auth pattern documented in
`team_access_control`.

## Dependencies

- `team_access_control` (auth/RLS).
- `team_communications` (inline announcement tasks feed the same
  `golf_tasks`/`golf_task_assignments` tables this feature owns).
- `calendar_events` (travel itineraries can link via `event_id`; task overdue
  logic and the coach dashboard's today-schedule RPC both touch calendar
  data).
- Supabase Storage (documents, expense receipts).

## Failure Modes

- **Timezone-naive "overdue" calculation.** Fixed this week — see Incident
  History. Any new overdue/due-date logic for tasks must go through
  `src/lib/golf/task-overdue.ts`'s `isGolfTaskOverdueInZone()`, not a
  viewer-local-clock comparison.
- **`get_coach_today_schedule` all-day off-by-one — still open.** The coach
  dashboard's today-schedule RPC is called with `p_team_id`, `p_today_start`,
  `p_today_end` (`dashboard-data.ts:339`) and has no `p_today_date` parameter.
  A fix adding `p_today_date` to avoid an all-day-event off-by-one was
  scoped this week (GitHub #1496) but **has not landed as of
  `last_verified_sha`** — confirmed by grep, no `p_today_date` reference
  exists in `dashboard-data.ts` or any migration. Treat today-schedule
  all-day event display as unreliable until this ships.
- **Two document-action naming generations in one file** (`documents.ts` has
  both a generic CRUD set and a `golf`-prefixed set) — a change to one may
  not apply to the other; check call sites.

## Observability Contract

No feature-specific observability contract (custom metrics, alert
thresholds) is defined in code as of `last_verified_sha` beyond the shared
`logServerError()` convention.

## Test Contract

- `src/app/golf/actions/__tests__/travel.test.ts`
- `src/components/fairway/pages/team-hub/FairwayTeamHub.logic.test.ts`
- `src/lib/golf/__tests__/task-overdue.test.ts`,
  `src/lib/golf/__tests__/today-iso-in-zone.test.ts` — new this week,
  covering the timezone fix in Incident History.
- No pgTAP RLS test exists under `supabase/tests/rls/` for `golf_tasks`,
  `golf_documents`, or `golf_travel_*` tables — a real coverage gap;
  `documents_storage.sql` covers document storage RLS only, not the
  `golf_documents` row-level policies themselves.

## Known Debt/Unknowns

- **`golf_travel_expense_splits` does not exist in production**, carried
  forward from the prior doc's schema-drift banner and re-confirmed this
  pass (absent from `src/lib/types/database.ts`). The narrower, corrected
  claim: per-expense *splitting* among multiple players has no backing table,
  but single-payer expense tracking and budgets (`golf_travel_expenses`,
  `golf_travel_budgets`) are real and functional. Don't build split-expense
  UI against a table that doesn't exist.
- Task reminder auto-send: `setTaskReminder()`/`clearTaskReminder()` persist
  a `reminder_at`, but whether anything actually fires a notification at that
  time was not re-verified this pass — treat as unconfirmed, not as working.
- `get_coach_today_schedule` all-day off-by-one (#1496) — open, see Failure
  Modes.

## Incident History

- **2026-08-21 — Team Info overdue badges used the viewer's clock, not the
  team's.** `FairwayTeamInfo` computed task-overdue state from the viewing
  browser's local time; a coach or player in a different timezone than the
  team could see wrong overdue badges. Fixed by commit `c69caa02c` (#1487 /
  PR #1545): `isGolfTaskOverdueInZone()` now threads `golf_teams.timezone`
  through to the client, the old viewer-local `isGolfTaskOverdue()` was
  deleted, and `todayIsoInZone()` was hardened for `en-CA` locale formatting
  edge cases. New regression tests:
  `src/lib/golf/__tests__/task-overdue.test.ts`,
  `src/lib/golf/__tests__/today-iso-in-zone.test.ts`.

## ADR Links

None recorded yet — `memory/decisions/` contains only a README stub as of
`last_verified_sha`.

## Verification Evidence

- Tables (`golf_tasks`, `golf_task_assignments`, `golf_task_templates`,
  `golf_task_reminders`, `golf_documents`, `golf_document_versions`,
  `golf_travel_itineraries`, `golf_travel_budgets`, `golf_travel_expenses`)
  confirmed present in `src/lib/types/database.ts`; `golf_travel_expense_splits`
  confirmed absent.
- Action exports confirmed via direct grep of `tasks.ts`, `documents.ts`,
  `travel.ts` (function names and rough line numbers cited above).
- `/golf/dashboard/hub` confirmed to be a pure redirect by reading
  `page.tsx` in full; `/golf/dashboard/team-hub` confirmed to be a separate,
  live route backed by `FairwayTeamHub`.
- `get_coach_today_schedule` call site confirmed at `dashboard-data.ts:339`
  with its current three-parameter signature (`p_team_id`, `p_today_start`,
  `p_today_end`); `p_today_date` confirmed absent from that call and from
  all migration files matching `*coach_today_schedule*`.
- Incident commit `c69caa02c` (#1487/#1545) confirmed via `git log`, ancestor
  of `last_verified_sha`; new task-overdue files confirmed present on disk.
- `src/app/api/tasks/**`, `src/app/api/documents/**`, `src/app/api/travel/**`,
  all named in `memory/registry.yml`'s `code.api` list for this feature, do
  not exist under `src/app/api/`. Server-action only; flagging as registry
  drift. `src/components/golf/tasks/**` and `src/components/golf/travel/**`,
  also named in the registry, likewise do not exist on disk.
