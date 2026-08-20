# Dead code + dead Supabase — full audit, 2026-08-20

Every number here was measured, not estimated. Where I could not verify a
claim, it is in the **Unverified** section at the bottom rather than in a
finding.

Three claims I made mid-audit did not survive verification and are corrected
in place rather than quietly removed — **C2**, **C3**, and the note under
**A2**. Two of them were going to be my top recommendations. They are left
visible because in each case the correction turned out to be the more useful
finding, and because a list of dead things is only worth as much as its
willingness to say which of its own entries were wrong.

---

## Method, and why the numbers can be trusted

Four independent instruments, deliberately chosen to fail differently:

| instrument | what it sees | blind spot |
|---|---|---|
| `pg_stat_user_tables` on production | what has actually been written/read, ever | says nothing about intent |
| `git ls-files` reference count | what the code names | counts a mention in a comment |
| import-graph BFS from route entry points | what a user can actually reach | misses framework magic |
| `knip` + repo's own `orphans:mounts` | unused files/exports | Next.js server actions |

**Phantom directories were excluded from every search.** `.deepsec/` (7,990
`.ts/.tsx`), `.worktrees/` and `.claude/worktrees/` are gitignored but fully
visible to `find`/`grep`/`rg`. Every scan here went through `git ls-files` or
`git grep`, which honour gitignore. This matters more than it sounds: those
trees hold roughly two copies of `src/` and would have made most dead things
look alive.

**A caveat that shapes the whole DB section.** `track_functions` is `none` on
this Postgres, so `pg_stat_user_functions` reports 0 calls for every function
including ones that obviously run. Function liveness here is therefore derived
from live `pg_policies` bodies, live `pg_trigger` rows, `pg_get_functiondef`
of every other function, and code references — never from call counts.

---

## Headline

| | |
|---|---|
| Tables in `public` | **268** (types match production exactly — no drift) |
| Tables **never written in production** (0 inserts, ever) | **88** |
| ...of those, with **no write path in the code at all** | **21** |
| ...of those, with a write path but **no UI that calls it** | **14** |
| ...of those, **wired to a button nobody has ever pressed** | **48** |
| DB functions never called by anything (code, policy, trigger, other fn) | **11** of 167 |
| Indexes never scanned, non-unique, not backing a constraint | **290** of 1,294 |
| Retired tables parked in a `graveyard` schema | **32** |
| Non-test `src/` files unreachable from any route | **282** of 2,782 |
| Unused exports (knip) | **882** + 2,253 unused types |
| Cron **routes on disk with no schedule** | **5** of 22 |

---

# PART A — Dead Supabase

## A1. The `graveyard` schema is the precedent to follow (32 tables)

Someone already solved this problem once. On 2026-07-04 a dead-table audit
moved 32 tables out of `public` into a `graveyard` schema, each with a COMMENT
recording why and how to undo it:

```
Moved from public 2026-07-04 (legacy Lift Lab, phase 3 — post program-builder
unification). Restore: ALTER TABLE graveyard.baseball_lift_assignments SET SCHEMA public;
```

That is the right pattern and everything in this report should follow it
rather than `DROP TABLE`. Two live details:

- **Four graveyard tables still hold data** — `baseball_lift_assignments` (44
  rows), `baseball_lift_results` (22), `baseball_readiness_checkins` (22),
  `golf_validations` (3). They are not empty shells; do not drop them.
- **73 of the 516 Supabase performance advisories fire against the graveyard.**
  Retired tables still carry their indexes and policies, so the linter still
  nags about them forever. Worth stripping indexes on graveyard tables.

There is also a single-table `archive` schema (`golf_events_momentic_20260731`,
54 rows) from a Momentic test run.

## A2. Twenty-one tables are read constantly and have no writer at all

These are not merely empty. Production code queries them on a schedule or on
page load, gets nothing back, and carries on. Ranked by how hard they are
being read:

