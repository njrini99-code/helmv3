## Tasks [both]

End-to-end audit of the Task Management tab (`/golf/dashboard/tasks`), tracing BOTH the coach and player code paths. Feature is flagged `⚠️ 85%` in `memory/context/golfhelm-features.md` §6.

---

### Routes / entry

- `src/app/golf/(dashboard)/dashboard/tasks/page.tsx` — the shared coach+player client page.
- `src/app/golf/(dashboard)/dashboard/tasks/layout.tsx` — metadata only (no gate).
- Role + auth are resolved one level up in `src/app/golf/(dashboard)/layout.tsx` (`getGolfSessionProfile()` → redirect to `/golf/login` if unauthenticated; routes by resolved role; provides `GolfUserProvider`). The page reads role/IDs from `useGolfUser()`.

### How it is ACTUALLY wired end-to-end

**Read path (both roles)** — `page.tsx:68` calls `useTaskRealtime(teamId, { playerId, assignedToPlayerOnly: role==='player' })`. The hook (`src/hooks/golf/use-task-realtime.ts:114-138`) queries **`golf_tasks`** joined to `golf_players` via `golf_tasks_assigned_to_fkey`, filtered `team_id=eq.<team>`; for a player it adds `.eq('assigned_to', playerId)` (line 134). It computes stats and (line 223-238) subscribes to realtime `postgres_changes` on **`golf_tasks`** only. The page transforms each row into a legacy `Task` whose `assignments[]` is built from the single `assigned_to_name` (page.tsx:87-95) — at most ONE pseudo-assignment per task.

**Render** — flag OFF → legacy `TasksList`/`TaskCard`; flag ON (prod, `NEXT_PUBLIC_REDESIGN=true`) → `FairwayTasks`. Coach gets Create CTA + Templates rail + per-task progress; player gets a "Mark complete" button (Fairway only).

**Write path (create)** — both `CreateTaskModal` (legacy, client `.insert` direct) and `FairwayCreateTaskModal` → `createTask()` (`actions/tasks.ts:389`) INSERT a row into **`golf_tasks`** (with `assigned_to` left NULL) and then INSERT one row per player into **`golf_task_assignments`**.

**Write path (complete)** — player "Mark complete" → `completeTask()` (`actions/tasks.ts:63`) UPDATEs **`golf_task_assignments`** (status/completed_at). It never touches `golf_tasks`.

### THE CENTRAL DEFECT: read model ≠ write model

The feature stores assignments in the **M:N `golf_task_assignments`** join table (create + complete both write there), but every READ path filters/joins the **1:1 `golf_tasks.assigned_to`** column, which **no code path ever populates**. `grep "assigned_to"` across `actions/tasks.ts` + all task components returns zero writes; the spec's own data flow (features.md:324-325) describes the assignments-table model. Consequences:

