-- Minimal existing-schema fixture for isolated PostgreSQL contract testing.
-- Authorization predicates mirror the round reader/owner split; no production rows.
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TABLE public.golf_players(id uuid PRIMARY KEY, user_id uuid NOT NULL);
CREATE TABLE public.golf_rounds(id uuid PRIMARY KEY, player_id uuid REFERENCES public.golf_players,
 course_id uuid, tee_id uuid, draft_data jsonb, holes_played integer, notes text, course_rating numeric, course_slope integer);
CREATE TABLE public.golf_holes(id uuid PRIMARY KEY, round_id uuid REFERENCES public.golf_rounds,
 hole_number integer, par integer, yardage integer);
CREATE TABLE public.golf_shot_anchors(id uuid PRIMARY KEY, round_id uuid, geometry_version text, course_id text, site_id text);
CREATE TABLE public.golf_round_course_bindings(round_id uuid PRIMARY KEY REFERENCES public.golf_rounds,
 course_id text NOT NULL, site_id text NOT NULL, geometry_version text NOT NULL, terrain_version text,
 one_tap_mode boolean NOT NULL DEFAULT false, schema_version smallint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.golf_round_course_bindings ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION public.owns_golf_round(p_round_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS
$$ SELECT EXISTS(SELECT 1 FROM public.golf_rounds r JOIN public.golf_players p ON p.id=r.player_id
 WHERE r.id=p_round_id AND p.user_id=auth.uid()) $$;
CREATE FUNCTION public.can_read_golf_round(p_round_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS
$$ SELECT public.owns_golf_round(p_round_id) OR auth.uid()='33333333-3333-4333-8333-333333333333'::uuid $$;
CREATE POLICY golf_round_course_bindings_select ON public.golf_round_course_bindings FOR SELECT TO authenticated USING(public.can_read_golf_round(round_id));
CREATE POLICY golf_round_course_bindings_insert ON public.golf_round_course_bindings FOR INSERT TO authenticated WITH CHECK(public.owns_golf_round(round_id));
CREATE POLICY golf_round_course_bindings_update ON public.golf_round_course_bindings FOR UPDATE TO authenticated USING(public.owns_golf_round(round_id)) WITH CHECK(public.owns_golf_round(round_id));
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE ON public.golf_round_course_bindings TO authenticated;
INSERT INTO public.golf_players VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');
INSERT INTO public.golf_rounds(id,player_id,course_id,tee_id,draft_data) VALUES
 ('aaaaaaaa-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc','dddddddd-dddd-4ddd-8ddd-dddddddddddd','{"holes":[{"number":2,"par":5,"yardage":500},{"number":1,"par":4,"yardage":400}]}'),
 ('bbbbbbbb-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',null,null,null),
 ('aaaaaaaa-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',null,null,null);
INSERT INTO public.golf_holes VALUES('aaaaaaaa-3333-4333-8333-333333333333','aaaaaaaa-1111-4111-8111-111111111111',1,4,410);
INSERT INTO public.golf_round_course_bindings(round_id,course_id,site_id,geometry_version)
 VALUES('aaaaaaaa-2222-4222-8222-222222222222','upper','site','legacy');
