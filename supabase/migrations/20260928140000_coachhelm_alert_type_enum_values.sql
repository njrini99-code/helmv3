-- CoachHelm in-app receipts get their own notification_type per category.
--
-- dispatch.ts (src/lib/coachhelm/v3/notifications/dispatch.ts) has stamped
-- every CoachHelm receipt `dev_plan_assigned`, the closest enum value that
-- existed, and carried the real category in data.coachhelm_category. Anything
-- that reads notifications.type therefore labels every CoachHelm receipt as a
-- development-plan assignment.
--
-- notifications.type is the enum public.notification_type (no CHECK
-- constraint), so a new value needs ALTER TYPE. This migration only adds the
-- values. Nothing here uses them: Postgres forbids using a value added by
-- ALTER TYPE ... ADD VALUE in the same transaction. dispatch.ts keeps writing
-- dev_plan_assigned until COACHHELM_PER_CATEGORY_IN_APP_TYPES is flipped in a
-- follow-up, after this migration is applied and `npm run db:types` is rerun.
--
-- Forward-only and additive. Existing rows keep dev_plan_assigned, and every
-- reader classifies CoachHelm rows by data.coachhelm_category first, so legacy
-- rows stay readable.

ALTER TYPE public.notification_type
ADD VALUE IF NOT EXISTS 'coachhelm_round_review_ready'
AFTER 'team_join_rejected';
ALTER TYPE public.notification_type
ADD VALUE IF NOT EXISTS 'coachhelm_coach_assigned_goal'
AFTER 'coachhelm_round_review_ready';
ALTER TYPE public.notification_type
ADD VALUE IF NOT EXISTS 'coachhelm_goal_achieved'
AFTER 'coachhelm_coach_assigned_goal';
ALTER TYPE public.notification_type
ADD VALUE IF NOT EXISTS 'coachhelm_goal_missed'
AFTER 'coachhelm_goal_achieved';
ALTER TYPE public.notification_type
ADD VALUE IF NOT EXISTS 'coachhelm_new_insight'
AFTER 'coachhelm_goal_missed';
ALTER TYPE public.notification_type
ADD VALUE IF NOT EXISTS 'coachhelm_composite_insight'
AFTER 'coachhelm_new_insight';
ALTER TYPE public.notification_type
ADD VALUE IF NOT EXISTS 'coachhelm_weekly_digest'
AFTER 'coachhelm_composite_insight';
ALTER TYPE public.notification_type
ADD VALUE IF NOT EXISTS 'coachhelm_coach_commented'
AFTER 'coachhelm_weekly_digest';
ALTER TYPE public.notification_type
ADD VALUE IF NOT EXISTS 'coachhelm_engine_suggested_goal'
AFTER 'coachhelm_coach_commented';
ALTER TYPE public.notification_type
ADD VALUE IF NOT EXISTS 'coachhelm_standing_percentile_changed'
AFTER 'coachhelm_engine_suggested_goal';
