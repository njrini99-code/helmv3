-- Prevent duplicate organization rows for the same school.
--
-- Context: the men's/women's team-toggle model assumes ONE organization runs a
-- men's + women's golf_teams pair. The per-org unique index
-- (golf_teams_org_gender_uidx, migration 20260612120000) only enforces one team
-- per gender WITHIN an org — it cannot catch a school fragmented across TWO org
-- rows. That happened with "University of Lynchburg" vs "University of Lynchburg "
-- (trailing space): two org rows, men's under one + women's under the other, so
-- no coach was a dual-team head and the toggle could never appear for them.
--
-- This adds the missing guarantee: at most one organization per school name,
-- case- and whitespace-insensitive. It is a DB-level backstop that holds for
-- EVERY insert path (coach onboarding, admin, future code), independent of the
-- application layer. The onboarding action additionally trims the name and
-- surfaces a friendly error on the 23505 this index raises.

-- ── 1. Normalize any whitespace already stored (idempotent; 0 rows as of the
--       2026-06-13 Lynchburg consolidation, included for safety + re-runs). ──
UPDATE public.organizations
  SET name = btrim(name)
  WHERE name IS NOT NULL AND name <> btrim(name);

-- ── 2. One organization per normalized school name. lower(btrim(...)) collapses
--       case + leading/trailing-whitespace variants to a single key, so neither
--       "University of Lynchburg " nor "university of lynchburg" can be created
--       alongside an existing "University of Lynchburg". ──
CREATE UNIQUE INDEX IF NOT EXISTS organizations_normalized_name_uidx
  ON public.organizations (lower(btrim(name)))
  WHERE name IS NOT NULL;

COMMENT ON INDEX public.organizations_normalized_name_uidx IS
  'One organization per school name, case + whitespace insensitive. Prevents duplicate-school org rows (e.g. the 2026-06 "University of Lynchburg " trailing-space dup). Onboarding catches the resulting 23505 and surfaces a friendly "already exists" error.';
