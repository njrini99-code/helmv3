/**
 * The "round setup restored after reload" signal, reported as what it is: an
 * expected recovery, not an error.
 *
 * When `NewRoundClient` remounts with a pending tee pick in
 * `new-round-pick-cache.ts` (WKWebView content-process kill, stale-asset
 * boot recovery), the pick is re-applied and the player lands back on the
 * setup screen they were on. That recovery is the feature working. The event
 * is still worth counting — it is the only trace a mid-setup reload leaves,
 * since the process kill behind it never reaches JS — but it used to go
 * through `logError(new Error(...))`, i.e. `Sentry.captureException`, which
 * opened error-category issues for a success path (JAVASCRIPT-NEXTJS-XG in
 * production, -XE on a preview) and wrote a Bridge `error_logs` row for it.
 *
 * It is now a structured Sentry log line (`helmLog.info`, queryable in
 * Explore > Logs by `event`) plus a `golf.round` breadcrumb, so any genuine
 * error later in the same session still shows that a reload restored the
 * setup first. No exception, no issue, no `error_logs` row.
 */

import { helmLog } from '@/lib/observability/structured-log';
import { recordHelmBreadcrumb } from '@/lib/observability/client-breadcrumbs';

export const ROUND_SETUP_RESTORED_EVENT = 'golf.round_setup.restored_after_reload';

export interface RoundSetupRestoredContext {
  courseId: string;
  teeId: string;
}

export function reportRoundSetupRestoredAfterReload(context: RoundSetupRestoredContext): void {
  const hasNavigator = typeof navigator !== 'undefined';
  helmLog.info(ROUND_SETUP_RESTORED_EVENT, {
    sport: 'golf',
    feature: 'round_tracking',
    action: 'round_setup_restore',
    result: 'restored',
    component: 'NewRoundClient',
    route: '/golf/dashboard/rounds/new',
    course_id: context.courseId,
    tee_id: context.teeId,
    navigator_online: hasNavigator ? navigator.onLine : null,
    is_native: hasNavigator && /HelmSportsLabsApp/.test(navigator.userAgent),
  });
  recordHelmBreadcrumb('golf.round', 'Round setup restored after reload', {
    feature: 'round_tracking',
    action: 'round_setup_restore',
    result: 'restored',
  });
}
