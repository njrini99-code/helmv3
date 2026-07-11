-- #bb-postgame schema-drift reconcile: baseball_postgame_reviews +
-- baseball_postgame_review_items.
--
-- Same class of bug as 20260710020000_baseball_settings_audit_log_column_reconcile
-- and 20260710031500_baseball_decision_log_kind_reconcile: 20260624000093's
-- create-if-not-exists for BOTH postgame tables no-op'd because tables with
-- these names already existed in prod under an OLDER schema —
--   baseball_postgame_reviews: (id, team_id, game_id, created_by_coach_id,
--     status, overall_grade, notes, created_at, updated_at)
--   baseball_postgame_review_items: (id, review_id, team_id, player_id,
--     category, item_type, body, source_refs, visibility, created_at)
-- — so the intended V10 postgame column set never landed on either.
--
-- Confirmed against LIVE information_schema.columns 2026-07-11 (post-deploy
-- error triage): generatePostgameReview's header upsert targets coach_id/
-- source_status/batting_lines_n/pitching_lines_n/import_warnings/title/
-- summary/confidence/visibility/disposition/generated_by_model/generated_at
-- — none of which exist on the live table — so every postgame save is
-- rejected by PostgREST at the schema cache (never reaches Postgres; observed
-- live as "[generatePostgameReview] Could not save the postgame review",
-- admin_events fingerprint 685ec9f3). The items upsert
-- (onConflict review_id,dedupe_key) would fail identically one step later.
-- `select count(*)` = 0 rows in BOTH prod tables, so this reconcile rewrites
-- nothing.
--
-- Additive-only per repo convention for the shared golf+baseball prod DB:
-- add the app-expected columns alongside the existing drifted ones
-- (created_by_coach_id/status/overall_grade/notes and category/item_type/body
-- are left untouched — no backfill, no drop, both tables are empty). Columns
-- 20260624000093 declared NOT-NULL-without-default (title, dedupe_key,
-- item_kind) are added NULLABLE so this ALTER can never fail against a
-- drifted non-empty table, mirroring 20260710020000's event_type/summary
-- treatment; the writer already supplies them unconditionally.
-- Existence-guarded throughout so the CI shadow-DB replay — where
-- 20260624000093's CREATE TABLE runs against a fresh DB and creates the
-- correct schema on the first try — sees every ADD COLUMN / ADD CONSTRAINT
-- as a no-op.

-- ----------------------------------------------------------------------------
-- baseball_postgame_reviews — app-expected header columns.
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_postgame_reviews
  ADD COLUMN IF NOT EXISTS coach_id           uuid REFERENCES public.baseball_coaches(id),
  ADD COLUMN IF NOT EXISTS source_status      text NOT NULL DEFAULT 'official',
  ADD COLUMN IF NOT EXISTS batting_lines_n    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pitching_lines_n   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS import_warnings    jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS title              text,
  ADD COLUMN IF NOT EXISTS summary            text,
  ADD COLUMN IF NOT EXISTS confidence         numeric,
  ADD COLUMN IF NOT EXISTS visibility         text NOT NULL DEFAULT 'staff_only',
  ADD COLUMN IF NOT EXISTS disposition        text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS generated_by_model text,
  ADD COLUMN IF NOT EXISTS generated_at       timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at         timestamptz;

-- CHECK constraints matching 20260624000093 (name-guarded: the fresh-DB
-- CREATE already carries them as unnamed column checks under these same
-- auto-generated names).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.baseball_postgame_reviews'::regclass
                   AND conname = 'baseball_postgame_reviews_source_status_check') THEN
    ALTER TABLE public.baseball_postgame_reviews
      ADD CONSTRAINT baseball_postgame_reviews_source_status_check
      CHECK (source_status IN ('official','partial','imported','manual','missing'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.baseball_postgame_reviews'::regclass
                   AND conname = 'baseball_postgame_reviews_confidence_check') THEN
    ALTER TABLE public.baseball_postgame_reviews
      ADD CONSTRAINT baseball_postgame_reviews_confidence_check
      CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.baseball_postgame_reviews'::regclass
                   AND conname = 'baseball_postgame_reviews_visibility_check') THEN
    ALTER TABLE public.baseball_postgame_reviews
      ADD CONSTRAINT baseball_postgame_reviews_visibility_check
      CHECK (visibility IN ('staff_only','player_visible','restricted'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.baseball_postgame_reviews'::regclass
                   AND conname = 'baseball_postgame_reviews_disposition_check') THEN
    ALTER TABLE public.baseball_postgame_reviews
      ADD CONSTRAINT baseball_postgame_reviews_disposition_check
      CHECK (disposition IN ('new','reviewed','dismissed','resolved'));
  END IF;
END $$;

-- The header upsert's ON CONFLICT (team_id, game_id) arbiter already exists
-- in prod as uq_baseball_postgame_review; the fresh-DB CREATE names it
-- uq_baseball_postgame_review_game. Guard on DEFINITION, not name, so neither
-- world gets a duplicate unique index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.baseball_postgame_reviews'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (team_id, game_id)'
  ) THEN
    ALTER TABLE public.baseball_postgame_reviews
      ADD CONSTRAINT uq_baseball_postgame_review_game UNIQUE (team_id, game_id);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- baseball_postgame_review_items — app-expected item columns.
