# BaseballHelm Demo Data Contract

> Single source of truth for "what does representative demo data mean per
> surface" — shared by `scripts/seed-baseball-surfaces-demo.ts` (the seeder)
> and `scripts/verify-baseball-demo-coverage.ts` (the verifier). If you change
> the shape seeded for a table, update this doc and the route mapping below
> in the same change.

Companion docs:
- `docs/audits/BASEBALLHELM_STALE_SURFACE_AUDIT_2026-06-25.md` — the original
  audit that enumerated the 13 empty tables this contract closes.
- `scripts/seed-baseball-demo.ts` — Phase 1 (org/team/coach/roster + core
  surfaces).
- `scripts/seed-baseball-lifting-demo.ts` — Phase 2 (Helm Lifting Lab).
- `scripts/seed-baseball-surfaces-demo.ts` — Phase 3 (this contract).

## Seed run order

BaseballHelm demo data is layered. Each phase **re-derives** the prior
phase's deterministic ids from the same namespace instead of re-seeding them,
so phases can be re-run independently and in any order *after* their
dependency has run at least once.

| Phase | Script | Depends on | Seeds |
|---|---|---|---|
| 1 | `scripts/seed-baseball-demo.ts` | — | Org, team, coach + 8-player roster, calendar, practice plan, lift assignments (Lite), readiness, coach insights, timeline events, one `baseball_import_runs` row. |
| 2 | `scripts/seed-baseball-lifting-demo.ts` | Phase 1 | Helm Lifting Lab: lifting-coach identity, programs/weeks/days/sections/prescriptions, sessions, set results, readiness check-ins. |
| 3 | `scripts/seed-baseball-surfaces-demo.ts` | Phase 1 (player/coach ids only — does **not** depend on Phase 2) | Every table this contract documents below. |

Run them in order for a from-scratch demo team. Re-running any phase alone
is always safe (idempotent upserts) — it just won't create anything the
dependency phase hasn't created yet (gracefully skipped, not a crash).

```bash
# 1. Org + team + roster + core surfaces
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-demo.ts --confirm

# 2. Helm Lifting Lab
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-lifting-demo.ts --confirm

# 3. Messaging / video / tasks / strength groups / dev plans / seasons / imports / stats
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-surfaces-demo.ts --confirm

# Verify coverage (any time, read-only, no --confirm flag needed)
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-baseball-demo-coverage.ts

# Same alignment flow as one npm script
DOTENV_CONFIG_PATH=.env.local npm run seed:baseball:demo
```

## Safety guarantees (all three seed scripts)

- **Dry-run by default.** No flag → prints the exact plan (table + row
  counts) and writes **nothing**. Pass `--confirm` to actually write.
- **Deterministic ids.** Every row id is `sha1("<namespace>:<key>")` formatted
  as a v5-shaped UUID (`detId()` / `p1Id()`). Re-running a phase upserts the
  *same* rows by primary key — never a duplicate, never delete-then-insert.
- **Upsert-only writes.** Every write goes through a single `upsert(table,
  rows, conflict)` helper using `.upsert({ onConflict })`. No `.delete()`
  anywhere in any of the three scripts.