1. **Players see an empty Tasks tab.** `assignedToPlayerOnly` adds `.eq('assigned_to', playerId)` (hook:134). Since `assigned_to` is NULL on every created task, the result set is empty. A player never sees any task the coach assigned (the assignment row that names them in `golf_task_assignments` is ignored).
2. **Coach per-player progress is always wrong.** The card's `assignments[]` is derived solely from `assigned_to_name` (page.tsx:87-95) which is NULL → `totalCount===0` → the Fairway card hides the progress read-out (FairwayTasks.tsx:516) and the "View details" expander (line 586). The real per-player completion in `golf_task_assignments` is never read here. The coach sees tasks but no "N of M completed".
3. **Completing a task does not update the tab.** Realtime subscription is on `golf_tasks` only (hook:231); `completeTask` writes `golf_task_assignments`, which fires no event. The `refetch()` re-reads `golf_tasks` (status unchanged) so even the manual refetch shows no change. Optimistic "Mark complete" reverts on next render.
4. **Player Hub shows completed tasks forever.** `dashboard-data.ts:774-781` reads `golf_tasks WHERE assigned_to=playerId AND status IN ('pending','in_progress')`. `assigned_to` is NULL (task never appears) AND `golf_tasks.status` is never flipped to completed (only the assignment row is), so any task that DID have `assigned_to` set would never leave the pending list. (This matches the spec's "Player Hub task completion bug", features.md:838/1312, though that note names the wrong read table.)

### Spec comparison (features.md §6, "⚠️ 85%")

| Spec claim | Actual |
|---|---|
| `createTask() → INSERT golf_tasks + golf_task_assignments per player` | TRUE (tasks.ts:434-466) |
| `completeTask() → UPDATE golf_task_assignments` | TRUE (tasks.ts:120-167) |
| Players complete tasks (with optional upload) | Partially: complete works ONLY in Fairway/Hub paths; legacy tab has no complete button; upload UI does not exist anywhere |
| Reminder auto-send missing (Known Gap, Medium) | STILL OPEN — confirmed below |

The spec does NOT flag the read/write table split, which is the dominant real-world breakage. The "85% complete" rating is optimistic; for a player the core flow (see + complete from the Tasks tab) is non-functional in any path because the read filter keys on a never-written column.

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| CRITICAL | wrong-data | src/hooks/golf/use-task-realtime.ts:114-135 + src/app/golf/actions/tasks.ts (no `assigned_to` write) | Read path filters/joins `golf_tasks.assigned_to`, but create/complete write `golf_task_assignments`; `assigned_to` is never set | Players see an EMPTY Tasks tab — no assigned task ever appears (`.eq('assigned_to', playerId)` matches nothing). Core player flow broken in all paths. | Read from `golf_task_assignments` (join `golf_tasks`) for the player list, and build the coach `assignments[]` from `golf_task_assignments` instead of `assigned_to_name`. Pick ONE model (M:N) and retire `assigned_to`. |
| CRITICAL | wrong-data | src/app/golf/(dashboard)/dashboard/tasks/page.tsx:87-95 | `assignments[]` is synthesized from a single `assigned_to_name` (NULL for all created tasks), not from `golf_task_assignments` | Coach sees every task as "0 of 0" → progress bar + per-player roster + "View details" all suppressed (FairwayTasks.tsx:516,586,623). Coach cannot tell who completed anything. | Fetch real `golf_task_assignments` rows (player + status) per task and pass them through. |
| HIGH | broken-wiring | src/hooks/golf/use-task-realtime.ts:223-238 + src/app/golf/actions/tasks.ts:169 | Realtime subscription + refetch only watch `golf_tasks`; `completeTask` mutates `golf_task_assignments` | Player marks complete; tab does not reflect it (optimistic state reverts on next render/refetch). No live update when a teammate completes. | Subscribe to `golf_task_assignments` (filter by task ids/team), and have `completeTask` ALSO update the parent or have reads compute completion from assignments. |
| HIGH | incomplete-feature | src/components/golf/tasks/TaskCard.tsx (whole file) | Legacy (flag-off) `TaskCard`/`TasksList` render no complete control for either role | When the redesign flag is off, a player cannot complete a task from the Tasks tab at all. | Add a player "Mark complete" action to the legacy card (mirror FairwayTaskCard:608-619) or retire the legacy path. |
| HIGH | revalidation | src/app/golf/actions/dashboard-data.ts:774-781 + src/app/golf/actions/tasks.ts:120-167 | Player Hub "pending tasks" reads `golf_tasks.status` + `assigned_to`; completion only updates `golf_task_assignments`, never `golf_tasks.status` | Completed tasks never leave the Hub's pending list (and tasks never appear there at all because `assigned_to` is NULL). | Derive Hub pending tasks from `golf_task_assignments` for the player, keyed on assignment status. |
| MEDIUM | incomplete-feature | vercel.json:36-86 (no task-reminder cron) + src/app/golf/actions/task-reminders.ts:257 `processReminders` | `setTaskReminder` sets `golf_tasks.reminder_at`, but no scheduler ever calls `processReminders`/`getDueReminders`; `golf_task_reminders` is never populated by the UI (no inserts found) | Reminders set in the create modal never fire. This is the spec's open Known Gap. | Add a Vercel cron (or Inngest fn) invoking `processReminders`; and write `golf_task_reminders` rows (or read `golf_tasks.reminder_at` directly). |
| MEDIUM | type-mismatch | src/app/golf/actions/task-reminders.ts:48 | `setTaskReminder` selects `created_by` from `golf_tasks`, but the table has no `created_by` (it is `assigned_by`) | This action errors on the column; it would always return "Task not found"/failure if invoked. Currently latent (file is unimported dead code). | Change `created_by` → `assigned_by`. (And note the Fairway modal uses the correct `setTaskReminder` from `tasks.ts`, not this one.) |
| MEDIUM | type-mismatch | src/app/golf/actions/task-reminders.ts:182-183, 400-401 | Embedded joins `users!assigned_to` / `users!created_by` / `users!assigned_by` assume `golf_tasks.assigned_to` references `users.id`, but it references `golf_players.id` (and `created_by` does not exist) | Reminder emails/in-app notifications would target the wrong/empty user; latent because unscheduled. | Resolve recipient `user_id` via `golf_players.user_id` (assignee) and `golf_coaches.user_id` (creator), not direct `users` FK. |
| LOW | dead-control | src/app/golf/actions/tasks.ts:185 (`uncompleteTask`), :239 (`getPlayerTasks`), :331 (`getTaskCompletionStatus`) | These golf actions are not imported by any golf/fairway UI (grep confirms zero callers) | Dead code; maintenance/confusion risk; suggests an undelivered "undo complete" / "task detail" feature. | Remove, or wire `uncompleteTask` into the card so a player can toggle completion back. |
| INFO | role-leak | src/app/golf/(dashboard)/dashboard/tasks/page.tsx (no in-page gate) | Page has no own role gate; relies on layout role routing + in-page `userRole` checks for coach-only UI (create/templates/reminders). Server actions independently re-check role (`createTask`/`deleteTask`/template/reminder actions all verify `golf_coaches`). | No exploit: a player who reaches the route sees only the read UI; coach mutations are server-enforced. Acceptable for a shared route, but noted that the gate is defense-in-depth at the action layer, not the page. | None required; keep action-level checks. |

### Auth / mutations / states quick-check

- AUTH: every server action in `tasks.ts` calls `supabase.auth.getUser()` and rejects before mutating (e.g. lines 72-75, 401-404, 527-530). Good.
- MUTATIONS: `createTask`/`completeTask`/`deleteTask`/`createTaskFromTemplate` all `revalidatePath('/golf/dashboard/tasks')` + `updateTag(CACHE_TAGS.DASHBOARD)`. No destructive delete-then-insert in save paths (deleteTask is an explicit user delete relying on FK cascade — acceptable).
- CLIENT: server actions use `await createClient()` from server; client modals/hook use client `createClient()`. Correct.
- RLS: `golf_task_assignments` has coach-all + player insert/select/update policies (migration 20260527…:19678-19701) — player can complete their own assignment. `golf_tasks` UPDATE is coach-only (no player policy, :19764), which is why a fix MUST keep player completion on the assignments table, not flip `golf_tasks.status`.
- STATES: loading skeleton present (page.tsx:139-163); empty state present (FairwayTasks EmptyState; legacy TasksList empty block); hook surfaces `error` but the page/Fairway view never render it (no error state shown to the user — MEDIUM-ish UX gap, captured implicitly).
- PAGINATION: task reads are unpaginated single `.select()` (no `.range`), fine for per-team task volumes (well under the 1000-row PostgREST cap).

### Coverage notes

- Could not run the app; all findings are static-traced. The empty-player-tab and "0 of 0" coach claims should be confirmed live by: (a) coach creates a task assigned to a specific player, (b) log in as that player and open `/golf/dashboard/tasks`. Expected per code: the task does NOT appear for the player and shows no per-player progress for the coach.
- Did not deep-verify `CreateFromTemplateModal`/`FairwayCreateFromTemplateModal` internals beyond confirming they call `createTaskFromTemplate` (which inserts the same `golf_task_assignments` rows, so it inherits the same read/write split).
