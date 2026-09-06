# Deliberately unapplied migrations

A migration file that exists here but has no row in the ledger looks identical
whether it was **held on purpose** or **forgotten**. This file is the difference.

## Why this exists

The 2026-08-19 reconciliation resolved 32 unaccounted migration files. Two of
them are unapplied *by decision* — and that was knowable only because two people
said so in conversation. Nothing in the repository or the database recorded it.
Had those conversations not happened, both would have looked exactly like the
other thirty.

**A missing record of a deliberate non-application is indistinguishable from an
oversight.** Every future audit re-opens the same question and reaches the same
dead end, because there is nowhere the answer could have been written down.

There is now. If you decide not to apply a migration, add a row. One line.

This is not a substitute for `public.audit_log` (which exists, has the right
schema, and has never been written to) — that covers privileged *runtime*
actions. This covers a decision that leaves no runtime trace at all.

## The register

| migration | status | why | decided |
|---|---|---|---|
| `20260708141000_gate_secdef_ownership_and_redemption.sql` | **HOLD** | Draft. Gates SECURITY DEFINER ownership + redemption; not finished and not reviewed. Applying an unfinished privilege change is worse than the drift it addresses. | pre-2026-08-19, recorded 2026-08-19 |
| `20260715141727_baseball_legacy_stats_backfill.sql` | **HOLD** | Legacy stats backfill. Data migration over baseball history, explicitly held across multiple sessions. Baseball is seed data nobody uses, so there is no cost to leaving it and a real cost to a bad backfill. | pre-2026-08-19, recorded 2026-08-19 |
| `20260528011000_harden_coach_insights_update_grants.sql` | **OBSOLETE** | Do **not** apply, and do **not** stamp. See below. | 2026-08-19 |
| `20260821043500_single_flight_round_submit.sql` | **VERIFIED APPLIED** | Read-only catalog check 2026-08-25: `pg_get_functiondef('public.submit_round_atomic(uuid,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure)` contains a `lock_not_available` handler — production already carries this migration's single-flight lock behavior. Recorded here only because this file's neighbors below are the opposite finding for the same round-submit surface, and leaving one unstated next to two "not yet applied" entries would look like an oversight, not a check. | 2026-08-25 |
| `20260825200811_helm_flight_recorder.sql` + `20260826010000_helm_debug_retention.sql` | **APPLIED 2026-08-26 — R3 — hold discharged** | Owner-executed production apply on 2026-08-26, both files, recorder first. Verified against the live catalog the same day: `helm_debug` schema present, 2 tables (`trace_runs`, `trace_steps`), 6 `public.helm_debug_*` facades, and `pg_get_functiondef` confirms `trace_checkpoint` calls are now present in BOTH `public.submit_round_atomic` and `public.save_partial_round_atomic`. A round was submitted end-to-end post-apply and completed normally. `src/lib/types/database.ts` was regenerated to match (PR #1627) — the `Database types drift` gate had gone red on every PR until it was. **The row is kept rather than deleted** because the reasoning below is why the hold was correct while it stood, and this file's whole purpose is that a held migration and a forgotten one must never look alike. Historical context follows. Read-only catalog check 2026-08-25: the `helm_debug` schema was absent from the production catalog — neither file had run at that point. Both are R3 (privileged) per `memory/system/golfhelm-engineering-os.md`: `20260825200811` rewrites two live, business-critical golf RPCs (`public.submit_round_atomic`, `public.save_partial_round_atomic`) in place via a `pg_get_functiondef()`-and-patch DO block, and `20260826010000` is a security-definer function plus grant changes on that schema. Daily reliability may investigate and prepare these but must never apply them — only the owner executes the production apply, and `db-migration-reviewer` review is mandatory first (already performed once on 2026-08-26; findings fixed in both files that session). The retention migration depends on the recorder migration's tables and will error at execution time (not at deploy time) if applied alone, so apply both together, in that order. Before applying `20260825200811`, take a `pg_get_functiondef()` backup of both `submit_round_atomic` and `save_partial_round_atomic` as they stand in production at that moment (the migration's own DO block already refuses to touch a function it does not recognize the shape of, but a human-held backup is the fast rollback path if the post-apply verification below fails) and confirm post-apply that both functions still round-submit successfully end-to-end and that `helm_private.trace_checkpoint` calls now appear in their definitions. While unapplied, the flight-recorder wiring in application code (trace start/step/finalize calls into `public.helm_debug_*`) was fail-open: every call site is expected to no-op or swallow the "relation does not exist" failure rather than block the round-submit path it instruments, since the round submit itself must never fail because a diagnostic write failed. | 2026-08-25, updated 2026-08-26 |
| 13 production-only `schema_migrations` versions with no repo file (`20260825233238`, `20260825125512`, `20260825124728`, `20260825121433`, `20260825121310`, `20260825121238`, `20260824023141`, `20260823235118`, `20260823233509`, `20260823233504`, `20260821165627`, `20260821114110`, `20260820172125`) | **VERIFIED APPLIED — RECORDED UNDER DIFFERENT VERSIONS/NAMES** | Read-only ledger + catalog investigation 2026-08-26: every one of the 13 traces to a repo migration file producing the same catalog effect — 12 under the same `name` but a different version-number stamp, one (`restore_atomic_lifecycle_capability_v2`) under a different name with byte-identical logic to `20260825093000_restore_atomic_lifecycle_capability.sql`. None of these 13 is itself a reason a rebuild would diverge from production — the DDL for each is already in the tree (verified by byte-diff or live catalog check per version, see the doc). That is narrower than "a `db reset` reproduces production": it does not, for reasons already recorded three rows above (`HOLD`/`OBSOLETE`/not-yet-applied entries unrelated to these 13). One real discrepancy found along the way: `20260824030000_allow_completed_round_reclassify.sql`'s own header says `STATUS: PREPARED, NOT APPLIED`, but its effect (the `'reclassify'` branch on `guard_golf_round_lifecycle`, plus `public.reclassify_golf_round`) is live in production and has been since 2026-08-24 — the comment is stale, not the schema. Full per-version evidence and owner options (repair-only files vs. `supabase migration repair` vs. accepting the drift) in `docs/operations/2026-08-26-migration-history-drift.md`. | 2026-08-26 |
| `20260827060000_scope_reclassify_qualifier_to_round_team.sql` | **APPLIED — hold discharged (ledger-verified 2026-09-01)** | `supabase_migrations.schema_migrations` carries version `20260827060000`. The row below it, `20260830120000`, is also applied and rewrites the same function, so the live behaviour is the later file's. Kept rather than deleted because this file's whole purpose is that a held migration and a forgotten one must never look alike — and this row said "still unapplied" for two days after it had shipped. Historical reasoning follows. | Security fix F8 from the 2026-08-26 scan: `public.reclassify_golf_round` is SECURITY DEFINER granted to `authenticated` and checks that the caller owns the round or coaches its team, but never that the client-supplied `p_qualifier_id` belongs to that round's team — so any authenticated player can graft their completed round onto a FOREIGN team's qualifier, colliding with its `qualifier_round_number` unique index and polluting another program's leaderboard. This file adds the team check and restates the grants. R3 per `memory/system/golfhelm-engineering-os.md` (privileged: SECURITY DEFINER + grants on a live golf RPC), so daily reliability prepared it and only the owner executes the production apply, with `db-migration-reviewer` review mandatory first — NOT yet performed. Before applying, take a `pg_get_functiondef('public.reclassify_golf_round(uuid,text,uuid,integer)'::regprocedure)` backup as the rollback path; after applying, confirm a legitimate same-team reclassify still succeeds and a cross-team one now raises 42501. **2026-08-30: superseded.** `20260830120000_reclassify_owns_its_own_integrity.sql` carries this same F8 fix by a stronger route — it requires a row in `golf_qualifier_entries`, which is coach-managed (all three write policies are `is_golf_team_coach`) and so cannot be forged by the player, and it holds even when a round's `team_id` is absent. That matters: 8 rounds carry a NULL `team_id` (3 completed), and this file's bare `round.team_id = qualifier.team_id` equality would have refused them a qualifier they may legitimately belong to. The team comparison survives in the new file as defence in depth, applied only when the round actually carries a team. Applying THIS file alone is still safe and still closes F8; applying the new one alone is sufficient. Do not apply both expecting two different effects — they rewrite the same function. | 2026-08-27, superseded 2026-08-30 |
| `20260830120000_reclassify_owns_its_own_integrity.sql` | **APPLIED — hold discharged (catalog-verified 2026-09-01)** | Verified against the LIVE catalog, not the ledger alone: `public.reclassify_golf_round` now contains the `golf_qualifier_entries` requirement, the `FOR UPDATE` row lock and the 42501 raise; and `helm_private.guard_golf_round_lifecycle`'s `reclassify` branch no longer carries the `OLD.status = 'completed'` gate that every other branch still has, so an `in_progress` round can be re-typed. The allowlist still excludes `status`. NOTE the pre-apply fingerprints recorded below are now STALE and must not be used as a refusal test: live values read 2026-09-01 are guard md5 `66fc04f238bb484a95849f1afc9e324f` (len 3370) and RPC md5 `8e54cafda4273be161c6c26b4ba00ab4` (len 3579). Historical reasoning follows. | Two defects on the round-reclassification path, found while investigating the 2026-08-30 report that "players still cannot edit round type after the round". (1) The lifecycle guard's `reclassify` exception is gated on `OLD.status = 'completed'`, so a round that was played but never submitted cannot be re-typed by anyone — 28 rounds sit `in_progress` in production, 26 of them untouched for over a day. The 2026-08-24 reasoning applies unchanged to a live round: re-typing changes what a round counts toward, not a stroke of it. (2) `public.reclassify_golf_round` is SECURITY DEFINER granted to `authenticated` — a public API — but the four checks that keep a qualifier coherent (exists, open, player entered, slot free) lived only in the TypeScript action, which a direct RPC call never runs. Both are fixed here, and this file also carries F8 (see the row above, now superseded). R3 per `memory/system/golfhelm-engineering-os.md`: SECURITY DEFINER + a BEFORE-UPDATE trigger function on a live golf table, so an agent prepares it and only the owner applies. **`db-migration-reviewer` review performed 2026-08-30; verdict CAUTION, both required fixes applied** — a `FOR UPDATE` row lock on the round read (closing a TOCTOU against a concurrent `submit_round_atomic` completion, which matters precisely because the guard's reclassify branch no longer checks status), and the pre-apply md5 fingerprints the superseded file carried and this one had dropped. Live catalog read 2026-08-30: guard md5 `cbc5671bc953183a4967d43b7d66699e` (len 3403), RPC md5 `c7c2c3f15af684fcdf63286c150bb12c` (len 1656) — re-run both before applying and STOP if either differs, because CREATE OR REPLACE would silently discard whatever moved. Two pgTAP assertions were added to `supabase/tests/rls/golf_round_lifecycle_contract.sql` pinning the claim the whole safety argument rests on: that the reclassify allowlist excludes `status`, so the marker cannot be used to complete a round outside the protected submit path. Before applying, back up both `pg_get_functiondef('public.reclassify_golf_round(uuid,text,uuid,integer)'::regprocedure)` and `helm_private.guard_golf_round_lifecycle()` as the rollback path. After applying, verify: an `in_progress` round re-types successfully; a completed round still does; a cross-team qualifier raises 42501; a taken slot raises 23505; and an ordinary score UPDATE on a completed round still raises 55000 (the guard must not have been loosened past classification). **NOTE: the user-visible half of the 2026-08-30 report is NOT in this file** — it was a picker that offered already-taken qualifier round numbers and defaulted to 1; that fix is application-only and ships independently of this migration. | 2026-08-30 |
| `20260819050000_drop_duplicate_baseball_decision_log_index.sql` + `20260819051000_baseball_fk_covering_indexes_wave_k2.sql` | **APPLIED — hold discharged (catalog-verified 2026-09-02)** | Owner-authorized direct apply 2026-09-02 through the repo-local CLI (`./node_modules/.bin/supabase db query --linked -f <file>`), each file in its own transaction with its precondition checked inside that transaction, the `supabase_migrations.schema_migrations` row inserted (`created_by` = `owner-authorized direct apply 2026-09-02 (Claude Fable 5.1 session)`), and a post-check — `db query` rather than `migration up` precisely because of the out-of-order stamp caution below. Verified against the LIVE catalog the same day: `baseball_decision_log_meeting_item_idx` is gone and its byte-identical sibling `baseball_decision_log_meeting_item_id_idx` survives (the precondition held: the sibling was present and `baseball_decision_log` had 0 rows at apply time); `baseball_postgame_review_items_timeline_event_id_idx`, `baseball_postgame_reviews_coach_id_idx` and `baseball_settings_audit_log_actor_coach_id_idx` are all present (those tables held 9, 2 and 2 rows at apply time). Ledger rows for both `20260819050000` and `20260819051000` present. Kept rather than deleted because this file's whole purpose is that a held migration and a forgotten one must never look alike. Historical reasoning follows. | Baseball-only index hygiene flagged by Supabase's performance advisor: drop one of two byte-identical indexes on `baseball_decision_log(meeting_item_id)` and add three FK covering indexes. Additive and idempotent (`IF EXISTS` / `IF NOT EXISTS`); no RLS, grants, views or golf objects. `db-migration-reviewer` review performed 2026-09-02: verdict CAUTION, lint reflow applied. Two apply-time cautions: the version stamps sort BEFORE roughly forty already-applied versions, so `supabase migration up` / `db push` will treat them as out-of-order and refuse or need `--include-all` (restamp to `202609…` or apply explicitly), and plain `DROP INDEX` / `CREATE INDEX` queue behind any long transaction on those tables, so wrap the apply in `SET lock_timeout = '3s'`. | 2026-09-02 |
| `20260901140000_trace_cannot_claim_success_while_blind.sql` | **APPLIED — hold discharged (catalog-verified 2026-09-02)** | Owner-authorized direct apply 2026-09-02 through the repo-local CLI (`./node_modules/.bin/supabase db query --linked -f <file>`) in a single transaction: the header's md5 precondition was checked inside that transaction and held, the `supabase_migrations.schema_migrations` row was inserted (`created_by` = `owner-authorized direct apply 2026-09-02 (Claude Fable 5.1 session)`), and the post-check ran. Verified against the LIVE catalog the same day: `public.helm_debug_finalize_trace(uuid,text,jsonb)` now carries `status_downgraded_from`; `anon` and `authenticated` cannot EXECUTE it and `service_role` can. Ledger row `20260901140000:trace_cannot_claim_success_while_blind` present. NOTE the pre-apply fingerprint the file's header records is now STALE and must not be used as a refusal test: it matched at apply time (md5 `5bfaba551f001460e12e6477c663d18e`, len 1074); the live value read 2026-09-02 is md5 `338d5f344491586a6ab416ed0798548a` (len 2021). Historical reasoning follows. | `CREATE OR REPLACE` on `public.helm_debug_finalize_trace(uuid,text,jsonb)` so a trace that observed none of its required steps is finalized as `warning`, never `success`. Confined to `helm_debug`; touches no `golf_*` or `baseball_*` object; `'warning'` is already in the `trace_runs.status` CHECK, so the downgrade cannot raise 23514 inside the round-submit instrumentation path. `db-migration-reviewer` review performed 2026-09-02: verdict CAUTION, required fixes applied (lint reflow, this row, grants restated). Before applying, re-run the md5 the file's header records and STOP if it differs; only the owner applies. | 2026-09-02 |
| `20260901120000_integrity_completed_round_zero_scored_holes.sql` | **APPLIED — hold discharged (catalog-verified 2026-09-02)** | Owner-authorized direct apply 2026-09-02 (~18:40Z) through the repo-local CLI (`./node_modules/.bin/supabase db query --linked -f <file>`) in a single transaction: the header's md5 precondition was checked inside that transaction and held, the `supabase_migrations.schema_migrations` row was inserted (`created_by` = `owner-authorized direct apply 2026-09-02 (Claude Fable 5.1 session)`), and the post-check ran. Verified against the LIVE catalog the same day: `public.run_integrity_checks()` now carries check 6 and its body excludes the four fixture ids `0b000000-0000-4000-b000-00000000000{1,2,3,4}`; `anon` and `authenticated` cannot EXECUTE it and `service_role` can. Ledger row `20260901120000:integrity_completed_round_zero_scored_holes` present. A read-only run of check 6's query with the exclusion immediately before applying flagged 0 rows, so the next 07:00 UTC run is expected to `pass`. NOTE the pre-apply fingerprint the file's header records is now STALE and must not be used as a refusal test: it matched at apply time (md5 `ae683fa1797204f933b261714d3dba84`, len 3789); the live value read 2026-09-02 is md5 `f57c6f68206b56f131240d768e00876e` (len 4315). Historical reasoning follows. | Adds a sixth check to `public.run_integrity_checks()`: a round with `status='completed'` and no `golf_holes` row carrying a non-null `score`. Nothing was watching for that state. Found 2026-08-31 in production, count 4 — and the forensics say seed, not lifecycle failure: ids `0b000000-0000-4000-b000-00000000000{1,2,3,4}`, three sharing `created_at` to the microsecond (`19:01:27.511173+00`), every `updated_at` equal to its `created_at`, no `course_id`, and `current_hole=1` against `holes_played=18`. No application path writes a patterned sequential uuid; these came in through a direct service-role insert on demo team `6ecdd1a6`. The check is still worth having, because `save_partial_round_atomic` is a REPLACE (it deletes a round's holes and shots and rebuilds them from the client payload), so a malformed snapshot arriving after a durable write is a real route into the same state. R3 per `memory/system/golfhelm-engineering-os.md` (SECURITY DEFINER, service_role-only EXECUTE), so an agent prepares it and only the owner applies. Checks 1-5 in the file are reproduced VERBATIM from the live definition read 2026-09-01 — md5 `ae683fa1797204f933b261714d3dba84`, length 3789. Re-run `select md5(pg_get_functiondef('public.run_integrity_checks()'::regprocedure));` before applying and STOP if it differs, because CREATE OR REPLACE would silently discard whatever moved. The new check's query was validated read-only against production the same day and returned exactly those 4 ids. — that is correct; the alert is right and the data is wrong. It goes green when the fixtures are removed. **Owner decision 2026-09-02: the four QA fixture rounds are KEPT** (removal scripts dropped from #1725 unrun; #1759 parked as draft). Check 6 was amended in this same file to name those four ids out of scope — by id, not by team, because Demo University Golf carries ~100 real demo rounds. Validated read-only against production with the exclusion: count=0. Expected `pass` on first run. The md5 fingerprint check before applying stands. | 2026-09-01, updated 2026-09-02 |
| `20260902160000_postgres_checkpoints_reach_trace_steps.sql` | **APPLIED — hold discharged (catalog-verified 2026-09-03)** | Owner-authorized apply 2026-09-03 01:2xZ through the Supabase Management API (`POST /v1/projects/qmnssrrolpinvwjjnufo/database/query`, the logged-in CLI's access token; the same endpoint the MCP uses) in file order 20260902160000 then 20260902170000, each as one request. Refusal test run first with `md5(pg_get_functiondef(oid))`/`length(...)`: helm_private.trace_checkpoint / helm_private.trace_exception_checkpoint (pre-apply md5 `012f4a7b745ec2707d48b6b6569fe744` len 1079 and `2a04d1c46fd226c3437553d39222751f` len 936 both matched production exactly; post-apply md5 `24368d3f…` len 4533 and `859a0e53…` len 3281, both now write `helm_debug.trace_steps`). `supabase_migrations.schema_migrations` rows inserted for both versions. Original hold text follows. `CREATE OR REPLACE` on `helm_private.trace_checkpoint(text,text,text,text,jsonb)` and `helm_private.trace_exception_checkpoint(jsonb,text,text,text,text)` so each Postgres-side flight-recorder checkpoint fired from inside `public.submit_round_atomic` / `public.save_partial_round_atomic` also UPSERTs a fail-open row into `helm_debug.trace_steps`, instead of only `RAISE LOG`. Neither function's signature, `SECURITY INVOKER` setting, `search_path`, or the RPC call sites change — only the function bodies. Confined to `helm_private`/`helm_debug`; touches no `golf_*` or `baseball_*` object; the new write is wrapped in its own `BEGIN ... EXCEPTION WHEN OTHERS ... END` so a broken checkpoint insert (proven in `supabase/tests/rls/golf_flight_recorder_checkpoints.sql` by renaming `helm_debug.trace_steps` inside a savepoint) cannot fail or slow the round write. **Known limitation, not a defect**: the exception-variant's new row is written inside the RPC's own `EXCEPTION WHEN OTHERS` handler, which ends in a bare `RAISE;` — on every current call site that re-raise aborts the whole request transaction and discards every write made during it, including this row, so `RAISE LOG` remains the only durable failure record for that path today; the write becomes durable only if a future caller catches the RPC's error without rolling back the whole transaction. **Known counter lag, not a defect, verified locally 2026-09-02**: `helm_debug.trace_runs.observed_step_count` (what `helm_debug_list_traces` shows in the Bridge's trace list) is maintained only by `public.helm_debug_record_trace_step`'s own recount, which this migration's INSERTs never call — immediately after a traced `submit_round_atomic`, `observed_step_count` read 0 against 7 real rows in `trace_steps`, and one subsequent call to `helm_debug_record_trace_step` for the same trace (any step key) brought it to 7. Every current call site reaches that facade once per request right after the RPC returns (`flightRecorder.complete`/`.fail`/`.warn` in `src/app/golf/actions/golf.ts`), so the undercount window is bounded by that request, not indefinite — the Bridge's trace *detail* view (`helm_debug_get_trace`) is unaffected either way, since it reads `trace_steps` directly rather than the counter. Pre-apply fingerprints of the CURRENT production definitions, read via the Supabase MCP `execute_sql` (`SELECT`, read-only) 2026-09-02: `trace_checkpoint` md5 `012f4a7b745ec2707d48b6b6569fe744` (len 1079), `trace_exception_checkpoint` md5 `2a04d1c46fd226c3437553d39222751f` (len 936). Re-run both before applying and STOP if either differs, because `CREATE OR REPLACE` would silently discard whatever moved:<br>`select md5(pg_get_functiondef('helm_private.trace_checkpoint(text,text,text,text,jsonb)'::regprocedure));`<br>`select md5(pg_get_functiondef('helm_private.trace_exception_checkpoint(jsonb,text,text,text,text)'::regprocedure));`<br>**`db-migration-reviewer` review performed 2026-09-02: verdict HOLDS (do not apply without weighing the findings below).** (1) The pre-apply fingerprints recorded above were read via the Supabase MCP `execute_sql` earlier the same day and were **not** re-verified during this review pass -- the review agent had no `execute_sql` access in that context. Re-run both against LIVE production immediately before applying, not on the strength of the 2026-09-02 reading alone: this file's own row for `20260830120000` above records the same category of failure -- fingerprints correct when written that went stale before anyone re-checked them. (2) **Apply-order caution.** `20260901140000` (blind-trace detection, row above) is now **APPLIED** in production. Once this file also ships, `helm_private.trace_checkpoint`'s unconditional UPSERT gives every successful `submit_round_atomic` / `save_partial_round_atomic` call at least one Postgres-written row in `helm_debug.trace_steps`, so `v_observed` inside `helm_debug_finalize_trace` is never 0 for those two workflows again -- reproduced locally in a rolled-back transaction: a trace with zero JS-recorded steps but this migration's Postgres checkpoints present still finalizes `status='success'`, because `observed_step_count` reads nonzero and the remaining branch, the JS-computed `missing_required_step_count`, read 0. This does not reopen the original 1,097-trace incident (that shape needed zero rows of any kind, which this migration's own fail-open write also prevents going forward), but it does narrow `20260901140000`'s blind-trace coverage for these two workflows down to a signal computed entirely on the JS side. Neither file is a defect alone; the combination is a real product-of-two-migrations interaction the owner should weigh before applying this file on top of an already-shipped safety net. **Closed by `20260902170000`** (row below), which narrows `helm_debug_finalize_trace`'s blind check to application-layer rows only, so this file's Postgres-layer rows can no longer mask a JS layer that recorded nothing — apply `20260902170000` no later than this file, and ideally in the same batch, so the finding is never live in production even briefly. (3) Added latency is documented narratively in this file's header, not benchmarked against production traffic in this review pass; a local, in-backend measurement (no network hop, near-empty `trace_steps`) read ~0.24ms/call warm-plan-cache and ~2-3ms/call cold -- roughly 1.7-20ms added per traced round write across the ~6-7 checkpoint calls each RPC makes, all of it inside `save_partial_round_atomic`'s `NOWAIT` lock or `submit_round_atomic`'s up-to-3s wait lock (`20260820170000`, `20260821043500`) -- not a rare path, since tracing already covers most/all production round-write traffic today per this file's own header (1313 runs / 2420 steps observed). (4) `helm_debug`'s prune function (`20260826010000`) has no scheduler wired to it -- a pre-existing gap this migration does not introduce but makes more consequential, since write volume to `trace_steps` roughly doubles per traced call once this ships. Refuter review of the accompanying pgTAP suite (`supabase/tests/rls/golf_flight_recorder_checkpoints.sql`) found Test F's fixture and assertions pinned the wrong step key (`db.submit_round_atomic`, declared layer `'postgres'` by both sides already, so no override could ever be observed) instead of the one where the JS and Postgres layers actually diverge (`db.save_partial_round_atomic`, declared `'supabase'` by the JS side) -- corrected in this same commit; the suite now exercises the real ownership guarantee. Only the owner applies. | 2026-09-02 |
| `20260902170000_blind_check_ignores_postgres_layer.sql` | **APPLIED — hold discharged (catalog-verified 2026-09-03)** | Owner-authorized apply 2026-09-03 01:2xZ through the Supabase Management API (`POST /v1/projects/qmnssrrolpinvwjjnufo/database/query`, the logged-in CLI's access token; the same endpoint the MCP uses) in file order 20260902160000 then 20260902170000, each as one request. Refusal test run first with `md5(pg_get_functiondef(oid))`/`length(...)`: public.helm_debug_finalize_trace (pre-apply md5 `338d5f344491586a6ab416ed0798548a` len 2021 matched production exactly; post-apply md5 `5000f553…` len 2896). `supabase_migrations.schema_migrations` rows inserted for both versions. Original hold text follows. `CREATE OR REPLACE` on `public.helm_debug_finalize_trace(uuid,text,jsonb)`, the same function `20260901140000` touched. Closes the high-severity finding from the `db-migration-reviewer` review of `20260902160000` (2026-09-02, verdict HOLDS, finding (2) in that row above): once `20260902160000` ships, every successful `submit_round_atomic` / `save_partial_round_atomic` call writes several Postgres-layer rows into `helm_debug.trace_steps` regardless of whether the JS application layer recorded anything, and the plain `count(*)` the blind check used made those rows alone enough to keep `v_observed` above zero — so a trace where the JS layer recorded NOTHING (the exact shape of the 1,097-trace incident `20260901140000` closed) would finalize `success` again. Reproduced by the reviewer in a rolled-back local transaction, and re-reproduced locally 2026-09-02 while preparing this file: a trace carrying only Postgres-layer rows against `expected_step_count > 0` finalizes `warning` after this migration, `success` before it. This migration narrows the blind check to a count of rows whose `layer` is not `'postgres'`; `observed_step_count` on the run is untouched and keeps counting every row, both layers, exactly as `20260901140000` left it — the Bridge's trace views still show both. Confined to `helm_debug`/`public`; touches no `golf_*` or `baseball_*` object; same signature, `SECURITY DEFINER` setting, `search_path` and grants as `20260901140000` left them. Pre-apply fingerprint of the CURRENT function, read against the LOCAL stack 2026-09-02 immediately after applying `20260901140000` there (production's own post-apply fingerprint for the same function, recorded in the row above for `20260901140000`, is `338d5f344491586a6ab416ed0798548a` / length 2021 — the two differ only because `pg_get_functiondef`'s formatting is not byte-identical across the local and production Postgres builds, not because the function bodies differ): `md5` `e017e6980ce7045f46b5e83c73580bdc` (length 2229). Re-run against PRODUCTION specifically before applying there and STOP if it differs from the production fingerprint above, because `CREATE OR REPLACE` would silently discard whatever moved:<br>`select md5(pg_get_functiondef('public.helm_debug_finalize_trace(uuid,text,jsonb)'::regprocedure));`<br>Two new pgTAP assertions in `supabase/tests/rls/golf_flight_recorder_checkpoints.sql` (Test G) pin the fix directly against `helm_debug_finalize_trace`: a trace with only Postgres-layer rows against a nonzero `expected_step_count` still downgrades to `warning`, and a trace carrying at least one application-layer row alongside Postgres-layer rows still finalizes `success` — both while `observed_step_count` counts every row regardless of layer. `db-migration-reviewer` review of this specific file has **not yet** been requested; only the owner applies, and applying `20260902160000` without this file (or without applying both in the same batch) reopens the blind-trace defect for the duration in between. | 2026-09-02 |
| `20260903150000_helm_debug_agent_runs.sql` | **HOLD — R3, not yet reviewed** | Prepared for the Bridge Premium Observability Phase 5 (Engineering OS) build, per `docs/ai-system/briefs/BRIDGE_PREMIUM_OBSERVABILITY_BRIEF_2026-09-03.md` and `memory/decisions/ADR-2026-09-03-control-plane-owner-decisions.md`'s `AGENT_FLIGHT_RECORDER_STORAGE` row (`helm_debug.agent_runs` table, RPC-gated, service-role only, on the golf Flight Recorder pattern). Adds one table (`helm_debug.agent_runs`) inside the already-applied `helm_debug` schema, one private sanitizer (`helm_private.agent_run_safe_payload`), and three public service-role-only facades (`helm_debug_record_agent_run`/`helm_debug_list_agent_runs`/`helm_debug_get_agent_run`). R3 per `memory/system/golfhelm-engineering-os.md`: SECURITY DEFINER facades plus grant changes on a schema already carrying live production data (`trace_runs`/`trace_steps`). Confined entirely to `helm_debug`/`helm_private`; touches no `golf_*` or `baseball_*` object and does not modify any existing function, unlike `20260825200811`. Daily reliability may investigate and prepare this file but must never apply it; only the owner executes the production apply, and `db-migration-reviewer` review is mandatory first — **not yet performed**. Cannot verify prod state for a table this migration itself creates (see the file's own `VERIFIED:` note). Before applying, confirm `helm_debug.trace_runs`/`trace_steps` still exist as expected (this file assumes but does not recreate the schema) and re-read the file's ACL tripwire output. While unapplied, the application-layer writer (`src/lib/admin/agent-runs/record.ts`) is fail-open by design: every call is expected to no-op or swallow a "function does not exist" failure rather than block the self-heal loop it instruments. | 2026-09-03 |

## Why `20260528011000` is obsolete rather than pending

It revokes `UPDATE (status, dismissed, resolved_at, metadata, lifecycle_state)`
on `golf_coach_insights` from `authenticated`, intending to leave players able
to write only `acknowledged_at` and `dismissed_at`.

`dismissInsight` — a live coach action at
`src/app/golf/actions/intelligence-dashboard.ts:548`, running under the
**user-scoped** client — writes `dismissed`, `status` and `lifecycle_state`.
Applying this revoke fails that statement with `42501`.

That is not hypothetical. The `DS-1` comment immediately above that call records
the same failure already happening once, for `updated_at`: *"the `authenticated`
role has no UPDATE privilege on that column … so including it made Postgres
reject the whole statement with 42501 before RLS was even evaluated —
dismissInsight always failed."*

**Stamping it would be worse than leaving it.** A ledger row asserts the revoke
happened. It did not, and no future audit would look again.

The intent is still right — a player should not be able to write `status`,
`lifecycle_state` or `metadata`. The mechanism cannot express it: coaches and
players share the `authenticated` role, and a column grant cannot tell them
apart. The fix is a design change (route player-side mutation through a
`SECURITY DEFINER` RPC, then revoke direct UPDATE), not a reconciliation step.

Measured 2026-08-19: `golf_coach_insights` has RLS enabled with 6 policies, all
targeting `authenticated` and **none** targeting `anon` — so the migration's
`REVOKE ... FROM anon` half addresses grants that no policy makes reachable.
That half is defence in depth, not an exposure.

| `20260903180000_helm_debug_db_error_events.sql` + `20260903180100_helm_debug_db_health_samples.sql` + `20260903180200_helm_debug_db_stat_deltas.sql` + `20260903180300_helm_debug_observability_retention.sql` | **APPLIED 2026-09-03 — R3 — hold discharged** | Four new `helm_debug` tables (`db_error_events`, `db_health_samples`, `db_stat_deltas`, `db_stat_prior_state`) plus SECURITY DEFINER facades (`record_db_error_event`, `helm_debug_db_health_snapshot`/`record_db_health_sample`, `helm_debug_stat_statements_snapshot`/`record_db_stat_snapshot`, `helm_debug_prune_observability`) and grant changes on the `helm_debug` schema — same privileged shape as `20260825200811`/`20260826010000`. Same isolation pattern as those two: schema revoked from public/anon/authenticated, EXECUTE granted service_role-only on every facade, ACL tripwire in each file, no direct table grant to any role (confirmed against production 2026-09-03 that even `service_role` lacks `USAGE` on `helm_debug` — access is mediated entirely by the facades). All four files are purely additive (`create schema/table/index if not exists`, `create or replace function`) and touch no existing table, function, or grant outside this new surface — no golf_*/baseball_* object, no change to `helm_debug.trace_runs`/`trace_steps`/`helm_debug_prune`. `db-migration-reviewer` review has **not** been requested. Apply in file order (error_events, health_samples, stat_deltas, retention — the retention function references all three preceding tables by name only inside PL/pgSQL, so `CREATE FUNCTION` itself would succeed out of order, but calling it before the tables exist fails at execution time). Cron routes calling these RPCs (`src/app/api/cron/db-health-sampler`, `db-stat-delta`) degrade cleanly while unapplied, following the exact `isMigrationNotAppliedError` pattern `src/app/api/cron/helm-debug-prune/route.ts` already uses (`PGRST202`/`42883`/`42P01`/`3F000` → 200 no-op, not a failed job run). **Owner-authorised apply 2026-09-03 (~13:0xZ) through the Supabase Management API `POST /v1/projects/<prod>/database/query`, in file order, each file's own ACL tripwire passing.** Verified against the LIVE catalog, not the response: the four tables exist in `helm_debug`; `information_schema.role_table_grants` returns ZERO rows for `anon`/`authenticated`/`public` on that schema; `pg_namespace.nspacl` for `helm_debug` is `postgres=UC/postgres` alone; all nine facades carry `proacl` `postgres=X/postgres,service_role=X/postgres` and nothing else. Ledger stamped: `supabase_migrations.schema_migrations` now carries versions `20260903180000`, `20260903180100`, `20260903180200`, `20260903180300` with their statements. Smoke-tested live: `helm_debug_db_health_snapshot()`, `helm_debug_read_db_health_history(5)`, `helm_debug_read_db_error_events(5,null,null)` and `helm_debug_prune_observability(90,90,90,90)` all return; `helm_debug_stat_statements_snapshot(5)` FAILED `42P01` on first call and is fixed by `20260903190000` (next row) — see it before assuming the delta collector ever worked. | 2026-09-03 |
| `20260903191000_helm_debug_db_lock_incidents.sql` + `20260903191100_helm_debug_db_table_samples.sql` + `20260903191200_helm_debug_jobs_health_read.sql` + `20260903191300_helm_debug_observability_retention_v2.sql` | **APPLIED 2026-09-03 — R3 — hold discharged** | Owner-authorised apply, executed and verified by the session that owns the apply path, NOT by the session that wrote these files — this row records their evidence and is explicit that the author did not re-read the production catalog itself (no credential is reachable from a task worktree; `.env.local` is withheld by `.worktreeinclude`). Their reported procedure, kept because the method is the evidence: a local stack was started first and exited 0, which proved NOTHING — `supabase start` resumed a stale volume, the local ledger held 342 versions with nothing from 2026-09-03, and `helm_debug` had only `trace_runs`/`trace_steps`. Reporting "exit 0, applies cleanly" at that point would have been precisely the green-from-a-check-that-never-ran failure this program exists to detect. `db reset` and `migration up` are denied by `permissions.deny`, correctly, so the fifteen missing migrations were applied by hand through psql with `ON_ERROR_STOP=1`, deliberately EXCLUDING `20260903150000` agent_runs so the local schema mirrored production rather than something better than it. Against that mirror all five applied clean, and the checks that actually decide safety passed: three new tables (`db_lock_incidents`, `db_table_samples`, `db_platform_samples`), every facade definer-rights, ZERO EXECUTE for `anon`/`authenticated` on any `helm_debug` facade, 19 of 19 for `service_role`, no schema USAGE granted to `anon`/`authenticated`, and all five read facades executing as `service_role`. Then applied to production one at a time, HTTP 201 each, each stamped into `schema_migrations` under its own filename version rather than letting anything restamp it, and every one of those checks re-verified against the production catalog afterwards. Anyone relying on this row for a security claim should re-read the catalog rather than trust the transcription. | Phase 2 of the same observability program, same isolation pattern as the row above: two new `helm_debug` tables (`db_lock_incidents`, `db_table_samples`) plus definer-rights facades, all EXECUTE granted service_role-only with an ACL tripwire per function, no direct table grant to any role, nothing PostgREST-exposed. `…190000` adds bounded current-state lock/blocking capture (capped at 50 rows, a two-token safe query class only, never full query text) folded into the existing `db-health-sampler` cron rather than a new schedule. `…190100` adds hourly table-health sampling (dead tuples, vacuum recency, scan/write deltas) via a new `db-table-health` cron (`7 * * * *`, registered in both `vercel.json` and `src/lib/admin/cron-registry.ts`). `…190200` adds NO new table — one read-only facade over `cron.job`/`cron.job_run_details` and `net.http_request_queue`/`net._http_response`, each independently capability-detected (catches both an absent extension and an unreadable-but-present one), never returning a job's own defined SQL or a pg_net response body. `…190300` `CREATE OR REPLACE`s Phase 1's `helm_debug_prune_observability` with a **byte-identical 4-argument signature** (deliberately — adding parameters would create a second, ambiguous overload that the existing zero-argument cron call would then fail against) to also prune the two new tables on fixed internal 30-day windows, plus adds a sizes/self-monitoring facade over all six `helm_debug` observability tables. Depends on Phase 1's four files being applied first (referenced tables/pattern), and its own four files must apply in filename order — `…190300`'s body references `…190000`'s and `…190100`'s tables by name, so `CREATE FUNCTION` succeeds regardless of order but calling it before those two tables exist fails at execution time, same caveat the Phase 1 row already states for its own retention file. `db-migration-reviewer` review has **not** been requested. Every new/replaced cron route (`db-health-sampler`, `db-table-health`, `db-observability-prune`) degrades cleanly while unapplied via the same `isMigrationNotAppliedError` pattern. Test coverage for this phase is unit-level TypeScript fixtures against the pure evaluators (locks, connection-saturation/rollback-rate rules, table health, jobs/pg_net health, freshness) — 241 tests passing at commit time — not database-level (pgTAP) tests; no pgTAP suite was written or run for these four migrations, consistent with Phase 1's own row, which also names no pgTAP coverage. | 2026-09-03 |
| `20260903191400_helm_debug_db_platform_samples.sql` | **APPLIED 2026-09-03 — R3 — hold discharged** | Owner-authorised apply, executed and verified by the session that owns the apply path, NOT by the session that wrote these files — this row records their evidence and is explicit that the author did not re-read the production catalog itself (no credential is reachable from a task worktree; `.env.local` is withheld by `.worktreeinclude`). Their reported procedure, kept because the method is the evidence: a local stack was started first and exited 0, which proved NOTHING — `supabase start` resumed a stale volume, the local ledger held 342 versions with nothing from 2026-09-03, and `helm_debug` had only `trace_runs`/`trace_steps`. Reporting "exit 0, applies cleanly" at that point would have been precisely the green-from-a-check-that-never-ran failure this program exists to detect. `db reset` and `migration up` are denied by `permissions.deny`, correctly, so the fifteen missing migrations were applied by hand through psql with `ON_ERROR_STOP=1`, deliberately EXCLUDING `20260903150000` agent_runs so the local schema mirrored production rather than something better than it. Against that mirror all five applied clean, and the checks that actually decide safety passed: three new tables (`db_lock_incidents`, `db_table_samples`, `db_platform_samples`), every facade definer-rights, ZERO EXECUTE for `anon`/`authenticated` on any `helm_debug` facade, 19 of 19 for `service_role`, no schema USAGE granted to `anon`/`authenticated`, and all five read facades executing as `service_role`. Then applied to production one at a time, HTTP 201 each, each stamped into `schema_migrations` under its own filename version rather than letting anything restamp it, and every one of those checks re-verified against the production catalog afterwards. Anyone relying on this row for a security claim should re-read the catalog rather than trust the transcription. | One new `helm_debug` table (`db_platform_samples`) plus two definer-rights facades (`record_db_platform_sample`, `helm_debug_read_db_platform_history`) — same isolation pattern as the four-migration row above: schema/table/sequence privileges revoked from public/anon/authenticated, EXECUTE granted service_role-only on both facades, ACL tripwire, no direct table grant to any role. Purely additive (`create table/index if not exists`, `create or replace function`); touches no existing table, function, or grant. Every metric column is nullable by design — the allow-list `src/lib/observability/supabase/metrics-api.ts` reads from is docs-derived, not live-verified against this project's Metrics API endpoint (no `SUPABASE_ACCESS_TOKEN`/`SUPABASE_SERVICE_ROLE_KEY` available in the worktree this was written in), so a metric name this project's live scrape does not actually expose stores `NULL`, never a fabricated `0`. `db-migration-reviewer` review has **not** been requested. No cross-dependency on the four migrations above beyond sharing the already-created `helm_debug` schema (`create schema if not exists`, idempotent). The cron route calling these RPCs (`src/app/api/cron/db-health-sampler`, extended — see that route's own `recordPlatformSampleFailOpen`) degrades cleanly while unapplied, same `isMigrationNotAppliedError` pattern. Retention is NOT wired for this table — see `docs/observability/SUPABASE_PLATFORM_OBSERVABILITY.md` §8 for why (folding it into the shared `helm_debug_prune_observability` migration would edit a file another track already shipped) — a named, documented gap, surfaced as a `WARN` in `npm run repo:doctor`. | 2026-09-03 |
| `20260903190000_helm_debug_stat_snapshot_extensions_search_path.sql` | **APPLIED 2026-09-03 — hold discharged on creation — NO LEDGER ROW (found 2026-09-05)** | Corrective, written and applied in the same session as the four above. `20260903180200` pinned `helm_debug_stat_statements_snapshot` to `search_path = pg_catalog, helm_debug`, but `pg_stat_statements` 1.11 is installed into the `extensions` schema on this project, so the function's unqualified `pg_stat_statements_info` / `pg_stat_statements` references resolved to nothing and every call raised `42P01`. `/api/cron/db-stat-delta` would have raised it every 15 minutes and the delta engine would never have recorded a row. `ALTER FUNCTION ... SET search_path = pg_catalog, extensions, helm_debug` — one schema added, path still pinned, `public` still excluded, body untouched (ALTER rather than CREATE OR REPLACE so no classification logic can change silently). Verified live after apply: the function returns, `proconfig` reads `pg_catalog, extensions, helm_debug`, and `proacl` is unchanged at `postgres=X/postgres,service_role=X/postgres`. **2026-09-05 reconciliation: `list_migrations` has NO row at version `20260903190000`, under this name, at ANY version.** The function-body fingerprint evidence above is trusted as-is (this reconciliation had no `execute_sql` access to re-verify `pg_get_functiondef` independently), but the ledger itself is wrong — the apply happened and was never stamped. See "Owner actions, prepared" below, action O6(a), for the exact `INSERT` that closes this. | 2026-09-03, ledger gap found 2026-09-05 |
| `20260903193000_helm_debug_error_events_individual_rows.sql` | **APPLIED 2026-09-03 — hold discharged on creation — NO LEDGER ROW (found 2026-09-05)** | Corrective, found by the review of PR #1792 on a migration already applied. `20260903180000` created `db_error_events_fingerprint_bucket_idx` as unique on `(fingerprint, bucket_started_at) where occurrence_count >= 1`, described in its own comment as partial — but `occurrence_count` is `integer not null default 1 check (>= 1)`, so the predicate is true for every row that can exist and the index was a FULL unique index. `record_db_error_event(p_force_individual_row => true)` — reserved for P0/P1, live caller `src/lib/observability/supabase/integrity.ts` — does a plain INSERT with no conflict handling, so a second forced occurrence with the same fingerprint in the same hour raised 23505 and was swallowed by the deliberately fail-open writer: the flag guaranteed the opposite of what it exists for. Adds `is_individual boolean not null default false`, rebuilds the unique index as `where not is_individual`, and replaces the function (patched from its own live `pg_get_functiondef`, not retyped) so the forced branch sets the flag and the upsert's ON CONFLICT names the same predicate. Applied to an EMPTY table (`count(*) = 0` verified immediately before), so no backfill and no collision during the index swap. Proven live after apply: two forced writes with one fingerprint in one hour produced two rows with distinct ids and `is_individual = true`; two aggregated writes produced one row with `occurrence_count = 2` and the same id returned twice; probe rows deleted, table back to 0. **2026-09-05 reconciliation: `list_migrations` has NO row at version `20260903193000`, under this name, at ANY version** — same gap as the row above, same fix (O6(a) below). | 2026-09-03, ledger gap found 2026-09-05 |
| `20260905090000_baseball_camp_registrations_lifecycle_timestamps.sql` | **HOLD** | Adds `registered_at`/`attended_at` (nullable timestamptz) to `baseball_camp_registrations`. `20260825224803_reconcile_baseball_active_read_contracts.sql`'s first block claimed these already existed live; the 2026-09-05 reconciliation's per-block live-column check found they do not — the one genuinely open gap out of that file's six blocks. Held rather than applied because it is unverified whether the baseball camp-registration UI actually reads/writes these column names today; see the file's own header for what to check before applying. | 2026-09-05 |
| `20260905091000_baseball_timeline_event_acks_user_id_columns.sql` | **HOLD** | Found by `db-drift.yml`'s daily production-drift check (5 consecutive failures, 2026-08-31 -> 2026-09-04). `src/app/baseball/actions/timeline-acks.ts` dual-writes `user_id`/`acknowledged_at` alongside the real `acked_by`/`acked_at` columns and then selects `acknowledged_at` back — but production has no `user_id`/`acknowledged_at` columns at all (confirmed live 2026-09-05). Held because whether this is actually causing acknowledgement writes to fail in production (versus PostgREST silently tolerating the extra keys) was not confirmed — see the file's header for what to check first. | 2026-09-05 |
| `20260905092000_baseball_elite_stat_event_columns_gap.sql` | **HOLD** | Found by the same `db-drift.yml` failures: `baseball_pitch_events.batter_id`/`.pitch_type_classified`/`.is_called_strike`/`.count_state` and `baseball_workload_events.count`/`.high_intent_count` are all missing live, even though `20260624000080_baseball_elite_stat_event_model.sql` — the migration that defines them — **does have a ledger row** (`list_migrations` confirms it "applied"). Root cause: that migration's `CREATE TABLE IF NOT EXISTS` silently no-op'd against these two tables because they already existed under an older, incompatible column shape (live `baseball_pitch_events` still carries `pitch_type`/`called_strike`/`pitcher_id`, not the elite-model names) — the ledger records the statement ran, not that it did anything to these two tables. This file adds only the missing columns, additively, and does not attempt to reconcile the old and new column pairs — that split (coexist permanently vs. merge vs. retire the old ones) is a schema-design decision for whoever owns the elite stat event model. | 2026-09-05 |
| *(data divergence, not a schema gap — no migration)* `admin_allowlist` vs. `users.role='admin'` | **INVESTIGATE, not a migration — diagnostic + template prepared as O7** | `db-drift.yml`'s "admin_allowlist and users.role=admin stay in sync" check has failed the same 5 runs: 1 `admin_allowlist` user no longer has `users.role='admin'` in production — read live via the check's own query, not independently re-run here (no `execute_sql` access in this reconciliation's read-only Supabase MCP). Admin RPCs still work for that user via `is_super_admin()`, so nothing is broken today, but the divergence itself needs an owner decision: was the demotion intentional (in which case remove the stale `admin_allowlist` row) or accidental (in which case restore `users.role='admin'`)? Neither this reconciliation nor a migration file can make that call — it needs identifying WHICH user and why. **2026-09-05 follow-up: the id was never captured anywhere in this repo's evidence trail** (the drift check's own query returns only a count, never a row) — see "Owner actions, prepared" below, action O7, for the read-only SELECT that identifies it and the templated UPDATE the owner fills in afterward. | 2026-09-05 |
| `20260730030000_avatars_storage_bucket_rls.sql` | **UNVERIFIED** | The file's own header says "NOT APPLIED BY THE AUTHOR. Production already has all five objects" — written to describe a state its author believed already existed, not applied and not independently confirmed at write time. This reconciliation does not relabel it local-only or applied either, for the same reason: `storage.objects` is outside every `public`-schema read this reconciliation's tools (`list_tables`, `get_advisors`) can see, so neither claim can be checked from here. **Prepared owner query** (read-only, `storage` schema): `SELECT policyname, cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname ILIKE '%avatar%';`. **What "verified" looks like**: exactly four rows — one each for `cmd` = `SELECT`, `INSERT`, `UPDATE`, `DELETE` — matching the four policy names in the file (`Avatars accessible to authenticated`, `Users can upload their own avatar`, `Users can update their own avatar`, `Users can delete their own avatar`). Fewer than four, or a `cmd`/predicate that doesn't match the file, means production and this file have diverged and the file needs a follow-up, not a status flip to APPLIED. | 2026-09-05 |
| `20260905100000_revoke_secdef_execute_from_authenticated.sql` | **APPLIED 2026-09-06** (owner-authorized, executed from the reviewed file via the account Supabase connector's `execute_sql`; ledger row `20260905100000` inserted with `statements` NULL; post-apply `has_function_privilege` check: all nine `authenticated`/`anon` false, `service_role` true) | Phase 2 / P3 debt paydown: narrows the `authenticated_security_definer_function_executable` advisor class from 142 findings to 133 by revoking `PUBLIC`/`anon`/`authenticated` EXECUTE from exactly nine functions — eight pure trigger functions plus the internal `__admin_rollup_b_gate()` composability helper — none of which the app, an RLS policy/check, or a non-DEFINER caller reaches directly. Full per-function classification and the reasoning for the five names deliberately left alone (`recompute_golf_round_totals`, `is_in_team`, `user_is_golf_team_member`, `golf_conversation_has_me`, `unresolve_admin_event`) is in the "Advisor warnings, classified" section below, not duplicated here. `db-migration-reviewer` review has **not** been requested. **Verify before applying**: `SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE'), has_function_privilege('anon', p.oid, 'EXECUTE'), has_function_privilege('service_role', p.oid, 'EXECUTE') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname IN ('extract_email_click_from_event','sync_coach_last_email_event','sync_email_snapshot_from_event','golf_event_documents_assert_same_team','golf_holes_recompute_round_totals_fn','set_calendar_feed_token','update_round_stats_cache','log_crm_stage_transition','__admin_rollup_b_gate');` — expect all nine `authenticated`/`anon` columns `false` pre-apply becoming the post-apply confirmation, `service_role` `true` throughout. **Rollback**: `GRANT EXECUTE ON FUNCTION <name> TO PUBLIC, anon, authenticated;` per function restores the exact pre-migration baseline grant; nothing legitimate exercises this surface today, so a rollback undoes the fix rather than restoring lost function. pgTAP coverage: `supabase/tests/rls/revoke_secdef_execute_from_authenticated.sql` (27 assertions: 21 on the nine revoked functions' anon/authenticated/service_role state, 6 regression guards on functions this migration deliberately did NOT touch, so a future over-broad revoke gets caught). **Not run locally** — this worktree has no Docker/local Supabase stack (`supabase status` fails: `dial unix .../docker.sock: connect: no such file or directory`), so the suite has not been executed against a rebuilt local database; it is wired for CI's "Supabase lint + RLS tests" job to pick up on the next PR. | 2026-09-05 |

## Local files with no ledger row — classification

The 2026-09-05 A3c reconciliation compared every `supabase/migrations/*.sql`
version stamp against a fresh `list_migrations` read (project
`qmnssrrolpinvwjjnufo`, 871 rows) rather than reusing an earlier session's
numbers. **44 local files have no ledger row.** Of those, 14 are already
discussed above — in the register, in "Applied directly, no file," or in the
2026-09-05 HOLD rows — and are not repeated here. The other **30** had no
discussion anywhere in this file until now. This section closes that gap.

Classification and evidence are carried over from the prior audit
(`scratchpad/exec/details-supabase-for-a3c.md` §2(a)) where that audit already
did the fuzzy-name-matching work; **every row this session's tools could
independently re-check is re-verified against the LIVE catalog below, not
just re-quoted.** Six rows carried an explicit "VERIFIED LIVE" tag and were
re-checked with `list_tables` (verbose, schema `public`) this session:
`golf_team_settings.sg_baseline`, `golf_pga_standards.tour`,
`baseball_player_stats.source_external_id`,
`baseball_team_coach_staff.bio`/`.phone`, and
`baseball_timeline_event_acks.team_id`/`.player_id` are all still present,
exactly as claimed — **no disagreement between the prior audit and the live
catalog was found.** A seventh, `20260801000000_crm_signal_spine` (creates two
VIEWs), could not be re-checked the same way — `list_tables` enumerates
tables, not views — so that one row states the limitation rather than a
re-confirmation; see its own row below.

Classification legend (same as the source audit): **APPLIED-ELSEWHERE** = the
migration's effect is live in production under a different filename/version
stamp; **LOCAL-ONLY** = a self-described reconciliation aligning a
from-scratch build to production, not a pending change; **UNRESOLVED** = no
strong signal either way from read-only tools.

| Version | Name | Classification | Evidence | Closes |
|---|---|---|---|---|
| `20260526070000` | `widen_insight_type_check_for_v3_generators` | APPLIED-ELSEWHERE (folded into baseline) | Token-fuzzy match (0.67) to pre-baseline `20260422100002_widen_insight_type_check_for_categories`; file's own header says the table it alters doesn't exist until the baseline runs. | Nothing. |
| `20260526180000` | `fix_v3_goals_suggestions_rls` | APPLIED-ELSEWHERE (folded into baseline, low-medium confidence) | Companion file `20260528010000` says "after the production baseline creates golf_goals"; live `golf_goals` carries exactly one `goals_coach_create`/`goals_coach_view` policy pair (performance advisor's `multiple_permissive_policies` finding), consistent with only one of the sibling pair's effect surviving. | Nothing. |
| `20260528010000` | `reapply_v3_goals_suggestions_rls` | APPLIED-ELSEWHERE (same evidence as the row above) | A second literal `CREATE POLICY goals_coach_create` would raise `duplicate_object` if the first had already run, so at most one of the two ever ran standalone; the live single-policy state is consistent with either. | Nothing. |
| `20260528012000` | `relock_crm_admin_rpcs` | APPLIED-ELSEWHERE (medium confidence) | Token-fuzzy match (0.60) to two ledger rows: `20260703154427_crm_rpcs_admin_gate` and `20260704110000_crm_rpcs_admin_gate`. | Nothing. |
| `20260605040000` | `reaffirm_golf_rounds_update_grants` | APPLIED-ELSEWHERE (medium confidence) | Fuzzy match (0.43) to `20260603040000_grant_update_golf_rounds_authenticated`. | Nothing. |
| `20260606190000` | `fix_fairway_denominator` | APPLIED-ELSEWHERE (medium confidence) | Fuzzy match (0.40) to `20260607003641_fix_fairway_denominator_recompute_round_totals`, same week, same fix. | Nothing. |
| `20260606200000` | `converge_legacy_round_sg` | APPLIED-ELSEWHERE | Fuzzy match (0.57) to `20260607011107_converge_legacy_calc_round_sg_with_recalculate`. | Nothing. |
| `20260607200000` | `per_team_sg_baseline` | **APPLIED-ELSEWHERE — VERIFIED LIVE** | Fuzzy match (0.80) to `20260607173102_per_team_sg_baseline_setting`; `golf_team_settings.sg_baseline` re-confirmed present via `list_tables` 2026-09-05 (alongside `sg_benchmark_level`). | Nothing. |
| `20260609230000` | `v3_gender_scoped_sibling_cohorts` | APPLIED-ELSEWHERE | Split across two ledger rows: `20260610011939_..._round_metrics` and `20260610012012_..._shot_metrics` (0.67 each). | Nothing. |
| `20260610150000` | `notification_type_event_updated_pattern` | APPLIED-ELSEWHERE | Fuzzy match (0.83) to `20260610143246_calendar_notification_type_event_updated_pattern`. | Nothing. |
| `20260610170000` | `seed_lpga_standards` | **APPLIED-ELSEWHERE — VERIFIED LIVE** | Fuzzy match (0.75) to `20260613123125_seed_lpga_standards_pk_fix`; `golf_pga_standards.tour` re-confirmed present via `list_tables` 2026-09-05. | Nothing. |
| `20260621170000` | `retire_stranded_predictions` | **UNRESOLVED** | Pure one-time `UPDATE` backfill retiring ~623 stranded `golf_predictions` rows (`due_date <= created_at::date`, `validated_at IS NULL`); no CREATE/ALTER, no fuzzy ledger match, no schema footprint `list_tables` can confirm. | Verification query 1 below. |
| `20260623131038` | `harden_crm_view_and_recruit_doc_functions` | **UNRESOLVED** (low priority — CRM, not golf/baseball core) | Sets `security_invoker = true` on view `v_crm_coaches_by_school` and pins `search_path` on two `golf_recruit_documents_*` trigger functions, each guarded by an existence check so re-running is a safe no-op; no fuzzy match; neither independently confirmable from `list_tables`/`get_advisors` alone. | Verification query 2 below. |
| `20260624000082` | `baseball_staff_display_and_invite_columns` | APPLIED-ELSEWHERE (medium confidence) | Fuzzy match (0.50) to `20260701002000_baseball_staff_capability_columns`. | Nothing. |
| `20260624001200` | `baseball_import_source_external_id` | **APPLIED-ELSEWHERE — VERIFIED LIVE** | Header's "NOT APPLIED by this agent" is authoring boilerplate ("I wrote it, someone else applied it"), not a hold marker; `baseball_player_stats.source_external_id` re-confirmed present via `list_tables` 2026-09-05. | Nothing. |
| `20260625000040` | `baseball_staff_display_scope_columns` | **APPLIED-ELSEWHERE — VERIFIED LIVE** | Same boilerplate phrase; `baseball_team_coach_staff.bio` and `.phone` re-confirmed present via `list_tables` 2026-09-05. | Nothing. |
| `20260625000070` | `baseball_performance_indexes` | APPLIED-ELSEWHERE (superseded by v2) | Same boilerplate phrase; exact token match (1.00) to `20260625113634_baseball_performance_indexes_v2`. | Nothing. |
| `20260625000080` | `helm_lifting_backfill_from_baseball` | **UNRESOLVED** | Idempotent (`ON CONFLICT DO NOTHING` on `legacy_baseball_id`) 22-table dependency-ordered copy from `baseball_lift_*`/`baseball_strength_*`/`baseball_readiness_*`/etc. into `helm_lifting_*`; pure data backfill, no schema footprint, weak fuzzy match only (0.38). | Verification query 3 below. |
| `20260702100100` | `baseball_event_acks_policy_restore` | APPLIED-ELSEWHERE (medium-high confidence) | Fuzzy match (0.67) to `20260702034631_baseball_event_acks_restore_policies` (word-reordered name); corroborated by `baseball_event_acknowledgements` **not** appearing in the live `rls_enabled_no_policy` advisor list even though the file's own header says it was "LOCKED OUT in prod: RLS enabled, ZERO policies" as of 2026-07-02 — the lockout is gone today. | Nothing. |
| `20260730020000` | `auth_user_created_trigger` | **UNRESOLVED** | The file's own header states it read `pg_get_triggerdef` live from production on 2026-07-30 and found `on_auth_user_created` already present on `auth.users`; `auth.users` is outside `list_tables(schemas=["public"])`'s scope, so this session could not independently re-confirm it. | Verification query 4 below. |
| `20260730040000` | `baseball_team_members_select_recursion` | APPLIED-ELSEWHERE — file confirms it itself | Exact token match (1.00) to `20260625204205_fix_baseball_team_members_select_recursion`; the file's own header states "Production does not [recurse], because it was fixed out of band." | Nothing. |
| `20260801000000` | `crm_signal_spine` | APPLIED-ELSEWHERE — VERIFIED LIVE, but **not by this session's tools** | Creates views `v_crm_coach_activity` and `v_crm_coach_signal_summary`; the prior audit confirmed both live via the `pg_graphql_authenticated_table_exposed` advisor list, which enumerates views. `list_tables` enumerates tables only, so this session could not re-run that check — recorded as a tooling limitation, not a disagreement; nothing found this session contradicts the prior finding. | Nothing (re-verify via an advisor read, not `list_tables`, if ever needed). |
| `20260807030300` | `baseball_conversations_recursion_and_tenant_binding` | APPLIED-ELSEWHERE | Fuzzy match (0.67) to `20260807044402_baseball_conversations_fix_recursion_and_tenant_bind` (same day). | Nothing. |
| `20260807030400` | `gate_qualifier_leaderboard` | APPLIED-ELSEWHERE | Fuzzy match (0.50) to `20260807044633_gate_qualifier_leaderboard_and_revoke_anon_effectiveness` (same day, expanded scope). | Nothing. |
| `20260807060000` | `retype_orphaned_class_events` | APPLIED-ELSEWHERE | Fuzzy match (0.80) to `20260807113440_retype_orphaned_class_events_as_class`. | Nothing. |
| `20260807080000` | `golf_dm_join_requires_creator` | APPLIED-ELSEWHERE | Fuzzy match (0.71) to `20260807163532_golf_dm_join_requires_creator_not_team` (same day refinement). | Nothing. |
| `20260825153105` | `permit_completed_round_sg_recalculation` | **UNRESOLVED — likely redundant** | Self-patching `DO` block: reads the live `pg_get_functiondef` of `public.recalculate_round_strokes_gained(uuid)` and no-ops (`RETURN`) if the companion `20260823235000_allow_derived_stats_cache_updates.sql` (confirmed applied — file and ledger row both exist at that version) already granted the same `helm.golf_lifecycle_write = 'stats_cache'` capability; cannot tell from outside whether this file separately ran. | Verification query 5 below. |
| `20260825222432` | `reconcile_baseball_timeline_ack_contract` | **LOCAL-ONLY — VERIFIED LIVE** | `reconcile_*` name; `baseball_timeline_event_acks.team_id` and `.player_id` re-confirmed present via `list_tables` 2026-09-05 (alongside `acked_by`/`acked_at`) — and `user_id`/`acknowledged_at` re-confirmed ABSENT, consistent with the `20260905091000` HOLD row above. | Nothing. |
| `20260825223149` | `reconcile_baseball_event_telemetry_production_contract` | LOCAL-ONLY | `reconcile_*` name, same family as the row above; not independently column-verified — this session's re-verification pass was scoped to rows the audit tagged "VERIFIED LIVE" or "UNRESOLVED — possible real gap," and this one carried neither tag. | Nothing. |
| `20260825235900` | `revoke_anon_from_secdef_admin_helpers` | LOCAL-ONLY | Not `reconcile_`-named, but content is explicit that production already satisfies the intent; targets `log_crm_stage_transition()` and `unresolve_admin_event(uuid[])`, both of which the security advisor's `authenticated_security_definer_function_executable` list showed as `authenticated`-executable (this file closes `anon` access on a fresh LOCAL build only). **Corrected 2026-09-05:** this row previously said `authenticated` access was "intended and unaffected" for both names — that overstated a scope decision (this migration never attempted to touch `authenticated`) as a reviewed finding (that `authenticated` is needed). Per-function re-check in "Advisor warnings, classified" below: `log_crm_stage_transition` is a pure trigger function and IS now revoked by `20260905100000_revoke_secdef_execute_from_authenticated.sql`; `unresolve_admin_event` is left granted, but for documented future admin-console wiring, not because it was "intended by design" here. | See `20260905100000` row below. |

**No disagreement between the prior audit and the live catalog.** Every
column this session independently re-checked against `list_tables` matched
what the audit claimed. The one row that could not be re-checked
(`20260801000000_crm_signal_spine`) is a tooling gap (views vs. `list_tables`
tables-only), not a finding of drift.

### Verification queries for the 5 UNRESOLVED rows

**1 — `20260621170000_retire_stranded_predictions.sql`:**

```sql
SELECT count(*) AS still_stranded
FROM public.golf_predictions
WHERE due_date IS NOT NULL AND created_at IS NOT NULL
  AND due_date <= (created_at::date)
  AND validated_at IS NULL;
```

`0` means either the backfill already ran or nothing was ever stranded;
`> 0` means it genuinely has not.

**2 — `20260623131038_harden_crm_view_and_recruit_doc_functions.sql`:**

```sql
SELECT relname, reloptions FROM pg_class WHERE relname = 'v_crm_coaches_by_school';

SELECT proname, proconfig FROM pg_proc
WHERE proname IN ('golf_recruit_documents_assert_same_team', 'golf_recruit_documents_touch_updated_at')
  AND pronamespace = 'public'::regnamespace;
```

`reloptions` containing `security_invoker=true`, and `proconfig` containing
`search_path=public,pg_temp`, confirm this file already applied.

**3 — `20260625000080_helm_lifting_backfill_from_baseball.sql`:**

```sql
SELECT count(*) AS backfilled_baseball_athletes
FROM public.helm_lifting_athletes
WHERE sport = 'baseball' AND legacy_baseball_id IS NOT NULL;

SELECT count(DISTINCT p.id) AS eligible_baseball_players
FROM public.baseball_players p
JOIN public.baseball_team_members btm ON btm.player_id = p.id
JOIN public.baseball_teams t ON t.id = btm.team_id
WHERE t.organization_id IS NOT NULL AND btm.status = 'active';
```

Roughly equal counts mean the backfill ran; `backfilled_baseball_athletes = 0`
against a nonzero eligible count means it did not.

**4 — `20260730020000_auth_user_created_trigger.sql`:**

```sql
SELECT tgname, pg_get_triggerdef(oid) AS definition, tgenabled
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass
  AND tgname = 'on_auth_user_created';
```

One row with `tgenabled <> 'D'` confirms production already has it — this
file stays a from-scratch-build fix, not a pending production change.

**5 — `20260825153105_permit_completed_round_sg_recalculation.sql`:**

```sql
SELECT pg_get_functiondef('public.recalculate_round_strokes_gained(uuid)'::regprocedure)
       LIKE '%helm.golf_lifecycle_write%stats_cache%' AS already_covered;
```

`true` means the capability is live in production today — whether from this
file, its companion `20260823235000`, or both is not distinguishable from
outside, and per the file's own comment, applying this one on top is harmless
either way.

## Applied directly, no file (2026-09-05 reconciliation)

The 2026-09-05 ledger reconciliation cross-checked all 358 migration files
against the 871-row production ledger. 41 files had no ledger row (32 resolve
to a file authored under a different name/version stamp — benign, not listed
here) and 314 ledger rows had no file (271 resolve the same way; 28 more via
fuzzy/same-day name matching). The remainder — **15 rows with no plausible
file match at all** — read as one-off direct-apply hardening or data sweeps
that never got a committed file. Three of the fifteen are the golf-messaging
change this same reconciliation gave files to (see
`20260904103000_golf_message_reactions.sql` and
`20260904160000_golf_messaging_structured.sql`, plus
`20260904120000_golf_messages_reply_to.sql` for the closely-related 16th row
noted below) — listed here anyway for a complete record of what the audit
found, with their new status noted.

| Ledger version | Ledger name | What the name says it did | File status |
|---|---|---|---|
| `20260527190000` | `harden_public_rpc_grants` | Tightened grants on one or more public RPCs. | No file. |
| `20260607162823` | `calculate_round_sg_gender_aware` | Part of the same-day gender-aware strokes-gained cluster (`20260607170000_gender_aware_strokes_gained.sql` is the closest filed sibling). | No file. |
| `20260610155053` | `golf_teams_season_active_email_gate` | Plausibly gates an email send on `golf_teams.season_active` (confirmed live 2026-08-25 by `20260825212613_reconcile_golf_team_season_active_production_contract.sql`). | No file. |
| `20260617023458` | `add_division_levels_d1_naia_juco` | Adds NCAA division labels (D1/NAIA/JUCO); corroborated by `20260825211909_reconcile_ncaa_division_production_contract.sql`'s claim that production already had these labels. | No file. |
| `20260617165330` | `crm_engagement_revoke_default_grants` | Revoked a default-privilege grant on CRM engagement objects. | No file. |
| `20260621220953` | `chat_message_status` | Added a status column/enum to a messaging table (pre-dates this week's golf-messaging work by ~2.5 months). | No file. |
| `20260701182842` | `baseball_teams_program_type_backfill_prod` | The `_prod` suffix names this as a one-off production data backfill on `baseball_teams.program_type`, not a schema change meant to have a file. | No file — by its own name, likely never meant to. |
| `20260703195259` | `supabase_drift_fixes_and_function_relation_guard` | A drift-fix sweep plus a relation guard on one or more functions. | No file. |
| `20260703212357` | `advisor_low_risk_hardening_20260703` | Date-stamped in its own name — a same-day sweep applying low-risk Supabase-advisor findings. | No file. |
| `20260729173447` | `baseball_messages_drop_self_comparison_policies` | Dropped one or more RLS policies on `baseball_messages` that compared a row to itself (a common self-referential-policy-recursion fix pattern in this repo, e.g. `20260625204205_fix_baseball_team_members_select_recursion`). | No file. |
| `20260729175000` | `revoke_anon_execute_on_definer_rpcs` | Revoked `anon` EXECUTE on one or more SECURITY DEFINER RPCs — the exact hardening class `shipping.md` §4 calls out repeatedly. | No file. |
| `20260729175027` | `revoke_public_execute_on_crm_trigger_fn` | Revoked `PUBLIC` EXECUTE on a CRM trigger function (closing the public-schema default-privilege auto-grant this repo's view/function migrations otherwise always state explicitly). | No file. |
| `20260803152021` | `helm_lifting_coaches_insert_own_in_editable_org` | Added or restated an INSERT policy letting a lifting coach insert their own row within an org they can edit. | No file. |
| `20260904103000` | `golf_message_reactions` | Created `golf_message_reactions`. | **Now reconstructed** — `20260904103000_golf_message_reactions.sql` (this reconciliation). |
| `20260904160000` | `golf_messaging_structured` | Added `golf_messages.kind`/`.payload`/`.pinned_at`/`.pinned_by` and created `golf_message_responses` (this file's own best-effort split — see its header). | **Now reconstructed** — `20260904160000_golf_messaging_structured.sql` (this reconciliation). |

A 16th row, `20260904120000_golf_messages_reply_to`, scored only a 0.33 fuzzy
match against an unrelated file and is functionally in this same "no file"
bucket, even though it fell just outside the audit's top-15 cut. It is the
third of the three 2026-09-04 golf-messaging rows and is **also now
reconstructed** — `20260904120000_golf_messages_reply_to.sql` (this
reconciliation) — adding `golf_messages.reply_to_id` and creating
`golf_message_mentions`.

None of the twelve still-unreconstructed rows above were verifiable against
the live catalog with the read-only tools this reconciliation had (most are
grant/policy changes, which `list_tables`/`get_advisors` do not enumerate in
enough detail to confirm or refute a specific historical grant). They are
recorded here as a complete accounting of the ledger, not as a claim that any
of them needs a follow-up migration file — per this file's own pattern
elsewhere (the 13-row and 271-row same-migration-different-stamp findings),
"no committed file" for a small, self-contained, already-applied change is
this repo's normal drift pattern, not evidence of a problem.

**2026-09-05 A3b follow-up — the three golf-messaging files independently
re-checked against the live catalog** (`list_tables`, verbose, project
`qmnssrrolpinvwjjnufo`, and `list_migrations`, both read fresh in this
follow-up session, not reused from A3's own read): all three live tables
(`golf_message_mentions`, `golf_message_reactions`, `golf_message_responses`)
exist exactly once each across the three files, every column/nullability/
default/CHECK/FK in each file matches the live catalog byte-for-byte (down to
`mentioned_user_id` being nullable and `kind`'s CHECK array), and no file
describes a table absent from the catalog. `list_migrations` confirms all
three ledger rows (`20260904103000 golf_message_reactions`,
`20260904120000 golf_messages_reply_to`, `20260904160000
golf_messaging_structured`) exist under exactly those names, and confirms
`20260903190000`/`20260903193000` (O6(a) above) genuinely have no row under
any name or version. No content or header disagreed with the catalog — the
three files needed no fix. The table-to-file attribution remains each file's
own disclosed inference (the catalog only shows end state, never which
transaction created which object), not upgraded to fact by this re-check.

## Ledger rows with no file

The mirror image of the section above. Measured 2026-09-05 against the same
`list_migrations` read (871 rows) and the same 364-file tree: **551 ledger
rows have no matching local file.** `240` of those predate
`20260527000000_prod_public_baseline.sql` — an 859 KB consolidation that
squashes the entire pre-baseline production history into one file, so those
240 never need individual reconciliation — leaving **311 post-baseline**.

### Policy

These are the June–August dashboard-applied history: one-off hardening
sweeps, same-day iterative fixes, and small direct-apply changes made through
the Studio/Management API rather than this repo's later file-then-apply
discipline. `scratchpad/exec/details-supabase-for-a3c.md` §2(b) hand-verified
a large sample of the 311 and found the dominant, well-understood shape —
**271 of 314 (86%, at that read) match a file under the exact same name at a
different version stamp** (file authored, applied hours-to-days later under
the ledger's apply-time stamp — never a materially different production
change), a further 28 resolve via fuzzy/same-day name matching, and only 15
have no plausible file match at all (pure one-off sweeps: grant/revoke
hardening, a production data backfill, and the three 2026-09-04
golf-messaging rows since given files elsewhere in this reconciliation). None
of that per-row detail is reproduced here — the point of this section is the
policy, not a second copy of the pairing table.

**The drift ratchet holds this count, and it may only go down.**
`.migration-drift-baseline.json`'s `production_only` field (currently `551`)
is enforced by `scripts/db/migration-ledger-drift.mjs`, which fails CI if the
live count rises above it. It falls only when an owner-run `--update` follows
genuine drift paydown — retroactively authoring a file for one of the 15
no-plausible-match rows, for instance — never by editing the baseline number
directly.

**Do not back-fill these as migration files.** For the 271+28 matched rows, a
file already exists and describes the real change; writing a second file
under the ledger's version stamp would create two files claiming to be the
same migration, and risks a second `CREATE OR REPLACE` diverging from the
first the next time either is edited. For the 15 unmatched rows, writing a
file after the fact would assert a level of certainty about "what exactly
ran" that this reconciliation's read-only tools cannot support — see
`scratchpad/exec/details-supabase-for-a3c.md`'s own "What I could not verify"
section.

**Do not delete these rows from the ledger.**
`supabase_migrations.schema_migrations` is the historical record of what
actually executed against production, however it was invoked. Deleting a row
asserts a migration never happened when the live catalog says otherwise — the
same category of error `.claude/rules/shipping.md` §1 calls "a session that
obeyed the docs produced fluent, confident, broken work," just pointed at the
ledger instead of a doc.

### The 20 newest post-baseline rows with no file

Shown so a reader can see the shape without opening `list_migrations`
directly. All 20 are dated 2026-08-25 or earlier; measured 2026-09-05, **zero**
ledger rows from 2026-08-26 onward lack a matching local file version stamp —
this reconciliation does not know or claim why that shift happened, only that
it did. The first 13 below are also independently documented in the
register's row for 13 production-only versions (search that row above for
the same 13 filenames); the remaining 7 were not previously called out
individually anywhere in this file.

| Ledger version | Ledger name |
|---|---|
| `20260825233238` | `fix_round_recap_wrapper_definer` |
| `20260825125512` | `restore_atomic_lifecycle_capability_v2` |
| `20260825124728` | `allow_protected_atomic_round_submit` |
| `20260825121433` | `restore_golf_round_lifecycle_contract` |
| `20260825121310` | `permit_completed_round_recap_write` |
| `20260825121238` | `fix_active_round_stranding_trigger_record_types` |
| `20260824023141` | `allow_completed_round_reclassify` |
| `20260823235118` | `allow_derived_stats_cache_updates` |
| `20260823233509` | `harden_golf_round_lifecycle_boundaries` |
| `20260823233504` | `preserve_started_round_identity` |
| `20260821165627` | `feature_health_excludes_resolved_incidents` |
| `20260821114110` | `single_flight_round_submit` |
| `20260820172125` | `single_flight_partial_round_save` |
| `20260819173235` | `conversation_creator_cannot_inject_third_party` |
| `20260819033336` | `golf_staff_invite_codes` |
| `20260819031356` | `golf_staff_invite_single_use` |
| `20260818124738` | `fix_putt_break_direction_metric_direction` |
| `20260818010326` | `golf_shots_select_policy_perf` |
| `20260809201741` | `join_request_predicate_staff_strict` |
| `20260809201731` | `golf_rounds_team_write_check` |

## Owner actions, prepared

Prepared by the 2026-09-05 reconciliation. None of this was run — every
statement (or, for O8, the env var change itself) needs the owner's own
credentials and, per `repair-contract.md` and this repo's R3 convention,
deliberate execution outside any agent's `bypassPermissions` session.
(Section renamed from "Owner SQL, prepared" on 2026-09-05 when O8 added the
first prepared action that is not SQL — a Vercel environment variable.)

### O11 — disable the Supabase GitHub branching integration; it is the only thing keeping this register's HELD files off production

`list_branches` (project `qmnssrrolpinvwjjnufo`, read 2026-09-05) shows the
Supabase-GitHub integration's automatic branching is live: preview branches
exist for PR #1759 (created 2026-09-02) and #1833 (2026-09-04) — the
project's concurrent-branch limit is reached — and the DEFAULT branch record
itself sits in status `MIGRATIONS_FAILED`.

That failing status is not incidental. Every merge to `main` posts a failing
"Supabase Preview" GitHub status reading "Remote migration versions not found
in local migrations directory" — this integration attempting to apply
`supabase/migrations/` straight into production on every merge, and failing
only because of the exact ledger mismatch this file exists to document (the
44 local-no-ledger-row files above, several of them deliberate HOLDs).
**That failure is currently the only thing stopping every HOLD, OBSOLETE, and
UNVERIFIED file in the register above from reaching production
automatically.** If the ledger mismatch is ever fully resolved without also
disabling this integration first, the next merge to `main` would attempt to
apply every one of them — including an unreviewed draft
(`20260708141000`), an explicitly obsolete revoke
(`20260528011000`), and R3-gated privileged migrations nobody has cleared for
an unattended apply (`20260903150000`).

**Action**: Supabase Dashboard → Project → Integrations → GitHub → disable
automatic branching and disable deploy-to-production-on-merge (or uninstall
the GitHub App entirely if branching is not wanted at all), then delete the
two existing preview branches (PR #1759, PR #1833) so the concurrent-branch
limit clears.

**Verification**: `list_branches` returns only the default branch — no
PR-scoped preview branches — and the failing "Supabase Preview" status stops
appearing on new PRs.

This is an owner-only dashboard/integration change, not a SQL statement, and
it changes what every future merge to `main` attempts against production —
treat it with the same R3 deliberateness as the SQL actions below.

### O6(a) — insert the two missing ledger rows

**APPLIED 2026-09-06** (owner-authorized). Both rows verified present by `SELECT version, name` immediately after the INSERT.

Closes the "NO LEDGER ROW" note on `20260903190000` and `20260903193000`
above. `supabase_migrations.schema_migrations` columns (confirmed live via
`list_tables`, schema `supabase_migrations`): `version` (text, PK),
`statements` (text[], nullable), `name` (text, nullable), `created_by` (text,
nullable), `idempotency_key` (text, nullable, unique), `rollback` (text[],
nullable). `statements`/`rollback` are left `NULL` — the exact executed SQL
text was never captured, only the resulting function bodies (verified via
`pg_get_functiondef` md5, per each row's HELD.md entry); this INSERT records
that the version applied, not what its literal statements were.

```sql
INSERT INTO supabase_migrations.schema_migrations (version, name, created_by)
VALUES (
  '20260903190000',
  'helm_debug_stat_snapshot_extensions_search_path',
  'owner action O6(a), 2026-09-05 reconciliation — applied 2026-09-03, ledger row missing'
)
ON CONFLICT (version) DO NOTHING;

INSERT INTO supabase_migrations.schema_migrations (version, name, created_by)
VALUES (
  '20260903193000',
  'helm_debug_error_events_individual_rows',
  'owner action O6(a), 2026-09-05 reconciliation — applied 2026-09-03, ledger row missing'
)
ON CONFLICT (version) DO NOTHING;
```

### O6(b) — a read-only role for the Repair stage

**APPLIED 2026-09-06** (owner-authorized). Role, four grants and four policies created; `pg_policies` shows the four `helm_repair_ro_*` rows. Minting `HELM_REPAIR_DB_KEY` still needs the JWT secret and remains an owner step.

`docs/ai-system/selfheal/repair-contract.md` names exactly what Repair reads
and writes: SELECT on `public.background_job_logs` (STEP 0b), `public.admin_events`
and `public.admin_error_resolutions` (STEP 1); INSERT — never UPDATE or
DELETE — on `public.background_job_logs`, and only its own heartbeat row
(STEP 6). This role is what
`.github/workflows/selfheal-repair.yml`'s planned `HELM_REPAIR_DB_KEY` secret
(see that workflow's TODO) should actually authenticate as, in place of the
full `SUPABASE_SERVICE_ROLE_KEY` the workflow uses today — the contract has
never needed write access to anything but its own heartbeat, so the
credential should not be able to do more than that.

All three tables have RLS enabled (confirmed live, `list_tables`: 276 of 276
`public` tables carry `rls_enabled = true`), so a bare `GRANT` is necessary
but not sufficient — the role also needs policies, added here rather than
`BYPASSRLS`, which would grant this role more than the contract ever uses.

```sql
CREATE ROLE helm_repair_ro NOLOGIN NOINHERIT;

-- PostgREST's connection role must be able to switch into this one — the
-- same mechanism Supabase's own `anon`/`authenticated` roles use.
GRANT helm_repair_ro TO authenticator;

GRANT USAGE ON SCHEMA public TO helm_repair_ro;

GRANT SELECT ON public.background_job_logs TO helm_repair_ro;
GRANT SELECT ON public.admin_events TO helm_repair_ro;
GRANT SELECT ON public.admin_error_resolutions TO helm_repair_ro;
GRANT INSERT ON public.background_job_logs TO helm_repair_ro;

CREATE POLICY helm_repair_ro_select_background_job_logs
  ON public.background_job_logs FOR SELECT
  TO helm_repair_ro
  USING (true);

CREATE POLICY helm_repair_ro_select_admin_events
  ON public.admin_events FOR SELECT
  TO helm_repair_ro
  USING (true);

CREATE POLICY helm_repair_ro_select_admin_error_resolutions
  ON public.admin_error_resolutions FOR SELECT
  TO helm_repair_ro
  USING (true);

-- Scoped to exactly what STEP 6 writes: its own heartbeat, never another
-- job_type's row and never an update/delete of an existing one.
CREATE POLICY helm_repair_ro_insert_own_heartbeat
  ON public.background_job_logs FOR INSERT
  TO helm_repair_ro
  WITH CHECK (job_type = 'selfheal-repair');
```

Minting a working `HELM_REPAIR_DB_KEY` from this role additionally needs a
JWT signed with the project's JWT secret carrying `{"role": "helm_repair_ro"}`
— that step needs the project's JWT secret, which this reconciliation does
not have access to and does not attempt to derive here.

### O6(c) — stop exposing `graphql_public` over the API

**NOT applied as SQL, by decision 2026-09-06.** Live check: `authenticator` has no `pgrst.db_schemas` in `rolconfig`, so the exposed-schema list is dashboard-managed on this project, and Supabase's own troubleshooting docs state that a manual `ALTER ROLE authenticator SET pgrst.db_schemas` makes the dashboard stop managing schemas from then on. Do this in Dashboard → Project Settings → Data API → Exposed schemas: remove `graphql_public`, save. The SQL below is kept only as the documented alternative.

Independently confirmed 2026-09-05 (`grep -rn "graphql" src/ --include="*.ts"
--include="*.tsx" -i`): exactly 4 lines, all references to the
`graphql_public`/`graphql` schema keys Supabase's own `db:types` generator
always emits into `src/lib/types/database.ts`, plus one test asserting
against that same generated structure. **Zero application code issues a
GraphQL query, imports a GraphQL client, or calls `/graphql/v1` anywhere in
`src/`.** The ~430 `pg_graphql_anon_table_exposed`/`pg_graphql_authenticated_table_exposed`
WARN-level security-advisor findings (126 + 308 unique tables) are dead
surface with no code path depending on them.

`supabase/config.toml`'s `[api] schemas = ["public", "graphql_public"]`
governs the **local** stack only. In production the exposed-schemas list is a
project setting (Dashboard → Settings → API → Exposed schemas), which can
also be changed at the database level via the `authenticator` role's
`pgrst.db_schemas` GUC, reloaded live with `NOTIFY pgrst`:

```sql
-- Remove graphql_public from PostgREST's exposed-schema list. Confirm the
-- current value first — this REPLACES the list, it does not remove one entry:
--   SHOW pgrst.db_schemas;   -- or: SELECT rolconfig FROM pg_roles WHERE rolname = 'authenticator';
ALTER ROLE authenticator SET pgrst.db_schemas = 'public';
NOTIFY pgrst, 'reload config';
```

This does not disable the `pg_graphql` extension itself (still installed,
schema `graphql`, version 1.5.11) — only removes it from what PostgREST
serves. If the extension is to be dropped entirely rather than just
unexposed: `DROP EXTENSION IF EXISTS pg_graphql;` (this also drops the
`graphql`/`graphql_public` schemas' generated views/functions; confirm no
Edge Function or Management-API-side tooling depends on the extension being
present before running it — this reconciliation did not check Edge Function
source for that, only `src/`).

### O7 — investigate and, if warranted, restore the `admin_allowlist` vs `users.role` divergence

**(a) RUN 2026-09-06 — one row.** The divergent allowlist entry is the founder account (the `note` column records it was added 2026-07-29 so `is_super_admin()` would pass); its `users.role` is `coach`. **(b) deliberately NOT run**: `users.role = 'admin'` still drives post-login routing (`src/app/golf/actions/auth.ts`, `src/app/golf/(dashboard)/layout.tsx`) and team-creation behavior (`src/app/golf/actions/teams.ts`), so flipping the founder's role changes their day-to-day coach experience — an owner decision. Owner confirmed 2026-09-06 that `coach` is intentional (that login is the test-coach account; `admin@` is the admin account, role `admin` and allowlisted). Resolved by changing the drift check, not the row: `check-supabase-drift.mjs` now fails only on a `users.role = 'admin'` account missing from `admin_allowlist` (the 2026-07-29 Forbidden shape) and reports allowlisted non-admin accounts as deliberate dual-role logins.

Closes the register's "INVESTIGATE, not a migration" row above (F040 in the
2026-09-05 coverage matrix). `db-drift.yml`'s "admin_allowlist and
users.role=admin stay in sync" check
(`scripts/db/check-supabase-drift.mjs`) has failed 5 straight scheduled runs:
one `admin_allowlist` user no longer has `users.role='admin'` in production.

**The specific `user_id` is NOT recorded anywhere this reconciliation (or the
A3 track before it) had access to.** A3's own report says so directly, twice
— once inline ("no `execute_sql` access in this session's read-only Supabase
MCP to identify the specific user") and once in its "what could not be
reconstructed" section ("needs identifying which specific user and why; not
resolvable without `execute_sql` access"). The `db-drift.yml` check itself
(`check-supabase-drift.mjs`'s query below) only returns a COUNT, never the
row — so even the CI log that failed 5 times never printed an id. **There is
no drift-run output anywhere in this repo's evidence trail that names an id
to quote here.** (a) below is the read-only diagnostic that produces one;
(b) is a template the owner fills in from (a)'s result — not a ready-to-run
statement, because no session in this chain has ever seen the actual id.

**(a) — identify every divergent id** (safe, read-only; matches the shape of
`check-supabase-drift.mjs`'s own query, but returns rows instead of a count):

```sql
SELECT a.user_id, a.email, a.note, u.role AS current_role
FROM public.admin_allowlist a
LEFT JOIN public.users u ON u.id = a.user_id
WHERE u.role IS NULL OR u.role <> 'admin';
```

**(b) — restore the role, ONLY if the demotion was accidental** (fill in the
`user_id` from (a) — this reconciliation has no value to put there):

```sql
-- Run (a) first. Decide whether the divergence is a mistake (restore) or
-- intentional (in which case DELETE the stale admin_allowlist row instead —
-- see the register row above). Do not run this against a guessed id.
UPDATE public.users
SET role = 'admin'
WHERE id = '<user_id from O7(a)>';
```

`admin_allowlist` (via `is_super_admin()`) is what actually gates admin
access today — see `docs/operations/SUPABASE_DRIFT_GUARD.md`'s "source of
truth" note — so nothing is broken while this sits uninvestigated. The
divergence is worth closing anyway: a stale `users.role` is exactly the kind
of two-copies-of-one-fact drift `src/lib/admin/require-super-admin.ts`'s own
header describes causing the #736 incident in the other direction.

### O8 — confirm the Inngest signing key in Vercel production actually works

F127 in the 2026-09-05 coverage matrix. Sentry issue `JAVASCRIPT-NEXTJS-QC`
("In cloud mode but no signing key found", culprit `POST /api/inngest`) has
five events, first seen 2026-09-02 and last seen 2026-09-03. Inngest Cloud was
calling back into `/api/inngest` with a signed request and the SDK could not
find a usable `INNGEST_SIGNING_KEY`.

The variable is NOT absent, though. `vercel env ls production`, run
2026-09-05, lists both `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in the
Production environment, created about four days earlier (≈2026-09-01). So one
of two things is true, and the owner has to tell which:

1. the deployment that served those requests was built before the variable
   existed — Vercel injects env at build time, so a value added after a
   deploy does nothing until the next promote; or
2. the value itself fails the shape check in `src/lib/inngest/credentials.ts`
   (`classifyCredential('inngest_signing_key', …)` returns `placeholder` or
   `malformed`), which the SDK reports with the same message.

**Action**: after the next production promote, run
`node scripts/inngest-health-check.mjs` against production and look at the
Sentry issue for any event newer than that deploy. No new events → resolve
`JAVASCRIPT-NEXTJS-QC` and this row is closed. New events → the stored value is
wrong; paste the current signing key from app.inngest.com into the Production
variable and promote again.

`scripts/check-required-env.mjs` now refuses a production/preview build that
has `INNGEST_EVENT_KEY` set without `INNGEST_SIGNING_KEY` (added 2026-09-05,
alongside this row). Production already satisfies it, so no deploy is blocked
by it today; it exists so the absent-variable case can never ship again. It
cannot see a wrong value — only the runtime health check can.

## Advisor warnings, classified

`get_advisors(type=security)` returns 589 lints today: 4 ERROR, 476 WARN, 7
INFO. The 4 ERROR-level `security_definer_view` findings have their own
section immediately below ("Dismiss in the Supabase advisor UI") and are not
repeated here. The remaining classes, one paragraph each:

**`pg_graphql_anon_table_exposed` (126 unique tables) and
`pg_graphql_authenticated_table_exposed` (308 unique tables), WARN.** Dead
surface: `grep -rn "graphql" src/ --include="*.ts" --include="*.tsx" -i`
returns exactly 4 lines, all references to the `graphql_public`/`graphql`
schema keys Supabase's own `db:types` generator always emits, plus one test
asserting against that generated structure — zero application code issues a
GraphQL query, imports a GraphQL client, or calls `/graphql/v1` anywhere in
`src/`. These ~430 findings are closed by O6(c) below (unexpose
`graphql_public` from PostgREST via the `authenticator` role's
`pgrst.db_schemas` GUC). **Owner action: run O6(c).**

**`authenticated_security_definer_function_executable` (142 findings, 141
unique names — the gap is legitimate overloading of
`can_view_baseball_player`), WARN.** Per the audit's §1.6 conclusion, this is
not an anon-exposure list — it flags every SECURITY DEFINER function callable
by any signed-in user, which is the correct, intended shape for an RPC helper
layer (`is_*`/`can_*`/`get_my_*` predicate functions dominate the list: 10
golf, 10 baseball, 9 helm_lifting, 112 other). **Revised 2026-09-05 (Phase 2
P3): this paragraph previously said "nothing is prepared to close this class
wholesale, and nothing should be" and stopped there, on the strength of that
same true premise — but "wholesale" and "zero" are different claims, and the
per-function classification that would tell them apart had never been done.
It has now.** Every one of the 141 names was checked against: every
`.rpc(`-shaped call in `src/` (including the `const rpc =
supabase.rpc.bind(supabase)` / `rpcCall(...)` / `fingerprintRpc(...)` /
`(supabase.rpc as any)(...)` detachment idioms this codebase repeats, not
only the literal `.rpc('name'` form); every `CREATE POLICY` USING/WITH CHECK
and `CHECK` constraint body across all 364 migrations (RLS predicate helpers
run IN THE QUERYING SESSION, so `authenticated` needs EXECUTE on them even
though the app never names them — this is the dominant shape, ~70 of the 96
names with no direct `.rpc()` site); every `CREATE TRIGGER`; and every other
function's body, to separate a callee reached only from a SECURITY DEFINER
caller (needs no grant — a DEFINER function executes as its owner, and every
function here is owned by `postgres` per the baseline's "owner-stripped"
comments, so the owner's own implicit privilege on functions it owns survives
any REVOKE against `authenticated`/`anon`/`PUBLIC`) from one actually reached
by app code or RLS. Full working detail: `scratchpad/exec/phase2-P3.md`
(this session) — not committed, reproduce via the same method if it is gone.

The result is nine names, not zero and not 141:
`20260905100000_revoke_secdef_execute_from_authenticated.sql` (register row
below, PENDING OWNER REVIEW) revokes `authenticated`/`anon`/`PUBLIC` EXECUTE
from eight pure trigger functions
(`extract_email_click_from_event`, `sync_coach_last_email_event`,
`sync_email_snapshot_from_event`, `golf_event_documents_assert_same_team`,
`golf_holes_recompute_round_totals_fn`, `set_calendar_feed_token`,
`update_round_stats_cache`, `log_crm_stage_transition` — Postgres never
checks the triggering session's EXECUTE privilege on a trigger function,
regardless of SECURITY mode, so this is a categorical guarantee, not an
inference from absent evidence) plus one internal composability gate,
`__admin_rollup_b_gate()` (called only via `PERFORM
public.__admin_rollup_b_gate();` from within its ~17 sibling admin-rollup
SECURITY DEFINER functions, themselves deliberately kept — see those
siblings' own history in `20260602165152_harden_search_path_and_revoke_anon_admin_fns.sql`
and `20260709010100_gate_admin_event_summary.sql` — and owned by the same
`postgres` role as its callers, so the nested call needs no grant).

**Two specific names on this list (`log_crm_stage_transition`,
`unresolve_admin_event`) are exactly what
`20260825235900_revoke_anon_from_secdef_admin_helpers.sql` (see the
classification table above) exists to keep `anon`-clean on a fresh local
build** — that much of the old paragraph, and the classification-table row
it points at, both stand. What does not stand: that migration's silence on
`authenticated` was scope (a LOCAL-drift-to-PRODUCTION fix, deliberately
narrow), not a reviewed finding that `authenticated` is needed — its own WHY
section says so. Re-checked per-function, the two names split:
`log_crm_stage_transition` is one of the eight trigger functions above and is
now revoked. `unresolve_admin_event` is NOT revoked, on different grounds
entirely — see below.

**Five names this migration deliberately leaves alone, each for a distinct,
stated reason, not by default:**

- `recompute_golf_round_totals(uuid)` — the only trigger caller found
  anywhere in the migration corpus is `golf_holes_recompute_round_totals_fn`
  (itself DEFINER-owned, needs no grant for that nested call). But the HELD,
  unapplied, unreviewed draft
  `20260708141000_gate_secdef_ownership_and_redemption.sql` asserts, in its
  own caller-audit, that this function "is invoked BY A TRIGGER on
  golf_shots" and must keep "owner/coach for direct authenticated/anon
  .rpc()". Neither claim is corroborated here — the only trigger on
  `golf_shots` in the whole corpus is `update_golf_shots_updated_at`, calling
  the unrelated `update_updated_at_column()` — but a second, independently
  written, already-committed audit disagreeing with this one is reason
  enough not to resolve the conflict by inference. Left granted.
- `is_in_team(uuid)`, `user_is_golf_team_member(uuid)` — zero callers found
  by the same exhaustive search as the eight trigger functions, but neither
  carries a trigger's categorical exemption; absence of evidence here is
  genuinely just absence of evidence. `is_in_team`'s own `COMMENT ON
  FUNCTION` calls it a "v3 RLS helper... Use for team-scoped shared-read
  policies (Pattern 3 in docs/v3-rls-template.md)" — documented for future
  adoption, not confirmed dead. Left granted.
- `golf_conversation_has_me(uuid)` — flagged by the advisor but has NO
  `CREATE FUNCTION` anywhere in `supabase/migrations/`, not even in the
  2026-05-27 production baseline dump that otherwise contains every
  production function as of that date. It exists in production out of band.
  Unresolved, not dead — left granted, recorded as a knowledge gap rather
  than judged.
- `unresolve_admin_event(uuid[])` — self-gates via `is_super_admin()`
  (`20260729120000_admin_events_unresolve_rpc.sql`), zero confirmed `src/`
  call site today, but that migration's own header states its purpose as
  future Bridge-console wiring ("make Bridge's only mutation reversible"),
  mirroring its already-wired sibling `resolve_admin_event(uuid[])` exactly.
  Revoking now would silently break that wiring the day it ships. Left
  granted — this is the corrected version of the old paragraph's "by design"
  claim for this name; "by design" overstated a scope decision as a reviewed
  one, but the corrected reason (documented future wiring) reaches the same
  answer.

Every remaining name — every `get_admin_*_rollup`, `get_users_with_auth`,
`get_audit_log_recent`, `get_shot_data_quality`, `get_qualifier_leaderboard`,
`get_golf_message_attachments`, `get_baseball_conversations_with_details`,
`get_golf_conversations_with_details`, `admin_resolve_error_fingerprint`, and
every remaining `is_*`/`can_*`/`get_my_*`/`current_*` RLS predicate — is
confirmed either as a direct (if indirectly dispatched) app RPC target, or as
self-gated with an explicit prior security migration that chose to keep
`authenticated` deliberately. Unchanged. **Owner action: review and apply
`20260905100000_revoke_secdef_execute_from_authenticated.sql`** (register row
below); until then this remains 9 open findings out of 142, not 0.

**`extension_in_public` (`citext`, `pg_trgm`), WARN.** Both confirmed
installed with `schema: "public"` via `list_extensions`. The advisor's fix is
to move each extension to a dedicated schema (e.g. `extensions`, where every
other non-`pg_graphql`/`pg_cron` extension in this project already lives).
That is a live-catalog schema move on two extensions with unqualified
references scattered across roughly 276 tables' worth of column types and
`gin_trgm_ops` index definitions — exactly the class of change
`20260903190000`'s own incident in this file (a function's `search_path`
missing the schema `pg_stat_statements` lives in, causing every call to raise
`42P01` until corrected) demonstrates can silently break at the call site
rather than at migration time. No migration is prepared for this. **Owner
decision required before attempting** — audit every dependent object's
schema-qualification or `search_path` first; this is not a same-day fix.

**`rls_enabled_no_policy` (7 tables), INFO.** `backup_ci_junk_rounds_20260821`,
`backup_class_semester_20260813`, `backup_prevyear_classes_20260821`,
`crm_email_templates_backup_20260720`, and `schema_migrations_pruned_20260820`
are dated backup/pruned snapshots — RLS on with zero policies means
unreadable by any non-service role, which is safe for retired data and a
candidate for a future `DROP TABLE`, not a policy fix. **No action** on those
five. `billing_customers` and `billing_invoices` are the two that matter: RLS
on, zero policies, so no `authenticated`/`anon` role can read or write them
today — acceptable if billing is read only through service-role server code,
a silent gap if any client-side billing read exists, because PostgREST
would return zero rows rather than an error and the failure would look like
"no billing data" rather than "no permission." Checked this session:
`grep -rn "billing_customers\|billing_invoices" src/` finds every reference
confined to `src/app/admin/actions/billing.ts` (a `'use server'` action) and
`src/app/api/webhooks/stripe/route.ts` (a server-side route handler) —
both server-scoped, neither reachable from a browser client. **No client-side
read path exists today; no action needed.** Re-run the same grep if a
customer-facing billing UI is ever added, since that is exactly the change
that would turn this from "safe by omission" into a real gap.

## Dismiss in the Supabase advisor UI (F097, 2026-09-05)

Four ERROR-level `security_definer_view` advisor findings are intentional,
not defects, and should be dismissed in the advisor UI (Dashboard → Advisors
→ Security) rather than left open. Each view's creating migration now also
carries a comment block stating the same reasoning at the object itself, so a
future reader hits it there, not only in this file.

| View | Reason to dismiss |
|---|---|
| `public.baseball_coaches_public` | Non-PII coach-identity boundary for messaging + cross-org display (authenticated only, not anon). `security_invoker = false` is required — the view must run with owner rights so it returns non-PII identity for any authenticated caller regardless of that caller's own row-level access to `baseball_coaches`. |
| `public.organizations_public_profile` | Anon-facing security boundary for the public `/baseball/program/[id]` page. Base table `organizations` stays authenticated-only via RLS; anon reads are served exclusively through this view's owner-rights execution. |
| `public.baseball_team_coach_staff_public` | Anon-facing security boundary for the public `/baseball/team/[id]` staff card. Base tables `baseball_team_coach_staff` and `baseball_coaches` stay authenticated-only via RLS. |
| `public.baseball_teams_public_profile` | Anon-facing security boundary for the public `/baseball/team/[id]` and `/baseball/program/[id]` pages. Base table `baseball_teams` stays authenticated-only via RLS. |

This is a different advisor category from O6(c) above — that one is the ~430
WARN-level `pg_graphql_*_table_exposed` findings, closed by unexposing
`graphql_public`. These four are ERROR-level `security_definer_view` findings
on views this repo deliberately built as security-definer boundaries; the
advisor's usual fix for that finding (`security_invoker = true`, or removing
the view) would break each view's actual purpose, described per-row above.

## Adding a row

Anything here must say what would go wrong if it were applied, not merely that
it is held. "Held" without a reason decays into the same unknown this file
exists to prevent.
