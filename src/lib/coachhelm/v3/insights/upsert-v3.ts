/**
 * v3 insight upsert wrapper (W21).
 *
 * Wraps v2/insights/upsert.ts so v3 generators reuse the dedup +
 * lifecycle + Wave 7 philosophy gate logic without modifying any v2
 * file (Rule 1 preserved).
 *
 * Flow:
 *   1. Caller hands us an InsightInput with `signature` prefixed `v3:`.
 *   2. We invoke the v2 upsertInsight to get back the row id.
 *   3. If a row was actually written (not GATED_OUT), we UPDATE its
 *      engine_version to 'v3'. The DEFAULT is 'v2' so existing rows
 *      and any v2 path stays correctly labeled.
 *
 * One extra UPDATE per write is acceptable — generators run on cron,
 * not in user-blocking paths.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  upsertInsight as v2UpsertInsight,
  GATED_OUT,
} from '@/lib/coachhelm/v2/insights/upsert';
import type { InsightInput } from '@/lib/coachhelm/v2/insights/types';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { judgeInsight } from '@/lib/typesafe/judgments/insight-priority';

const V3_SIGNATURE_PREFIX = 'v3:';

/**
 * Upserts an insight with engine_version='v3' stamped on the returned
 * row. Signature must already carry the `v3:` prefix (enforces
 * coexistence-safety with v2 dedup space).
 *
 * Returns:
 *   - string: the row id (existing or newly inserted)
 *   - GATED_OUT: the philosophy gate suppressed the write
 */
export async function upsertInsightV3(
  supabase: SupabaseClient,
  input: InsightInput,
): Promise<string | typeof GATED_OUT> {
  if (!input.signature.startsWith(V3_SIGNATURE_PREFIX)) {
    throw new Error(
      `upsertInsightV3: signature must start with "${V3_SIGNATURE_PREFIX}". Got: ${input.signature}`,
    );
  }

  const result = await v2UpsertInsight(supabase, input);
  if (result === GATED_OUT) return result;

  // Stamp engine_version. Best-effort — a stamp failure should NOT
  // throw away the insight write.
  try {
    const { error } = await supabase
      .from('golf_coach_insights')
      .update({ engine_version: 'v3' })
      .eq('id', result);
    if (error) {
      await logServerError(
        `upsertInsightV3 stamp failed for ${result}: ${error.message}`,
        { action: 'v3.insights.upsert' },
      );
    }
  } catch (err) {
    await logServerError(
      `upsertInsightV3 stamp exception for ${result}: ${describeError(err)}`,
      { action: 'v3.insights.upsert' },
    );
  }

  // TypeSafe shadow judgment (flag `typesafe_judgments`, off in production):
  // scores the insight TEXT for actionability, specificity, player-safety
  // and over-claiming and records them beside the row id. `ranking/score.ts`
  // is audit-tracked (EC-1, FID-1/2) and stays untouched — these numbers are
  // logged so their distribution can be seen before any of them is allowed
  // near the rank.
  //
  // Not awaited: a generator run upserts sequentially, ~10–30 rows per
  // player across 11 generators plus composites, so awaiting ~300 ms here
  // would add seconds per player to every cron sweep. The judgment runs in
  // the background and logs when it lands; a judgment lost to a function
  // shutting down is acceptable for shadow telemetry. `askJev` never
  // rejects, and the `.catch` covers the log call.
  if (isFlagEnabled('typesafe_judgments')) {
    void judgeInsight({
      id: result,
      title: input.title,
      content: input.content,
      category: input.category,
      insight_type: input.insight_type ?? 'unknown',
      evidence: input.evidence,
    }).then(async (verdict) => {
      if (!verdict) return;
      await logServerEvent(
        'upsertInsightV3: typesafe shadow judgment recorded',
        {
          action: 'v3.insights.jev',
          featureArea: 'coachhelm',
          skipSentry: true,
          extra: {
            insightId: result,
            insightType: input.insight_type ?? null,
            category: input.category,
            priority: input.priority ?? null,
            model: verdict.model,
            latencyMs: verdict.latencyMs,
            actionability: Math.round(verdict.answers.actionability.score * 100) / 100,
            specificity: Math.round(verdict.answers.specificity.score * 100) / 100,
            safeForPlayer: Math.round(verdict.answers.safe_for_player.noul * 100) / 100,
            overclaims: Math.round(verdict.answers.overclaims.noul * 100) / 100,
          },
        },
        'info',
      );
    }).catch(() => undefined);
  }

  return result;
}

export { GATED_OUT, V3_SIGNATURE_PREFIX };
