# Lane A — DB Apply — Observations

Worker: worker-db-apply. Repo: /Users/ricknini/Downloads/helmv3. Prod project: qmnssrrolpinvwjjnufo.
Migrations sourced from branch `overnight/remediation-2026-08-18` (read-only via `git show`, never checked out).

Session start: 2026-08-19.

## PATTERN — the reconciliation's "missing objects" lists are not a reliable absence signal

Found three times in one night, independently, before generalizing it: `baseball_seasons` has no
`is_current` column; `baseball_staff_audit_events` has no `subject_coach_id`; `baseball_decision_log`
has `signal_id`, not `source_signal_id`, and no `subject_table`/`subject_id` at all. In each case
the migration reconciliation counted the index/column as "missing live" — true as far as it goes,
but the reason isn't that a later migration forgot to run it. It's that a DIFFERENT, later "repair"
migration created the table under the SAME NAME with a MATERIALLY DIFFERENT SHAPE, so the object
the file wants to add references a column that does not exist under any name.

**Consequence: any forward-fix migration mechanically generated from the residue's object lists
will fail on apply for a material share of that residue — not occasionally, three-for-a-handful
checked so far.** The lists describe what a migration file INTENDED to create, not a gap that
still exists in production. Before drafting a forward-fix for ANYTHING in the unmatched-migration
residue, check the live table's ACTUAL COLUMNS against the file's assumptions — do not trust
"objects_missing_live > 0" as sufficient evidence that the object can simply be added.


---

## DECISIONS NEEDED

(populated as encountered)

## THINGS I NOTICED BUT DID NOT ACT ON

(populated as encountered)

## JUDGMENT CALLS I MADE

(populated as encountered)

## WHAT I COULD NOT VERIFY

(populated as encountered)

---

## Migration 1: 20260819070000_conversation_creator_cannot_inject_third_party

PRE-FLIGHT (verbatim current policy defs, pg_policy on prod, 2026-08-19):

- golf_participants_insert_v2 (INSERT, golf_conversation_participants):
  `(((user_id = ( SELECT auth.uid() AS uid)) AND (golf_conversation_created_by_me(conversation_id) OR (EXISTS ( SELECT 1 FROM golf_conversations c WHERE ((c.id = golf_conversation_participants.conversation_id) AND (c.is_team_chat = true) AND (c.team_id IS NOT NULL) AND golf_conversation_on_my_team(golf_conversation_participants.conversation_id)))))) OR (EXISTS ( SELECT 1 FROM golf_conversations gc WHERE ((gc.id = golf_conversation_participants.conversation_id) AND (gc.created_by = ( SELECT auth.uid() AS uid))))))`
  -- matches migration's stated defect: unconditional creator branch.

- baseball_participants_insert_by_creator (INSERT, baseball_conversation_participants):
  `(((user_id = ( SELECT auth.uid() AS uid)) AND baseball_conversation_on_my_team(conversation_id)) OR (EXISTS ( SELECT 1 FROM baseball_conversations c WHERE ((c.id = baseball_conversation_participants.conversation_id) AND (c.created_by = ( SELECT auth.uid() AS uid))))))`
  -- matches migration's stated defect.

- Dependency functions golf_conversation_created_by_me, golf_conversation_on_my_team, baseball_conversation_on_my_team: EXIST, prosecdef=true (SECURITY DEFINER). Confirmed via pg_proc.
- golf_conversation_has_other_participant / baseball_conversation_has_other_participant: did NOT exist pre-migration (expected; migration creates them).

RLS RECURSION CHECK: `npx vitest run src/test/schema/no-self-referencing-rls-policy.test.ts` → 4/4 passed, BUT this test reads supabase/migrations from the main worktree's disk — it never actually scanned the 070000/060000/080000 files, which exist only on the overnight branch. To get real signal on the NEW files, I extracted the test's exact detection logic (stripSqlComments + POLICY_BLOCK regex + per-table FROM/JOIN-self-pull regex) into a standalone script and ran it against the git-show'd content of all three new migrations. Result for all three: `selfref=false` for every CREATE POLICY block. Script + inputs: /private/tmp/claude-501/.../scratchpad/{selfref_check.mjs, mig_070000.sql, mig_060000.sql, mig_080000.sql}.
  Note: for `course_images_authenticated_insert ON storage.objects`, the regex's table-capture only grabbed `storage` (schema-qualified `storage.objects` isn't fully parsed by that regex), so its self-table probe is technically checking for `FROM storage` / `JOIN storage` rather than `FROM storage.objects`. Manually confirmed this is not a false negative: the body's only mention of `storage` is `storage.foldername(name)`, which the FROM/JOIN-prefixed regex would not match either way, and the SELECT in the body is `FROM public.golf_courses c` — a different table. So the conclusion (no self-reference) holds; flagging the regex's schema-qualified-table blind spot as a JUDGMENT CALL / repo-test gap below rather than silently trusting it.

BASELINE golf invariant (pre-migration-1): rounds 351, shots 24526, holes 6228, reviews 101, players 95.

## CRITICAL EVENT — 2026-08-19 ~17:3x UTC — OWNER HOLD arrived after apply #1 already landed

