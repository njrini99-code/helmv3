-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0.
-- WHY: Practice plans as their own tab: the plan with its draft body (coaches only), frozen published versions (what players read), private own-work lines per version, and which version each player opened (Seen by).
-- WHO: Coaches of the team (public.is_golf_team_coach) read all four tables and delete plans. Players of the team (public.is_golf_team_player) read only the live version of an event plan, the live version of their own make-up, and their own lines in a live version. No INSERT or UPDATE grant to authenticated on any of the four: writes go through SECURITY DEFINER functions (010500, 010600, 010800).
-- ORDER: First of 20261026010000..20261026010800. Needs public.is_golf_team_coach and public.is_golf_team_player (functions/public.sql:6964, :7000) and public.golf_messages.
-- RISK: New tables only. No change to golf_events, golf_rounds, golf_holes or golf_shots. No triggers.
-- ROLLBACK: (roll back 010800, 010700, 010600, 010500 and 010400 first, newest first) DROP TABLE IF EXISTS public.golf_practice_plan_opens, public.golf_practice_plan_lines, public.golf_practice_plan_versions, public.golf_practice_plans CASCADE;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('golf_practice_plans', 'golf_practice_plan_versions', 'golf_practice_plan_lines', 'golf_practice_plan_opens') AND relrowsecurity HAVING count(*) = 4;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename IN ('golf_practice_plans', 'golf_practice_plan_versions', 'golf_practice_plan_lines', 'golf_practice_plan_opens') HAVING count(*) = 5;
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('authenticated', 'public.golf_practice_plans', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.golf_practice_plans', 'UPDATE') AND NOT has_table_privilege('authenticated', 'public.golf_practice_plan_versions', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.golf_practice_plan_versions', 'UPDATE') AND NOT has_table_privilege('authenticated', 'public.golf_practice_plan_lines', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.golf_practice_plan_opens', 'INSERT');
-- VERIFY: SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname IN ('golf_practice_plans_event_uniq', 'golf_practice_plan_versions_live_uniq') HAVING count(*) = 2;

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.golf_practice_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'event',
  event_id uuid REFERENCES public.golf_events(id) ON DELETE CASCADE,
  for_player_id uuid REFERENCES public.golf_players(id) ON DELETE CASCADE,
  source_plan_id uuid REFERENCES public.golf_practice_plans(id) ON DELETE SET NULL,
  due_on date,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  step text NOT NULL DEFAULT 'blocks',
  active_variant text NOT NULL DEFAULT 'main',
  body jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  edited_after_publish boolean NOT NULL DEFAULT false,
  published_version integer,
  published_at timestamptz,
  first_published_at timestamptz,
  taken_down_at timestamptz,
  chat_message_id uuid REFERENCES public.golf_messages(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_practice_plans_kind_check CHECK (kind IN ('event', 'makeup')),
  CONSTRAINT golf_practice_plans_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT golf_practice_plans_step_check CHECK (step IN ('blocks', 'groups', 'drills', 'review')),
  CONSTRAINT golf_practice_plans_variant_check CHECK (active_variant IN ('main', 'rain')),
  CONSTRAINT golf_practice_plans_kind_shape CHECK (
    (kind = 'event' AND event_id IS NOT NULL AND for_player_id IS NULL AND due_on IS NULL AND completed_at IS NULL)
    OR (kind = 'makeup' AND event_id IS NULL AND for_player_id IS NOT NULL AND due_on IS NOT NULL AND chat_message_id IS NULL)
  ),
  CONSTRAINT golf_practice_plans_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  CONSTRAINT golf_practice_plans_published_shape CHECK (status <> 'published' OR (published_version IS NOT NULL AND published_at IS NOT NULL)),
  CONSTRAINT golf_practice_plans_first_published CHECK ((published_version IS NULL) = (first_published_at IS NULL)),
  CONSTRAINT golf_practice_plans_body_object CHECK (jsonb_typeof(body) = 'object'),
  CONSTRAINT golf_practice_plans_body_size CHECK (octet_length(body::text) <= 196608),
  CONSTRAINT golf_practice_plans_version_positive CHECK (version >= 1 AND (published_version IS NULL OR published_version >= 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_practice_plans_event_uniq
  ON public.golf_practice_plans (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS golf_practice_plans_team_kind_idx
  ON public.golf_practice_plans (team_id, kind, status);
CREATE INDEX IF NOT EXISTS golf_practice_plans_player_idx
  ON public.golf_practice_plans (for_player_id) WHERE for_player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS golf_practice_plans_source_idx
  ON public.golf_practice_plans (source_plan_id) WHERE source_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS golf_practice_plans_chat_idx
  ON public.golf_practice_plans (chat_message_id) WHERE chat_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.golf_practice_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.golf_practice_plans(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  kind text NOT NULL,
  event_id uuid REFERENCES public.golf_events(id) ON DELETE CASCADE,
  for_player_id uuid REFERENCES public.golf_players(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  body jsonb NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  notified boolean NOT NULL DEFAULT true,
  is_live boolean NOT NULL DEFAULT false,
  published_by uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_practice_plan_versions_kind_check CHECK (kind IN ('event', 'makeup')),
  CONSTRAINT golf_practice_plan_versions_version_positive CHECK (version >= 1),
  CONSTRAINT golf_practice_plan_versions_body_object CHECK (jsonb_typeof(body) = 'object'),
  CONSTRAINT golf_practice_plan_versions_body_size CHECK (octet_length(body::text) <= 262144),
  CONSTRAINT golf_practice_plan_versions_changes_array CHECK (jsonb_typeof(changes) = 'array'),
  CONSTRAINT golf_practice_plan_versions_plan_version_uniq UNIQUE (plan_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_practice_plan_versions_live_uniq
  ON public.golf_practice_plan_versions (plan_id) WHERE is_live;
CREATE INDEX IF NOT EXISTS golf_practice_plan_versions_team_live_idx
  ON public.golf_practice_plan_versions (team_id) WHERE is_live;
CREATE INDEX IF NOT EXISTS golf_practice_plan_versions_event_idx
  ON public.golf_practice_plan_versions (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS golf_practice_plan_versions_player_idx
  ON public.golf_practice_plan_versions (for_player_id) WHERE for_player_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.golf_practice_plan_lines (
  plan_id uuid NOT NULL,
  version integer NOT NULL,
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  block_id text NOT NULL,
  line text NOT NULL,
  CONSTRAINT golf_practice_plan_lines_pkey PRIMARY KEY (plan_id, version, player_id, block_id),
  CONSTRAINT golf_practice_plan_lines_version_fk FOREIGN KEY (plan_id, version)
    REFERENCES public.golf_practice_plan_versions (plan_id, version) ON DELETE CASCADE,
  CONSTRAINT golf_practice_plan_lines_line_length CHECK (char_length(btrim(line)) BETWEEN 1 AND 140),
  CONSTRAINT golf_practice_plan_lines_block_length CHECK (char_length(block_id) BETWEEN 1 AND 64)
);
CREATE INDEX IF NOT EXISTS golf_practice_plan_lines_player_idx
  ON public.golf_practice_plan_lines (player_id);

CREATE TABLE IF NOT EXISTS public.golf_practice_plan_opens (
  plan_id uuid NOT NULL REFERENCES public.golf_practice_plans(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  version integer NOT NULL,
  first_opened_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_practice_plan_opens_pkey PRIMARY KEY (plan_id, player_id),
  CONSTRAINT golf_practice_plan_opens_version_positive CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS golf_practice_plan_opens_team_idx
  ON public.golf_practice_plan_opens (team_id);

ALTER TABLE public.golf_practice_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_practice_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_practice_plan_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_practice_plan_opens ENABLE ROW LEVEL SECURITY;

-- Plans hold the draft: coaches only. Players never read this table (they read versions).
DROP POLICY IF EXISTS golf_practice_plans_select ON public.golf_practice_plans;
CREATE POLICY golf_practice_plans_select ON public.golf_practice_plans
  FOR SELECT TO authenticated
  USING (public.is_golf_team_coach(team_id));

-- Any coach of the team may delete, the creator included.
DROP POLICY IF EXISTS golf_practice_plans_delete ON public.golf_practice_plans;
CREATE POLICY golf_practice_plans_delete ON public.golf_practice_plans
  FOR DELETE TO authenticated
  USING (public.is_golf_team_coach(team_id));

-- Versions: coaches read all; a player reads only the live version, of an event plan on their team or of their own make-up.
DROP POLICY IF EXISTS golf_practice_plan_versions_select ON public.golf_practice_plan_versions;
CREATE POLICY golf_practice_plan_versions_select ON public.golf_practice_plan_versions
  FOR SELECT TO authenticated
  USING (
    public.is_golf_team_coach(team_id)
    OR (is_live AND kind = 'event' AND public.is_golf_team_player(team_id))
    OR (
      is_live AND kind = 'makeup' AND public.is_golf_team_player(team_id)
      AND EXISTS (
        SELECT 1 FROM public.golf_players gp
        WHERE gp.id = golf_practice_plan_versions.for_player_id AND gp.user_id = (SELECT auth.uid())
      )
    )
  );

-- Own-work lines: coaches read all; a player reads only their own, and only in a live version.
DROP POLICY IF EXISTS golf_practice_plan_lines_select ON public.golf_practice_plan_lines;
CREATE POLICY golf_practice_plan_lines_select ON public.golf_practice_plan_lines
  FOR SELECT TO authenticated
  USING (
    public.is_golf_team_coach(team_id)
    OR (
      public.is_golf_team_player(team_id)
      AND EXISTS (
        SELECT 1 FROM public.golf_players gp
        WHERE gp.id = golf_practice_plan_lines.player_id AND gp.user_id = (SELECT auth.uid())
      )
      AND EXISTS (
        SELECT 1 FROM public.golf_practice_plan_versions v
        WHERE v.plan_id = golf_practice_plan_lines.plan_id AND v.version = golf_practice_plan_lines.version AND v.is_live
      )
    )
  );

-- Opens (Seen by): coaches only.
DROP POLICY IF EXISTS golf_practice_plan_opens_select ON public.golf_practice_plan_opens;
CREATE POLICY golf_practice_plan_opens_select ON public.golf_practice_plan_opens
  FOR SELECT TO authenticated
  USING (public.is_golf_team_coach(team_id));

REVOKE ALL ON public.golf_practice_plans FROM anon;
REVOKE ALL ON public.golf_practice_plans FROM authenticated;
REVOKE ALL ON public.golf_practice_plan_versions FROM anon;
REVOKE ALL ON public.golf_practice_plan_versions FROM authenticated;
REVOKE ALL ON public.golf_practice_plan_lines FROM anon;
REVOKE ALL ON public.golf_practice_plan_lines FROM authenticated;
REVOKE ALL ON public.golf_practice_plan_opens FROM anon;
REVOKE ALL ON public.golf_practice_plan_opens FROM authenticated;
GRANT SELECT, DELETE ON public.golf_practice_plans TO authenticated;
GRANT SELECT ON public.golf_practice_plan_versions TO authenticated;
GRANT SELECT ON public.golf_practice_plan_lines TO authenticated;
GRANT SELECT ON public.golf_practice_plan_opens TO authenticated;
GRANT ALL ON public.golf_practice_plans TO service_role;
GRANT ALL ON public.golf_practice_plan_versions TO service_role;
GRANT ALL ON public.golf_practice_plan_lines TO service_role;
GRANT ALL ON public.golf_practice_plan_opens TO service_role;
