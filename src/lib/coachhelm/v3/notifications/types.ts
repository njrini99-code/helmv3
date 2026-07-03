/**
 * v3 notification preference types — the DELIVERY-FACING contract.
 *
 * The actual push/email gate (src/lib/notifications/email.ts ·
 * getUserNotificationPreferences → shouldSendEmail) reads the
 * `users.notification_preferences` JSONB column, keyed by the
 * `email_*` / `push_*` flags below. This module is the single source of
 * truth for that shape so the settings UI (FairwaySettingsGeneral) writes
 * EXACTLY the keys delivery reads — no drift between the toggle and the gate.
 *
 * The per-CATEGORY router in ./router.ts is a separate, player-only surface
 * (golf_player_notification_state); it does NOT feed the email/push gate. The
 * coach + player general settings panel uses THIS module, so a toggle there
 * actually changes whether mail/push goes out.
 *
 * `quiet_mode` is honoured by `gatedDelivery()` below: a delivery channel is
 * only live when the per-category flag is on AND quiet-mode either is off or
 * the category is exempt (transactional updates a user always wants).
 */

/** The category keys the email/push delivery gate switches on. */
export type DeliveryNotificationKey =
  | 'email_messages'
  | 'email_pipeline_updates'
  | 'email_event_reminders'
  | 'email_profile_views'
  | 'email_announcements'
  | 'email_task_reminders'
  | 'email_coachhelm'
  | 'push_messages'
  | 'push_events'
  | 'push_task_reminders'
  | 'push_coachhelm';

/**
 * The shape persisted to `users.notification_preferences`. Mirrors
 * NotificationPreferences in src/lib/notifications/types.ts (what delivery
 * reads) plus the additive `quiet_mode` flag.
 */
export interface DeliveryNotificationPreferences
  extends Record<DeliveryNotificationKey, boolean> {
  /**
   * When true, only quiet-exempt categories deliver. Additive: a stored prefs
   * row without this key is treated as quiet_mode = false (see DEFAULT below).
   */
  quiet_mode: boolean;
}

/**
 * UI grouping: an email/push pair shown as one row in the settings panel.
 * `quietExempt` rows keep delivering even in quiet mode (transactional).
 */
export interface DeliveryNotificationGroup {
  id: string;
  label: string;
  description: string;
  emailKey: DeliveryNotificationKey;
  /** Some groups are email-only (no push channel exists for them). */
  pushKey?: DeliveryNotificationKey;
  /** True ⇒ unaffected by quiet mode (the user always wants these). */
  quietExempt: boolean;
}

/**
 * The category rows rendered in the general settings notifications panel,
 * for BOTH coaches and players. Every key here exists in the delivery gate.
 */
export const DELIVERY_NOTIFICATION_GROUPS: readonly DeliveryNotificationGroup[] = [
  {
    id: 'messages',
    label: 'Messages',
    description: 'Direct messages from your team.',
    emailKey: 'email_messages',
    pushKey: 'push_messages',
    quietExempt: true,
  },
  {
    id: 'events',
    label: 'Events & reminders',
    description: 'Calendar events, RSVPs and qualifier updates.',
    emailKey: 'email_event_reminders',
    pushKey: 'push_events',
    quietExempt: false,
  },
  {
    id: 'announcements',
    label: 'Announcements',
    description: 'Team announcements and round activity.',
    emailKey: 'email_announcements',
    quietExempt: false,
  },
  {
    id: 'tasks',
    label: 'Tasks',
    description: 'Assigned tasks and reminders.',
    emailKey: 'email_task_reminders',
    pushKey: 'push_task_reminders',
    quietExempt: false,
  },
  {
    id: 'coachhelm',
    label: 'CoachHelm AI',
    description: 'AI insights, goals and coaching signals.',
    emailKey: 'email_coachhelm',
    pushKey: 'push_coachhelm',
    quietExempt: false,
  },
  {
    id: 'pipeline',
    label: 'Recruiting updates',
    description: 'Pipeline and recruiting activity.',
    emailKey: 'email_pipeline_updates',
    quietExempt: false,
  },
  {
    id: 'profile_views',
    label: 'Profile views',
    description: 'When someone views your profile.',
    emailKey: 'email_profile_views',
    quietExempt: false,
  },
] as const;

/** Categories that keep delivering even when quiet mode is on. */
const QUIET_EXEMPT_DELIVERY_KEYS: ReadonlySet<DeliveryNotificationKey> = new Set(
  DELIVERY_NOTIFICATION_GROUPS.flatMap((g) =>
    g.quietExempt ? ([g.emailKey, g.pushKey].filter(Boolean) as DeliveryNotificationKey[]) : [],
  ),
);

/** Defaults — mirrors DEFAULT_NOTIFICATION_PREFERENCES + quiet_mode off. */
const DEFAULT_DELIVERY_NOTIFICATION_PREFERENCES: DeliveryNotificationPreferences = {
  email_messages: true,
  email_pipeline_updates: true,
  email_event_reminders: true,
  email_profile_views: false,
  email_announcements: true,
  email_task_reminders: true,
  email_coachhelm: true,
  push_messages: false,
  push_events: false,
  push_task_reminders: true,
  push_coachhelm: true,
  quiet_mode: false,
};

/**
 * The effective delivery decision for one channel key, applying both the
 * per-category flag AND quiet mode. This is the gate the delivery reads honour:
 * a channel only fires when its flag is on and quiet mode doesn't silence it.
 *
 * Pure + side-effect-free so it can be unit-tested and reused at any callsite.
 */
export function gatedDelivery(
  prefs: Partial<DeliveryNotificationPreferences> | null | undefined,
  key: DeliveryNotificationKey,
): boolean {
  const merged = { ...DEFAULT_DELIVERY_NOTIFICATION_PREFERENCES, ...(prefs ?? {}) };
  if (!merged[key]) return false;
  if (merged.quiet_mode && !QUIET_EXEMPT_DELIVERY_KEYS.has(key)) return false;
  return true;
}
