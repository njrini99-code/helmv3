CREATE TYPE "public"."admin_event_severity" AS ENUM (
    'info',
    'warning',
    'error',
    'critical'
);

ALTER TYPE "public"."admin_event_severity" OWNER TO "postgres";

CREATE TYPE "public"."coach_status" AS ENUM (
    'new_lead',
    'contacted',
    'engaged',
    'proposal',
    'won',
    'lost',
    'nurture'
);

ALTER TYPE "public"."coach_status" OWNER TO "postgres";

CREATE TYPE "public"."contact_type" AS ENUM (
    'email',
    'call',
    'demo',
    'meeting',
    'note'
);

ALTER TYPE "public"."contact_type" OWNER TO "postgres";

CREATE TYPE "public"."crm_event_type" AS ENUM (
    'demo',
    'follow_up',
    'call',
    'meeting',
    'email_reminder',
    'other'
);

ALTER TYPE "public"."crm_event_type" OWNER TO "postgres";

CREATE TYPE "public"."email_status" AS ENUM (
    'valid',
    'bounced',
    'complained',
    'unknown',
    'unsubscribed'
);

ALTER TYPE "public"."email_status" OWNER TO "postgres";

CREATE TYPE "public"."ncaa_division" AS ENUM (
    'D2',
    'D3',
    'D1',
    'NAIA',
    'JUCO',
    'JUCO_D1',
    'JUCO_D2',
    'JUCO_D3',
    'CCCAA'
);

ALTER TYPE "public"."ncaa_division" OWNER TO "postgres";

CREATE TYPE "public"."notification_type" AS ENUM (
    'profile_view',
    'watchlist_add',
    'video_view',
    'message',
    'team_invite',
    'team_join_request',
    'team_join_approved',
    'event_reminder',
    'dev_plan_assigned',
    'team_join',
    'team_join_rejected'
);

ALTER TYPE "public"."notification_type" OWNER TO "postgres";

CREATE TYPE "public"."organization_type" AS ENUM (
    'college',
    'juco',
    'high_school',
    'showcase'
);

ALTER TYPE "public"."organization_type" OWNER TO "postgres";

CREATE TYPE "public"."program_type" AS ENUM (
    'mens',
    'womens',
    'both'
);

ALTER TYPE "public"."program_type" OWNER TO "postgres";

CREATE TYPE "public"."reminder_type" AS ENUM (
    'in_app',
    'email',
    'push',
    'all'
);

ALTER TYPE "public"."reminder_type" OWNER TO "postgres";

CREATE TYPE "public"."team_member_status" AS ENUM (
    'pending',
    'active',
    'inactive',
    'removed'
);

ALTER TYPE "public"."team_member_status" OWNER TO "postgres";

CREATE TYPE "public"."user_role" AS ENUM (
    'coach',
    'player',
    'admin'
);

ALTER TYPE "public"."user_role" OWNER TO "postgres";
