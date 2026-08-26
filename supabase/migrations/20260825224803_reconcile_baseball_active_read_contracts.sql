BEGIN;

-- These are active read/write contracts, not a wholesale attempt to merge the
-- two historical Baseball schema lineages.  Each field below is either used
-- by a shipped query or is needed to make the local reset reproduce the
-- production contract that query expects.

-- Camp attendance UI: no production column existed for either lifecycle
-- timestamp, even though the client has selected and written both since the
-- feature was introduced.  created_at is the only safe historic source for
-- the initial registration timestamp.
ALTER TABLE public.baseball_camp_registrations
ADD COLUMN IF NOT EXISTS registered_at timestamptz,
ADD COLUMN IF NOT EXISTS attended_at timestamptz;

UPDATE public.baseball_camp_registrations
SET registered_at = created_at
WHERE registered_at IS NULL;

ALTER TABLE public.baseball_camp_registrations
ALTER COLUMN registered_at SET DEFAULT now();

-- Production's coach-note contract is the one the action/read-model layer
-- already uses.  Preserve the richer local soft-delete aliases rather than
-- removing them; this forward migration only adds the canonical fields.
ALTER TABLE public.baseball_coach_notes
ADD COLUMN IF NOT EXISTS title text,
ADD COLUMN IF NOT EXISTS tags text[],
ADD COLUMN IF NOT EXISTS source_refs jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS archived_at timestamptz,
ADD COLUMN IF NOT EXISTS created_by uuid,
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Local import-source rows predate the production registry vocabulary.  The
-- aliases are populated from the only semantically equivalent legacy fields;
-- config_json is intentionally empty rather than fabricated.
ALTER TABLE public.baseball_import_sources
ADD COLUMN IF NOT EXISTS adapter_key text,
ADD COLUMN IF NOT EXISTS config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'baseball_import_sources'
      AND column_name = 'source_type'
  ) THEN
    EXECUTE '
      UPDATE public.baseball_import_sources
      SET adapter_key = source_type
      WHERE adapter_key IS NULL AND source_type IS NOT NULL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'baseball_import_sources'
      AND column_name = 'enabled'
  ) THEN
    EXECUTE '
      UPDATE public.baseball_import_sources
      SET is_active = enabled
      WHERE enabled IS NOT NULL';
  END IF;
END;
$$;

-- Decision Room reads production's body/status signal contract.  Historic
-- local signal rows remain visible as active until a user resolves them.
ALTER TABLE public.baseball_signals
ADD COLUMN IF NOT EXISTS body text,
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

UPDATE public.baseball_signals
SET status = 'active'
WHERE status IS NULL;

-- Scout packets require the production shareable-link field.  Copy only when
-- the previous local schema had a real external URL; do not invent a link for
-- an otherwise incomplete legacy row.
ALTER TABLE public.baseball_video_events
ADD COLUMN IF NOT EXISTS video_url text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'baseball_video_events'
      AND column_name = 'external_video_url'
  ) THEN
    EXECUTE '
      UPDATE public.baseball_video_events
      SET video_url = external_video_url
      WHERE video_url IS NULL AND external_video_url IS NOT NULL';
  END IF;
END;
$$;

-- CRM send templates read these deployed contact-priority fields.  They have
-- no local predecessor, so defaults preserve the existing "non-primary,
-- unclassified" meaning rather than inventing a role classification.
ALTER TABLE public.crm_coaches
ADD COLUMN IF NOT EXISTS role_level text,
ADD COLUMN IF NOT EXISTS is_primary_contact boolean NOT NULL DEFAULT FALSE;

COMMIT;