| table | reads ever | rows | who reads it |
|---|---:|---:|---|
| `baseball_fielding_events` | 121,105 | 0 | `coachhelm/engine-run.ts`, `player-snapshot-cards.ts` |
| `baseball_baserunning_events` | 121,102 | 0 | `coachhelm/engine-run.ts`, `stat-visuals.ts` |
| `baseball_catching_events` | 120,980 | 0 | `coachhelm/engine-run.ts`, `player-snapshot-cards.ts` |
| `golf_attendance_summary` | 56,458 | 0 | the `get_admin_teams_scoring_rollup` RPC |
| `baseball_workload_events` | 29,976 | 0 | `read-models/stat-visuals.ts` |
| `baseball_plate_appearances` | 29,906 | 0 | `elite-stat-events.ts`, `loaders-events.ts` |
| `helm_lifting_soreness_check_requests` | 22,360 | 0 | `lifting/actions/soreness.ts` |
| `helm_lifting_nutrition_plan_assignments` | 22,338 | 0 | `lifting/actions/nutrition.ts` |
| `baseball_stat_visual_views` | 6,655 | 0 | — |
| `golf_review_events` | 178 | 0 | — |
| `admin_client_errors` | 120 | 0 | `seed-admin-events.ts` only |
| `admin_api_perf_log` | 113 | 0 | — |
| `baseball_player_percentiles` | 66 | 0 | `recruiting-philosophy.ts` |
| `golf_practice_sessions` | 36 | 0 | `ingest/providers/trackman.ts` |
| `golf_ingest_connections` | 32 | 0 | `cron/v3/ingest-sync`, `providers/arccos.ts` |
| `golf_coach_behavior_log` | 16 | 0 | `coachhelm/v2/feedback/index.ts` |
| `golf_platform_metrics_daily` | 14 | 0 | — |
| `helm_lifting_exercise_substitutions` | 14 | 0 | — |
| `billing_customers` | 10 | 0 | — |
| `error_rate_hourly` | 10 | 0 | — |
| `auth_metrics_hourly` | 9 | 0 | — |
| `baseball_staff_audit_events` | 9 | 0 | — |
| `api_call_logs` | 5 | 0 | — |

**Correction to my own first pass.** I initially listed `baseball_pitch_events`,
`baseball_batted_ball_events` and `baseball_swing_events` here too. They are
NOT writerless — `stat-event-imports.ts` writes them through a *dynamic* table
name (`.from(GRAIN_TO_TABLE[grain]).insert(...)`, line 758) that a name-based
scan cannot see. They belong in A3 instead. The five event tables that remain
above are genuinely writerless because `GRAIN_TO_TABLE` covers only
`pitch` / `batted_ball` / `swing`.

That correction is itself the finding: **the elite event-grain stat tier is
half-built.** Three of the eight event grains have an importer; five have
readers, RLS policies, indexes and no writer anywhere.

## A3. Forty-eight tables have a working button nobody has ever pressed

Full list in `scratchpad/button.json`. The interesting ones — where a lot of
engineering sits behind a control that has produced exactly zero rows:

- `baseball_player_daily_contracts` (92,943 reads) — `saveDraftAndCommit`,
  `saveDraftContract` in `daily-contract.ts`, wired to UI.
- `baseball_actions` (47,218) — `convertInsightToAction`, `convertSignalToAction`.
  The entire "turn an insight into an action" loop.
- `baseball_decision_log` + `baseball_meeting_items` (23,111 / 23,252) — the
  Decision Room. Built, wired, never used once.
- `baseball_practice_effectiveness_reviews` (52,178) — `runPracticeEffectiveness`.
- `golf_coach_player_intent` (9,364) — `setIntent`. Note this is one of the
  actions I hardened for authorization earlier tonight.
- `golf_qualifier_selections` (1,072) — `setCoachPick` / `confirmSelection`.
  Also hardened tonight. The qualifier selection workspace has never selected
  anybody.

**These are the ones to ask a product question about, not a code question.**
The code works. Either the workflow does not match how coaches actually
operate, or the entry point is too buried to find.

## A4. Fourteen tables have a write path with no caller — the button was never built

This is the "should be in the UI and isn't" list.

