import { logServerError } from '@/lib/server-error-logger';
import { dispatchCoachHelmNotification } from '@/lib/coachhelm/v3/notifications/dispatch';
import type { NotificationCategory } from '@/lib/coachhelm/v3/notifications/router';
import type { InsightEvidence, InsightLifecycleState } from '@/lib/coachhelm/v2/insights/types';
import { describeError } from '@/lib/utils/describe-error';

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

// P1-10 — the throttle + recipient resolution + delivery now live in the V3
// dispatcher (dispatchCoachHelmNotification), which honours the player's
// per-category prefs + quiet mode + in-app receipt. This module's job is reduced
// to: decide WHEN an insight warrants a notification + compose the copy.

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

    // 3. Compose + dispatch through the V3 dispatcher (P1-10) so the player's
    //    per-category prefs + quiet mode govern delivery and an in-app receipt is
    //    created — landed/matured/resolved insights now route through the same
    //    pipeline as every other CoachHelm notification. The dispatcher owns the
    //    throttle (1 per (player, kind) per UTC day via throttle_key) + recipient
    //    resolution, so the legacy Redis/user-lookup steps here are no longer
    //    needed. matured → new_insight, resolved → goal_achieved.
    const body = composeBody(args, kind);
    const category: NotificationCategory =
      kind === 'insight_resolved' ? 'goal_achieved' : 'new_insight';
    await dispatchCoachHelmNotification({
      player_id: args.player_id,
      category,
      title: `Helm — ${body}`,
      body,
      action_url: `/golf/dashboard/coachhelm`,
      data: {
        insightId: args.insight_id,
        category: args.category,
        lifecycle_state: args.lifecycle_state,
        kind,
      },
      // Preserve the historical "1 per (player, kind) per UTC day" cadence.
      throttle_key: kind,
    });
  } catch (err) {
    // Catch-all — a notification failure must NEVER break the upsert caller.
    await logServerError(
      `insight-notifier: unhandled failure: ${describeError(err)}`,
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
