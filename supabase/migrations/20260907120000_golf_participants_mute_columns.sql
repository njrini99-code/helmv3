-- golf_conversation_participants: converge the two mute columns that exist in
-- production but that no migration creates (G-58, audit/A1-RESOLUTION.md §4).
--
-- RISK TIER: R1. Additive, idempotent, and a NO-OP against production. Not
-- applied by an agent — owner-apply-only through `npm run db:apply`
-- (docs/operations/APPLY_PATH.md), after db-migration-reviewer sign-off.
-- This is NOT a held migration: it belongs in the apply queue, so it gets no
-- row in supabase/migrations/HELD.md.
--
-- THE DEFECT
-- ----------
-- `notification_level` and `muted_until` exist in the production catalog and
-- are declared in the schema mirror (supabase/schemas/golf/10_tables.sql), but
-- `grep -rl "muted_until\|notification_level" supabase/migrations/` finds
-- nothing. The only other hits are under supabase/migrations_archive/, which
-- is historical and never replayed. So every environment BUILT from migrations
-- — a fresh local stack, CI, a preview branch, a disaster-recovery restore —
-- has exactly (id, conversation_id, user_id, joined_at, last_read_at) and
-- lacks both columns. Production is the only place the mute contract exists.
--
-- This is drift in the direction nothing checks. `check-supabase-drift`'s golf
-- invariant asserts a fixed expected-column list that does not name these two,
-- and ci.yml's declarative-schema step checks migrations -> schemas, not
-- schemas -> migrations.
--
-- WHY IT IS SAFE TO RUN AGAINST PRODUCTION
-- ----------------------------------------
-- Every statement is guarded on the object already existing, and the shapes
-- below were read from the production catalog rather than from the mirror:
--
--   information_schema.columns
--     notification_level  text        NOT NULL  DEFAULT 'all'::text
--     muted_until         timestamptz NULL      (no default)
--   pg_constraint
--     golf_participants_notification_level_check
--       CHECK ((notification_level = ANY
--                (ARRAY['all'::text, 'mentions'::text, 'muted'::text])))
--
-- so in production every branch is skipped and the table is untouched. The
-- column order below matches production's ordinal positions
-- (notification_level then muted_until) so a rebuilt environment converges on
-- the same shape, not merely the same set.
--
-- NOT ADDED: an index. Production has none on either column
-- (pg_indexes shows only the pkey, the (conversation_id, user_id) unique, and
-- the two single-column fkey indexes), and adding one here would make this
-- migration a change to production rather than a no-op. Indexing mute lookups
-- is a separate decision with its own evidence.
--
-- `ADD CONSTRAINT` has no `IF NOT EXISTS` in PostgreSQL, hence the catalog
-- lookup rather than a bare ALTER.
--
-- VERIFIED, not assumed. Run against the local stack (built from migrations)
-- on 2026-09-07:
--   before  id, conversation_id, user_id, joined_at, last_read_at
--   after   ... notification_level text NOT NULL DEFAULT 'all'::text,
--               muted_until timestamptz NULL
--           + golf_participants_notification_level_check, definition identical
--             to production's, and the column comment above
--   again   a second apply changed nothing (column hash unchanged, one
--           constraint, not two)
-- The "before" line is also the direct evidence for G-58 itself.
--
-- ENFORCED from here: `GOLF_EXPECTED_COLUMNS` in
-- scripts/db/check-supabase-drift.mjs now names both columns, and ci.yml runs
-- `db:drift:check` against the migrations rebuild — so deleting or breaking
-- this file fails CI rather than silently reopening the gap.
--
-- VERIFY: select 1 from information_schema.columns
-- VERIFY:  where table_schema = 'public'
-- VERIFY:    and table_name = 'golf_conversation_participants'
-- VERIFY:    and column_name = 'notification_level' and is_nullable = 'NO';
-- VERIFY: select 1 from information_schema.columns
-- VERIFY:  where table_schema = 'public'
-- VERIFY:    and table_name = 'golf_conversation_participants'
-- VERIFY:    and column_name = 'muted_until';
-- VERIFY: select 1 from pg_constraint
-- VERIFY:  where conname = 'golf_participants_notification_level_check';
--
-- ROLLBACK: `ALTER TABLE public.golf_conversation_participants DROP COLUMN
-- ROLLBACK: notification_level, DROP COLUMN muted_until;` — destructive, and
-- ROLLBACK: only ever correct in an environment where this migration actually
-- ROLLBACK: created them. NEVER in production, where they already hold real
-- ROLLBACK: rows and this migration is a no-op — there the correct rollback
-- ROLLBACK: is to do nothing.

ALTER TABLE "public"."golf_conversation_participants"
ADD COLUMN IF NOT EXISTS "notification_level" text DEFAULT 'all'::text NOT NULL;

ALTER TABLE "public"."golf_conversation_participants"
ADD COLUMN IF NOT EXISTS "muted_until" timestamp with time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'golf_conversation_participants'
      AND con.conname = 'golf_participants_notification_level_check'
  ) THEN
    ALTER TABLE "public"."golf_conversation_participants"
      ADD CONSTRAINT "golf_participants_notification_level_check"
      CHECK (("notification_level" = ANY (ARRAY['all'::"text", 'mentions'::"text", 'muted'::"text"])));
  END IF;
END
$$;

-- The column comment is reproduced from production and applied ONLY where the
-- column carries none. Production's own text is the sole written record of the
-- mute semantics anywhere in this project (it is in no repo file), and an
-- unguarded `COMMENT ON` would silently overwrite it with a paraphrase — which
-- is both a change to production and a loss of the better description.
DO $$
BEGIN
  IF col_description('public.golf_conversation_participants'::regclass,
                     (SELECT attnum FROM pg_attribute
                       WHERE attrelid = 'public.golf_conversation_participants'::regclass
                         AND attname = 'notification_level')) IS NULL THEN
    COMMENT ON COLUMN "public"."golf_conversation_participants"."notification_level" IS
      'YOUR delivery preference for this conversation: all | mentions | muted. Per-participant, never per-conversation. With muted_until set, the level lapses back to all once that timestamp passes — evaluated on read, so a stalled job can never leave somebody permanently silent.';
  END IF;
END
$$;

-- `muted_until` carries no comment in production, so this migration adds none.
-- Matching production exactly is the whole point of the file.
