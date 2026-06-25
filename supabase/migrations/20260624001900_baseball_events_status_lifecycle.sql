-- ============================================================================
-- baseball_events: add soft-cancel lifecycle columns (status + cancelled_at)
-- ============================================================================
-- The shared PremiumCalendarClient (golf-authored) drives Cancel/Restore by
-- sending { status: 'cancelled' | 'confirmed' } to actionHandlers.updateEvent.
-- baseball_events already had `cancellation_reason` but no `status` column, so
-- updateBaseballEvent had nowhere to write the lifecycle state — the empty
-- update returned the unchanged row as success:true (a false-success no-op).
--
-- This mirrors public.golf_events exactly (status text default 'scheduled',
-- cancelled_at timestamptz, cancellation_reason text) so the same Cancel/Restore
-- semantics work identically across both sports. Additive only — no existing
-- column or row is touched; the default keeps every existing row 'scheduled'.
--
-- Allowed lifecycle values match golf's calendar transitions:
--   'scheduled'  — created (golf seeds 'scheduled'/'confirmed' interchangeably)
--   'confirmed'  — live / restored
--   'cancelled'  — soft-cancelled (cancelled_at + cancellation_reason set)
-- ============================================================================

ALTER TABLE "public"."baseball_events"
  ADD COLUMN IF NOT EXISTS "status" "text" DEFAULT 'scheduled'::"text",
  ADD COLUMN IF NOT EXISTS "cancelled_at" timestamp with time zone;

-- Constrain to the calendar lifecycle vocabulary. Use NOT VALID-free add via
-- IF NOT EXISTS guard so re-runs are safe; existing rows default to 'scheduled'
-- which satisfies the check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "pg_constraint"
    WHERE "conname" = 'baseball_events_status_check'
  ) THEN
    ALTER TABLE "public"."baseball_events"
      ADD CONSTRAINT "baseball_events_status_check"
      CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'confirmed'::"text", 'cancelled'::"text"])));
  END IF;
END $$;

-- Partial-friendly index mirroring idx_golf_events_status so calendar reads that
-- filter/sort by lifecycle state stay fast as the table grows.
CREATE INDEX IF NOT EXISTS "idx_baseball_events_status"
  ON "public"."baseball_events" USING "btree" ("status");
