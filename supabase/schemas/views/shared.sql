CREATE MATERIALIZED VIEW "public"."crm_coach_engagement" AS
 WITH "windowed" AS (
         SELECT "cl"."coach_id",
            "ee"."event_type",
            "ee"."occurred_at",
            "exp"(((- EXTRACT(epoch FROM ("now"() - "ee"."occurred_at"))) / ((14)::numeric * 86400.0))) AS "decay"
           FROM ("public"."email_events" "ee"
             JOIN "public"."crm_contact_log" "cl" ON (("cl"."id" = "ee"."contact_log_id")))
          WHERE ("ee"."occurred_at" > ("now"() - '90 days'::interval))
        ), "agg" AS (
         SELECT "windowed"."coach_id",
            COALESCE("sum"("windowed"."decay") FILTER (WHERE ("windowed"."event_type" = 'email.opened'::"text")), (0)::numeric) AS "open_score",
            "count"(*) FILTER (WHERE ("windowed"."event_type" = 'email.opened'::"text")) AS "opens_90d",
            "count"(*) FILTER (WHERE ("windowed"."event_type" = 'email.clicked'::"text")) AS "clicks_90d",
            "max"("windowed"."occurred_at") AS "last_event_at"
           FROM "windowed"
          GROUP BY "windowed"."coach_id"
        ), "replies" AS (
         SELECT "crm_replies"."coach_id",
            "count"(*) AS "replied_90d",
            "max"("crm_replies"."received_at") AS "last_reply_at"
           FROM "public"."crm_replies"
          WHERE (("crm_replies"."coach_id" IS NOT NULL) AND ("crm_replies"."received_at" > ("now"() - '90 days'::interval)))
          GROUP BY "crm_replies"."coach_id"
        )
 SELECT "c"."id" AS "coach_id",
    COALESCE("a"."opens_90d", (0)::bigint) AS "opens_90d",
    COALESCE("a"."clicks_90d", (0)::bigint) AS "clicks_90d",
    COALESCE("r"."replied_90d", (0)::bigint) AS "replied_90d",
    GREATEST("a"."last_event_at", "r"."last_reply_at") AS "last_event_at",
    (LEAST((100)::numeric, GREATEST((0)::numeric, ("round"((COALESCE("a"."open_score", (0)::numeric) * (10)::numeric)) + (
        CASE
            WHEN (COALESCE("r"."replied_90d", (0)::bigint) > 0) THEN 50
            ELSE 0
        END)::numeric))))::integer AS "score",
        CASE
            WHEN (COALESCE("r"."replied_90d", (0)::bigint) > 0) THEN 'hot'::"text"
            WHEN (COALESCE("a"."open_score", (0)::numeric) > (1)::numeric) THEN 'warm'::"text"
            ELSE 'cold'::"text"
        END AS "temperature"
   FROM (("public"."crm_coaches" "c"
     LEFT JOIN "agg" "a" ON (("a"."coach_id" = "c"."id")))
     LEFT JOIN "replies" "r" ON (("r"."coach_id" = "c"."id")))
  WHERE ("c"."is_archived" = false)
  WITH NO DATA;

ALTER MATERIALIZED VIEW "public"."crm_coach_engagement" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."crm_email_events" WITH ("security_invoker"='true') AS
 SELECT "id",
    "contact_log_id",
    "resend_message_id",
    "event_type",
    "recipient_email",
    "occurred_at",
    "raw_payload",
    "created_at"
   FROM "public"."email_events";

ALTER VIEW "public"."crm_email_events" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."organizations_public_profile" WITH ("security_invoker"='false') AS
 SELECT "id",
    "name",
    "type",
    "logo_url",
    "description",
    "division",
    "conference",
    "website_url",
    "location_city",
    "location_state"
   FROM "public"."organizations";

ALTER VIEW "public"."organizations_public_profile" OWNER TO "postgres";

COMMENT ON VIEW "public"."organizations_public_profile" IS 'Anon-readable public org identity for the public team/program profile pages (id, name, type, logo_url, description, division, conference, website_url, location_city, location_state). No PII. Base table public.organizations stays authenticated-only via RLS; anon reads go through this view only.';

CREATE OR REPLACE VIEW "public"."v_crm_coach_activity" WITH ("security_invoker"='true') AS
 SELECT "l"."coach_id",
    'outbound_email'::"text" AS "signal",
    ("l"."contact_type")::"text" AS "detail",
    "l"."created_at" AS "occurred_at",
    1 AS "weight",
    "l"."subject" AS "context"
   FROM "public"."crm_contact_log" "l"
  WHERE ("l"."coach_id" IS NOT NULL)
UNION ALL
 SELECT COALESCE("cl"."coach_id", "c"."id") AS "coach_id",
    ('email_'::"text" || "replace"("ev"."event_type", 'email.'::"text", ''::"text")) AS "signal",
    "ev"."event_type" AS "detail",
    "ev"."occurred_at",
        CASE "ev"."event_type"
            WHEN 'email.clicked'::"text" THEN 2
            WHEN 'email.opened'::"text" THEN 2
            WHEN 'email.bounced'::"text" THEN 0
            ELSE 1
        END AS "weight",
    "ev"."recipient_email" AS "context"
   FROM (("public"."email_events" "ev"
     LEFT JOIN "public"."crm_contact_log" "cl" ON (("cl"."id" = "ev"."contact_log_id")))
     LEFT JOIN "public"."crm_coaches" "c" ON (("lower"("c"."email") = "lower"("ev"."recipient_email"))))
  WHERE (COALESCE("cl"."coach_id", "c"."id") IS NOT NULL)