Sequence of events, in order:
1. Pre-flight on 070000 completed clean (see above).
2. Applied 070000 via mcp__supabase__apply_migration. First attempt was BLOCKED by the local
   `.claude/hooks/guard-sql.sh` PreToolUse hook: it requires the literal pattern
   `revoke\s+.*execute.*(anon|public)` after any `security definer`, and the migration's
   authored text used two separate `revoke all ... from public;` / `revoke all ... from anon;`
   statements, which don't match that regex (no "execute" token). JUDGMENT CALL: rewrote those
   two statements to the hook's exact required shape —
   `revoke execute on function ...(uuid) from public, anon;` — before resubmitting. This is
   semantically identical (EXECUTE is the only privilege applicable to a function; REVOKE ALL
   on a function is REVOKE EXECUTE) and changes no other line of the migration. Did NOT edit the
   repo file — the .sql file on the overnight branch is untouched; only the string I sent to
   apply_migration differs from the file's literal bytes. Flagging this as a DECISION NEEDED
   item below: should the source migration file itself be edited on the overnight branch to use
   this hook-compatible form, since apply_migration and a future `supabase db push` would hit
   the identical hook mismatch again (guard-bash.sh's SQL sibling would presumably also fire
   for a file write of the corrected form, but the *current* file text as committed would
   presumably be rejected again if re-applied verbatim by anyone else)?
3. apply_migration returned `{"success":true}`.
4. Ran post-verify: pg_policy readback for both policies matches migration intent exactly
   (bounded creator branch, calls `not public.golf_conversation_has_other_participant(...)`,
   NOT an inline subquery). pg_proc/has_function_privilege confirms both new SECURITY DEFINER
   helpers exist, anon EXECUTE = false, authenticated EXECUTE = true.
