import { Redis } from '@upstash/redis';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushNotification } from '@/lib/notifications/push';
import { logServerError } from '@/lib/server-error-logger';
import type { InsightEvidence, InsightLifecycleState } from '@/lib/coachhelm/v2/insights/types';

/**
 * Wave 1B — post-write hook that decides when a newly persisted insight
 * warrants a push to the player. Called from `upsertInsight()` after every
 * successful write. Never throws — push failures are logged and swallowed so
 * the engine can keep working.
 *
 * Fires on:
 *  - lifecycle transition  detected → matured  (the "your X is making waves"
 *    signal-threshold moment)
 *  - lifecycle transition  matured|addressed → resolved  (the celebration)
 *
 * Never fires on dedup-refresh (<5% movement), never on insert of a brand-new
 * 'tentative' or 'detected' row, and never when the lifecycle state didn't
 * actually change on this write (`was_lifecycle_promotion === false`).
 *
 * Throttled to **one push per (player, kind) per UTC day** via the Upstash
 * Redis we already have wired (`KV_REST_API_URL` / `KV_REST_API_TOKEN`). If
 * Redis is unavailable the notifier fails-open but logs a warning — we'd
 * rather let a push through than drop signal.
 */

export type InsightPushKind = 'insight_matured' | 'insight_resolved';

export interface NotifyInsightArgs {
  player_id: string;
  insight_id: string;
  category: string;
  title: string;
  evidence: InsightEvidence;
  lifecycle_state: InsightLifecycleState;
  /** true iff this write promoted the lifecycle (detected→matured or matured/addressed→resolved). */
  was_lifecycle_promotion: boolean;
}

let cachedRedis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  cachedRedis = url && token ? new Redis({ url, token }) : null;
  return cachedRedis;
}

/** Exposed for tests — resets the lazy Redis singleton. */
export function __resetRedisForTests(): void {
  cachedRedis = undefined;
}

function todayUtcStamp(now: Date = new Date()): string {
  // YYYY-MM-DD in UTC; Date#toISOString is always UTC.
  return now.toISOString().slice(0, 10);
}

function throttleKey(playerId: string, kind: InsightPushKind, day: string): string {
  return `push:player:${playerId}:${kind}:${day}`;
}

/**
 * Try to claim today's slot for (player, kind). Returns true if claimed
 * (→ safe to send), false if already taken (→ throttle). On Redis failure we
 * fail-open so signal isn't dropped silently.
 */
async function tryClaimDailySlot(
  playerId: string,
  kind: InsightPushKind,
): Promise<boolean> {
  const client = getRedis();
  if (!client) {
    // No Redis configured — log once, let it through. Local dev + preview
    // envs without the KV integration still get push delivery.
    return true;
  }
  try {
    const key = throttleKey(playerId, kind, todayUtcStamp());
    const res = await client.set(key, '1', { ex: 60 * 60 * 24, nx: true });
    // upstash-js returns 'OK' on NX success, null when NX fails.
    return res === 'OK';
  } catch (err) {
    await logServerError(
      `insight-notifier: throttle check failed: ${err instanceof Error ? err.message : String(err)}`,
      {
        action: 'insight_notifier.throttle',
        featureArea: 'coachhelm.insights',
        playerId,
        metadata: { kind },
        handled: true,
      },
      'warning',
    );
    // Fail-open on transient Redis errors — do NOT block delivery.
    return true;
  }
}

