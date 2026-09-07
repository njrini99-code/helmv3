CREATE SCHEMA IF NOT EXISTS "extensions";

ALTER SCHEMA "extensions" OWNER TO "postgres";

CREATE SCHEMA IF NOT EXISTS "helm_debug";

ALTER SCHEMA "helm_debug" OWNER TO "postgres";

CREATE SCHEMA IF NOT EXISTS "helm_private";

ALTER SCHEMA "helm_private" OWNER TO "postgres";

CREATE SCHEMA IF NOT EXISTS "public";

ALTER SCHEMA "public" OWNER TO "pg_database_owner";

COMMENT ON SCHEMA "public" IS 'standard public schema';

CREATE SCHEMA IF NOT EXISTS "archive";

ALTER SCHEMA "archive" OWNER TO "postgres";

CREATE SCHEMA IF NOT EXISTS "graveyard";

ALTER SCHEMA "graveyard" OWNER TO "postgres";

CREATE SCHEMA IF NOT EXISTS "pgmq";

ALTER SCHEMA "pgmq" OWNER TO "postgres";
