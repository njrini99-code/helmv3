-- Make the supabase_realtime publication reproducible from migrations, and
-- switch on the 13 subscriptions that were silently dead.
--
-- THE BUG. `postgres_changes` only delivers events for tables in the
-- `supabase_realtime` publication. A subscription to an unpublished table
-- still returns SUBSCRIBED — it simply never fires. No error, no warning,
-- nothing in the console. The feature just silently shows stale data until
-- the user refreshes.
--
-- Measured 2026-08-01: the app subscribes to 18 distinct tables; only 5 were
-- published. The publication has NEVER been populated by a migration — the
-- only `ALTER PUBLICATION` statements in this repo are the DROPs in the
-- 20260704 graveyard migrations. It was enabled by hand in the dashboard for
-- an early set of tables, and every realtime feature built afterwards was
-- written in code and never switched on.
--
-- Silently dead until this migration, including features named for it:
--   helm_lifting_sessions / helm_lifting_set_results  <- LiveWeightRoomClient
--   baseball_messages / _conversations / _participants <- baseball messaging
--   golf_tasks / golf_task_assignments                 <- task live updates
--   golf_qualifiers / golf_qualifier_entries           <- live qualifier board
--   golf_events / golf_event_attendance                <- calendar + RSVP
--   golf_rounds                                        <- round status sync
--   admin_api_perf_log                                 <- Bridge perf feed
--
-- ADDITIVE AND IDEMPOTENT. `ALTER PUBLICATION ... ADD TABLE` errors if the
-- table is already a member, so each add is guarded by a pg_publication_tables
-- lookup. Re-running this migration is a no-op.
--
-- REPLICA IDENTITY IS DELIBERATELY NOT CHANGED. Every one of these tables is
-- `relreplident = 'd'` (default = primary key). For INSERT that is irrelevant;
-- for UPDATE/DELETE it means the `old` record in the payload carries only the
-- primary key. Several of these subscriptions listen on UPDATE or '*', so if a
-- handler needs previous column values it will need
-- `REPLICA IDENTITY FULL` on that specific table — which materially increases
-- WAL volume per row and should be decided per table with that cost in view,
-- not applied in bulk here. Handlers that only refetch on notification (the
-- common shape in this codebase) do not need it.
--
-- COST NOTE. Realtime WAL processing is already the single largest consumer of
-- database time on this project (~22 hours of exec time across ~11.9M calls in
-- pg_stat_statements at time of writing), dominated by `admin_events`, which
-- is the highest-write table here and is published for the Bridge live feed.
-- The 13 newly-added tables are all far lower write volume, so the marginal
-- cost is small — but if Realtime load becomes a problem, `admin_events` is
-- the table to reconsider, not these.

DO $$
DECLARE
  t text;
  wanted text[] := ARRAY[
    -- Already published in production, but ONLY because they were enabled by
    -- hand in the dashboard — no migration has ever added them, so a rebuild
    -- from migrations would silently lose them. Listed here so the publication
    -- is reproducible from source. The guard below makes these no-ops today.
    'admin_events',
    'email_events',
    'golf_conversation_participants',
    'golf_conversations',
    'golf_messages',
    -- Subscribed in code but never published — silently dead until now.
    'admin_api_perf_log',
    'baseball_conversation_participants',
    'baseball_conversations',
    'baseball_messages',
    'golf_event_attendance',
    'golf_events',
    'golf_qualifier_entries',
    'golf_qualifiers',
    'golf_rounds',
    'golf_task_assignments',
    'golf_tasks',
    'helm_lifting_sessions',
    'helm_lifting_set_results'
  ];
BEGIN
  FOREACH t IN ARRAY wanted LOOP
    -- Skip anything that does not exist in public (a table could have been
    -- renamed or graveyarded since this migration was written).
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      RAISE NOTICE 'realtime publication: skipping % (no such table in public)', t;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      RAISE NOTICE 'realtime publication: % already published', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    RAISE NOTICE 'realtime publication: added %', t;
  END LOOP;
END $$;
