/**
 * Dedup helper for `recordInsightAction` (event-ledger.ts) — Pkg 9 slice 1a.
 *
 * Mirrors `exposure-rows.ts`'s `recordInsightExposure` dedup (#1506) for the
 * same reason: a double-submit (network retry, double-tap on "Add to plan" /
 * "Create focus") must not write two ledger rows for what the player/coach
 * experienced as one action, inflating the effectiveness rollup's `acted`
 * count (`event-ledger.ts`'s `getInsightEffectivenessSignals`) for a real
 * count of one.
 *
 * App-level, "racy-but-adequate" — a concurrent request can still double-
 * write between the read and the insert; the robust version needs a unique
 * index, which is a migration + owner decision on the shared production DB,
 * the same tracked shape as #1506.
 */

/** The (insight, actor, action_type) identity a day's worth of an action
 *  collapses to. Deliberately excludes `metadata`: two `create_focus` rows
 *  for the SAME insight/actor/day are the same real-world action even if a
 *  retry's `metadata.focus_area_id` differs from the first attempt's — the
 *  dedup key describes what happened, not what an unreliable retry recorded
 *  about it. */
export function actionDedupeKey(row: {
  insight_id: string;
  actor_id?: string | null;
  action_type: string;
}): string {
  return `${row.insight_id}::${row.actor_id ?? ''}::${row.action_type}`;
}

/** True when `row`'s (insight, actor, action_type) key is already present in
 *  `alreadyRecordedKeys` — i.e. already written today. Pure so it can be
 *  unit-tested without a database. */
export function isActionAlreadyRecorded(
  row: { insight_id: string; actor_id?: string | null; action_type: string },
  alreadyRecordedKeys: ReadonlySet<string>,
): boolean {
  return alreadyRecordedKeys.has(actionDedupeKey(row));
}