| table | the action that would write it | reads |
|---|---|---:|
| `helm_lifting_availability_statuses` | `setAvailabilityStatus` (×2 files) | 44,254 |
| `helm_lifting_weight_checkin_requests` | `materializeWeightCheckInRequests` | 22,336 |
| `baseball_video_events` | `linkVideoEvent` | 1,476 |
| `baseball_ai_audit` | `runBaseballEngineCore` | 271 |
| `baseball_player_development_metrics` | `snapshotPlayerDevelopmentMetrics`, `snapshotTeamDevelopmentMetrics` | 12 |
| `helm_lifting_group_audit` | `appendGroupAudit` | 9 |
| `audit_log` | — (insert in `view-as.ts`, no caller) | 163,797 |
| `golf_announcement_tasks` | — | 35,340 |
| `baseball_stat_sources` | — | 29,098 |
| `baseball_player_comparisons`, `golf_message_attachments`, `baseball_team_lineups`, `baseball_lineup_positions`, `golf_academic_exclusions` | various | < 100 |

`audit_log` deserves its own line: **163,797 reads, zero rows, and the admin
audit-log RPC `get_audit_log_recent` is called by nothing.** There is an admin
audit trail that has never recorded a single event and a screen that reads it
constantly.

## A5. Eleven DB functions are called by nothing at all

Not by app code, not by an edge function, not by a script, not from a live RLS
policy, not by a trigger, and not by another function (checked against
`pg_get_functiondef` of all 167, excluding self-matches):

```
get_crm_coach_email_events        get_qualifier_leaderboard
get_crm_email_stats_detailed      get_user_golf_organization_id
get_golf_message_attachments      get_user_last_active
get_pending_task_reminders        is_in_team
mark_task_reminder_sent           unresolve_admin_event
update_qualifier_leaderboard
```

Two clusters worth naming:

- **Qualifier leaderboard** — `get_qualifier_leaderboard` +
  `update_qualifier_leaderboard` are a complete, unused feature pair.
- **Task reminders** — `get_pending_task_reminders` + `mark_task_reminder_sent`
  exist, `golf_task_reminders` has 1 insert in its lifetime and 0 rows, and
  `/api/cron/task-reminders` runs **every hour** regardless.

Four functions I nearly put on this list are alive via another function and
must NOT be dropped: `get_audit_log_recent` (called by
`get_admin_errors_rollup`), `sg_estimate_from_holes` and `sg_normalize_lie`
(both called by `recalculate_round_strokes_gained` — strokes-gained would
break), `update_player_distance_proximity` (called by
`refresh_player_stats_cache`).

## A6. 290 droppable indexes; 465 never scanned

Of 1,294 indexes in `public`, **465 have never been scanned**. 290 of those are
non-unique and back no constraint, so they are safe to drop — 4.2 MB, which is
trivial on disk and not the point. The point is write amplification: every one
of them is maintained on every insert, and the hot tables are
`golf_shots` (252,206 lifetime inserts), `golf_holes` (113,401),
`putt_details` (90,458), `golf_patterns_v2` (54,440).

Do **not** drop the 175 zero-scan indexes that are unique or constraint-backed
— they enforce correctness, and scan count is irrelevant to that.

The Supabase performance linter separately reports **136 `multiple_permissive_policies`**
warnings, which is a bigger real cost than the indexes: multiple permissive
RLS policies on one table/action are OR-ed and every one is evaluated on every
row.

## A7. Small, certain, zero-risk

- `crm_email_templates_backup_20260720` — a dated backup table, 40 rows, zero
  code references outside docs. One month old. Move to `graveyard` or drop.
- `v_crm_coaches_by_school` — a view with zero references anywhere in `src/`.

---

# PART B — Dead code

## B1. Nine files three independent tools agree are dead

My import-graph, `knip`, and the repo's own `orphans:mounts` all flag these:

```
src/components/ui/chart-shell.tsx      src/components/ui/progress-ring.tsx
src/components/ui/containers.tsx       src/components/ui/row-actions-menu.tsx
src/components/ui/filter-chips.tsx     src/components/ui/secondary-nav.tsx
src/components/ui/pagination.tsx       src/components/ui/shimmer.tsx
                                       src/components/ui/shine-effect.tsx
```

All nine are in `src/components/ui/`, which `design-system.md` already
describes as the retired vocabulary superseded by `src/components/fairway/`.
This is the cleanest delete in the report.

