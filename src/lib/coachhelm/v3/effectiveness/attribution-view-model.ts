/**
 * A9 slice 3 (repair-plan §14.12): pure, DB-free view model over a raw
 * `AttributionRow` (`attribution-read.ts`) for the coach-facing readout.
 *
 * LANGUAGE (repair-plan §14.12 item (a), guarded by `src/test/coachhelm/
 * observed-outcome-language.test.ts`): every label/description here is an
 * OBSERVED-CHANGE claim, never "improved", "proven", or "caused" — this
 * table's own comment history (`causality/attribute.ts`'s N9/N10 notes,
 * `event-ledger.ts`'s `deriveTrustStatus` rename) is the established house
 * style this mirrors.
 *
 * METHOD_VERSION LABELING — every known value, so a future new version is
 * the ONLY way to reach `unknown` (never a silent default for a value this
 * module simply forgot to list):
 *   - `null` (no column, or a genuine NULL row) AND `'v2_observed_delta'` →
 *     `'earlier_method'`. Both are the ROUND-LEVEL path
 *     (`causality/attribute.ts`) which predates shot-level matching AND
 *     predates the A9 slice 2 confounding check entirely — collapsed into
 *     one bucket because a reader cannot honestly claim any more
 *     granularity than "computed by an earlier method" for either. Per the
 *     migration's own doc comment (`supabase/migrations/
 *     20260922230000_v3_attribution_method_version.sql`), NULL already
 *     means "v1" (pre-N10) — this view model does not re-invent that.
 *   - `COMPARABLE_OPPORTUNITIES_METHOD_VERSION` (`'comparable_opportunities
 *     _v1'`) → `'observed_change'` — the shot-level, confound-CHECKED
 *     comparison (A9 slices 1-2).
 *   - `COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION`
 *     (`'..._v1_limited'`) → `'observed_change_limited'` — same method, but
 *     `confounding-check.ts` found another intervention inside the
 *     measurement window.
 *   - anything else (a version string this module doesn't recognize) →
 *     `'unknown'` — a NEUTRAL fallback. `isCleanMethodVersion` below is
 *     `false` for this case, same as `'..._limited'` — an unrecognized
 *     version must never be read as clean evidence by omission.
 *
 * "CLEAN" IS NARROW ON PURPOSE: `isCleanMethodVersion` is `true` for
 * EXACTLY ONE value, `COMPARABLE_OPPORTUNITIES_METHOD_VERSION` — the only
 * method whose OWN pipeline actively ran `detectConfoundingInterventions`
 * and found nothing. `'earlier_method'` rows never ran that check at all
 * (they predate it), so they get NO benefit of the doubt — "no confound
 * found" and "never checked for one" are not the same claim, and only the
 * former is "clean".
 */
import { COMPARABLE_OPPORTUNITIES_METHOD_VERSION } from '@/lib/coachhelm/v3/evaluation/comparable-opportunities';
import { COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION } from '@/lib/coachhelm/v3/causality/comparable-attribute';
import type { AttributionRow } from './attribution-read';

/** Legacy round-level `method_version` literal — `attribute.ts`'s own
 *  N10 constant is inlined at its write call site (`method_version:
 *  'v2_observed_delta'`), not exported, so this is named here rather than
 *  imported. */
const LEGACY_ROUND_LEVEL_METHOD_VERSION = 'v2_observed_delta';

export type AttributionMethodLabel = 'earlier_method' | 'observed_change' | 'observed_change_limited' | 'unknown';

export interface AttributionMethodInfo {
  label: AttributionMethodLabel;
  /** One hedged sentence, never "improved"/"proven"/"caused". Player/coach
   *  and chat-facing — guarded by `observed-outcome-language.test.ts`. */
  description: string;
  /** True for exactly one method_version — see file header. */
  isClean: boolean;
}

const METHOD_INFO: Record<AttributionMethodLabel, Omit<AttributionMethodInfo, 'label'>> = {
  earlier_method: {
    description: 'Measured by an earlier method',
    isClean: false,
  },
  observed_change: {
    description: 'Observed change on comparable shots',
    isClean: true,
  },
  observed_change_limited: {
    description: "Observed change — another change happened in the same window, so it can't be isolated",
    isClean: false,
  },
  unknown: {
    description: 'Measurement method not recognized',
    isClean: false,
  },
};

/** Maps a raw `method_version` column value (including `null`) to its
 *  label + hedged description + clean-evidence flag. Exported standalone
 *  (not only via the row-level readout below) so a caller with just a
 *  version string — e.g. a future admin/debug view — gets the same
 *  labeling without reconstructing a whole `AttributionRow`. */
