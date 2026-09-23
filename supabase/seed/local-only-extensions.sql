-- local-only-extensions.sql — LOCAL DEV ONLY.
--
-- Enables extensions this repo wants available while developing against the
-- local Supabase stack that production does NOT need enabled through this
-- path (see the [db] extension-parity comment block in
-- supabase/config.toml). Seed files listed in [db.seed].sql_paths run only
-- on `supabase db reset`/`supabase start` — they are never applied to
-- production, which has its own separate story for these extensions.
--
-- plpgsql_check — added 2026-09-06 (D1, Helm Database Plan). Backs
-- `npm run db:lint:functions` (scripts/db/lint-functions.mjs), which lints
-- every function in the `public` schema for plpgsql_check FAILs.
CREATE EXTENSION IF NOT EXISTS plpgsql_check WITH SCHEMA extensions;

-- pg_net — added 2026-09-06. The Supabase platform auto-provisions this in
-- production (see supabase/config.toml's extension-parity comment); the
-- local CLI image does not. Without it, `net.http_request_queue` does not
-- exist locally and `public.helm_debug_read_jobs_health` (which reads that
-- table) fails `plpgsql_check` here even though it is correct against
-- production's real schema. Enabling it locally closes that gap rather
-- than papering over it in the lint script.
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