**83 files** are flagged by both my graph and knip; **282** by the graph alone
(knip counts a file as used if anything imports it, even if that importer is
itself unreachable — so the graph number is the one that answers "can a user
get here").

## B2. Sixteen server-action files no route imports

```
golf/actions/admin-bi-data.ts        golf/actions/stats.ts
golf/actions/admin-people-data.ts    golf/actions/task-templates.ts
golf/actions/admin-system-data.ts    golf/actions/team-sg-baseline.ts
golf/actions/courses.ts              golf/actions/v3/focus-area-progress.ts
golf/actions/insight-evidence.ts     golf/actions/v3/goal-progress.ts
golf/actions/player-effectiveness.ts golf/actions/v3/llm.ts
golf/actions/player-profile-stats.ts golf/actions/v3/practice-rx.ts
baseball/actions/development-metrics.ts  golf/actions/v3/team-practice-rx.ts
```

Verified individually with `git grep` for the module specifier: **zero
importers each.** In Next.js a `'use server'` export is only reachable through
a real import, so zero importers means unreachable.

## B3. `golf/actions/courses.ts` is a superseded duplicate — and it explains a dead table

`createCourse` is defined **twice**: `courses.ts:256` (unreachable) and
`course-library.ts:1106` (live). `courses.ts` is the only writer of
`golf_course_holes`, and the live path writes `golf_course_tee_holes` instead:

| table | rows | reads |
|---|---:|---:|
| `golf_course_holes` (v1, written only by the dead file) | **0** | 4,035 |
| `golf_course_tee_holes` (v2, live) | 1,548 | 1,497 |

An entire abandoned v1 of the course model — table, types, 429-line action
file — still typed and still being read from.

## B4. The golf admin dashboard is mostly components with no page

`src/app/golf/admin/` contains **82 components** and **3 pages** (`crm`,
`crm/coach/[id]`, `demo-sessions`). Thirty-one of those components are
unreachable, along with three admin action files
(`admin-bi-data`, `admin-people-data`, `admin-system-data`). Those three action
files are also the only readers of `golf_platform_metrics_daily`,
`auth_metrics_hourly` and `error_rate_hourly` — three permanently-empty tables.
This is one dismantled subsystem, not eleven separate findings.

## B5. Five cron routes exist with no schedule

`vercel.json` schedules 17 jobs; 22 cron route files exist. Unscheduled:

```
process-sequences   v3/genome-backfill   v3/ingest-sync
v3/standing-backfill   v3/weekly-coach-email
```

Backfills being manual-only is legitimate. `process-sequences` and
`v3/weekly-coach-email` are worth a decision — the CRM sequence machinery has
1,756 enrollments and its processor is not on a schedule.

The inverse is also true and worse: **`/api/cron/task-reminders` runs every
hour** against a table with 0 rows and a feature nothing calls (A5).

## B6. Unused exports

`knip`: **882 unused exports**, **2,253 unused types**, 85 unused files.
Concentrated in barrels — `components/fairway/index.ts` alone has 254 unused
exports, `fairway/charts/index.ts` 87, `baseball/stat-visuals/index.ts` 64.
A barrel re-exporting more than it needs is normal DX and mostly noise; the
signal is that the Fairway component library is far larger than what ships.

---

# PART C — The alignment list (this is the part to act on)

Built, working, and invisible. **Two of the three items I first put at the top
of this list did not survive verification** — both are corrected below rather
than removed, because the corrections are more useful than the claims were.

## C1. LeakBoard was pulled for a data problem that has since been 75% fixed

This is the single most actionable item in the audit.

`components/golf/coachhelm/coach/LeakBoard.tsx` is a finished component that
was deliberately un-mounted. The reason is recorded in
`TriageDesk.diagnostics.test.tsx:15-20`:

> on real prod data, most `golf_coach_insights` rows carry no `strokes_impact`,
> so 7 of 8 LeakBoard categories read a hollow "−0.0 total" ... LeakBoard stays
> available at `/vizlab` pending that fix and a future re-mount

Then on 2026-08-18, `signal-groups.ts:200-204` changed where that value is read
from — `metadata.strokes_impact` (wrong) to `evidence` (where generators
actually write it). **Nobody went back to re-mount LeakBoard.** Measured
against production tonight:

| | then | now |
|---|---|---|
| insights carrying `strokes_impact` | 0 of 501 (`metadata`) | **621 of 634** (`evidence`) |
| ACTIVE insights carrying it | 0 | **520 of 520 — 100%** |
| ...with a **non-zero** value | 0 | 129 of 520 (25%), mean 0.293 |
| distinct categories | — | 7 |

So the original blocker is gone: the key is present on every active insight
instead of none. The residual is different and smaller — three-quarters of the
values are literally `0`, so a re-mounted LeakBoard would show real numbers for
a quarter of insights and honest zeros for the rest. **Decision needed:** is a
25%-populated leak board better than no leak board? That is a judgement call,
but it should be made against these numbers rather than against a note
describing a state that no longer exists.

## C2. CORRECTION — the weight sliders are hidden on purpose, and correctly

I initially flagged `WeightDistributor.tsx` / `AlertTypeToggles.tsx` as
"unmounted UI for a table that is being written". That was wrong twice over,
and the truth is more interesting.

`WeightDistributor.tsx:12-32` documents the decision explicitly: the five
sliders persist to `golf_coach_philosophy.weight_historical` /
`weight_recent_form` / `weight_tournament` / `weight_qualifying` /
`weight_subjective`, and **no ranking or roster-comparison code reads any of
them.** The live insight ranker uses a different table entirely,
`golf_coachhelm_coach_weights`. Shipping the sliders would have been a placebo:
drag, Save, nothing changes. They were suppressed rather than shipped. That is
a good call, already made, already documented, with a `TODO(coachhelm)` naming
the condition for restoring them.

Two real findings fall out of the correction:

- **Five columns that are carried but never consumed.** `golf_coach_philosophy.weight_historical`
  / `weight_recent_form` / `weight_tournament` / `weight_qualifying` /
  `weight_subjective` ARE selected (`coaching-philosophy.ts:29-33`) and typed
  (`insights.ts:199-203`) — so "unreferenced" would be wrong. What no code does
  is *use the values to decide anything*: no ranking or roster-comparison path
  consumes them, which is precisely what `WeightDistributor.tsx` says. They are
  read, passed around, and never acted on. The table itself is very much alive
  (14 rows, 177,614 reads).
- **`golf_coachhelm_coach_weights` is machine-written, not coach-written.** Its
  79 updates come from `api/cron/v3/causality-attribute/route.ts:383`, not from
  any UI. Coach ranking weights are currently learned, never set. Whether that
  is intended is a product question.

## C3. CORRECTION — the shot charts are in a dev harness, not orphaned

I also flagged `PuttingHeatmap.tsx` and `ShotDispersion.tsx` as unmounted with
25k shots of data waiting. They are reachable — from `/vizlab`, which
`src/app/vizlab/page.tsx:11` makes `notFound()` in production:

```
Returns 404 in production so it never ships to users.
```

So they are not dead code and not reachable by a user either. `/vizlab` is a
deliberate visual-test harness. The finding that survives is narrower: **three
finished visualisations sit in a dev-only harness while their data is fully
populated in production** — `golf_shots` 25,371 rows, `putt_details` 5,058,
`approach_miss_details` 1,441. Promoting them is a product decision, not a
repair.

## C4. Three Fairway CoachHelm pages are genuinely unreachable

`FairwayMyDevelopment.tsx`, `FairwayEffectiveness.tsx` and
`FairwayMyGameProfile.tsx` are unreachable from any route, and unlike C1–C3
there is no note explaining why. `golf-feature-ownership.md` documents
`…/coachhelm?view=development`, `?view=effectiveness` and `?view=profile` as
live views, so either those views render older non-Fairway components or the
Fairway redesign was built and never switched on. Worth one route read to find
out which — and it is exactly the shape of thing this repo has shipped before.

## C5. `v3/llm.ts` is unreachable — including the fix I shipped tonight

Earlier tonight I closed two authorization findings in
`src/app/golf/actions/v3/llm.ts` (`generateLlmRoundReview`,
`generateHeroNarrative`). **That file has zero importers** — verified with
`git grep` on the module specifier. The fix is correct and I would make it
again, but the practical exposure was lower than my commit message implied,
because nothing reaches those actions. Recording it here rather than leaving a
wrong impression standing.

## C6. Baseball elite stat tier — half a product

`docs/operations/BASEBALL_STATS_SOURCE_OF_TRUTH.md` describes three layers:
legacy (grandfathered), box-score (canonical), event-grain (elite). Reality:

- box-score: **alive** — 185 batting + 55 pitching rows, heavy traffic
- event-grain: **3 of 8 grains importable, 5 have no writer** (A2)

`ImportWizardClient.tsx` exists and advertises `baseball_pitch_events (+ event
tables)` as its target. It has never produced a row. Fielding, catching,
baserunning, plate-appearance and workload data have readers wired into
`engine-run.ts` and nothing that can ever fill them.

## C7. The Decision Room and daily contracts

Two substantial baseball subsystems — `baseball_decision_log` +
`baseball_meeting_items` (Decision Room) and `baseball_player_daily_contracts`
— are fully built, wired to UI, read tens of thousands of times, and have never
received a single row. Their read paths are among the busiest in the database.
Something reads these on every dashboard load and always gets nothing.

## C8. Task reminders — hourly cron, zero rows, dead RPCs

`golf_task_reminders`: 1 insert ever, 0 rows. `task-reminders.ts` is a
600-line action file that writes it. `get_pending_task_reminders` and
`mark_task_reminder_sent` are never called. `/api/cron/task-reminders` runs
every hour. Either wire the UI that creates a reminder, or retire all four
pieces together.

# PART D — Triage

**Do now, zero risk** — nothing reads these and nothing can break:
1. Delete the 9 unanimously-dead `components/ui/*` files (B1).
2. Move `crm_email_templates_backup_20260720` to `graveyard` (A7).
3. Drop the 290 non-unique, zero-scan, non-constraint indexes (A6). Keep every
   unique/constraint index regardless of scan count.
4. Delete `golf/actions/courses.ts` and graveyard `golf_course_holes` (B3) —
   after confirming no in-flight branch imports it.

**Do next, needs one decision each:**
5. The 21 writerless tables (A2) — for each: build the writer or graveyard the
   table. The 5 baseball event grains are the biggest single call.
6. The 16 unreachable action files (B2) and the golf admin component set (B4) —
   decide whether the admin dashboard is coming back before deleting.
7. The 5 unscheduled cron routes (B5) — schedule or delete.
8. The 11 uncalled DB functions (A5).

**Product decisions, not engineering:**
9. The 48 wired-but-never-used tables (A3) — especially Decision Room, daily
   contracts, qualifier selection. The code works; the workflow may not.
10. The 14 no-caller write paths (A4) — these are the "surface it" candidates.
11. **C1 first** — LeakBoard's blocker is measurably 75% resolved and
    nobody re-checked. Then C4 (three unexplained unreachable Fairway pages)
    and C3 (promote the vizlab charts, or decide not to).

---

## Unverified — do not act on these without checking

- **Enclosing-action attribution in A3/A4 is heuristic.** For each insert I
  attributed it to the nearest preceding `export`, which is wrong in very large
  files. Three I know are mis-attributed: `golf_travel_budgets` →
  `exportExpensesToCSV`, `golf_coach_blocked_time` → `getEventRSVP`,
  `golf_event_documents` → `getEventDocuments`. The table-level verdict holds;
  the named action may not.
- **`reads_ever` is cumulative since the last stats reset**, which I did not
  establish a date for. It supports "this is read a lot / not at all", not
  "this is read N times per day".
- I did not audit **column-level** dead columns, RLS policy correctness, or
  storage buckets.
- I did not check whether any of the 282 unreachable files are reachable via
  `next.config.mjs` rewrites or middleware matchers.

---

*Companion reports produced in the same pass:
`DUPLICATION_NESTING_2026-08-20.md` (duplication + nesting),
`FEATURE_GAP_INTENT_2026-08-20.md` (documented-vs-built).*
