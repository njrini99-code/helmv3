/**
 * Platform CPU / memory / up rules — brief §22.
 *
 * Pure evaluator over a short in-process ring of recent platform samples (no
 * database, no fetch, no side effect). The cron route
 * (`src/app/api/cron/db-health-sampler/route.ts`) supplies the ring by
 * reading the last few rows written by `record_db_platform_sample` via
 * `helm_debug_read_db_platform_history`; the Bridge reader
 * (`src/lib/admin/database/platform.ts`) supplies it the same way for
 * on-page evaluation. Neither caller is required to sort — this file sorts
 * defensively by `sampledAt`.
 *
 * RULES (verbatim from the brief):
 *   - db down (`dbUp === 0`) -> CRITICAL, immediately, no consecutive-sample
 *     requirement — a database that reports down does not need a second
 *     opinion.
 *   - CPU > 90% across >= 2 CONSECUTIVE samples -> critical candidate.
 *   - memory > 90% across >= 2 CONSECUTIVE samples -> critical candidate.
 *   - A single spike -> no alert. This is why the sustained checks require
 *     BOTH of the last two samples to exceed the threshold, not just the
 *     latest one.
 *   - stale (> 15 minutes since the latest sample) -> UNKNOWN, never a
 *     silently-passed evaluation. A stale ring answers no rule at all —
 *     "no candidates" from a stale input would read as "healthy", which is
 *     exactly the blind-as-healthy failure `docs/.../sources.ts` exists to
 *     stop for the wider Bridge (see that file's header).
 *
 * `null` is never treated as "exceeds the threshold" and never treated as
 * "healthy" either — it simply cannot satisfy a `> 90` comparison, so a
 * missing CPU/memory reading silently drops out of the sustained check
 * rather than forcing a false positive or a false negative either way. This
 * mirrors brief §6's "unknown never renders as zero" for a evaluator that
 * has no health-tone to fall back on other than "no candidate produced".
 */

export type PlatformCandidateRule = 'db_down' | 'cpu_sustained_high' | 'memory_sustained_high';

/** One sample the evaluator consumes. A strict subset of `PlatformHealthModel`
 *  (`metrics-api.ts`) — only the three fields these rules read. `dbUp` is
 *  `0 | 1 | null`, never `boolean`: a boolean would collapse "the metric was
 *  absent" into `false`, manufacturing an outage out of a blind read. */
export interface PlatformSample {
  sampledAt: string; // ISO-8601
  dbUp: 0 | 1 | null;
  cpuPct: number | null;
  memoryPct: number | null;
}

export interface PlatformAlertCandidate {
  rule: PlatformCandidateRule;
  severity: 'critical';
  message: string;
  /** The triggering (latest) sample's timestamp — not the sample that first
   *  crossed the threshold, so a Bridge card can always say "as of when". */
  sampledAt: string;
}

export type PlatformFreshness = 'fresh' | 'stale' | 'unknown';

export interface PlatformRuleEvaluation {
  freshness: PlatformFreshness;
  /** Empty whenever `freshness !== 'fresh'` — a stale or unknown ring has no
   *  opinion, not a clean one. */
  candidates: PlatformAlertCandidate[];
}

const STALE_AFTER_MS = 15 * 60_000;
const HIGH_THRESHOLD_PCT = 90;
/** Samples that must agree before a rule counts as "sustained". Exported so a
 *  caller can tell "not enough history to judge" (blind) apart from "judged
 *  and clear" — a single reading can never satisfy this. */
export const CONSECUTIVE_REQUIRED = 2;

function parseSampledAt(sampledAt: string): number {
  const ms = Date.parse(sampledAt);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/** True only when the last `CONSECUTIVE_REQUIRED` samples (chronological
 *  order) ALL exceed the threshold. A ring shorter than that requirement
 *  cannot be "sustained" by definition — returns false, not an assumption. */
function sustainedAbove(
  sorted: readonly PlatformSample[],
  pick: (s: PlatformSample) => number | null,
): boolean {
  if (sorted.length < CONSECUTIVE_REQUIRED) return false;
  const tail = sorted.slice(-CONSECUTIVE_REQUIRED);
  return tail.every((s) => {
    const v = pick(s);
    return v !== null && Number.isFinite(v) && v > HIGH_THRESHOLD_PCT;
  });
}

export function evaluatePlatformRules(
  samples: readonly PlatformSample[],
  nowMs: number = Date.now(),
): PlatformRuleEvaluation {
  if (samples.length === 0) {
    return { freshness: 'unknown', candidates: [] };
  }

  const sorted = [...samples].sort((a, b) => parseSampledAt(a.sampledAt) - parseSampledAt(b.sampledAt));
  const latest = sorted[sorted.length - 1];
  if (!latest) {
    // Unreachable given the length check above, but noUncheckedIndexedAccess
    // cannot see that — narrow explicitly rather than asserting.
    return { freshness: 'unknown', candidates: [] };
  }
  const latestMs = parseSampledAt(latest.sampledAt);

  const freshness: PlatformFreshness = !Number.isFinite(latestMs)
    ? 'unknown'
    : nowMs - latestMs > STALE_AFTER_MS
      ? 'stale'
      : 'fresh';

  if (freshness !== 'fresh') {
    return { freshness, candidates: [] };
  }

  const candidates: PlatformAlertCandidate[] = [];

  // Immediate, not sustained — a single down reading is already the fact.
  if (latest.dbUp === 0) {
    candidates.push({
      rule: 'db_down',
      severity: 'critical',
      message: 'Database platform metric reports down (dbUp = 0).',
      sampledAt: latest.sampledAt,
    });
  }

  if (sustainedAbove(sorted, (s) => s.cpuPct)) {
    candidates.push({
      rule: 'cpu_sustained_high',
      severity: 'critical',
      message: `CPU above ${HIGH_THRESHOLD_PCT}% across the last ${CONSECUTIVE_REQUIRED} samples.`,
      sampledAt: latest.sampledAt,
    });
  }

  if (sustainedAbove(sorted, (s) => s.memoryPct)) {
    candidates.push({
      rule: 'memory_sustained_high',
      severity: 'critical',
      message: `Resident memory above ${HIGH_THRESHOLD_PCT}% across the last ${CONSECUTIVE_REQUIRED} samples.`,
      sampledAt: latest.sampledAt,
    });
  }

  return { freshness, candidates };
}
