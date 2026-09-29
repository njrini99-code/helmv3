/**
 * v3 CoachHelm category notifiers (audit row 53).
 * ----------------------------------------------------------------------------
 * `dispatchCoachHelmNotification` routes ten categories, but only `new_insight`
 * and `goal_achieved` ever had a caller, so the other eight preference toggles
 * governed nothing. One helper per category here, called from where the event
 * already happens. Each helper:
 *   - composes category copy with no numbers from the data except a count the
 *     caller passes explicitly (the same rule insight-notifier.ts follows);
 *   - uses the CATEGORY as the throttle key, so the dispatcher's one-per-
 *     (player, key)-per-UTC-day throttle caps every category at one a day;
 *   - carries the entity ids in `data`, so the notification feed can expire a
 *     receipt whose entity is gone;
 *   - never throws: a notification failure must not break the event's writer.
 * ========================================================================== */

import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { surfaceHref } from '@/lib/golf/surface-registry';
import { dispatchCoachHelmNotification } from './dispatch';
import type { NotificationCategory } from './router';

async function send(args: {
  player_id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  action_url: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    await dispatchCoachHelmNotification({ ...args, throttle_key: args.category });
  } catch (err) {
    await logServerError(`coachhelm notify ${args.category} failed: ${describeError(err)}`, {
      action: `v3.notifications.notify.${args.category}`,
      featureArea: 'coachhelm.notifications',
      handled: true,
    });
  }
}

const reviewHref = (roundId: string) => `/golf/dashboard/rounds/${roundId}/review`;

export async function notifyRoundReviewReady(args: { player_id: string; round_id: string }): Promise<void> {
  await send({
    player_id: args.player_id,
    category: 'round_review_ready',
    title: 'Your round review is ready',
    body: 'See how your round broke down, hole by hole.',
    action_url: reviewHref(args.round_id),
    data: { roundId: args.round_id },
  });
}

export async function notifyCoachCommented(args: {
  player_id: string;
  round_id: string;
  review_id?: string | null;
}): Promise<void> {
  await send({
    player_id: args.player_id,
    category: 'coach_commented',
    title: 'Your coach left feedback',
    body: 'Your coach added notes to your round review.',
    action_url: reviewHref(args.round_id),
    data: { roundId: args.round_id, ...(args.review_id ? { reviewId: args.review_id } : {}) },
  });
}

export async function notifyCoachAssignedGoal(args: {
  player_id: string;
  goal_id: string;
  goal_title: string;
}): Promise<void> {
  await send({
    player_id: args.player_id,
    category: 'coach_assigned_goal',
    title: 'New goal from your coach',
    body: args.goal_title,
    action_url: surfaceHref('tab-plan-player'),
    data: { goalId: args.goal_id },
  });
}

export async function notifyEngineSuggestedGoals(args: { player_id: string; count: number }): Promise<void> {
  if (!(args.count > 0)) return;
  const noun = args.count === 1 ? 'goal' : 'goals';
  await send({
    player_id: args.player_id,
    category: 'engine_suggested_goal',
    title: 'New goal suggestions',
    body: `CoachHelm has ${args.count} new ${noun} for you to review.`,
    action_url: surfaceHref('tab-plan-player'),
    data: { count: args.count },
  });
}

export async function notifyGoalMissed(args: {
  player_id: string;
  goal_id: string;
  goal_title: string;
}): Promise<void> {
  await send({
    player_id: args.player_id,
    category: 'goal_missed',
    title: 'A goal window closed',
    body: `${args.goal_title}: the window ended before the target was reached.`,
    action_url: surfaceHref('tab-plan-player'),
    data: { goalId: args.goal_id },
  });
}

export async function notifyCompositeInsight(args: { player_id: string; insight_id: string }): Promise<void> {
  await send({
    player_id: args.player_id,
    category: 'composite_insight',
    title: 'CoachHelm connected a pattern',
    body: 'Several of your recent signals point the same way. Tap to see how they fit.',
    action_url: surfaceHref('overview'),
    data: { insightId: args.insight_id },
  });
}

export async function notifyStandingPercentileChanged(args: {
  player_id: string;
  direction: 'up' | 'down';
}): Promise<void> {
  await send({
    player_id: args.player_id,
    category: 'standing_percentile_changed',
    title: args.direction === 'up' ? 'You moved up in team standing' : 'Your team standing changed',
    body: 'Your standing against the team updated after your latest rounds.',
    action_url: surfaceHref('overview'),
    data: { direction: args.direction },
  });
}

export async function notifyWeeklyDigest(args: { player_id: string }): Promise<void> {
  await send({
    player_id: args.player_id,
    category: 'weekly_digest',
    title: 'Your week in CoachHelm',
    body: 'Your weekly summary is ready.',
    action_url: surfaceHref('overview'),
  });
}