-- ----------------------------------------------------------------------------
ALTER TABLE public.baseball_postgame_review_items
  ADD COLUMN IF NOT EXISTS item_kind         text,
  ADD COLUMN IF NOT EXISTS signal_source     text,
  ADD COLUMN IF NOT EXISTS title             text,
  ADD COLUMN IF NOT EXISTS detail            text,
  ADD COLUMN IF NOT EXISTS action_label      text,
  ADD COLUMN IF NOT EXISTS action_type       text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS owner_role        text,
  ADD COLUMN IF NOT EXISTS priority          text NOT NULL DEFAULT 'low',
  ADD COLUMN IF NOT EXISTS confidence        numeric,
  ADD COLUMN IF NOT EXISTS player_visible    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS timeline_event_id uuid REFERENCES public.baseball_player_timeline_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disposition       text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS dedupe_key        text,
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.baseball_postgame_review_items'::regclass
                   AND conname = 'baseball_postgame_review_items_item_kind_check') THEN
    ALTER TABLE public.baseball_postgame_review_items
      ADD CONSTRAINT baseball_postgame_review_items_item_kind_check
      CHECK (item_kind IN ('timeline_update','staff_decision','practice_focus',
                           'workload_update','video_evidence'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.baseball_postgame_review_items'::regclass
                   AND conname = 'baseball_postgame_review_items_action_type_check') THEN
    ALTER TABLE public.baseball_postgame_review_items
      ADD CONSTRAINT baseball_postgame_review_items_action_type_check
      CHECK (action_type IN ('task','note','practice_adjustment','meeting_topic','none'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.baseball_postgame_review_items'::regclass
                   AND conname = 'baseball_postgame_review_items_priority_check') THEN
    ALTER TABLE public.baseball_postgame_review_items
      ADD CONSTRAINT baseball_postgame_review_items_priority_check
      CHECK (priority IN ('low','medium','high','urgent'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.baseball_postgame_review_items'::regclass
                   AND conname = 'baseball_postgame_review_items_confidence_check') THEN
    ALTER TABLE public.baseball_postgame_review_items
      ADD CONSTRAINT baseball_postgame_review_items_confidence_check
      CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conrelid = 'public.baseball_postgame_review_items'::regclass
                   AND conname = 'baseball_postgame_review_items_disposition_check') THEN
    ALTER TABLE public.baseball_postgame_review_items
      ADD CONSTRAINT baseball_postgame_review_items_disposition_check
      CHECK (disposition IN ('new','converted_to_task','converted_to_timeline',
                             'dismissed','resolved'));
  END IF;
END $$;

-- The items upsert's ON CONFLICT (review_id, dedupe_key) arbiter. Guarded by
-- definition (fresh DB has it from the CREATE as uq_baseball_postgame_item).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.baseball_postgame_review_items'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (review_id, dedupe_key)'
  ) THEN
    ALTER TABLE public.baseball_postgame_review_items
      ADD CONSTRAINT uq_baseball_postgame_item UNIQUE (review_id, dedupe_key);
  END IF;
END $$;

-- Legacy drift column: relax so the new writer (which never sets body)
-- cannot fail a NOT NULL it no longer supplies — without this, the
-- missing-column rejection above just becomes a 23502 not-null violation on
-- every items upsert once the column set is reconciled. Guarded: body does
-- not exist on a fresh (correctly-created) table.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'baseball_postgame_review_items'
      AND column_name = 'body' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.baseball_postgame_review_items ALTER COLUMN body DROP NOT NULL;
  END IF;
END $$;
