import type { PlayerNotificationCounts } from './player-notifications';
import type { CoachNotificationCounts } from './coach-notifications';

/**
 * Types for `getNotificationBadgeBundle` (notification-badges.ts).
 *
 * Lives in a sibling non-'use server' module on purpose: an `export type`
 * from a 'use server' file is registered as a server action and throws a
 * ReferenceError at runtime (see the finish-task skill, "bundle boundary").
 */

export interface BadgePart<T> {
  success: boolean;
  data?: T;
  authExpired?: boolean;
}

export interface AlertBadgeCounts {
  critical: number;
  warning: number;
  info: number;
  total: number;
}

export interface NotificationBadgeRequest {
  role: 'player' | 'coach';
  userId: string;
  playerId?: string | null;
  teamId?: string | null;
  coachId?: string | null;
}

/**
 * Every part is `null` when it was not requested for this role OR when that
 * one read threw — the provider treats `null` exactly as it treated a thrown
 * individual action before consolidation (hold / zero, never fabricate).
 */
export interface NotificationBadgeBundle {
  player: BadgePart<PlayerNotificationCounts> | null;
  coach: BadgePart<CoachNotificationCounts> | null;
  alerts: { success: boolean; counts?: AlertBadgeCounts; authExpired?: boolean } | null;
  unread: BadgePart<{ unread: number }> | null;
}
