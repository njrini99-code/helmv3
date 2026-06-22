/**
 * v3 CoachHelm notification DISPATCHER (P1-10).
 * ----------------------------------------------------------------------------
 * The single production entry point that makes notification preferences govern
 * REAL delivery. Before this, `routeNotification()` (router.ts) had no callsite,
 * so the per-category prefs / quiet mode in `golf_player_notification_state`
 * were a hollow setting. This wires them end-to-end:
 *
 *   1. Load the player's per-category prefs + quiet_mode from
 *      `golf_player_notification_state` (defaults when no row).
 *   2. `routeNotification(category, prefs)` → the channel decision (push / email
 *      / in_app), honouring category prefs + quiet mode (with the Part-XXII
 *      quiet-exempt categories).
 *   3. Throttle: one dispatch per (player, throttle_key) per UTC day via the
 *      Upstash KV we already use (fail-open when KV isn't configured).
 *   4. Deliver each enabled channel:
 *        • in_app → a receipt row in `notifications` (always when in_app=true).
 *        • push   → sendPushNotification (which re-checks the user's push prefs).
 *        • email  → sendEmailNotification (which re-checks the user's email prefs).
 *
 * NEVER throws — a notification failure must never break the engine caller. All
 * CoachHelm notifications (insight landed/matured/resolved, goal achieved/missed,
 * coach-assigned goal, etc.) route through here.
 * ========================================================================== */

import { Redis } from '@upstash/redis';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushNotification } from '@/lib/notifications/push';
import { sendEmailNotification } from '@/lib/notifications/email';
import { logServerError } from '@/lib/server-error-logger';
import type { NotificationType } from '@/lib/notifications/types';
import type { Database, Json } from '@/lib/types/database';
import {
  routeNotification,
  type NotificationCategory,
  type NotificationPrefs,
  type PrefsByCategory,
  type RoutingDecision,
} from './router';

type DbNotificationType = Database['public']['Enums']['notification_type'];

/**
 * Map a CoachHelm category → the foundation push/email `NotificationType` (so
 * the delivery clients' own per-user gate aligns) AND the closest `notifications`
 * enum value for the in-app receipt. The true semantic category is always
 * preserved in the receipt's `data.category`, so no enum widening is needed.
 */
interface CategoryDelivery {
  /** push/email channel type the delivery clients switch on. */
  deliveryType: NotificationType;
  /** in-app receipt enum value (closest existing `notification_type`). */
  inAppType: DbNotificationType;
}

const CATEGORY_DELIVERY: Record<NotificationCategory, CategoryDelivery> = {
  round_review_ready: { deliveryType: 'coachhelm_insight', inAppType: 'dev_plan_assigned' },
  coach_assigned_goal: { deliveryType: 'dev_plan_assigned', inAppType: 'dev_plan_assigned' },
  goal_achieved: { deliveryType: 'coachhelm_insight', inAppType: 'dev_plan_assigned' },
  goal_missed: { deliveryType: 'coachhelm_insight', inAppType: 'dev_plan_assigned' },
  new_insight: { deliveryType: 'coachhelm_insight', inAppType: 'dev_plan_assigned' },
  composite_insight: { deliveryType: 'coachhelm_insight', inAppType: 'dev_plan_assigned' },
  weekly_digest: { deliveryType: 'coachhelm_insight', inAppType: 'dev_plan_assigned' },
  coach_commented: { deliveryType: 'coachhelm_insight', inAppType: 'dev_plan_assigned' },
  engine_suggested_goal: { deliveryType: 'coachhelm_insight', inAppType: 'dev_plan_assigned' },
  standing_percentile_changed: { deliveryType: 'coachhelm_insight', inAppType: 'dev_plan_assigned' },
};

export interface DispatchArgs {
  /** golf_players.id of the recipient player. */
  player_id: string;
  category: NotificationCategory;
  /** Notification title (push/in-app headline). */
  title: string;
  /** Body copy (push/email/in-app body). */
  body: string;
  /** In-app deep link + push `data.url`. */
  action_url?: string;
  /** Extra payload merged into push/email `data` and the in-app receipt. */
  data?: Record<string, unknown>;
  /**
   * Throttle bucket key — one dispatch per (player, throttle_key) per UTC day.
   * Defaults to the category (so e.g. one new_insight/day). Pass a finer key
   * (e.g. `new_insight:${insightId}`) to scope the throttle per-entity instead.
   * Pass `null` to skip throttling entirely (e.g. coach-assigned goals).
   */
  throttle_key?: string | null;
}

export interface DispatchResult {
  decision: RoutingDecision;
  throttled: boolean;
  in_app: boolean;
  push: boolean;
  email: boolean;
}

const SKIPPED: DispatchResult = {
  decision: { push: false, email: false, in_app: false, exempted_from_quiet: false },
  throttled: false,
  in_app: false,
  push: false,
  email: false,
};

// ── Throttle (Upstash KV, fail-open) ────────────────────────────────────────
let cachedRedis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  cachedRedis = url && token ? new Redis({ url, token }) : null;
  return cachedRedis;
}

/** Exposed for tests — resets the lazy Redis singleton. */
export function __resetDispatchRedisForTests(): void {
  cachedRedis = undefined;
}

function todayUtcStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Claim today's slot for (player, key). Returns true when claimed (safe to
 * dispatch), false when already taken (throttle). Fail-open on KV error / when
 * KV isn't configured — we'd rather let a notification through than drop signal.
 */
