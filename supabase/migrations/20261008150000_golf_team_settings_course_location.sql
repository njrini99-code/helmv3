-- STATUS: WRITTEN, NOT APPLIED. Held for the owner's apply (supabase/migrations/HELD.md).
-- Prepared for the Clubhouse premium pass: the global light (P001-A1, D3-1) and
-- schema changes (D5-4), both owner-approved in docs/clubhouse/PREMIUM_PASS_AUDIT.md
-- ("the team's course location, set once in Team settings; the time zone until it is set").
-- Apply: npm run db:apply --
-- supabase/migrations/20261008150000_golf_team_settings_course_location.sql
-- Risk: LOW. Three nullable columns with no default and no backfill (a catalog-only
-- change, no table rewrite), plus CHECKs every existing row passes because the
-- columns start NULL. golf_team_settings has one row per team.
--
-- Where the team's course is, for the sun the Clubhouse draws its light from. A coach
-- sets it once in Settings > Team with the browser's Geolocation (rounded to two
-- decimals, about 1 km; no geocoding service) and a short label, or clears it. Until it
-- is set (and before this file is applied) the light uses the team's time zone. The
-- Clubhouse reads these columns only when the select that names them succeeds, so
-- nothing breaks before this is applied; applying it turns the Team row on.
--
-- RLS: unchanged. Checked in 20260527000000_prod_public_baseline.sql (no later file
-- alters them): "Coaches can manage settings" (ALL, a coach on the team's staff:
-- golf_team_coach_staff joined to golf_coaches on auth.uid()) and "Team members can
-- view settings" (SELECT, that staff or a rostered player via golf_team_members). Both
-- are row-level on team_id, and the table grants are table-wide (GRANT ALL ON TABLE
-- golf_team_settings TO authenticated), so the new columns are covered exactly as the
-- existing ones are: coaches write, the team reads.
--
-- ROLLBACK: ALTER TABLE public.golf_team_settings
--   DROP CONSTRAINT IF EXISTS golf_team_settings_course_latitude_range,
--   DROP CONSTRAINT IF EXISTS golf_team_settings_course_longitude_range,
--   DROP CONSTRAINT IF EXISTS golf_team_settings_course_label_length,
--   DROP COLUMN IF EXISTS course_label,
--   DROP COLUMN IF EXISTS course_longitude,
--   DROP COLUMN IF EXISTS course_latitude;
--
-- VERIFY: select count(*) = 3 from information_schema.columns
-- VERIFY: where table_schema = 'public' and table_name = 'golf_team_settings'
-- VERIFY: and column_name in ('course_latitude', 'course_longitude', 'course_label')
-- VERIFY: and is_nullable = 'YES';

ALTER TABLE public.golf_team_settings
  ADD COLUMN IF NOT EXISTS course_latitude double precision,
  ADD COLUMN IF NOT EXISTS course_longitude double precision,
  ADD COLUMN IF NOT EXISTS course_label text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'golf_team_settings_course_latitude_range') THEN
    ALTER TABLE public.golf_team_settings
      ADD CONSTRAINT golf_team_settings_course_latitude_range CHECK (course_latitude BETWEEN -90 AND 90);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'golf_team_settings_course_longitude_range') THEN
    ALTER TABLE public.golf_team_settings
      ADD CONSTRAINT golf_team_settings_course_longitude_range CHECK (course_longitude BETWEEN -180 AND 180);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'golf_team_settings_course_label_length') THEN
    ALTER TABLE public.golf_team_settings
      ADD CONSTRAINT golf_team_settings_course_label_length CHECK (char_length(course_label) <= 80);
  END IF;
END $$;

COMMENT ON COLUMN public.golf_team_settings.course_latitude IS
  'The team course''s latitude (2 decimals) for the Clubhouse global light; null uses the team time zone.';
COMMENT ON COLUMN public.golf_team_settings.course_longitude IS
  'The team course''s longitude (2 decimals) for the Clubhouse global light; null uses the team time zone.';
COMMENT ON COLUMN public.golf_team_settings.course_label IS
  'A short name for the course location shown in Settings > Team (at most 80 characters).';
