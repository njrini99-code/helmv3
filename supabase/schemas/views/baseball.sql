CREATE OR REPLACE VIEW "public"."baseball_coaches_public" WITH ("security_invoker"='false') AS
 SELECT "id",
    "user_id",
    "organization_id",
    "coach_type",
    "full_name",
    "avatar_url",
    "title"
   FROM "public"."baseball_coaches";

ALTER VIEW "public"."baseball_coaches_public" OWNER TO "postgres";

COMMENT ON VIEW "public"."baseball_coaches_public" IS 'Non-PII coach identity (id, user_id, organization_id, coach_type, full_name, avatar_url, title) — NO email/phone. Read by messaging + cross-org display; the base-table baseball_coaches keeps email/phone behind a teammate-scoped RLS policy (Tier C). Never grant to anon.';

CREATE OR REPLACE VIEW "public"."baseball_team_coach_staff_public" WITH ("security_invoker"='false') AS
 SELECT "s"."team_id",
    "s"."coach_id",
    "s"."is_primary",
    "s"."role",
    "c"."full_name",
    "c"."avatar_url"
   FROM ("public"."baseball_team_coach_staff" "s"
     JOIN "public"."baseball_coaches" "c" ON (("c"."id" = "s"."coach_id")))
  WHERE (("s"."visible_to_players" = true) AND ("s"."status" = 'active'::"text"));

ALTER VIEW "public"."baseball_team_coach_staff_public" OWNER TO "postgres";

COMMENT ON VIEW "public"."baseball_team_coach_staff_public" IS 'Anon-readable public coaching-staff identity per team (team_id, coach_id, is_primary, role, full_name, avatar_url). No email/phone/bio. Excludes rows where the staff member opted out (visible_to_players = false) or is not active (status <> ''active'') — fixed 2026-07-09, previously exposed every row unconditionally. Base tables public.baseball_team_coach_staff and public.baseball_coaches stay authenticated-only via RLS; anon reads go through this view only.';

CREATE OR REPLACE VIEW "public"."baseball_teams_public_profile" WITH ("security_invoker"='false') AS
 SELECT "id",
    "organization_id",
    "name",
    "team_type",
    "logo_url",
    "description"
   FROM "public"."baseball_teams"
  WHERE ("public_profile_mode" <> 'private'::"text");

ALTER VIEW "public"."baseball_teams_public_profile" OWNER TO "postgres";

COMMENT ON VIEW "public"."baseball_teams_public_profile" IS 'Anon-readable public team identity for the public team/program profile pages (id, organization_id, name, team_type, logo_url, description). Excludes join_code (invite secret), created_by, and (fixed 2026-07-09) any team with public_profile_mode = ''private''. Intentionally still returns ''unlisted'' teams: this view backs direct-by-id share-link lookups in src/app/baseball/(public)/team|program/[id]/page.tsx, not a generic listing — no such listing exists in src/ today. ''unlisted'' rows must never be exposed through a future directory/search caller; that caller must additionally filter to public_profile_mode = ''public'' at the call site. Base table public.baseball_teams stays authenticated-only via RLS; anon reads go through this view only.';
