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
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

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

  return result;
}

export { GATED_OUT, V3_SIGNATURE_PREFIX };