function composeBody(args: NotifyInsightArgs, kind: InsightPushKind): string {
  if (kind === 'insight_resolved') {
    const label = CATEGORY_LABEL[args.category] ?? args.category.replace(/_/g, ' ');
    return `You closed the gap on ${label}! 🎉`;
  }

  // matured — category-flavored copy
  switch (args.category) {
    case 'putting':
      return 'Your putting is making waves — open to see what changed.';
    case 'approach':
      return 'Your approach game has a new pattern — tap to explore.';
    case 'tee':
      return 'Your tee game has a new signal — tap to see the details.';
    case 'short_game':
      return 'Your short game is showing a new pattern — tap to explore.';
    case 'scoring':
      return 'Your scoring has a new pattern — tap to see what changed.';
    case 'pressure':
      return 'Pressure performance is trending — tap to see the details.';
    case 'course_management':
      return 'A course-management pattern just firmed up — tap to see.';
    default:
      return 'A new insight is ready — tap to see what changed.';
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  putting: 'putting',
  approach: 'approach play',
  tee: 'tee shots',
  short_game: 'the short game',
  scoring: 'scoring',
  pressure: 'pressure situations',
  course_management: 'course management',
};

/**
 * Resolve `golf_players.id → auth users.id` so we can reuse the existing
 * `sendPushNotification(type, userId, data)` pipeline (which looks up tokens
 * by user_id on `device_tokens`).
 */
async function resolvePlayerUserId(playerId: string): Promise<string | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('golf_players')
      .select('user_id')
      .eq('id', playerId)
      .maybeSingle();

    if (error) {
      await logServerError(
        `insight-notifier: player→user lookup failed: ${error.message}`,
        {
          action: 'insight_notifier.resolve_user',
          featureArea: 'coachhelm.insights',
          playerId,
          errorCode: error.code ?? undefined,
          handled: true,
        },
        'warning',
      );
      return null;
    }
    return data?.user_id ?? null;
  } catch (err) {
    await logServerError(
      `insight-notifier: player→user lookup threw: ${err instanceof Error ? err.message : String(err)}`,
      {
        action: 'insight_notifier.resolve_user',
        featureArea: 'coachhelm.insights',
        playerId,
        handled: true,
      },
      'warning',
    );
    return null;
  }
}

/**
 * Public entry point — called from `upsertInsight` after each successful
 * write. NEVER throws.
 */
export async function notifyInsightLanded(args: NotifyInsightArgs): Promise<void> {
  try {
    // 1. Only fire on actual promotions.
    if (!args.was_lifecycle_promotion) return;

    // 2. Only fire on the two "worth-a-push" states.
    let kind: InsightPushKind;
    if (args.lifecycle_state === 'matured') {
      kind = 'insight_matured';
    } else if (args.lifecycle_state === 'resolved') {
      kind = 'insight_resolved';
    } else {
      return;
    }

    // 3. Throttle — 1 per (player, kind) per UTC day.
    const claimed = await tryClaimDailySlot(args.player_id, kind);
    if (!claimed) return;

    // 4. Resolve recipient.
    const userId = await resolvePlayerUserId(args.player_id);
    if (!userId) return;

    // 5. Compose + send. Uses the existing notification-type 'coachhelm_insight'
    //    so it respects the player's `push_events` preference.
    const body = composeBody(args, kind);
    const result = await sendPushNotification('coachhelm_insight', userId, {
      insightTitle: `Helm — ${body}`,
      insightId: args.insight_id,
      category: args.category,
      lifecycle_state: args.lifecycle_state,
      kind,
    });

    if (!result.success) {
      await logServerError(
        `insight-notifier: push send reported failure: ${result.error ?? 'unknown'}`,
        {
          action: 'insight_notifier.send',
          featureArea: 'coachhelm.insights',
          playerId: args.player_id,
          metadata: { insightId: args.insight_id, kind, category: args.category },
          handled: true,
        },
        'warning',
      );
    }
  } catch (err) {
    // Catch-all — a notification failure must NEVER break the upsert caller.
    await logServerError(
      `insight-notifier: unhandled failure: ${err instanceof Error ? err.message : String(err)}`,
      {
        action: 'insight_notifier.notify',
        featureArea: 'coachhelm.insights',
        playerId: args.player_id,
        metadata: {
          insightId: args.insight_id,
          lifecycle_state: args.lifecycle_state,
          was_lifecycle_promotion: args.was_lifecycle_promotion,
        },
        handled: true,
      },
      'warning',
    );
  }
}
