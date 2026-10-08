-- STATUS: WRITTEN, NOT APPLIED. Prepared by plan phase 6 item 6.5 (performance
-- advisor).
-- Apply: npm run db:apply --
-- supabase/migrations/20261007105000_add_missing_foreign_key_indexes.sql
-- Risk: LOW. Eleven plain CREATE INDEX IF NOT EXISTS on tables that hold at
-- most a few hundred rows (live 2026-10-07: admin_error_resolutions 723,
-- golf_messages 233, golf_message_reactions 34, golf_coachhelm_action_runs 4,
-- the rest empty), so the brief write lock is immaterial. No CONCURRENTLY: the
-- apply path runs the file in one transaction and refuses it.
--
-- These are the 11 public-schema unindexed_foreign_keys advisor findings. The
-- 40 findings in the graveyard schema are archived tables and are left alone.
-- An FK without a covering index makes ON DELETE and ON UPDATE of the parent
-- row scan the child table.
--
-- ROLLBACK: DROP INDEX IF EXISTS public.<each index name below>;
--
-- VERIFY: select 1 where (select count(*) from pg_indexes where schemaname =
-- VERIFY: 'public' and indexname in ('idx_admin_error_resolutions_resolved_by',
-- VERIFY: 'idx_baseball_pitch_events_batter_id',
-- VERIFY: 'idx_golf_coachhelm_action_runs_message_id',
-- VERIFY: 'idx_golf_coachhelm_action_runs_team_id',
-- VERIFY: 'idx_golf_message_reactions_user_id',
-- VERIFY: 'idx_golf_message_responses_user_id', 'idx_golf_messages_pinned_by',
-- VERIFY: 'idx_golf_staff_invite_codes_created_by_coach_id',
-- VERIFY: 'idx_golf_staff_invite_codes_organization_id',
-- VERIFY: 'idx_golf_staff_invite_redemptions_organization_id',
-- VERIFY: 'idx_golf_staff_invite_redemptions_redeemed_by')) = 11;

-- Plain CREATE INDEX, not CONCURRENTLY: the apply path runs the file in one
-- transaction, where CONCURRENTLY cannot run. Every table has at most 723 rows.
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_admin_error_resolutions_resolved_by
ON public.admin_error_resolutions USING btree (resolved_by);
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_baseball_pitch_events_batter_id
ON public.baseball_pitch_events USING btree (batter_id);
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_coachhelm_action_runs_message_id
ON public.golf_coachhelm_action_runs USING btree (message_id);
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_coachhelm_action_runs_team_id
ON public.golf_coachhelm_action_runs USING btree (team_id);
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_message_reactions_user_id
ON public.golf_message_reactions USING btree (user_id);
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_message_responses_user_id
ON public.golf_message_responses USING btree (user_id);
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_messages_pinned_by
ON public.golf_messages USING btree (pinned_by);
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_staff_invite_codes_created_by_coach_id
ON public.golf_staff_invite_codes USING btree (created_by_coach_id);
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_staff_invite_codes_organization_id
ON public.golf_staff_invite_codes USING btree (organization_id);
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_staff_invite_redemptions_organization_id
ON public.golf_staff_invite_redemptions USING btree (organization_id);
-- squawk-ignore require-concurrent-index-creation
CREATE INDEX IF NOT EXISTS idx_golf_staff_invite_redemptions_redeemed_by
ON public.golf_staff_invite_redemptions USING btree (redeemed_by);
