-- Only a HEAD coach may delete a team's round, shot or hole history.
--
-- OWNER DIRECTIVE, 2026-08-18: "There should be no deletion of golf shot
-- history." and "you cannot delete players round or shots in golfhelm.
-- Protect at all costs."
--
-- --- THE DEFECT ------------------------------------------------------------
--
-- `is_golf_team_coach(team_id)` is an EXISTENCE check. It asks only whether a
-- row links this user to this team in `golf_team_coach_staff`; it never reads
-- `gtcs.role`. The sibling `is_golf_team_head_coach()` DOES check the role and
-- is the correct predicate for a privileged action.
--
-- Three DELETE policies governing competitive history trust the existence-only
-- variant, which makes them role-blind: they authorize on staff membership
-- rather than on being the team's head coach. Deleting a round CASCADEs to
-- `golf_shots`, `golf_holes`, `golf_round_reviews` and
-- `golf_round_stats_cache` -- the shot history goes with it, and there is no
-- soft-delete, no export and no recovery path.
--
-- Exposure figures and the reachability assessment are kept OUT of this
-- repository, which is public, since this migration may sit unapplied for a
-- while. They live with the 2026-08-19 audit material outside the repo.
--
-- --- WHY THESE THREE AND NOTHING ELSE --------------------------------------
--
-- 20 destructive policies (16 DELETE + 4 ALL) use `is_golf_team_coach`. Most
-- are correct as they stand: cancelling a practice, removing a document or
-- reassigning a task is ordinary coaching work an assistant should do.
-- Tightening all 20 would break real features to fix three.
--
-- These three are separated from the rest by a measured fact: THEY HAVE NO
-- LIVE CALL SITES. Every deletion of a round, shot or hole in the application
-- goes through a self-scoped path that re-verifies the acting user owns the
-- player row:
--
-- justification for the suppression on the next line: this migration creates
-- NO functions. The phrase below is prose describing two PRE-EXISTING RPCs,
-- both of which already pin search_path where they are defined
-- (prod_public_baseline.sql:5627 and :5106). The rule is a whole-file regex
-- and cannot tell a comment from code, so it fires on any migration that
-- DOCUMENTS a definer function. Suppressed narrowly here rather than loosened
-- globally: a not-regex for comments would create a false negative on every
-- file that mixes prose with a real definer.
-- nosemgrep: helmv3-security-definer-without-search-path
--   * `submit_round_atomic` / `save_partial_round_atomic` -- SECURITY DEFINER
--     RPCs that bypass RLS entirely and check `player_id` themselves
--     (supabase/migrations/20260527000000_prod_public_baseline.sql:5627, :5106)
--   * the JS fallbacks in src/app/golf/actions/golf.ts:1060-1097 and
--     round-drafts.ts:497-533, authorized by the PLAYER's own policies
--     (`golf_rounds_delete`, `golf_shots_delete_own`, `golf_holes_delete`)
--
-- No coach-facing surface deletes a round. Three independent sweeps of the
-- application code agreed on this. So these coach DELETE policies are not an
-- entry point anyone uses -- they are only an entry point an attacker or a
-- mistake could use. Removing assistant access costs zero function.
--
-- Adoption bounds the risk further: `golf_team_coach_staff` holds 11
-- head_coach rows and 1 assistant_coach row, and exactly 1 of 10 teams has an
-- assistant at all.
--
-- --- WHAT THIS DELIBERATELY DOES NOT FIX -----------------------------------
--
-- Documented rather than silently omitted, because a partial fix that reads as
-- complete is worse than an obviously partial one:
--
--   * `golf_team_members_delete_coach` -- an assistant can evict a player from
--     the roster. That IS a live feature (roster.ts:104, the "Remove from
--     Team" button), so tightening it breaks something real, and its matching
--     UPDATE policy reaches the same outcome via `status='removed'` anyway.
--     Both must move together, and that is a product decision, not a fix.
--   * `golf_teams_update_coach` -- governs `join_code`. Postgres RLS has no
--     column granularity, so any coach can rotate the team's invite code and
--     silently invalidate every outstanding invite (teams.ts:800-849).
--   * `golf_teams_delete_creator` -- does not consult `is_golf_team_coach` at
--     all; a coach who CREATED a team can delete it after leaving its staff.
--   * the qualifier and recruiting UPDATE policies -- same existence-only
--     predicate, same soft-destructive reachability.
--
-- These belong to the morning review, not to this migration.
--
-- --- SAFETY ----------------------------------------------------------------
--
-- Strictly reducing. Every row this migration affects is a row that could
-- previously be deleted by more people than it can be now. There is no input
-- for which this permits a deletion the current schema forbids, and it creates
-- no new delete path. The policy bodies are otherwise identical to the
-- deparsed originals -- the ONLY change is the predicate function.
--
-- NOT APPLIED BY THE AUTHORING SESSION. Docker was unavailable, so the
-- clean-room local-stack replay could not be exercised. It ships in the PR for
-- deliberate application, per the run's forward-only rule.

begin;

-- --- golf_rounds -----------------------------------------------------------
drop policy if exists golf_rounds_delete_coach on public.golf_rounds;

create policy golf_rounds_delete_coach on public.golf_rounds
for delete
using (
    (team_id is not null) and is_golf_team_head_coach(team_id)
);

-- --- golf_shots ------------------------------------------------------------
drop policy if exists golf_shots_delete_coach on public.golf_shots;

create policy golf_shots_delete_coach on public.golf_shots
for delete
using (
    exists (
        select 1
        from public.golf_rounds gr
        where
            gr.id = golf_shots.round_id
            and gr.team_id is not null
            and is_golf_team_head_coach(gr.team_id)
    )
);

-- --- golf_holes ------------------------------------------------------------
drop policy if exists golf_holes_delete_coach on public.golf_holes;

create policy golf_holes_delete_coach on public.golf_holes
for delete
using (
    exists (
        select 1
        from public.golf_rounds gr
        where
            gr.id = golf_holes.round_id
            and gr.team_id is not null
            and is_golf_team_head_coach(gr.team_id)
    )
);

commit;

-- --- VERIFICATION (run after applying) -------------------------------------
--
--   -- all three must now name the head-coach variant
--   select polname, pg_get_expr(polqual, polrelid) as qual
--     from pg_policy
--    where polname in ('golf_rounds_delete_coach',
--                      'golf_shots_delete_coach',
--                      'golf_holes_delete_coach');
--
--   -- history counts may only ever increase
--   select 'golf_rounds' t, count(*) from golf_rounds
--   union all select 'golf_shots', count(*) from golf_shots
--   union all select 'golf_holes', count(*) from golf_holes;
--
-- Baseline at authoring time: golf_rounds 348, golf_shots 24,526,
-- golf_holes 6,174. A DECREASE IS AN INCIDENT, not a discrepancy.
