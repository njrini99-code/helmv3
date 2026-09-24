'use server';

import { getPlayerNotificationCounts } from './player-notifications';
import { getCoachNotificationCounts } from './coach-notifications';
import { getAlertCounts } from './alerts';
import { getNotificationsUnreadCount } from './unified-notifications';
import type { NotificationBadgeBundle, NotificationBadgeRequest } from './notification-badges-types';

/** A rejected part degrades to `null` instead of failing the whole bundle. */
function settle<T>(promise: Promise<T>): Promise<T | null> {
  return promise.then(
    (value) => value,
    () => null,
  );
}

/**
 * ONE server-action round-trip for every shell badge.
 *
 * The badge provider used to call up to three server actions back to back
 * (role counts → CoachHelm alert counts → generic `notifications` unread).
 * Next.js runs a client's server actions one at a time, so each of those
 * serial POSTs also held up any server action the current page wanted to
 * run. Here the same reads run in parallel on the server and return
 * together.
 *
 * Each underlying action authenticates from the session itself and ignores
 * caller-supplied identity for authorization (see DS-04 in
 * coach-notifications.ts), so this wrapper adds no trust in the request args
 * beyond what those actions already accept.
 */
export async function getNotificationBadgeBundle(
  request: NotificationBadgeRequest,
): Promise<NotificationBadgeBundle> {
  const { role, userId, playerId, teamId, coachId } = request;
  const isPlayer = role === 'player' && !!playerId && !!userId && !!teamId;
  const isCoach = role === 'coach' && !!userId;

  const [player, coach, alerts, unread] = await Promise.all([
    isPlayer ? settle(getPlayerNotificationCounts(playerId!, userId, teamId!)) : Promise.resolve(null),
    isCoach ? settle(getCoachNotificationCounts(userId, teamId ?? undefined)) : Promise.resolve(null),
    isCoach && coachId ? settle(getAlertCounts(coachId)) : Promise.resolve(null),
    userId ? settle(getNotificationsUnreadCount()) : Promise.resolve(null),
  ]);

  return { player, coach, alerts, unread };
}
