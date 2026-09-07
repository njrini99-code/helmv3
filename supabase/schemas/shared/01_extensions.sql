-- Extensions the schema files below depend on to apply cleanly.
--
-- `supabase db dump --schema-only` does NOT emit `CREATE EXTENSION`
-- statements for this project (verified empirically: a scoped dump of
-- public/helm_debug/helm_private/extensions/archive/graveyard produced zero
-- CREATE EXTENSION lines). This file was authored by hand from
-- `list_extensions` against the linked production project, keeping only the
-- extensions with a non-null installed_version that this repo's own tables,
-- columns, or indexes actually reference (citext columns, gen_random_uuid()/
-- pgcrypto, pg_trgm indexes, etc). Extensions that exist in production but
-- nothing under supabase/schemas/** depends on (postgis, vector, wrappers,
-- pgaudit, and the rest of the long tail from `list_extensions`) are left out
-- on purpose — enabling an extension nothing declares against is D1's call
-- (supabase/config.toml [db] / extension sections), not a schema-file
-- decision. If D1 lands a different mechanism for declaring installed
-- extensions, this file should be reconciled with it, not run alongside it.
--
-- Order matches [db.migrations] schema_paths: this file is first because
-- shared/03_types.sql and every *_tables.sql file below use these types and
-- functions in column definitions (e.g. "public"."citext", "gen_random_uuid()").
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
-- index_advisor requires hypopg to already be installed.
CREATE EXTENSION IF NOT EXISTS "hypopg" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "index_advisor" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";
-- pgmq's own schema must exist before "WITH SCHEMA" can target it; it is
-- also created (idempotently) in shared/02_schemas.sql for documentation
-- symmetry with every other schema, but must be created here first because
-- this file runs before that one.
CREATE SCHEMA IF NOT EXISTS "pgmq";
CREATE EXTENSION IF NOT EXISTS "pgmq" WITH SCHEMA "pgmq";
