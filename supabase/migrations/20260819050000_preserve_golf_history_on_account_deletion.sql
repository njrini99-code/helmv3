-- Golf round/shot history survives account deletion.
--
-- OWNER DECISION, 2026-08-18: "There should be no deletion of golf shot history."
--
-- ─── THE PROBLEM ────────────────────────────────────────────────────────────
--
-- `DELETE /api/account/delete` performs a service-role
-- `admin.from('users').delete().eq('id', user.id)`, and the FK graph below it
-- is entirely ON DELETE CASCADE:
--
--   users -> golf_players -> golf_rounds -> golf_holes
--                                        -> golf_shots
--                                        -> golf_round_reviews
--                                        -> golf_round_stats_cache
--
-- The route's pre-flight only blocks on three attribution tables
-- (golf_goals.created_by_user_id, golf_qualifier_selections.selected_by_user_id,
-- golf_travel_expenses.created_by). `golf_rounds` is NOT among them, so having a
-- full season of rounds does not block anything. Measured against live data on
-- 2026-08-18: 93 of 94 players pass that pre-flight and reach the delete.
--
-- One settings click plus one confirm therefore destroys a player's entire
-- competitive history, irreversibly, with no export and no grace period.
--
-- ─── WHY NOT JUST DROP THE CASCADE ──────────────────────────────────────────
--
-- `golf_rounds.player_id` is NOT NULL, so `ON DELETE SET NULL` there is
-- impossible — the constraint would fail on every deletion. RESTRICT would be
-- worse: it makes account deletion fail outright for 93 of 94 players, which
-- breaks a right-to-erasure obligation.
--
-- ─── THE APPROACH: ANONYMIZE THE PLAYER, KEEP THE HISTORY ───────────────────
--
-- The insight is that the protected data contains no personal information.
-- `golf_shots` and `golf_holes` are distances, clubs, lies and coordinates.
-- `golf_rounds` is scores and dates. The PII lives in `users` and in
-- `golf_players.first_name / last_name / email` — and all three of those
-- columns are NULLABLE.
--
-- So erasure and preservation are not actually in conflict. Destroy the
-- identity; keep the anonymous performance record:
--
--   1. `golf_players.user_id` becomes nullable, and its FK to `users` becomes
--      ON DELETE SET NULL. Deleting the auth user now DETACHES the player row
--      instead of destroying it.
--   2. `golf_players.id` is unchanged, so `golf_rounds.player_id` (NOT NULL)
--      stays valid and every child row survives.
--   3. The route nulls first_name / last_name / email and marks the row
--      anonymized (application change, shipped alongside this migration).
--
-- What remains afterwards is a de-identified round history that still supports
-- team-level aggregates and season records, which is what a program needs: a
-- player leaving should not silently rewrite the team's competitive record.
--
-- ─── SAFETY ─────────────────────────────────────────────────────────────────
--
-- Additive and reversible. Widening NOT NULL -> NULL cannot fail on existing
-- rows. Swapping CASCADE -> SET NULL strictly REDUCES what a delete destroys;
-- there is no input for which this migration deletes more than the current
-- schema does. It creates no new delete path.
--
-- NOT APPLIED BY THE AUTHORING SESSION. Docker was unavailable, so the
-- clean-room `supabase db reset` replay could not be run and this has not been
-- exercised against a local stack. It ships in the PR for review and deliberate
-- application, per the run's forward-only rule.

begin;

-- 1. A player may exist without an auth user (an anonymized, departed player).
alter table public.golf_players
  alter column user_id drop not null;

-- 2. Deleting the auth user detaches the player instead of destroying them.
--    Drop-and-recreate is required: Postgres has no ALTER for a FK's action.
alter table public.golf_players
  drop constraint if exists golf_players_user_id_fkey;

alter table public.golf_players
  add constraint golf_players_user_id_fkey
  foreign key (user_id) references public.users(id)
  on delete set null;

-- 3. Make the anonymized state explicit rather than inferred from a NULL.
--    Something reading this row later needs to distinguish "departed player,
--    history retained" from "record is broken".
alter table public.golf_players
  add column if not exists anonymized_at timestamptz;

comment on column public.golf_players.anonymized_at is
  'Set when the linked auth user was deleted and the identity fields were '
  'cleared. The round/shot history under this player is deliberately retained '
  'and is de-identified. NULL = active player.';

-- 4. A partial index so "is this row anonymized" stays cheap for the roster
--    and stats queries that must exclude departed players from active views.
create index if not exists golf_players_anonymized_at_idx
  on public.golf_players (anonymized_at)
  where anonymized_at is not null;

commit;

-- ─── VERIFICATION (run after applying) ──────────────────────────────────────
--
--   -- the FK must now be SET NULL ('n'), not CASCADE ('c')
--   select conname, confdeltype
--     from pg_constraint
--    where conname = 'golf_players_user_id_fkey';
--
--   -- history counts must be unchanged by any subsequent account deletion
--   select 'golf_rounds' t, count(*) from golf_rounds
--   union all select 'golf_shots', count(*) from golf_shots
--   union all select 'golf_holes', count(*) from golf_holes;
--
-- Baseline at authoring time: golf_rounds 349, golf_shots 24,526,
-- golf_holes 6,192. These may only ever increase.
