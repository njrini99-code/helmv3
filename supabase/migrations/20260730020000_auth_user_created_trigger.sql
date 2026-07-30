-- =============================================================================
-- Restore `on_auth_user_created` on auth.users to the tracked schema.
--
-- WHAT WAS WRONG
--
-- Production has exactly one non-internal trigger in the `auth` schema:
--
--   CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
--     FOR EACH ROW EXECUTE FUNCTION handle_new_user()
--
-- (read live from production on 2026-07-30 via pg_get_triggerdef, tgenabled='O')
--
-- No migration in `supabase/migrations/` creates it. The only copies in the repo
-- are in `supabase/migrations_archive/v1_original/` — 021, 042, 045,
-- 20251231000002, 20251231000003 — which are archived and never applied.
--
-- The reason it went missing is structural, not careless: the active baseline
-- `20260527000000_prod_public_baseline.sql` is a **public-schema-only** dump (its
-- first DDL is `CREATE SCHEMA IF NOT EXISTS "public"` and it emits nothing for
-- `auth`). It therefore captured `public.handle_new_user()`, which is a public
-- function, but could not capture the trigger, which is an object ON an auth
-- table. A public-schema dump can never carry it. So the function has been
-- tracked all along and the thing that FIRES it has not.
--
-- WHY IT MATTERED, AND HOW IT SURFACED
--
-- On any database built from `supabase/migrations/` — `supabase start`, a
-- Supabase preview branch, a restore drill — inserting into `auth.users` does
-- NOT create the `public.users` row. Signup is silently broken there.
--
-- It surfaced when the required BaseballHelm smoke gate was pointed at a local
-- stack instead of production: the demo seed created its auth users, then died on
--
--   upsert baseball_coaches failed: insert or update on table "baseball_coaches"
--   violates foreign key constraint "baseball_coaches_user_id_fkey"
--
-- because that FK targets `public.users(id)` (baseline line 14961) and the row
-- the trigger should have inserted was not there. Against production the seed
-- never hit this: those demo users already existed, so `ensureAuthUser` took its
-- lookup branch and the creation path was never exercised. The seed has run on
-- every PR for months without once testing the code that creates a user.
--
-- WHY THIS IS SHAPED AS A CONDITIONAL CREATE
--
-- Strictly additive, and a genuine no-op on production. It is NOT
-- `DROP TRIGGER IF EXISTS ... ; CREATE TRIGGER ...`: that form would briefly take
-- ACCESS EXCLUSIVE on `auth.users` and leave a window with no trigger, and it
-- would silently replace whatever production actually has if the two ever
-- diverged from what is written here. Checking first means applying this to
-- production cannot change production's behaviour, only a database that is
-- missing the trigger gains it.
--
-- NOT APPLIED BY THE AUTHOR. This file exists so databases built from
-- migrations are correct; production already has the object and needs nothing.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.relnamespace = 'auth'::regnamespace
      AND c.relname = 'users'
      AND t.tgname = 'on_auth_user_created'
      AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user();

    RAISE NOTICE 'created trigger on_auth_user_created on auth.users';
  ELSE
    RAISE NOTICE 'trigger on_auth_user_created already present on auth.users — no change';
  END IF;
END
$$;
