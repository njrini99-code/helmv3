BEGIN;

-- Production historically used team/player + acked_* while fresh local
-- replays used user_id + acknowledged_at. The action writes both shapes during
-- the compatibility window, so this test locks down the cross-environment
-- contract and the explicit owner-only delete path.
SELECT plan(10);

SELECT has_column('public', 'baseball_timeline_event_acks', 'team_id',
  'timeline acknowledgements retain the owning team');
SELECT has_column('public', 'baseball_timeline_event_acks', 'player_id',
  'timeline acknowledgements retain the subject player');
SELECT has_column('public', 'baseball_timeline_event_acks', 'acked_by',
  'timeline acknowledgements support the production actor key');
SELECT has_column('public', 'baseball_timeline_event_acks', 'acked_at',
  'timeline acknowledgements support the production timestamp key');
SELECT has_column('public', 'baseball_timeline_event_acks', 'user_id',
  'timeline acknowledgements retain the canonical self-service actor key');
SELECT has_column('public', 'baseball_timeline_event_acks', 'acknowledged_at',
  'timeline acknowledgements retain the canonical timestamp key');

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.baseball_timeline_event_acks'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (timeline_event_id, acked_by)'
  ),
  'the production-compatible acknowledgement conflict key is unique'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_timeline_event_acks'
      AND p.polname = 'baseball_timeline_acks_delete'
      AND p.polcmd = 'd'
      AND regexp_replace(pg_get_expr(p.polqual, p.polrelid), '[[:space:]]+', '', 'g')
        ILIKE '%user_id=(selectauth.uid()asuid)%'
      AND regexp_replace(pg_get_expr(p.polqual, p.polrelid), '[[:space:]]+', '', 'g')
        ILIKE '%acked_by=(selectauth.uid()asuid)%'
  ),
  'withdraw acknowledgement has an owner-only DELETE policy'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_timeline_event_acks'
      AND p.polroles @> ARRAY['anon'::regrole]::oid[]
  ),
  'no timeline acknowledgement policy grants anon access'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'baseball_timeline_event_acks'
      AND p.polname = 'baseball_timeline_acks_insert'
      AND p.polcmd = 'a'
      AND regexp_replace(pg_get_expr(p.polwithcheck, p.polrelid), '[[:space:]]+', '', 'g')
        ILIKE '%user_id=(selectauth.uid()asuid)%'
      AND regexp_replace(pg_get_expr(p.polwithcheck, p.polrelid), '[[:space:]]+', '', 'g')
        ILIKE '%acked_by=(selectauth.uid()asuid)%'
  ),
  'inserts bind both actor aliases to the authenticated caller'
);

SELECT * FROM finish();

ROLLBACK;
