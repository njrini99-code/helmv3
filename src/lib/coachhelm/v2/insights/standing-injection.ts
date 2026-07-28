/**
 * v2 → v3 bridge: inject `evidence.standing` for v2 generators (W14).
 *
 * Each v2 generator now passes its (playerId, v3 metric_id) to
 * {@link loadStandingForInsightEvidence} before upserting. The helper
 * loads the standing snapshot computed nightly by W11's
 * refresh_player_standing RPC and returns a JSON-serialisable object the
 * generator merges into its `evidence` payload.
 *
 * Returns `null` when:
 *   - The metric has no standing row yet (cold-start / cache bucket
 *     misalignment / metric isn't in STANDING_REFRESH_METRIC_IDS).
 *   - The standing loader throws (e.g. DB hiccup) — we log and degrade
 *     gracefully so the insight still ships without the bar.
 *
 * Per master plan Part XXIV, this entire helper is removed in W26 when
 * v2 mining/ is sunset.
 */

import { loadStandingForMetric } from '@/lib/coachhelm/v3/standing/loader';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { PlayerStanding } from '@/lib/coachhelm/v3/standing/types';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/**
 * JSON-serialisable shape v2 generators can merge into `evidence.standing`.
 * Mirrors the PlayerStanding interface but flattened for storage.
 */
export type EvidenceStanding = {
  /** True when the gender-aware loader omitted a misleading cross-gender PGA anchor. */
  pga_omitted?: boolean;
  /** True for women's-team rows — render layers label the Tour reference "LPGA". */
  is_womens?: boolean;
  metric_id: string;
  player_value: number;
  team_avg: number | null;
  team_n: number;
  team_pct: number | null;
  pga_value: number;
  pga_delta: number | null;
  computed_at: string;
};

function flatten(s: PlayerStanding): EvidenceStanding {
  return {
    metric_id: s.metric_id,
    player_value: s.player_value,
    team_avg: s.team_avg,
    team_n: s.team_n,
    team_pct: s.team_pct,
    pga_value: s.pga_value,
    pga_delta: s.pga_delta,
    pga_omitted: s.pga_omitted,
    is_womens: s.is_womens,
    computed_at: s.computed_at,
  };
}

/**
 * Load the standing snapshot for a (playerId, metricId) pair and return
 * it in evidence-merge shape. Null = no standing available.
 *
 * Designed to be safe to call from any v2 generator: never throws.
 */
export async function loadStandingForInsightEvidence(
  playerId: string,
  metricId: MetricId,
): Promise<EvidenceStanding | null> {
  try {
    const standing = await loadStandingForMetric(playerId, metricId);
    return standing ? flatten(standing) : null;
  } catch (err) {
    // Don't let standing failures kill the insight write.
    await logServerError(
      `standing-injection failed for ${playerId}/${metricId}: ${describeError(err)}`,
      { action: 'v2.insights.standing-injection' },
    );
    return null;
  }
}

/**
 * Convenience: merge a standing into an existing evidence object in
 * place (returns the same reference) without overwriting other keys.
 * Safe to call with `null` — no-op.
 */
export function mergeStandingIntoEvidence<E extends object>(
  evidence: E,
  standing: EvidenceStanding | null,
): E {
  if (standing) {
    (evidence as unknown as Record<string, unknown>).standing = standing;
  }
  return evidence;
}
