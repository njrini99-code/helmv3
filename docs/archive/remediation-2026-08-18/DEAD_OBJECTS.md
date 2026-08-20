# Dead database objects — discovery only

# ⚠ READ THE STATS WINDOW FIRST: **20 days 14 hours**

Index-usage evidence in this document rests entirely on that window.

- `pg_postmaster_start_time()` = **2026-07-29 13:40:47 UTC**; uptime at measurement
  (2026-08-19 04:06 UTC) = **20 days 14:25**.
- `pg_stat_database.stats_reset` is **NULL** — no *explicit* reset recorded. NULL is
  ambiguous, not reassuring, so it is not the evidence here; the uptime is.
- **The stats are real, not freshly zeroed:** 893 of 1,523 indexes have a non-zero
  scan count, the busiest shows 404,459,547 scans, and 335 tables show scan
  activity. A just-reset counter set would show near-zero everywhere.

**What 20 days can and cannot support.** It is enough to say an index was not used
during a normal operating fortnight. It is *not* enough for seasonal access
patterns — this is a college golf and baseball product, measured in **August**.
Recruiting-cycle, season-start, qualifier and postseason paths may legitimately
not have run. Treat "0 scans" as *a reason to look*, never as proof of death.

Note the window opens at **2026-07-29**, the date of the documented Supabase
outage/DB wedge. The restart that began this stats window was very likely that
incident.

---

## The reframe: this cleanup is not worth doing for space

**All 359 never-scanned indexes total 6,104 kB — about 6 MB.**

Dropping every one of them reclaims ~6 MB on a database whose largest single index
has served 404 million scans. Anyone reading "359 unused indexes" will picture a
significant reclaim; there isn't one. The real cost of a redundant index is **write
amplification** — every INSERT/UPDATE maintains it — not storage. So the case for
touching any of these is write throughput on hot tables, and it should be argued
per-table, not as a 359-item sweep.

**Also: 0 of the 359 back a constraint.** No UNIQUE or PK index is in this list —
those were excluded by construction, so nothing here is a correctness object
misfiled as dead.

---

## Split by directive

Per the owner, via `helmv3-c9`:

- **GOLF — NOTE ONLY.** Nothing dropped, not even a provably-unused index. The bar
  is the owner reviewing it in the morning, not proof.
- **BASEBALL — actionable.** Seed data; rows do not protect a baseball object.

**I have deleted nothing and am not going to.** This is a discovery pass, and four
Claude sessions are live in this working tree with uncommitted feature work in it.
Deletions need reachability proof, an isolated commit and a build — that is a
separate workstream, and starting it here at 04:00 against other sessions' in-flight
edits is how you break something nobody can attribute in the morning.

| Class | golf (note only) | baseball (actionable) | lifting | crm | other |
|---|---:|---:|---:|---:|---:|
| Never-scanned indexes | 57 | **179** | 49 | 16 | 58 |
| Duplicate index groups | 14 | **16** | 2 | 2 | 6 |
| Zero-row tables | 21 | **46** | 13 | 4 | 9 |

---

## Class 1 — Duplicate / redundant indexes (40 groups) — STRONGEST EVIDENCE

**This class does not depend on the stats window at all.** Two indexes on the same
table over the same column list are redundant by structure, whatever the usage
counters say. If anything here gets acted on, start here.

The dominant pattern is a hand-rolled index duplicating the index Postgres already
created for a UNIQUE constraint — the `_key` suffix is the giveaway:

| Table | Redundant pair |
|---|---|
| `baseball_coaches` | `baseball_coaches_user_id_key` ‖ `idx_baseball_coaches_user_id` |
| `baseball_players` | `baseball_players_user_id_key` ‖ `idx_baseball_players_user_id` |
| `baseball_player_settings` | `baseball_player_settings_player_id_key` ‖ `idx_baseball_player_settings_player_id` |
| `baseball_coach_philosophy` | `baseball_coach_philosophy_coach_id_key` ‖ `idx_baseball_coach_philosophy_coach_id` |
| `baseball_teams` | `baseball_teams_join_code_key` ‖ `idx_baseball_teams_join_code` |
| `baseball_team_invitations` | `baseball_team_invitations_code_key` ‖ `idx_baseball_team_invitations_code` |
| `approach_miss_details` | `approach_miss_details_shot_id_unique` ‖ `idx_approach_miss_details_shot_id` |

In each pair the `_key`/`_unique` index is constraint-backing and **must stay**; the
`idx_*` twin is the redundant one.