- **Graceful schema-skip.** If a table or column referenced by the script
  does not exist yet on the target database (a forward-looking migration
  that hasn't been applied), the upsert for *that table only* is caught,
  logged under "Skipped (schema not present)", and the script continues.
  A schema-skip never aborts the run and never throws.
- **Scoped to demo ids only.** Every row is keyed off the Phase-1 demo
  org/team/coach/roster ids. Nothing outside that scope is ever read or
  written.
- **Non-destructive auth.** Auth users are looked up by email first; Phase 3
  never creates new auth users — it only reads the coach/player ids Phase 1
  already created. If a referenced user is missing (Phase 1 hasn't run),
  the user-dependent tables (conversations/messages) are skipped with a
  clear warning instead of failing the whole run.

## Schema caveats (read before touching column names)

These tables have **forward-looking migrations** in `supabase/migrations/`
that are explicitly marked `WRITTEN, NOT APPLIED` in their own header
comments, and hand-authored TypeScript types exist specifically because
`src/lib/types/database.ts` (auto-generated from a live `supabase gen types`
run) cannot be regenerated against a schema that hasn't landed yet:

- **`baseball_seasons`** — production currently exposes the generated-type
  shape: `season_name` / `season_year` / `start_date` / `end_date` /
  `created_by_coach_id` / `lifting_enabled`. The app normalizes this back to
  the UI contract (`label`, `starts_on`, `ends_on`, `created_by`,
  `lift_groups_enabled`) at the action boundary.
- **`baseball_import_sources`** — production currently exposes
  `adapter_key` / `config_json` / `is_active`, with legacy CHECK constraints
  (`dedupe_strictness` accepts `strict|loose`; `player_match_strategy`
  accepts `name_fuzzy`). The app normalizes reads back to
  `source_type` / `enabled` / `name_then_external_id`, and writes the live
  accepted values.
- **`baseball_import_runs`** — link a run to its registry row via
  `source_config_id` (added by
  `20260624000460_baseball_import_registry_load_bearing.sql`, confirmed
  live in `database.ts`); identify the run with `source_id` /
  `source_label` / `status` (`pending|parsing|matching|review|committed|
  rolled_back|failed`), **not** a `name`/`type` pair.
  `baseball_player_stats` has **no** `season_id` column — stats are not
  season-scoped at the row level.

All other tables in this contract match `src/lib/types/database.ts` *and*
the originally-applied baseline (`supabase/migrations/
20260527000000_prod_public_baseline.sql`) *and* current production server
actions 1:1 — there is no ambiguity for those.

## Per-table contract

Every row below is scoped to the Phase-1 demo team (`baseball_teams` row
named "Demo University Baseball") and its 8-player roster.

| Table | Anchoring parents | Min shape seeded | Primary route(s) |
|---|---|---|---|
| `baseball_conversations` | `team_id`, `created_by` (coach auth user id) | 1 team chat (`is_team_chat=true`) + 1 coach↔player direct thread | `/baseball/dashboard/messages` |
| `baseball_conversation_participants` | `conversation_id`, `user_id` | All 9 team-chat participants (coach + 8 players) + 2 direct-thread participants | `/baseball/dashboard/messages` |
| `baseball_messages` | `conversation_id`, `sender_id` | 5-message team-chat exchange + 4-message direct exchange, mixed `read` true/false | `/baseball/dashboard/messages` |
| `baseball_videos` | `player_id`, `team_id` | 5 rows across 4 players: mixed `video_type`, one `is_primary`, one clip with `parent_video_id` | `/baseball/dashboard/videos` |
| `baseball_tasks` | `team_id`, `created_by_id` (coach) | 5 tasks spanning every `status` (`pending/in_progress/completed/overdue/cancelled`), `category`, and `priority` value | `/baseball/dashboard/tasks` |
| `baseball_task_assignments` | `task_id`, `player_id` | 8 assignments across the 5 tasks, spanning `status` (`pending/in_progress/completed`) | `/baseball/dashboard/tasks` |
| `baseball_strength_groups` | `team_id`, `created_by_coach_id` | 1 static group (Pitching Staff) + 1 dynamic group (small `rule_json`) | `/baseball/dashboard/performance/groups` |
| `baseball_strength_group_members` | `group_id`, `player_id` | 2 pitchers in the static group, 4 players in the dynamic group | `/baseball/dashboard/performance/groups` |
| `baseball_developmental_plans` | `coach_id`, `player_id`, `team_id` | 3 plans (mixed `active`/`draft` status, `goals` JSON array) | `/baseball/dashboard/dev-plans`, `/baseball/dashboard/dev-plan` |
| `baseball_seasons` | `team_id`, `created_by` | 1 current season (`is_current=true`, `status='active'`) + 1 archived season | Settings → Season; `/baseball/dashboard/settings` |
| `baseball_import_sources` | `team_id` | 2 registered sources (TrackMan device-export, GameChanger staff-entered) | `/baseball/dashboard/import`, Settings → Import Sources |
| `baseball_import_runs` (Phase-3 addition) | `team_id`, `source_config_id` | 1 additional committed run referencing the new TrackMan registry row | `/baseball/dashboard/import` |
| `baseball_stat_uploads` | `team_id`, `coach_id`, `import_run_id` | 1 completed upload linked to the Phase-3 import run | `/baseball/dashboard/import` |
| `baseball_player_stats` | `team_id`, `coach_id`, `player_id` | 3 sessions per player (1 practice + 2 game) × 8 players = 24 rows, batting/pitching/fielding fields filled per position | `/baseball/dashboard/stats`, `/baseball/dashboard/stats/team` |
| `baseball_player_aggregates` | `player_id`, `team_id` | 1 row per player (8 total), computed from the seeded `baseball_player_stats` rows so career/game/practice averages are internally consistent | `/baseball/dashboard/stats`, player profile |

## Intentionally-empty surfaces (NOT a coverage gap)

These tables are deliberately left at zero rows for the demo team. They are
informational-only in `verify-baseball-demo-coverage.ts` and never fail the
exit code:

| Table | Why it stays empty |
|---|---|
| `baseball_recruiting_interests`, `baseball_watchlists` | The demo team (`player_type='college'`, `recruiting_activated=false` on every roster player) is a *college roster*, not a recruiting pipeline. College players never activate recruiting (see `CLAUDE.md` "Recruiting Activation Model"). Seeding recruiting data here would be product-incorrect, not just incomplete. |
| `baseball_decision_log`, `baseball_meeting_items`, `baseball_signals`, `baseball_actions` | "Decision Room" is a separate CoachHelm-adjacent workflow (`src/lib/baseball/read-models/decision-room/`) built on top of *other* already-seeded surfaces (readiness, lift, insights, games). It is out of scope for this demo-coverage pass — not audited as empty in the original stale-surface audit. |
| `baseball_video_events` | The staff-anchored film-tagging queue (Event/Tagged/Evidence video views) is distinct from the player-uploaded `baseball_videos` library this contract seeds, and was not in the original audit's empty-table list. |

## Verifying coverage

```bash
DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-baseball-demo-coverage.ts
```

Prints one line per table in the contract above: route, table, expected
status, actual row count for the demo team, and PASS/FAIL. Exits non-zero
only if a table marked **required** above has zero rows for the demo team;
intentionally-empty surfaces are printed as informational and never fail
the run.