async function tryClaimDailySlot(playerId: string, key: string): Promise<boolean> {
  const client = getRedis();
  if (!client) return true;
  try {
    const k = `dispatch:player:${playerId}:${key}:${todayUtcStamp()}`;
    const res = await client.set(k, '1', { ex: 60 * 60 * 24, nx: true });
    return res === 'OK';
  } catch (err) {
    await logServerError(
      `coachhelm dispatch: throttle check failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.notifications.dispatch.throttle', handled: true },
      'warning',
    );
    return true;
  }
}

// ── Prefs load ──────────────────────────────────────────────────────────────

/** Default per-category prefs when the player has no state row: in-app only. */
const DEFAULT_PREFS: NotificationPrefs = { prefs: {}, quiet_mode: false };

async function loadPlayerPrefs(playerId: string): Promise<NotificationPrefs> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('golf_player_notification_state')
      .select('prefs, quiet_mode')
      .eq('player_id', playerId)
      .maybeSingle();
    if (error || !data) return DEFAULT_PREFS;
    return {
      prefs: (data.prefs && typeof data.prefs === 'object' ? data.prefs : {}) as PrefsByCategory,
      quiet_mode: Boolean(data.quiet_mode),
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

/** Resolve golf_players.id → (user_id, email) for the foundation clients. */
async function resolveRecipient(
  playerId: string,
): Promise<{ userId: string; email: string | null } | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('golf_players')
      .select('user_id, users:user_id(email)')
      .eq('id', playerId)
      .maybeSingle();
    if (error || !data?.user_id) return null;
    const usersRel = (data as { users?: { email?: string | null } | null }).users;
    return { userId: data.user_id, email: usersRel?.email ?? null };
  } catch {
    return null;
  }
}

// ── In-app receipt ──────────────────────────────────────────────────────────

async function createInAppReceipt(args: {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  action_url?: string;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('notifications').insert({
      user_id: args.userId,
      type: CATEGORY_DELIVERY[args.category].inAppType,
      title: args.title,
      body: args.body,
      action_url: args.action_url ?? null,
      // Preserve the true semantic category + any extra payload.
      data: { ...(args.data ?? {}), coachhelm_category: args.category } as Json,
      read: false,
    });
    if (error) {
      await logServerError(`coachhelm dispatch: in-app receipt insert failed: ${error.message}`, {
        action: 'v3.notifications.dispatch.in_app',
        handled: true,
      });
      return false;
    }
    return true;
  } catch (err) {
    await logServerError(
      `coachhelm dispatch: in-app receipt threw: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.notifications.dispatch.in_app', handled: true },
    );
    return false;
  }
}

// ── Public dispatch ─────────────────────────────────────────────────────────

/**
 * Route + deliver one CoachHelm notification through the per-category prefs +
 * quiet mode + throttle, then fan out to the enabled channels. Never throws.
 */
export async function dispatchCoachHelmNotification(args: DispatchArgs): Promise<DispatchResult> {
  try {
    // 1. Prefs → routing decision.
    const prefs = await loadPlayerPrefs(args.player_id);
    const decision = routeNotification(args.category, prefs);

    // Quiet mode (non-exempt category) silenced everything → nothing to do.
    if (!decision.push && !decision.email && !decision.in_app) {
      return { ...SKIPPED, decision };
    }

    // 2. Throttle (unless explicitly skipped with throttle_key === null).
    const throttleKey = args.throttle_key === null ? null : (args.throttle_key ?? args.category);
    if (throttleKey !== null) {
      const claimed = await tryClaimDailySlot(args.player_id, throttleKey);
      if (!claimed) return { ...SKIPPED, decision, throttled: true };
    }

    // 3. Resolve the recipient once for the channels that need it.
    const recipient = decision.push || decision.email || decision.in_app
      ? await resolveRecipient(args.player_id)
      : null;
    if (!recipient) return { ...SKIPPED, decision };

    const out: DispatchResult = {
      decision,
      throttled: false,
      in_app: false,
      push: false,
      email: false,
    };

    // 4a. In-app receipt.
    if (decision.in_app) {
      out.in_app = await createInAppReceipt({
        userId: recipient.userId,
        category: args.category,
        title: args.title,
        body: args.body,
        action_url: args.action_url,
        data: args.data,
      });
    }

    const deliveryType = CATEGORY_DELIVERY[args.category].deliveryType;
    const payload: Record<string, unknown> = {
      ...(args.data ?? {}),
      coachhelm_category: args.category,
      title: args.title,
      body: args.body,
      ...(args.action_url ? { url: args.action_url } : {}),
    };

    // 4b. Push (the client re-checks the user's push prefs).
    if (decision.push) {
      const r = await sendPushNotification(deliveryType, recipient.userId, payload);
      out.push = r.success;
    }

    // 4c. Email (the client re-checks the user's email prefs).
    if (decision.email && recipient.email) {
      const r = await sendEmailNotification(deliveryType, recipient.userId, recipient.email, payload);
      out.email = r.success;
    }

    return out;
  } catch (err) {
    // A notification failure must NEVER break the engine caller.
    await logServerError(
      `coachhelm dispatch: unhandled failure: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.notifications.dispatch', handled: true },
      'warning',
    );
    return SKIPPED;
  }
}