⚠ **`approach_miss_details` is golf shot-detail data — NOTE ONLY**, despite being the
cleanest example in the list.

**Confidence:** HIGH (structural). **What breaks if I'm wrong:** for a genuine
duplicate, nothing — the constraint index serves the same lookups. The failure mode
is misreading which of the pair is constraint-backed and dropping that one, which
would silently remove a uniqueness guarantee. Verify `pg_constraint.conindid` per
pair before touching any of them.

## Class 2 — Never-scanned indexes (359)

179 baseball (actionable), 57 golf (note only), 49 lifting, 16 crm, 58 other.
Full rows with table, scan count and size in `raw_dead.json` (`kind=1_unused_index`).

**Confidence:** LOW-to-MEDIUM individually, and it is the seasonality caveat above
that caps it, not the window length. **What breaks if I'm wrong:** a query that runs
monthly or seasonally goes from index scan to sequential scan. On a small table that
is invisible; on a large one it is a production timeout. Given the ~6 MB total, the
upside does not obviously justify that risk for any of them.

## Class 3 — Zero-row tables (93 confirmed by exact count)

46 baseball · 21 golf · 13 lifting · 4 crm · 9 other.

Golf zero-row tables (**NOTE ONLY**): `golf_academic_exclusions`,
`golf_announcement_tasks`, `golf_attendance_summary`, `golf_coach_behavior_log`,
`golf_coach_blocked_time`, `golf_coach_player_intent`, `golf_course_holes`,
`golf_event_documents`, `golf_ingest_connections`, `golf_ingest_sync_log`,
`golf_message_attachments`, `golf_platform_metrics_daily`, `golf_practice_sessions`,
`golf_qualifier_selections`, `golf_recruit_documents`, `golf_review_events`,
`golf_staff_invite_codes`, `golf_staff_invite_redemptions`, `golf_task_reminders`,
`golf_travel_budgets`, `golf_travel_expenses`.

**Two of those are brand new, not dead:** `golf_staff_invite_codes` and
`golf_staff_invite_redemptions` were created by `helmv3-cb` **tonight** and are empty
because the feature has not shipped. This is the exact trap in this class — an empty
table is equally consistent with "abandoned" and "not launched yet".

**Confidence:** the row counts are HIGH (exact `count(*)`, not estimates). The
*deadness* inference is LOW without a code-reference check, which this pass did not
do. **What breaks if I'm wrong:** dropping a table backing an unshipped or seasonal
feature breaks it at launch, with no failing test to catch it beforehand.

## Class 4 — RLS enabled, zero policies (3)

`billing_customers` · `billing_invoices` · `crm_email_templates_backup_20260720`

These are **deny-all through PostgREST** — RLS on with no policy means no row is
ever visible to the API. That is **fail-safe, not a leak**, and the correct
description of `crm_email_templates_backup_20260720`, one of the two out-of-band
objects in the original brief. Its name and 40 rows read as a `CREATE TABLE AS
SELECT` snapshot taken before a destructive edit — a data-preservation artifact.

The two `billing_*` tables are worth a deliberate decision rather than a cleanup:
if anything is *meant* to read them through the API, it currently cannot.

---

## Instrument corrections made during this pass

Recorded because each would have shipped a wrong list to the morning review.

1. **`reltuples <= 0` is not "empty".** In PG14+ `reltuples = -1` means **never
   analyzed**. That first pass reported **124** empty tables including
   `golf_coaches` — which has **17** rows. 123 tables carry `-1`. Re-derived with
   an exact `count(*)` per table via `query_to_xml`: the true figure is **93**.
   Caught by a sanity check on a table that could not possibly be empty.
2. **`stats_reset IS NULL` is not evidence of a long window.** It records only that
   no explicit reset happened. The defensible bound is `pg_postmaster_start_time()`,
   corroborated by the distribution of non-zero scan counts.
3. **Constraint-backing indexes had to be excluded explicitly**, or every UNIQUE
   index with no lookup traffic would appear as a droppable dead object.

## Not covered

- **No code-reference check.** Nothing here was cross-referenced against `src/`, so
  "zero rows" and "zero scans" are database-side facts only. The
  columns-never-read-in-`src/` item from the brief is **not started**.
- **Policies that can never match** (contradictory or shadowed) — **not started**.
- **Definer functions with zero callers** — **not started** (the manifest covers
  their grants and bodies, not their call sites).
- The **82 overlapping authenticated policy groups** — **not started**, deferred
  deliberately in favour of finishing this inventory.
