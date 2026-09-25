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
import { sanitizeProse } from '@/lib/coachhelm/v3/themes/assemble';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

const V3_SIGNATURE_PREFIX = 'v3:';

/**
 * Write-boundary prose hygiene. Every v3 row (single-metric generators via
 * `generator-base.ts` and composites via `composite/synthesis.ts`) passes
 * through here, so this is the one place that guarantees no internal
 * authoring artifact ("(Research doc §N)", "Per Research doc §N …", the
 * dangling "standing card below" sentence) is ever PERSISTED into
 * player/coach-facing copy — the read-time `sanitizeProse` calls in
 * `insight-delivery*.ts` only cover the surfaces that remember to call it,
 * and `DiagnosisPanel` renders `evidence.diagnosis` prose raw. Sanitizes
 * `title`, `content`, and the diagnosis prose fields; every other evidence
 * field is untouched. Pure + exported for tests.
 */
export function sanitizeInsightProse(input: InsightInput): InsightInput {
  const diagnosis = input.evidence.diagnosis;
  return {
    ...input,
    title: sanitizeProse(input.title),
    content: sanitizeProse(input.content),
    evidence: diagnosis
      ? {
          ...input.evidence,
          diagnosis: {
            ...diagnosis,
            symptom: sanitizeProse(diagnosis.symptom),
            root_cause: sanitizeProse(diagnosis.root_cause),
            recommended_action: sanitizeProse(diagnosis.recommended_action),
          },
        }
      : input.evidence,
  };
}

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

  const result = await v2UpsertInsight(supabase, sanitizeInsightProse(input));
  if (result === GATED_OUT) return result;

  // Stamp engine_version. Best-effort — a stamp failure should NOT
  // throw away the insight write. Guarded to a no-op once already
  // stamped ('v3' filter) — an unconditional UPDATE here bumps
  // `updated_at` on every single v3 write, including a plain refresh
  // that changed nothing else, which can consume upsertInsight's one CAS
  // retry (row 10, plan §5.1) for no reason.
  try {
    const { error } = await supabase
      .from('golf_coach_insights')
      .update({ engine_version: 'v3' })
      .eq('id', result)
      .or('engine_version.is.null,engine_version.neq.v3');
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