export function describeMethodVersion(methodVersion: string | null): AttributionMethodInfo {
  let label: AttributionMethodLabel;
  if (methodVersion === null || methodVersion === LEGACY_ROUND_LEVEL_METHOD_VERSION) {
    label = 'earlier_method';
  } else if (methodVersion === COMPARABLE_OPPORTUNITIES_METHOD_VERSION) {
    label = 'observed_change';
  } else if (methodVersion === COMPARABLE_OPPORTUNITIES_LIMITED_METHOD_VERSION) {
    label = 'observed_change_limited';
  } else {
    label = 'unknown';
  }
  return { label, ...METHOD_INFO[label] };
}

/** ANCHOR LABELING (owner decision, Package 10): `interventionAt` anchors on
 *  the insight's first `golf_insight_action` when one exists, else falls
 *  back to first exposure (`shown_at`) — `comparable-attribute.ts`'s
 *  `resolveInterventionAnchor`. `row.anchor_kind === 'exposure'` means THIS
 *  row used the fallback, so the measurement window is honestly described
 *  as counted "since first shown" rather than implying an action anchored
 *  it. Only applied to the two comparable-method labels — `earlier_method`/
 *  `unknown` rows carry `anchor_kind: null` (`attribution-read.ts`) and are
 *  left untouched.
 *
 *  `anchor_kind === 'action'` gets NO added label — there is no established
 *  house phrase yet for "since you acted on it" that stays inside this
 *  file's hedged-language contract, and inventing one here was flagged as
 *  an open question for the PR rather than decided unilaterally. */
function withAnchorLabel(method: AttributionMethodInfo, anchorKind: AttributionRow['anchor_kind']): AttributionMethodInfo {
  if (anchorKind !== 'exposure') return method;
  if (method.label !== 'observed_change' && method.label !== 'observed_change_limited') return method;
  return { ...method, description: `${method.description} (since first shown)` };
}

/** Same `< 3` sample-size floor `event-ledger.ts`'s `deriveTrustStatus`
 *  already established for "too few measured outcomes to say anything" —
 *  reused rather than a new number invented for this surface. */
export const MIN_SUFFICIENT_ROUNDS = 3;

export interface AttributionSampleSize {
  before: number;
  after: number;
}

export type AttributionReadout =
  | { state: 'missing' }
  | { state: 'insufficient'; sampleSize: AttributionSampleSize; method: AttributionMethodInfo }
  | {
      state: 'result';
      insightId: string;
      targetMetricId: string;
      /** Direction-agnostic raw change (`post - baseline`) — never called
       *  "improvement" or "lift" here; see `comparable-opportunities.ts`'s
       *  own NAMING note for why this codebase reserves those words for a
       *  direction-corrected, learning-loop-facing number this readout
       *  never computes or shows. */
      delta: number;
      sampleSize: AttributionSampleSize;
      method: AttributionMethodInfo;
    };

function sufficientSampleSize(sampleSize: AttributionSampleSize): boolean {
  return sampleSize.before >= MIN_SUFFICIENT_ROUNDS && sampleSize.after >= MIN_SUFFICIENT_ROUNDS;
}

/** One row → one readout. `insufficient` fires on sample size ALONE — a
 *  `'..._limited'` row with a healthy sample size is still `'result'`
 *  (limited ≠ insufficient; the two states are orthogonal: `state` reports
 *  whether there's enough data, `method.isClean`/`method.label` reports
 *  whether the data was confound-checked). */
export function rowToAttributionReadout(row: AttributionRow): AttributionReadout {
  const sampleSize: AttributionSampleSize = { before: row.n_rounds_before, after: row.n_rounds_after };
  const method = withAnchorLabel(describeMethodVersion(row.method_version), row.anchor_kind);
  if (!sufficientSampleSize(sampleSize)) {
    return { state: 'insufficient', sampleSize, method };
  }
  return {
    state: 'result',
    insightId: row.insight_id,
    targetMetricId: row.target_metric_id,
    delta: row.delta,
    sampleSize,
    method,
  };
}

/** Single-insight convenience: `rows` is the direct result of
 *  `readAttributionForInsight` (0 or 1 elements). Zero rows is the
 *  legitimate "never attributed yet" case → `'missing'`, distinct from a
 *  failed read (the caller — the server action — must check
 *  `AttributionReadResult.ok` BEFORE calling this; this function has no
 *  way to represent "read failed" itself, by design — see
 *  `attribution-read.ts`'s "NEVER EMPTY ON FAILURE" note). */
export function toAttributionReadout(rows: AttributionRow[]): AttributionReadout {
  const row = rows[0];
  if (!row) return { state: 'missing' };
  return rowToAttributionReadout(row);
}
