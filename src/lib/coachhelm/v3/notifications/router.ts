/**
 * v3 notification router (W42).
 *
 * Pure-ish: takes a category + the recipient's prefs row + a delivery
 * payload, returns which channels should fire. Quiet-mode overrides
 * everything EXCEPT round_review_ready + coach_assigned_goal per
 * master plan Part XXII.
 *
 * Persistence + the actual push/email/in-app delivery happens at the
 * callsite via the existing foundation/* clients (push.ts, email.ts).
 * The router never delivers — it returns the routing decision so the
 * caller can dispatch.
 */

export type NotificationCategory =
  | 'round_review_ready'
  | 'coach_assigned_goal'
  | 'goal_achieved'
  | 'goal_missed'
  | 'new_insight'
  | 'composite_insight'
  | 'weekly_digest'
  | 'coach_commented'
  | 'engine_suggested_goal'
  | 'standing_percentile_changed';

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  'round_review_ready',
  'coach_assigned_goal',
  'goal_achieved',
  'goal_missed',
  'new_insight',
  'composite_insight',
  'weekly_digest',
  'coach_commented',
  'engine_suggested_goal',
  'standing_percentile_changed',
];

/** Quiet-mode exemption list per Part XXII. */
const QUIET_MODE_EXEMPT: ReadonlySet<NotificationCategory> = new Set([
  'round_review_ready',
  'coach_assigned_goal',
]);

export interface ChannelPref {
  push: boolean;
  email: boolean;
  in_app: boolean;
}

export type PrefsByCategory = Partial<Record<NotificationCategory, ChannelPref>>;

export interface NotificationPrefs {
  prefs: PrefsByCategory;
  quiet_mode: boolean;
}

export interface RoutingDecision {
  push: boolean;
  email: boolean;
  in_app: boolean;
  /** True when quiet_mode would have silenced this except for the
   *  exemption list — caller can log "delivered despite quiet" if
   *  they want UX transparency. */
  exempted_from_quiet: boolean;
}

export function routeNotification(
  category: NotificationCategory,
  prefs: NotificationPrefs,
): RoutingDecision {
  const channels = prefs.prefs[category] ?? { push: false, email: false, in_app: true };

  // Quiet-mode block + exemption check.
  if (prefs.quiet_mode && !QUIET_MODE_EXEMPT.has(category)) {
    return {
      push: false,
      email: false,
      in_app: false,
      exempted_from_quiet: false,
    };
  }

  return {
    push: channels.push,
    email: channels.email,
    in_app: channels.in_app,
    exempted_from_quiet: prefs.quiet_mode && QUIET_MODE_EXEMPT.has(category),
  };
}

/** True when any channel is enabled for this category. */
export function shouldDeliver(category: NotificationCategory, prefs: NotificationPrefs): boolean {
  const r = routeNotification(category, prefs);
  return r.push || r.email || r.in_app;
}
