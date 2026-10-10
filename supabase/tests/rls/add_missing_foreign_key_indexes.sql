-- Contract for 20261007105000_add_missing_foreign_key_indexes.sql.
-- Each of the eleven advisor-flagged foreign keys now has an index whose
-- leading column is the FK column.

BEGIN;
\ir _helpers.sql

SELECT plan(2);

SELECT is(
  (SELECT count(*)::int FROM pg_indexes
   WHERE schemaname = 'public'
     AND indexname IN (
       'idx_admin_error_resolutions_resolved_by',
       'idx_baseball_pitch_events_batter_id',
       'idx_golf_coachhelm_action_runs_message_id',
       'idx_golf_coachhelm_action_runs_team_id',
       'idx_golf_message_reactions_user_id',
       'idx_golf_message_responses_user_id',
       'idx_golf_messages_pinned_by',
       'idx_golf_staff_invite_codes_created_by_coach_id',
       'idx_golf_staff_invite_codes_organization_id',
       'idx_golf_staff_invite_redemptions_organization_id',
       'idx_golf_staff_invite_redemptions_redeemed_by')),
  11,
  'all eleven foreign-key indexes exist'
);

-- Every FK on these eight tables has an index that starts with its column.
SELECT is_empty(
  $$SELECT c.conrelid::regclass::text AS tbl, c.conname
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid::regclass::text IN (
        'admin_error_resolutions', 'baseball_pitch_events', 'golf_coachhelm_action_runs',
        'golf_message_reactions', 'golf_message_responses', 'golf_messages',
        'golf_staff_invite_codes', 'golf_staff_invite_redemptions')
      AND c.conname IN (
        'admin_error_resolutions_resolved_by_fkey', 'baseball_pitch_events_batter_id_fkey',
        'golf_coachhelm_action_runs_message_id_fkey', 'golf_coachhelm_action_runs_team_id_fkey',
        'golf_message_reactions_user_id_fkey', 'golf_message_responses_user_id_fkey',
        'golf_messages_pinned_by_fkey', 'golf_staff_invite_codes_created_by_coach_id_fkey',
        'golf_staff_invite_codes_organization_id_fkey',
        'golf_staff_invite_redemptions_organization_id_fkey',
        'golf_staff_invite_redemptions_redeemed_by_fkey')
      AND NOT EXISTS (
        SELECT 1 FROM pg_index i
        WHERE i.indrelid = c.conrelid
          AND i.indkey[0] = c.conkey[1])$$,
  'every flagged foreign key is covered by an index led by its column'
);

SELECT * FROM finish();
ROLLBACK;
