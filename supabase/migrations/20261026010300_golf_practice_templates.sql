-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0.
-- WHY: Session, block and week templates. A template never carries people: no
--   players, no coaches, no own-work lines, no pairing players, no qualifier
--   link.
-- WHO: Coaches of the team only (public.is_golf_team_coach), all four
--   commands. Players have no access. The six starters are code constants, not
--   rows.
-- ORDER: After 20261026010000.
-- RISK: New table only. No triggers.
-- ROLLBACK: DROP TABLE IF EXISTS public.golf_practice_templates CASCADE;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace =
-- VERIFY: 'public'::regnamespace AND relname = 'golf_practice_templates' AND
-- VERIFY: relrowsecurity;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND
-- VERIFY: tablename = 'golf_practice_templates' HAVING count(*) = 4;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid =
-- VERIFY: 'public.golf_practice_templates'::regclass AND conname =
-- VERIFY: 'golf_practice_templates_no_people' AND convalidated;
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('authenticated',
-- VERIFY: 'public.golf_practice_templates', 'TRUNCATE') AND NOT
-- VERIFY: has_table_privilege('authenticated',
-- VERIFY: 'public.golf_practice_templates', 'TRIGGER') AND NOT
-- VERIFY: has_table_privilege('anon', 'public.golf_practice_templates',
-- VERIFY: 'SELECT');

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.golf_practice_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid NOT NULL REFERENCES public.golf_teams (id) ON DELETE CASCADE,
    kind text NOT NULL,
    name text NOT NULL,
    body jsonb NOT NULL,
    -- squawk-ignore prefer-bigint-over-int
    minutes integer,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT golf_practice_templates_kind_check CHECK (
        kind IN ('session', 'block', 'week')
    ),
    CONSTRAINT golf_practice_templates_name_length CHECK (
        char_length(btrim(name)) BETWEEN 1 AND 60
    ),
    CONSTRAINT golf_practice_templates_minutes CHECK (
        (kind = 'week') = (minutes IS NULL)
        AND (minutes IS NULL OR minutes BETWEEN 5 AND 360)
    ),
    CONSTRAINT golf_practice_templates_body_object CHECK (
        jsonb_typeof(body) = 'object' AND body ->> 'v' = '2'
    ),
    CONSTRAINT golf_practice_templates_body_size CHECK (
        octet_length(body::text) <= 131072
    ),
    CONSTRAINT golf_practice_templates_no_people CHECK (
        NOT jsonb_path_exists(body, 'lax $.players[*]')
        AND NOT jsonb_path_exists(body, 'lax $.groups[*].players[*]')
        AND NOT jsonb_path_exists(
            body, 'lax $.**.coach ? (@.type() == "string")'
        )
        AND NOT jsonb_path_exists(body, 'lax $.**.lines.*')
        AND NOT jsonb_path_exists(body, 'lax $.**.pairings[*].players[*]')
        AND NOT jsonb_path_exists(
            body, 'lax $.**.qualifierId ? (@.type() == "string")'
        )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_practice_templates_team_kind_name_uniq
ON public.golf_practice_templates (team_id, kind, lower(btrim(name)));

ALTER TABLE public.golf_practice_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_practice_templates_select
ON public.golf_practice_templates;
CREATE POLICY golf_practice_templates_select ON public.golf_practice_templates
FOR SELECT TO authenticated USING (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_practice_templates_insert
ON public.golf_practice_templates;
CREATE POLICY golf_practice_templates_insert ON public.golf_practice_templates
FOR INSERT TO authenticated
WITH CHECK (
    public.is_golf_team_coach(team_id) AND created_by = (SELECT auth.uid())
);

DROP POLICY IF EXISTS golf_practice_templates_update
ON public.golf_practice_templates;
CREATE POLICY golf_practice_templates_update ON public.golf_practice_templates
FOR UPDATE TO authenticated
USING (public.is_golf_team_coach(team_id))
WITH CHECK (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_practice_templates_delete
ON public.golf_practice_templates;
CREATE POLICY golf_practice_templates_delete ON public.golf_practice_templates
FOR DELETE TO authenticated USING (public.is_golf_team_coach(team_id));

REVOKE ALL ON public.golf_practice_templates FROM anon;
REVOKE ALL ON public.golf_practice_templates FROM authenticated;
GRANT SELECT,
INSERT,
UPDATE,
DELETE ON public.golf_practice_templates TO authenticated;
GRANT ALL ON public.golf_practice_templates TO service_role;
