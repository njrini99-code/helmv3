/**
 * Canonical classification for "is this event a shot-tracking event?".
 *
 * WHY THIS IS A SEPARATE, PURE MODULE
 * -----------------------------------
 * It used to live inside `src/app/golf/actions/admin-tracer-data.ts`, which
 * carries `'use server'`. Next.js only permits async function exports from such
 * a file, so the classifier could never be exported and therefore could never
 * be unit-tested — the exact code where a silent miss is most costly was the
 * code with no test. Pure, dependency-free, and importable from both the server
 * action and a test.
 *
 * WHAT WAS BROKEN, AND HOW IT WAS PROVEN
 * --------------------------------------
 * Two independent blind spots, both verified against real emitted strings
 * rather than inferred:
 *
 * 1. FEATURE AREA. `withAdminObserved` derives
 *    `featureArea: opts.featureArea ?? opts.feature`
 *    (locked by src/lib/admin/__tests__/observed-action.test.ts, which asserts
 *    `featureArea: 'round_tracking'`). Thirteen wrapped golf actions declare
 *    `feature: 'round_tracking'` and no featureArea — including `updateShot`
 *    and `submitGolfRoundComprehensive`. The old classifier accepted only
 *    `'shot_tracking'`, so those failures reached the tracer only by accident,
 *    via a fallback needing BOTH a roundId AND the word "round"/"shot" in free
 *    text.
 *
 * 2. NAMESPACED ACTIONS. The prefix list contained
 *    `'submitgolfroundcomprehensive'` and matched with `startsWith`. The action
 *    actually emitted is `golf.submitGolfRoundComprehensive`. It never matched.
 *    The single most important shot-tracking action in the product was
 *    invisible to this branch of its own tracer.
 *
 * DESIGN RULE
 * -----------
 * Prefer a false positive to a false negative. An unrelated round-adjacent
 * error showing up in the Golf Tracer costs an operator two seconds; a dropped
 * shot-tracking failure costs a player their round and shows up nowhere.
 */

/**
 * Feature areas that ARE shot tracking. `stats_cache` is deliberately absent —
 * it stays conditional at the call site, because cache events are only
 * shot-tracking when they carry a round identity.
 */
export const SHOT_TRACKING_FEATURE_AREAS: ReadonlySet<string> = new Set([
  'shot_tracking',
  'round_tracking',
  'rounds',
  'round_draft',
]);

/**
 * Action prefixes, matched against both the raw lowercased action and the
 * action with its leading namespace stripped.
 *
 * Every entry was taken from an actual `action:` string in the source. Grouped
 * by the pipeline stage it belongs to, so a new action has an obvious home.
 */
export const SHOT_TRACKING_ACTION_PREFIXES: readonly string[] = [
  // Final submit.
  'submitgolfroundcomprehensive',
  'savepartialround',
  'continueroundpage',
  'invalidateonroundcomplete',
  // Active shot editing — the "Shot not found" concurrency family.
  'addshot',
  'updateshot',
  'deleteshot',
  // Resume / staleness / draft persistence.
  'checkroundstaleness',
  'loadrounddraft',
  'saverounddraft',
  'clearrounddraft',
  'rounddetailpage',
  // Post-round processing that mutates or reads round state.
  'postroundtrigger',
  'onroundcomplete',
  'markstatsstale',
  'refreshstatscache',
  'recalculateround',
  // Round-level reads/repairs that surface tracking defects.
  'getroundshotdetails',
  'deleteinprogressround',
  'getplayershotanalytics',
];

/**
 * The lowercased action, plus — when namespaced (`golf.updateShot`,
 * `round_drafts.saveRoundDraft`) — the same value with the leading namespace
 * removed. Suffixed sub-steps (`deleteShot.invalidateStatsCache`) still match
 * by prefix against the first form.
 */
export function shotTrackingActionCandidates(action: string | null | undefined): string[] {
  const normalized = action?.toLowerCase().trim() ?? '';
  if (!normalized) return [];
  const separator = normalized.indexOf('.');
  if (separator <= 0) return [normalized];
  return [normalized, normalized.slice(separator + 1)];
}

/** True when the action belongs to any stage of the shot-tracking pipeline. */
export function isShotTrackingAction(action: string | null | undefined): boolean {
  const candidates = shotTrackingActionCandidates(action);
  if (candidates.length === 0) return false;
  return SHOT_TRACKING_ACTION_PREFIXES.some((prefix) =>
    candidates.some((candidate) => candidate.startsWith(prefix)),
  );
}

/** True when the feature area is unambiguously shot tracking. */
export function isShotTrackingFeatureArea(featureArea: string | null | undefined): boolean {
  const normalized = featureArea?.toLowerCase().trim() ?? '';
  if (!normalized) return false;
  return SHOT_TRACKING_FEATURE_AREAS.has(normalized);
}