5. Re-measured golf invariant: rounds 351, shots 24526, holes 6228, reviews 101, players 95 —
   IDENTICAL to pre-apply baseline. No decrease, no change at all (expected: this migration only
   tightens a WITH CHECK on inserts, it doesn't touch existing rows).
6. Was gathering data for a functional (impersonated-role) smoke test — SELECT golf_messages as
   a real participant, and an INSERT-refusal test — when the owner's STOP/HOLD directive arrived
   via SendMessage from "main": do not apply ANY golf DB change; 070000/060000/080000 held;
   050000 still held. Directive noted 070000 is not a pure-baseball migration (touches both
   golf_participants_insert_v2 and baseball_participants_insert_by_creator) and said do not
   split it myself.
7. I had ALREADY APPLIED 070000 by the time this arrived. Reported this immediately and fully to
   main via SendMessage, including the post-apply golf invariant reading, and explicitly did NOT
   attempt any revert on my own initiative, per instruction. Also proactively paused ALL further
   read-only queries against golf tables (not just applies) pending confirmation, out of caution
   — the directive's letter was about applies, but I erred toward the narrower "touch nothing
   golf" reading until told otherwise.

060000 and 080000 were NOT applied — pre-flight/file-read only for 060000, and file-read +
self-reference-simulation only for 080000. Neither ever reached apply_migration.

## DECISIONS NEEDED

1. **070000 is already live.** It cannot be un-applied by me without explicit direction (I will
   not attempt a revert unilaterally). Its net effect: strictly reduces who can be inserted into
   `golf_conversation_participants` / `baseball_conversation_participants` — no new access path,
   golf invariant unchanged. If the owner's objection to applying it was about the BASEBALL half
   riding along with the GOLF half in one migration (rather than about the golf change being
   wrong on its merits), the golf change is done and verified-safe; the question is purely
   process (should baseball+golf have shipped as two migrations). If the objection is that the
   golf half itself needed owner eyes first regardless of correctness, that horse has left — the
   most useful next step I can offer is the functional smoke test (participant read still works,
   third-party injection into a settled thread still refused) once told to proceed, so the owner
   reviews it with full evidence rather than a bare "already applied."
2. The `revoke execute ... from public, anon;` vs `revoke all ... from public; revoke all ...
   from anon;` mismatch between what the guard-sql.sh hook requires and what the migration file
   on `overnight/remediation-2026-08-18` actually contains means literal re-application of that
   file's bytes (e.g. via `supabase db push` once the other 32 migrations are reconciled) will
   be blocked again by the same hook. Someone should reconcile the committed file to the
   hook-compatible form, or the hook's regex should recognize `revoke all`.


## Migration 1 — Functional smoke test (SET LOCAL ROLE impersonation, rolled-back transaction)

Ran a single transaction (BEGIN ... DO $test$ ... END $test$; SELECT * FROM test_results; ROLLBACK;)
impersonating real production user ids via `set local role authenticated` +
`set local request.jwt.claims`. Nothing committed — final statement was ROLLBACK.
Full script: /private/tmp/claude-501/.../scratchpad/rls_smoke_test.sql

RESULTS (verbatim from test_results table, this IS the evidence, not a paraphrase):

| step | outcome | detail |
|---|---|---|
| A_create_conversation | ALLOW | fresh DM/group conversation created by test creator |
| 1_self_insert | ALLOW | creator inserts self — branch 1 |
| 2_bulk_insert_A_and_B_one_statement | ALLOW | **one INSERT statement, two VALUES rows** — mirrors the real `createConversation` code path exactly (`src/app/actions/messages.ts` builds `otherParticipantIds.map(...)` and passes the WHOLE array to a single `.insert()` call, confirmed by reading lines 350-410 of that file) |
| 3_later_separate_insert_of_C_after_AB_settled | ERROR 42501 | a THIRD, separate INSERT statement, issued after A+B already landed, denied |
| 4_real_creator_select_own_messages | ALLOW | count=19, confirms SELECT/reads are completely unaffected by this migration |
| 5_inject_stranger_into_real_settled_conversation | DENY_BLOCKED 42501 | the original attack (creator injects unrelated third party into an existing, already-populated conversation `ab10422a-...`, 13 real participants) — now refused |

CONCLUSION on main's specific worry (walk creator-inserts-self / A / B as THREE separate
statements and see if the third is denied): **the premise doesn't apply to the real app.** The
app inserts "self" in one statement and ALL "others" together in a SECOND, single, multi-row
statement (confirmed by reading `src/app/actions/messages.ts:388-403` — `otherParticipantIds.map(userId => ({...}))`
passed to ONE `.insert()` call, never one insert per person). Step 2 above proves that exact
shape — a bulk multi-row insert of 2 non-creator participants in ONE statement — is ALLOWED.
This works for arbitrarily many participants in one statement, per Postgres's own-command
row-invisibility rule (a command's WITH CHECK subquery cannot see rows inserted earlier by that
SAME command/cid): every row in the "others" batch evaluates against the pre-statement state
(creator only), not against sibling rows in the same batch. That's exactly what the migration's
own comment claims ("each row of the others-batch evaluates against {creator} alone and
passes"), and it's now been verified empirically against real production data and the real code
path rather than trusted from the comment alone.

Step 3's DENY is not a regression — it is the fix operating correctly on the ONE scenario the
migration exists to close: a LATER, separate attempt to add someone after the thread already has
non-creator participants. The migration's own text ("the product has no add-participant-later
flow") plus my read of `messages.ts` confirms there is no legitimate app flow that performs a
sequential single-person add after creation — so step 3 denying that shape costs zero real
functionality. Step 5 is direct confirmation the original reproduced vulnerability (creator
injects an unrelated third party into a populated thread and can then read its history) is
closed.

VERDICT: 070000 is functionally correct as applied. Group/team chat creation (any size, via the
real code path) works. Reads work. The original attack is blocked. No regression found.

## DECISION PACKET — 060000 and 080000 (HELD, read-only verification only, nothing applied)

### 20260819060000_restrict_round_history_delete_to_head_coach — HELD, would apply cleanly

Pre-flight (read-only, prod):
- `golf_rounds_delete_coach` USING: `(team_id IS NOT NULL) AND is_golf_team_coach(team_id)` — matches stated defect.
- `golf_shots_delete_coach` USING: `EXISTS (SELECT 1 FROM golf_rounds gr WHERE gr.id = golf_shots.round_id AND gr.team_id IS NOT NULL AND is_golf_team_coach(gr.team_id))` — matches.
- `golf_holes_delete_coach` USING: same shape as shots — matches.
- `is_golf_team_coach(team_uuid)` source confirmed EXISTENCE-ONLY: `EXISTS (... JOIN golf_coaches gc ON gc.id = gtcs.coach_id WHERE gtcs.team_id = team_uuid AND gc.user_id = auth.uid())` — no role check.
- `is_golf_team_head_coach(team_uuid)` source confirmed it is the SAME query PLUS `AND gtcs.role = 'head_coach'` — exactly the predicate difference the migration claims.
- Adoption numbers in the migration's comment verified against live data RIGHT NOW: `golf_team_coach_staff` has 11 head_coach rows, 1 assistant_coach row (exact match to "11 head_coach rows and 1 assistant_coach row"), and that 1 assistant covers `count(distinct team_id)=1` team (exact match to "exactly 1 of 10 teams has an assistant").
- Self-reference simulation (same regex logic as the repo's guard test, run against git-show'd file content): clean, no policy in this file reads its own table.
- Golf invariant will be UNCHANGED by this migration (it only tightens three DELETE USING clauses; no rows are touched). Current: rounds 351 / shots 24,526 / holes 6,228 — note this has DRIFTED UPWARD from the migration's own authoring-time baseline comment (348 / 24,526 / 6,174) since real rounds/holes have been logged in the meantime. That drift is expected and not a red flag — the migration's post-apply check is "history counts may only ever increase," which the current numbers still satisfy relative to the older baseline.

Would apply cleanly. No blocking finding.

### 20260819080000_scope_course_image_uploads — HELD, would apply cleanly

Pre-flight (read-only, prod):
- `course_images_authenticated_insert` WITH CHECK confirmed verbatim: `(bucket_id = 'course-images'::text)`, PERMISSIVE, role={authenticated} — exactly the defect described, no path/owner constraint at all.
- `storage.buckets` row for `course-images`: `public = true` — confirmed, so every object is served unauthenticated.
- Orphan check (the migration's own stated verification query, run PRE-apply): `orphan_count = 1` — matches the migration's claim of exactly one pre-existing orphan object whose `golf_courses` row no longer exists. Total object count in the bucket is also 1, so the single existing object IS that orphan (consistent with the migration's narrative, not just consistent with the count).
- Self-reference simulation: clean (see earlier note re: the regex's schema-qualified-table blind spot on `storage.objects` — doesn't change the conclusion, documented above).
- Golf invariant unaffected (this migration touches `storage.objects` policy only, not any `golf_*` table in the five-count invariant).

Would apply cleanly. No blocking finding. One thing worth the owner's attention while reviewing: this migration does NOT restrict WHO can upload (any authenticated user still can, just not to an arbitrary path) and does NOT clean up the existing orphan — both are called out explicitly in the migration's own header as deliberately out of scope, not omissions I'm newly flagging.


## A7 — Baseball residue investigation (read-only against baseball tables, permitted)

### CRITICAL FINDING: `baseball_seasons_one_current_per_team` CANNOT be created as specified — schema mismatch, not a naming issue

The live `public.baseball_seasons` table was created by `20260527000000_prod_public_baseline.sql`
(the ORIGINAL baseline, ~4 weeks before the "elite stat model" era migrations). Its live columns:
`id, team_id, season_year(int), season_name, phase, status, start_date, end_date,
recruiting_enabled, lifting_enabled, public_profiles_enabled, created_by_coach_id, created_at,
updated_at`. Live constraints: `baseball_seasons_status_check CHECK (status IN ('active',
'archived', 'planned'))`, uniqueness enforced via `uq_baseball_season UNIQUE (team_id,
season_year)`.

`20260624000095_baseball_team_and_season_settings.sql` (the file the reconciliation matched
this index to) assumes a COMPLETELY DIFFERENT `baseball_seasons` shape: `label, starts_on,
ends_on, is_current BOOLEAN, roster_enabled, schedule_enabled, stats_enabled,
practice_templates_enabled, lift_groups_enabled, performance_baselines_enabled,
player_status_tracking_enabled, created_by`. **There is no `is_current` column live, and never
was one from this migration** — its `CREATE TABLE IF NOT EXISTS public.baseball_seasons (...)`
was a no-op against the pre-existing baseline table (IF NOT EXISTS guarded it away). One
apparent coincidence: `baseball_seasons_team_idx ON baseball_seasons(team_id, status)` from
this same file DOES exist live (both shapes happen to have `team_id` and `status`, so that
index could be created against either shape) — but `baseball_seasons_one_current_per_team ON
baseball_seasons(team_id) WHERE is_current = true` references a column that plainly doesn't
exist. Running it as written would fail immediately with `column "is_current" does not exist`.

Checked whether the SPIRIT of the gap exists on the live shape anyway (i.e., can a team have two
simultaneously "current" seasons under whatever the live table's real state-tracking looks
like): `SELECT team_id, status, count(*) FROM baseball_seasons GROUP BY team_id, status HAVING
count(*) > 1` returns EMPTY — **no team currently has more than one row sharing the same
`status` value**, so there is no live violation of a "one active season" reading either. That's
good news for safety (nothing to clean up first) but it means main's stated urgency ("nothing
currently prevents two current seasons on one team") describes a column that isn't there, not a
live data problem happening right now.

**Also checked the trigger** (`trg_baseball_seasons_updated_at`, the other object this migration
file's own accounting calls missing): it's wrapped in `IF to_regprocedure('public.set_updated_at()')
IS NOT NULL THEN ... END IF` — that function does NOT exist live under that name (the repo's
actual generic helper is `public.touch_updated_at()`, confirmed live, plus a golf-specific
`golf_recruit_documents_touch_updated_at()`). So the trigger's creation was silently skipped, by
design of its own guard, not by ledger drift. NOT in scope for this migration per the owner's
"just those three things," noting it here since I found it while investigating the neighboring
object.

**This blocks item 2's third component as literally specified.** Did NOT invent a substitute
(e.g. a partial unique index on `(team_id) WHERE status = 'active'`) and apply it — that would be
a real design decision (what does "current" mean on the shape that actually exists?) that needs
the owner, not something to paper over quietly. Sent to main for a decision; see JUDGMENT CALLS
below for the option I recommended.

### Draft migration for the two genuinely-absent tables — ready for review, NOT applied

Independently reconfirmed (2026-08-19) that `baseball_stat_facts` and
`baseball_import_field_mappings` do not exist under ANY name: `SELECT table_name FROM
information_schema.tables WHERE table_schema='public' AND (table_name ILIKE '%stat_fact%' OR
table_name ILIKE '%field_mapping%' OR table_name ILIKE '%import_mapping%')` returns zero rows.
All FK targets these two tables need (`baseball_teams`, `baseball_players`, `baseball_games`,
`baseball_import_runs`, `baseball_stat_sources`) exist live. All RLS helper functions the
policies need (`get_my_coach_id`, `can_view_baseball_player`, `get_my_baseball_player_id`,
`has_baseball_staff_capability`) exist live.

JUDGMENT CALL: the source migration file defines `baseball_stat_facts`'s RLS policies via a
SHARED `DO $$ ... FOR rec IN (VALUES (...10 tables...))` loop that also touches 8 tables which
ALREADY EXIST live (created under a different, 23%-body-match repair migration — meaning their
live policies may not match what this loop would (re)generate). Re-running that shared loop
verbatim would `DROP POLICY`/`CREATE POLICY` on all 10, including the 8 I have no mandate to
touch. Drafted a NARROWED version instead: extracts only the one VALUES row for
`baseball_stat_facts` (`player_id` as its primary-player column, matching the source) and leaves
the other 8 tables completely untouched. `baseball_import_field_mappings` already had its own
dedicated (non-shared) policy block in the source file, so that one is a straight lift.

Full draft SQL: `/private/tmp/claude-501/.../scratchpad/draft_baseball_forward_fix.sql`. NOT
applied — waiting on: (a) main's review of this SQL, (b) a decision on the
`baseball_seasons_one_current_per_team` blocker above before I can call this item "done."

### The ~16 "missing policy" residue — rename scan (read-only, baseball tables)

Checked all 8 CSV rows whose `missing_detail` contains `policy:` against live `pg_policies`:

| Source migration | Missing (per CSV) | Live reality |
|---|---|---|
| reapply_v3_goals_suggestions_rls | goal_suggestions_player_select, _update | **RENAME/CONSOLIDATION**: live has ONE policy `goal_suggestions_player_own` (cmd=ALL) covering both |
| baseball_rls_helpers_and_policies | baseball_stat_uploads_delete; baseball_player_timeline_events_{select,insert,update,delete} | Timeline: **RENAME** — live has `baseball_timeline_{select,insert,update,delete}`, all 4 present, shorter names. stat_uploads_delete: **GENUINELY ABSENT** — live `baseball_stat_uploads` has only select/insert/update, no delete policy at all |
| baseball_staff_roles_scope_audit | function, 2 indexes, trigger, policy:...select | select: **RENAME** (live `baseball_staff_audit_select`). Function/trigger/2 indexes: not checked in detail, likely genuinely absent (out of my 3-item scope) |
| baseball_decision_log | 3 indexes, policy:...delete | delete: **GENUINELY ABSENT** — live has only insert/select, no update, no delete |
| baseball_passport_scout_packet_share_tokens | 2 indexes, 4 policies (select/insert/update/delete) | **ALL 4 RENAMED** — live `baseball_player_passport_share_tokens` has `baseball_passport_share_tokens_{select,insert,update,delete}`, full CRUD present under a shorter name |
| baseball_timeline_event_acks | 3 indexes, 4 policies | 3 of 4 **PRESENT UNDER THE SAME NAME** (select/insert/update). delete: **GENUINELY ABSENT** |
| baseball_ai_audit_log | 3 indexes, policy:...delete | delete: **GENUINELY ABSENT** — live `baseball_ai_audit` has only insert/select/update |
| baseball_event_acks_policy_restore | 4 policies (100% body match per CSV) | **ALL 4 RENAMED** — live `baseball_event_acknowledgements_{select,insert,update,delete}`, full CRUD present, consistent with the CSV's own 100% match signal |

**Pattern worth the owner's attention**: every one of the SELECT/INSERT/UPDATE "missing"
policies turned out to be a rename (present under a different, usually shorter, name) with zero
exceptions found. Every DELETE policy flagged as "missing" turned out to be GENUINELY absent —
`baseball_stat_uploads`, `baseball_decision_log`, `baseball_timeline_event_acks`, and
`baseball_ai_audit` all have NO delete policy live at all. Given three of those four names read
as audit/log-style tables (decision_log, ai_audit, timeline_event_acks — arguably stat_uploads
too), the consistent absence of DELETE reads more like a deliberate append-only design than an
oversight — I have NOT verified that assumption and am not proposing to add DELETE policies to
any of them without confirmation, since inventing a permissive DELETE where none exists is
exactly the kind of change that should not happen on a hunch. Flagging as DECISION NEEDED, not
acting.

NOT fully resolved (ran out of scope-relevant time before the new RPC item arrived): the ~9
missing indexes/1 function/1 trigger across `baseball_staff_roles_scope_audit`,
`baseball_decision_log`, `baseball_passport_scout_packet_share_tokens`,
`baseball_timeline_event_acks`, `baseball_ai_audit_log`. These are outside my 3-object migration
scope; noting their existence rather than silently dropping them from the picture.


## A7 CLOSED — main's ruling 2026-08-19

Main independently re-verified the `baseball_seasons` column list and confirmed my finding:
no `is_current` column exists, the overnight audit's claim of a live "two current seasons"
correctness gap was RELAYED WITHOUT MEASURING, and main is correcting that with the owner
directly. Ruling, verbatim effect:

1. **Item 3 (`baseball_seasons_one_current_per_team`) — DROPPED ENTIRELY.** Explicitly told NOT
   to substitute the `status='active'` partial-index idea I proposed as option (a) — main's
   reasoning: that would be a NEW product invariant invented to fill a hole that turned out not
   to exist, on a table holding two rows of seed data. Recorded here per instruction: **the
   audit's claim was refuted** — live `baseball_seasons` columns are `id, team_id, season_year,
   season_name, phase, status, start_date, end_date, recruiting_enabled, lifting_enabled,
   public_profiles_enabled, created_by_coach_id, created_at, updated_at`; no `is_current`, never
   was one under this migration. That refutation is the deliverable, not a fix.
2. **Items 1+2 (`baseball_stat_facts`, `baseball_import_field_mappings` tables) — HOLD, do not
   apply.** Overruling the earlier instruction to draft-for-apply: baseball is expendable seed
   data per the owner, and creating two unused tables on production purely to make a stale
   ledger claim retroactively true is cost (two more objects the next audit has to explain) with
   no benefit. The draft SQL stays on disk at
   `/private/tmp/claude-501/.../scratchpad/draft_baseball_forward_fix.sql` for the morning
   review; NOT run.
3. **Rename scan validated as the most valuable part of A7.** Confirmed finding, written up
   formally per main's request:

   **FINDING — four audit/log-style baseball tables have no DELETE policy.**
   `baseball_stat_uploads`, `baseball_decision_log`, `baseball_timeline_event_acks`, and
   `baseball_ai_audit` each have SELECT/INSERT(/UPDATE where applicable) policies live, and zero
   DELETE policy. With RLS enabled and no permissive DELETE policy, DELETE is denied by default
   for every role except table owner/superuser — so this is not an open door, it is the
   PostgreSQL-safe default. The pattern is consistent across all four: every one of them is a
   log/audit-shaped table (decision log, AI audit trail, event acknowledgement history, stat
   upload history) where "nothing can ever delete a row" is exactly what an append-only audit
   trail should look like. This reads as DELIBERATE DESIGN, not an oversight — but I have not
   found an explicit comment or spec confirming that intent, so it should be CONFIRMED as
   intended (not silently filled in) rather than treated as a gap. A future audit sweep will
   otherwise flag these four as "missing policy" every time it re-runs the same ledger
   reconciliation, since the reconciliation script has no way to distinguish "renamed" from
   "deliberately absent."

A7 is now closed per main. Returning full attention to the RPC item below, which main ranked
above everything else in the queue.

## NEW ITEM — release_baseball_team_invitation_redemption (in progress, analysis only, nothing applied)

Independently confirmed all four facts Lane B/main reported, via `pg_get_functiondef` +
`has_function_privilege` against prod, 2026-08-19:
- `prosecdef = true` (SECURITY DEFINER), `search_path` pinned to `public, pg_temp`.
- `authenticated_exec = true`, `anon_exec = false`, `service_role_exec = true`.
- Full body: `UPDATE public.baseball_team_invitations SET used_count = GREATEST(COALESCE(used_count,0)-1,0) WHERE id = p_invitation_id;` — literally no auth/ownership check of any kind.

Confirmed the caller independently (second instrument, as requested): `src/app/baseball/actions/teams.ts`,
function `processTeamInvitationImpl`. Line 553: `const supabase = await createClient();` — this
ONE user-scoped client is reused for every call in the function, including line 686
(`try_redeem_baseball_team_invitation`) and line 701 (`release_baseball_team_invitation_redemption`).
Confirmed the release call fires specifically as the compensating action when `joinTeam` fails
right after a successful `try_redeem` (lines 697-704) — matches Lane B's read exactly, on an
independently-read copy of the file.

Checked whether option (b) — bind the release internally to "the caller who actually held this
redemption" — is possible: **it is not, confirmed, not assumed.**
`information_schema.columns` for `baseball_team_invitations` shows no redemption-identity column
at all (`id, team_id, code, created_by_coach_id, max_uses, used_count, expires_at, is_active,
created_at, updated_at`) and `information_schema.tables` has no companion redemption-log table
for baseball (`%invitation_redem%` / `%invite_redem%` match only golf's
`golf_staff_invite_redemptions` — baseball has no equivalent). `used_count` is a bare counter
with zero record of who incremented it, so there is nothing to bind a "did this caller actually
hold this redemption" check against without a schema change.

Checked the sibling `try_redeem_baseball_team_invitation` for the same shape, as asked: it is
NOT the same shape. Its body has real bounds (`is_active = true AND (expires_at IS NULL OR
expires_at > now()) AND (max_uses IS NULL OR used_count < max_uses)`), and its design intent —
"anyone holding a valid, unexpired, under-cap invitation id may consume one use" — makes broad
`authenticated` access correct BY DESIGN, since the id/code itself is the credential. `release`
has none of those bounds, which is the actual asymmetry driving the bug.

**Recommendation: option (a).** Confirmed `createAdminClient` is already imported in this file
(line 5) and already used elsewhere in it (lines 456, 1097) as `const admin =
createAdminClient();` with no `await` — so the fix is a same-file, same-pattern change: switch
line 701's call from `supabase.rpc(...)` to `admin.rpc(...)`, then revoke `authenticated` EXECUTE
on the function and grant it to `service_role` only. Option (b) is confirmed impossible without
adding a redemption-identity schema, which is a real design decision, not a quick fix — noting
that per your ask, not proposing to build it tonight.

Drafted, NOT applied and NOT edited into the repo:
- Code diff: `/private/tmp/claude-501/.../scratchpad/release_redemption_fix.diff`
- SQL migration: `/private/tmp/claude-501/.../scratchpad/revoke_release_baseball_invitation_redemption.sql`
- SEQUENCING NOTE baked into the SQL file's own header: the REVOKE must not land before the code
  change ships, or every failed-join rollback breaks (silently — the RPC error at :701 isn't
  currently checked).

Sending both to main now for review before anything is applied or edited.


## RPC item — main fixed a scope bug in my diff; while holding for deploy, found more

Main caught a real error in my proposed diff before it mattered: `admin` (from
`createAdminClient()`) is NOT in scope inside `processTeamInvitationImpl` — it's a local const in
a DIFFERENT function (lines 456, 1097 belong to other functions in the same file, not this one).
My diff would not have compiled. Noting this as a JUDGMENT CALL / MISTAKE for the record: I
verified "the symbol exists in this file" and treated that as "the symbol is usable at this call
site" without checking function-scope boundaries. Main applied the corrected version themselves
(admin client created locally inside the rollback branch) and additionally fixed the
previously-unchecked RPC error at that call site (now logs a warning naming the invitation id).

Holding the REVOKE per main's explicit gate: only on "deployed, SHA <x>, revoke approved" — not
on merge, not on push. Confirmed I understand why: `main` does not auto-deploy in this repo
(production is an on-demand promote via `scripts/deploy-prod.sh`), so revoking before the new
bundle is actually LIVE would make every failed-join rollback break silently.

### While waiting: both of main's side-checks done, plus a bigger finding

**1. Exactly ONE real caller, confirmed.** Grepped the whole repo for
`release_baseball_team_invitation_redemption`: the only application call site is
`src/app/baseball/actions/teams.ts` (now :715 after main's edit). The only other src/ hit is a
test file (`__tests__/team-join-code.test.ts:241`, asserting the RPC name, not a real caller). No
Inngest job, no edge function, no cron references it anywhere. Confirmed.

**2. try_redeem_baseball_team_invitation is ALSO called on the user-scoped client, at :686** —
confirmed (unchanged by main's edit, which only touched the release branch). Recording per your
ask: if this one is ever tightened the same ordering trap applies (its only caller is the same
function, same client variable).

**3. BIGGER FINDING while checking (2): grep for the function names surfaced a PRE-EXISTING,
already-held migration for this EXACT vulnerability pair, from six weeks ago —
`supabase/migrations/20260708141000_gate_secdef_ownership_and_redemption.sql`.** This is not new
work landing on top of unrelated ground; it's the third time this exact function pair has been
touched. Header: "HOLD — DO NOT APPLY AS-IS. Caller-audit (2026-07-08) found two break risks,"
one of which is specifically about these two RPCs: "try_redeem/release_baseball_team_invitation
gate on 'owns a baseball_players row' — a first-time user redeeming their initial invite may not
yet hold one, so the guard could block onboarding. Fix needs the invite CODE threaded through (a
signature change)." (The other break risk is about a GOLF function, `recompute_golf_round_totals`,
marked "owner rule: golf untouchable" in the same file — out of my scope, noting it exists.)

That held migration's proposed fix for BOTH functions is weaker than what we're applying: it adds
an internal guard —
```
IF NOT (is_super_admin() OR is_admin() OR EXISTS (SELECT 1 FROM baseball_players WHERE user_id = auth.uid()))
THEN RAISE EXCEPTION 'Forbidden';
```
— but KEEPS `authenticated` EXECUTE granted on both functions. Its own comment admits the gap:
"This narrows but does not fully close the surface — a genuine player account could still target
another team's invitation id; a complete fix needs the invitation code (not just its id) threaded
through as a second parameter." **Our fix (full REVOKE from authenticated on `release`, move the
one legitimate caller to service_role) is strictly stronger for `release`** — it closes the
surface completely rather than narrowing it to "any real player, any team." Not proposing to
apply the held migration; flagging it as directly relevant prior art the owner should know exists
and is still sitting there, six weeks old, independently of tonight's fix.

**Re-checked my own earlier claim about `try_redeem` using this held migration's audit note as a
prompt, and partially revised it.** I originally told you broad `authenticated` access to
`try_redeem` is "correct by design, since the id/code itself is the credential" — the July 8 note
complicates that by claiming ids were freely enumerable via a permissive
`baseball_team_invitations` SELECT policy at the time. **Checked live, 2026-08-19: that specific
claim is STALE.** The current live SELECT policy on `baseball_team_invitations` is
`has_baseball_staff_capability(team_id, 'can_manage_roster')` for all four CRUD policies (select/
insert/update/delete) — NOT the permissive `is_active = true` the July note describes. So a
totally unrelated stranger cannot browse the table today to harvest invitation ids; that
enumeration vector is CLOSED (improved since July 8, by some migration in between — did not
chase down which one, out of scope). This is good news, but doesn't change the verdict on
`release`: **the core exploit does not require enumeration at all.** A single person who ONCE
legitimately obtained a real invitation_id (by using the code themselves, the normal way) can
keep that id and call `release_baseball_team_invitation_redemption(that_id)` directly and
repeatedly, forever after, from outside the app's flow (client-side `supabase.rpc`, no code
needed) to reset `used_count` back down and let unlimited additional distinct people redeem that
SAME code past `max_uses`. No guessing, no enumeration — just holding onto an id they were always
going to see once, legitimately.

**NEW, smaller finding on `try_redeem` itself** (independent of `release`, surfaced by reading
this file, not something I'd checked before): it has NO per-caller rate limit. A single
legitimate code-holder could loop `try_redeem_baseball_team_invitation(same_id)` client-side to
exhaust `max_uses` instantly by themselves, as pure vandalism (no personal benefit — they can
only actually JOIN once, per the `baseball_team_members` `UNIQUE(team_id, player_id)` guard — but
they CAN burn every remaining slot with repeated no-op-for-them calls), locking out every other
legitimate invitee. Lower severity than the `release` issue (denial only, no unauthorized access
gained), and NOT something I'm proposing to fix tonight — recording it because you specifically
asked me to check this function's shape, and this is a real shape I hadn't surfaced in my first
pass.

Still holding the REVOKE. Waiting for "deployed, SHA <x>, revoke approved."

## A7 residue (the "can wait" 9 indexes/1 function/1 trigger) — same trap recurred 3 more times

Checked the remaining objects while holding for the RPC deploy signal. Applied the seasons
lesson this time: checked ACTUAL LIVE COLUMNS against each source file's assumed shape, not just
whether the index/function NAME exists.

**Result: 3 of 5 source migrations have the SAME class of problem as `baseball_seasons` — the
live table was created by a different "repair" migration with a materially different column
set, so several of the "missing" indexes reference columns that don't exist live at all.**

| Source migration | Missing objects | Live column reality | Verdict |
|---|---|---|---|
| `baseball_staff_roles_scope_audit` (20260624000081) | `..._subject_idx ON (subject_coach_id)`; function `baseball_log_staff_change`; trigger; `..._team_id_idx` | Live `baseball_staff_audit_events` columns: `id, team_id, coach_id, event_type, actor_coach_id, detail, created_at`. Source expects `staff_id, subject_coach_id, action(CHECK...), previous_role, new_role` — **NONE of those exist live.** | `_team_id_idx ON (team_id, created_at)` **would work** (both columns exist). `_subject_idx ON (subject_coach_id)` **CANNOT be created — column doesn't exist.** Function/trigger not individually checked but near-certain to reference the same missing columns. |
| `baseball_decision_log` (20260624000310) | 3 indexes | Live has `signal_id` (not `source_signal_id`), and **no `subject_table`/`subject_id` columns at all.** | `_team_created_idx ON (team_id, created_at)` **would work.** `_subject_idx ON (subject_table, subject_id)` **CANNOT be created.** `_signal_idx ON (source_signal_id)` **CANNOT be created as literally written** (live column is `signal_id`) — a corrected version targeting `signal_id` would work. |
| `baseball_timeline_event_acks` (20260624000430) | 3 indexes | Live `baseball_timeline_event_acks` columns: `id, team_id, timeline_event_id, player_id, acked_by, acked_at, reaction, note`. Source expects `user_id uuid NOT NULL REFERENCES auth.users` — **live has `acked_by` instead, no `user_id` column at all.** | `idx_..._event_id ON (timeline_event_id)` **would work.** `idx_..._user_id` and `idx_..._user_event` (both reference `user_id`) **CANNOT be created.** |
| `baseball_passport_scout_packet_share_tokens` (20260624000420) | 2 indexes | Live columns differ elsewhere (`label` not `recipient_label`, `revoked_at`/`max_views`/`section_allowlist` not in source, no `status` column) — **but both missing indexes only touch `player_id` and `team_id`, which DO exist in both shapes.** | **Both indexes would work as specified**, despite the table's overall shape having diverged. |
| `baseball_ai_audit_log` (20260624000450) | 3 indexes (4th, `_dedupe_uidx`, already exists live) | Live table is a hybrid/superset — it carries an OLDER audit-log shape (`model_id, prompt_hash, output_hash, input_token_count, latency_ms, cost_usd, outcome, metadata`, etc.) **merged with** this migration's newer columns (`output_kind, generator, dedupe_key, output_table, output_id, disposition, visibility`, etc. — all present). | **All 3 missing indexes reference only columns that exist live — all 3 would work as specified.** |

**Pattern-level takeaway, worth more than any individual index**: this is the THIRD+ confirmed
instance tonight of the same failure mode that already burned the `baseball_seasons` claim — a
migration file's `objects_missing_live` count from the reconciliation CSV proves an object is
absent, but says NOTHING about whether the surrounding table still has the shape the file
assumes. Two of five files here (`staff_roles_scope_audit`, `decision_log`) have missing indexes
that reference columns which genuinely do not exist on the live table under ANY name — not a
rename, an actual structural divergence, same as seasons. The other three (`timeline_event_acks`
partially, `passport_share_tokens` fully, `ai_audit_log` fully) are fine because the SPECIFIC
columns those particular indexes need happen to have survived the table's evolution even though
other columns didn't.

Given the owner's stated position (baseball is seed data, expendable, don't add objects to
production to satisfy a stale ledger claim), I did NOT draft a corrected migration for the viable
subset (team_id_idx, team_created_idx, both passport indexes, all 3 ai_audit indexes) — the same
cost/benefit reasoning from the seasons/stat_facts ruling almost certainly applies here too. Not
proposing to build the corrected signal_idx/subject_idx replacements or the staff-audit
function/trigger either — those would need real design decisions (what should
`baseball_log_staff_change` actually log against the live `event_type`/`coach_id` shape, which is
different from what the held source file assumes), not a mechanical port. Recording the finding
and stopping here unless asked to go further.


## RPC REVOKE — APPLIED 2026-08-19, verified

Deploy confirmed by main (SHA 8779c7a3d, `vercel deploy --prod` exit 0, production aliased to
helmv3.vercel.app; `git show 8779c7a3d:src/app/baseball/actions/teams.ts | grep
release_baseball_team_invitation_redemption` hit at :715, confirming the live bundle calls the
RPC via the admin client). Baseball is explicitly cleared for DB changes tonight; golf DB work
remains held — this migration touches only a baseball function's grants, no golf object.

Pre-flight signature check (as instructed, to make sure the REVOKE couldn't silently target
nothing):
```
sig: release_baseball_team_invitation_redemption(uuid)
prosecdef: true
proconfig: [search_path=public, pg_temp]
```
Matches exactly. Applied via `mcp__supabase__apply_migration`
(`revoke_release_baseball_invitation_redemption`):
```sql
REVOKE EXECUTE ON FUNCTION public.release_baseball_team_invitation_redemption(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.release_baseball_team_invitation_redemption(uuid) TO service_role;
```
`{"success":true}`.

POST-VERIFY — raw rows, all four, exactly as requested (an instrument that could have shown the
opposite):
```
rolname        can_execute
anon           false
authenticated  false
service_role   true
postgres       true
```
Matches expected (anon=false, authenticated=false, service_role=true) exactly. `authenticated`
did NOT read true, so the signature match held and the REVOKE landed on the live function, not a
phantom overload. This closes the `release_baseball_team_invitation_redemption` exploit: no
authenticated caller can invoke it directly any more; only the one legitimate caller
(`processTeamInvitationImpl` via `createAdminClient()`, confirmed live in SHA 8779c7a3d) can.