UNION ALL
 SELECT COALESCE("s"."crm_coach_id", "c"."id") AS "coach_id",
    'demo_entered'::"text" AS "signal",
    'demo_session'::"text" AS "detail",
    "s"."entered_at" AS "occurred_at",
    10 AS "weight",
    "s"."school" AS "context"
   FROM ("public"."golf_demo_sessions" "s"
     LEFT JOIN "public"."crm_coaches" "c" ON (("lower"("c"."email") = "lower"("s"."email"))))
  WHERE (COALESCE("s"."crm_coach_id", "c"."id") IS NOT NULL)
UNION ALL
 SELECT "r"."coach_id",
    'reply_received'::"text" AS "signal",
    'inbound_reply'::"text" AS "detail",
    "r"."received_at" AS "occurred_at",
    20 AS "weight",
    "r"."subject" AS "context"
   FROM "public"."crm_replies" "r"
  WHERE ("r"."coach_id" IS NOT NULL)
UNION ALL
 SELECT "t"."coach_id",
    'stage_change'::"text" AS "signal",
    "t"."to_status" AS "detail",
    "t"."changed_at" AS "occurred_at",
    3 AS "weight",
    "t"."from_status" AS "context"
   FROM "public"."crm_stage_transitions" "t"
  WHERE ("t"."coach_id" IS NOT NULL)
UNION ALL
 SELECT "n"."coach_id",
    'note'::"text" AS "signal",
    COALESCE("n"."kind", 'note'::"text") AS "detail",
    "n"."created_at" AS "occurred_at",
    1 AS "weight",
    "left"("n"."body", 120) AS "context"
   FROM "public"."crm_notes" "n"
  WHERE ("n"."coach_id" IS NOT NULL);

ALTER VIEW "public"."v_crm_coach_activity" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."v_crm_coach_signal_summary" WITH ("security_invoker"='true') AS
 SELECT "c"."id" AS "coach_id",
    "c"."name",
    "c"."school",
    "c"."email",
    ("c"."status")::"text" AS "stage",
    ("c"."email_status")::"text" AS "email_status",
    "count"(*) FILTER (WHERE ("a"."signal" = 'outbound_email'::"text")) AS "touches",
    "count"(*) FILTER (WHERE ("a"."signal" = 'email_delivered'::"text")) AS "delivered",
    "count"(*) FILTER (WHERE ("a"."signal" = 'email_opened'::"text")) AS "opens",
    "count"(*) FILTER (WHERE ("a"."signal" = 'demo_entered'::"text")) AS "demo_visits",
    "count"(*) FILTER (WHERE ("a"."signal" = 'reply_received'::"text")) AS "replies",
    "count"(*) FILTER (WHERE ("a"."signal" = 'email_bounced'::"text")) AS "bounces",
    "max"("a"."occurred_at") FILTER (WHERE ("a"."signal" = ANY (ARRAY['demo_entered'::"text", 'reply_received'::"text", 'email_opened'::"text"]))) AS "last_intent_at",
    "max"("a"."occurred_at") AS "last_any_signal_at",
    COALESCE("sum"("a"."weight") FILTER (WHERE ("a"."signal" = ANY (ARRAY['demo_entered'::"text", 'reply_received'::"text", 'email_opened'::"text"]))), (0)::bigint) AS "intent_score"
   FROM ("public"."crm_coaches" "c"
     LEFT JOIN "public"."v_crm_coach_activity" "a" ON (("a"."coach_id" = "c"."id")))
  GROUP BY "c"."id", "c"."name", "c"."school", "c"."email", "c"."status", "c"."email_status";

ALTER VIEW "public"."v_crm_coach_signal_summary" OWNER TO "postgres";

CREATE OR REPLACE VIEW "public"."v_crm_coaches_by_school" WITH ("security_invoker"='true') AS
 SELECT "division",
    "school",
    "conference",
    "program",
    "role_level",
    "is_primary_contact",
    "name",
    "title",
    "email",
    "phone",
    "status",
    "email_status",
    "is_starred",
    "priority",
    "count"(*) OVER (PARTITION BY "school", "division") AS "coaches_at_school",
    "id"
   FROM "public"."crm_coaches"
  WHERE ("is_archived" IS NOT TRUE)
  ORDER BY "division", "school", "program", "is_primary_contact" DESC,
        CASE "role_level"
            WHEN 'head_coach'::"text" THEN 0
            WHEN 'director'::"text" THEN 1
            WHEN 'associate_head_coach'::"text" THEN 2
            WHEN 'unknown'::"text" THEN 3
            WHEN 'other'::"text" THEN 4
            WHEN 'volunteer'::"text" THEN 5
            WHEN 'assistant_coach'::"text" THEN 6
            ELSE 7
        END, "name";

ALTER VIEW "public"."v_crm_coaches_by_school" OWNER TO "postgres";
