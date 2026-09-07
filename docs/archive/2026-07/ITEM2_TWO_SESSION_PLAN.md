<!--
STATUS: SUPERSEDED
DATE: 2026-07-10
SUPERSEDED BY / WHY: 2026-07-01 workload-split plan for "Lane B = Fairway Phase B" work. Superseded by later iterations of the same Fairway-migration planning lineage: docs/baseball/ui-migration-execution-plan.md (07-03) and docs/baseball/ui-migration-map.md (07-09).
KEPT FOR HISTORY -- do not delete this file.
-->

# Item-2 Workload-Sharing Plan — Two Sessions (2026-07-01)

> Follows the BaseballHelm clean-slate landing: **all 53 PRs merged + 19 migrations applied to prod**.
> **Item 1 (merge PR #622 — the `#406` migration-file/`database.ts` fix) is owned by Nick.**
> **Item 2 (the remaining escalations + Fairway Phase B) is split below across two sessions.**
> Grounded in a live-DB + merged-code scout (2026-07-01); each area re-verified against `information_schema`/`pg_policies`, **not** `list_migrations` (the recorded-but-drifted gotcha).

## The split (why)
- **Lane A = this session — "Correctness & Security" (backend).** Everything touching **server actions, hooks, RLS, migrations, and data fetches.** This session already has the live-DB verification discipline and the applied-migration context.
- **Lane B = another session — "Fairway Phase B" (presentation only).** Migrate `(dashboard)` leaf UIs to `src/components/fairway/*`, flag-gated, **never touching actions/RLS/migrations/data paths.** Highly parallelizable (~36 small PRs).

This keeps the lanes **file-disjoint**: Lane A owns `src/app/baseball/actions/**`, `src/lib/baseball/**`, `src/hooks/**`, `supabase/migrations/**`, `src/components/messages/**`, `src/components/panels/TeamPeekPanel.tsx`, and the public `program/[id]`/`team/[id]` pages. Lane B owns `src/app/baseball/(dashboard)/**` leaf `page.tsx` + `src/components/baseball/**` client components + `src/components/fairway/*` imports. See the **Collision protocol** at the bottom for the few shared components.

---

## STANDING RULES (both lanes — binding)
1. **Verify live schema, never trust migration history.** Query `information_schema`/`pg_policies`/`pg_constraint` before writing any DB or data-fetch code. The history shows objects "applied" whose columns never landed.
2. **Migrations: additive & idempotent only.** `CREATE OR REPLACE`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS`→`CREATE POLICY`, `to_regclass()`-guarded `DO` blocks. **Never `GRANT … TO anon`** (verify `pg_class.relacl` after any view/table create — recreate re-grants anon). No destructive `DROP TABLE/COLUMN`, no `DELETE`-then-`INSERT` in save/submit/sync.
3. **PR size cap:** ≤15 files / ~400 lines, **one surface per PR.** Split large client components across sub-PRs.
4. **Adversarial verify** every fix (independent reviewer: does it fix the bug? do all referenced columns exist live? auth/return-shape preserved? no regression? scoped correctly?). Rework REJECT/AWC before shipping.
5. **Do NOT rotate the leaked service_role key / demo creds, do NOT touch `scripts/*` secret issues #516/#391** — owner-declined, settled.
6. **Migrations are applied via MCP `apply_migration`** (this project's pattern) after the PR merges — Lane A owns *all* migration authoring **and** application, in timestamp order, dependency-checked.
7. **Merging:** the auto-mode classifier blocks self-authored `--admin` merges; Nick merges, or an allow-rule is added. Stage clean PRs regardless.

---

# LANE A — this session (Correctness & Security)

Ordered by impact × independence. ~9 PRs.

### A1 · join_code residual — **app-only, no migration, independent** (1 PR) ✅ start here
The RPC/RLS core (`try_redeem_baseball_team_invitation`, `can_insert_baseball_team_member`, rebuilt `baseball_team_members_insert`) is confirmed applied & correct. Two residual app bugs:
- **Dead invite links:** `src/components/coach/InviteModal.tsx` (line ~69 + displayed value ~161) builds `` `${origin}/join/${code}` `` — there is **no `/join/[code]` route** (only `/baseball/join`, `/golf/join`, `/lifting/join`) and no redirect/rewrite. Every link 404s. **Fix:** prefix `/baseball`. (Contrast: `BaseballInviteButton.tsx` + `teams/TeamsClient.tsx` build the correct `/baseball/join/${code}`.)
- **No dual-lookup fallback at code-entry points:** `src/app/baseball/(onboarding)/player/page.tsx` (~132) and `src/components/baseball/player-today/PlayerTodayTeamless.tsx` (~105) call `processTeamInvitation()` unconditionally → a valid *persistent* `baseball_teams.join_code` typed here returns "Invalid invitation code". **Fix (preferred, single-point):** in `processTeamInvitation()` (`teams.ts` ~479, on `!invitation`) fall back to `joinTeamByCode(code, playerId)` before failing — keeps all three entry points in sync.
- **Files:** `InviteModal.tsx`, `teams.ts` (+ verify `join-team-client.tsx`/`join/[code]/page.tsx` already correct — no change).
- **Acceptance:** link from Roster "Invite Players" resolves to a working join page; a persistent join_code typed into onboarding/teamless widget joins the team; `team-join-code.test.ts` still green + a new case for the fallback.

### A2 · baseball_signals write-path — **1 migration + app error-surfacing** (1 PR, high impact)
Live: `baseball_signals` has **0 rows** — the entire Signal Inbox pipeline is a silent no-op in prod. Two independent causes:
- `uq_baseball_signal_dedupe` is `UNIQUE (team_id, dedupe_key) **DEFERRABLE**` → Postgres won't use it as an `ON CONFLICT` arbiter; the redundant partial idx `baseball_signals_dedupe_open_uidx` is also ineligible for a bare column-list conflict → every `.upsert({onConflict:'team_id,dedupe_key'})` fails.
- `baseball_signals_disposition_check` drifted to 5 values incl. a stray `'open'`; app writes `'new'`/`'sample_too_small'`/`'converted'` (7-value `BaseballSignalDisposition`).
- **Migration** (`<ts>_fix_baseball_signals_dedupe_and_disposition.sql`): `ALTER CONSTRAINT uq_baseball_signal_dedupe NOT DEFERRABLE;` · `DROP INDEX IF EXISTS baseball_signals_dedupe_open_uidx;` · drop+re-add `baseball_signals_disposition_check` with the 7 real values (table empty → no data risk).
- **App:** `operational-signals.ts` (~731-772) and `engine-run.ts` (~769-793) currently swallow `upsertErr`/`sigErr` and `return {success:true}` — surface the failure (`success:false`). Also `signals.ts` (~669 `'converted'`).
- **Files:** new migration, `operational-signals.ts`, `engine-run.ts`, `signals.ts`, `src/lib/types/baseball-signals.ts` (verify enum). **⚠ shares `engine-run.ts` with A4 — do A2 first, then A4 rebases.**
- **Acceptance:** a seeded signal upsert succeeds post-migration; a simulated upsert error surfaces `success:false`; `baseball_signals` starts accumulating rows.

### A3 · baseball_coaches PII leak — **3 sequential PRs** (⚠ one owner-decision flag)
Live-confirmed: `baseball_coaches_select_all USING(true)` **and** an over-broad `baseball_coaches_select` (`get_my_coach_id() IS NOT NULL`) both expose `email`/`phone` of every coach to any authenticated user, cross-org.
- **PR A3a (view migration):** `CREATE VIEW public.baseball_coaches_public (id, user_id, organization_id, coach_type, full_name, avatar_url, title)` (`security_invoker=false`), `GRANT SELECT TO authenticated` only — **verify no anon grant** (`pg_class.relacl`).
- **PR A3b (app repoints — must merge+deploy before A3c):** point identity-only consumers at the view; drop `email` (and fix the pre-existing `first_name`/`last_name`→`full_name` bug) in the over-fetchers:
  - `TeamPeekPanel.tsx`, `src/app/baseball/(public)/program/[id]/page.tsx`, `src/app/baseball/(public)/team/[id]/page.tsx` — drop `email`, fix name cols.
  - `NewMessageModal.tsx`, `use-messages.ts` (already non-PII columns — repoint to the view; `use-messages` FK-embed must become a **two-step** `.in('user_id',…)` fetch since PostgREST won't embed a view).
  - `CollegeInterestClient.tsx` — already non-PII, repoint for consistency.
  - **No change (verify only):** `decision-room/staff-settings.ts` + `staff.ts` invite-dedupe legitimately need teammate-scoped `email` and are already `team_id`-scoped.
- **PR A3c (RLS narrow migration):** `DROP POLICY baseball_coaches_select_all` + `DROP POLICY baseball_coaches_select`; `CREATE POLICY baseball_coaches_select_self_or_teammate` (`auth.uid()=user_id OR shared-active-team via baseball_team_coach_staff`, reusing `get_my_coach_id()` + active-status semantics). **Only after A3b is deployed & verified** (else identity reads break before repoint lands).
- **⚠ OWNER DECISION (do not infer):** should recruiting coaches see a *rival* program's coaching-staff identity (non-PII) in Discover/program profiles? Today the `baseball_team_coach_staff` SELECT policy already blocks foreign-org staff joins, so Discover shows empty regardless. If yes, needs a deliberate `organization_id`-keyed SECURITY DEFINER RPC over `baseball_coaches_public`. **Flag to Nick before building.**
- **Acceptance:** `pg_policies` shows only self-or-teammate SELECT; player→coach messaging, decision-room staff email, and staff invite-dedupe all still work; no anon grant on the view.

### A4 · elite stat-event + baseball_ai_audit — **needs a focused re-scout first** (est 1-2 PRs)
The scout agent for this area hit the output cap — **re-investigate before fixing.** Known shape: `src/lib/baseball/coachhelm/engine-run.ts` writes elite stat-event columns (from `20260624000080`) + `baseball_ai_audit` (from `20260624000450`) that don't exist live (drift), and a `baseball_ai_audit` upsert targets a partial index. **Do a targeted read-only re-scout** (engine-run.ts writes vs live `information_schema`), then an **additive reconcile migration** (add missing columns / fix the upsert arbiter) + app reshape. **Shares `engine-run.ts` with A2 → sequence after A2.**

### A5 · tasks + camps phantom columns — **app-only correctness** (1-2 small PRs)
- `tasks.ts` `getPlayerTasks` (~278-282) selects/orders by `baseball_task_assignments.created_at` — **column doesn't exist live** (only `id,task_id,player_id,status,completed_at,notes`). The returned `created_at` is actually sourced from the joined `baseball_tasks.created_at`, so the assignment-side select is pure dead/broken. **Fix:** drop `created_at` from the select + order by `id` (or the task join); drop it from `BaseballTaskAssignment`. Independent, no PR overlap.
- `camps/[id]/page.tsx` reads/orders `registered_at` + writes `attended_at` on `baseball_camp_registrations` — **neither exists live.** **Fix (app-only preferred):** drop those refs, order by `created_at`, represent checked-in via `status==='attended'`. (Do **not** fold into #564 unless coordinating with Lane B's #564 shepherding — see below.)

### A6 · camps capacity — PR #564 (already authored, CI-red)
`#564` (`fix/baseball-442-camps-correctness`) already fixes camp capacity/re-register with a schema-correct SECURITY DEFINER RPC (`baseball_register_for_camp`) + migration `20260701000442`. **Lane A owns getting its CI green, merging, and applying its migration** (migrations are Lane A's domain). Fold the A5 `camps/[id]` phantom-column fix into the same review if convenient.

---

## LANE A — LIVE STATUS (this session; updated as PRs open — **Lane B: defer the files listed here**)
_As of 2026-07-01 (newest first):_
- ✅ **PR #624** — A1 join_code residual: `src/components/coach/InviteModal.tsx`, `src/app/baseball/actions/teams.ts`. _(Lane B doesn't touch these.)_
- 🔜 **A2 signals** (next): `operational-signals.ts`, `engine-run.ts`, `signals.ts` + 1 migration. _(Lane B: `signals` surface is Wave 7 — safe, different files, but rebase if timing overlaps.)_
- 🔜 **A3 coaches-PII** (3 PRs): will touch `NewMessageModal.tsx`, `use-messages.ts`, `TeamPeekPanel.tsx`, `program/[id]/page.tsx`, `team/[id]/page.tsx`, `CollegeInterestClient.tsx` + 2 migrations. **⚠ Lane B: DEFER `discover`, `college-interest`, and `messages` surfaces until A3b merges.**
- 🔜 **A4 elite-stat/ai_audit**: `engine-run.ts` (+ reconcile migration) — re-scout pending.
- 🔜 **A5 tasks/camps phantom cols**: `tasks.ts`, `camps/[id]/page.tsx`. **⚠ Lane B: defer `camps` surface until this + #564 merge.**
- 🔜 **A6**: shepherd PR #564 (camps capacity).

**Lane B — clear to start NOW:** Wave 1 (command-center, roster, calendar, tasks, announcements) and Wave 2 items `documents`, `travel`, `team` do **not** overlap any Lane A file. Only `messages` (Wave 2), `discover`/`college-interest` (Wave 5), `signals` (Wave 7), `camps` (Wave 7) are gated on Lane A per the collision table below.

---

# LANE B — another session (Fairway Phase B, presentation only)

**Scope:** migrate `src/app/baseball/(dashboard)/dashboard/**` leaf UIs to `src/components/fairway/*`, **flag-gated behind `isRedesignEnabled()`**, **presentation-only** (per `docs/fairway-baseballhelm-migration-plan.md` §6: never touch server actions, read-models, RLS, migrations, data paths). Phase A shell (`BaseballFairwayShell`, #591) is merged. **36 surfaces, ~36 PRs, 10 waves.** One surface per PR; reuse `fairway/*`, never copy into `components/baseball/`; green typecheck + lint-ratchet + baseball smoke + visual-parity per §6.

**Golf reference templates:** `src/components/fairway/pages/*` (`dashboard, roster, calendar, tasks, announcements, messages, documents, travel, team, team-hub, settings, recruiting, coachhelm, hub, …`) + primitives (`cards-insight, charts, data-table, forms, controls, overlays, feedback, view-header, instrument, calendar`).

### Ordered waves (lowest-risk / highest-traffic first)
- **Wave 1 — coach core (5):** command-center→`dashboard`; roster (965-line `RosterClient` → **split 2 PRs**); calendar; tasks; announcements.
- **Wave 2 — team utility (4):** messages(+[id]); documents; travel; team + team/high-school.
- **Wave 3 — stats/perf/lift (6):** stats-center; my-stats; readiness; lift(+[sessionId]); performance overview+builder+groups; performance live+players/[id]+programs(+[programId]).
- **Wave 4 — player profile / recruiting docs (3):** players/[id] core (index/profile/stats); players/[id] passport+scout-packet(+preview); scout-packets list.
- **Wave 5 — recruiting suite (3):** pipeline (1010-line `PipelineClient` → **split 2**); watchlist+discover; colleges+college-interest+compare+comparisons.
- **Wave 6 — CoachHelm-analog (3):** decision-room; postgame; practice-effectiveness.
- **Wave 7 — long tail (7):** academics (716-line → maybe 2); camps(+[id]); videos(+[id],[id]/edit); signals; journey; dev-plan+dev-plans(+[id]) (745-line → budget 2); import.
- **Wave 8 — settings (3 batched):** root+staff/roles/permissions/philosophy; account group (notifications/appearance/ai/demo-mode/privacy/player-access/guardian-access/data-retention); org group (program/teams/season/integrations/imports/recruiting-preferences/showcase-profile/audit).
- **Wave 9 — showcase-org admin (2):** organization+teams(showcase); activate+analytics.
- **Wave 10 — stat-entry tools (2, last):** stats/games(+[gameId],create,new); stats/season+stats/upload.

**Out of scope (own future pass):** the `(player-dashboard)` route group (Player Today, passport, timeline, practice) — `BaseballFairwayShell` only wraps `(dashboard)`; that group needs its own Phase-A shell adoption before leaf migration.

### Lane B secondary: shepherd nothing that Lane A owns
Lane B does **not** author migrations or touch actions. If Lane B reaches a surface where Lane A has an open data-fetch PR (see protocol), **skip it and move to the next surface**, circling back after Lane A's PR merges.

---

## COLLISION-AVOIDANCE PROTOCOL (the few shared files)
Lane A changes **data fetches inside a handful of client components** that Lane B will also presentation-migrate. Rule: **Lane A owns the data-fetch lines; Lane B rebases/defers those specific surfaces.**

| Shared file | Lane A change | Lane B action |
|---|---|---|
| `DiscoverClient.tsx` / `TeamPeekPanel.tsx` | A3b drops `email`, fixes coach name cols | Migrate **discover** surface (Wave 5) **after** A3b merges |
| `CollegeInterestClient.tsx` | A3b repoint to view | Migrate **college-interest** (Wave 5) **after** A3b |
| `NewMessageModal.tsx` / `use-messages.ts` | A3b repoint to `baseball_coaches_public` | Migrate **messages** (Wave 2) **after** A3b; leave the query alone |
| `camps/page.tsx` / `camps/[id]/page.tsx` | A5/#564 (capacity RPC, phantom cols) | Migrate **camps** (Wave 7) **after** #564 + A5 merge |
| `engine-run.ts` | A2 then A4 | Lane B never touches (not a leaf UI) |

**Both lanes, every PR:** run `git log -5 -- <file>` and `gh pr list --search "<file>"` before editing; if the other lane has an open PR on that exact file, coordinate or defer. Prefer **file-disjoint** batches so neither lane blocks the other.

---

## OWNER-DECISION-GATED (do not build blind)
1. **Discover/program foreign-org coaching-staff visibility** (A3) — is showing rival-program coach identity (non-PII) intended? Flag before building the org-keyed RPC.
2. **Merges** — self-authored `--admin` merges are classifier-blocked; Nick merges each staged PR (or adds an allow-rule).
3. **camps real check-in timestamps** (A5) — app-only removal is default; only add `registered_at`/`attended_at` columns if the product wants real timestamps.

## Status pointers
- Landing state + morning summary: `docs/audits/AUTONOMOUS_RUN_STATUS_2026-07-01.md`
- Fairway playbook: `docs/fairway-baseballhelm-migration-plan.md` (§5 canonical pages, §6 agent brief, §7 order)
- Nav manifest: `src/lib/baseball/nav-registry.ts` (`getVisibleBaseballNav()`), flag: `src/lib/redesign/flag.ts`
- Scout raw findings: workflow `wf_77ace44a-d74` (task `weahiro97`)
