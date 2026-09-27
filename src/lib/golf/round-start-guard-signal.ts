/**
 * Round-start guard outcomes, reported as what they are: the product doing
 * its job, not errors.
 *
 * Two outcomes on the New Round screen used to go through
 * `logError(new Error(...))`, which writes a Bridge `error_logs` /
 * `admin_events` row and opens an incident for a path that is working:
 *
 * - `duplicate_completed_round` (Bridge fingerprint 633f48a5, "Round start
 *   failed: duplicate_completed_round"). The server's R8 start-intent dedupe
 *   (`savePartialRound` in `src/app/golf/actions/golf.ts`) found a
 *   COMPLETED round on the same course and date, answered with the
 *   structured code, and the client showed "Tap Start round again to start a
 *   new one anyway"; the second tap proceeds. The server already records the
 *   outcome (`flightRecorder.warn('db.create_or_update_draft', ...)`).
 * - A client-side validation block before start (Bridge fingerprint
 *   e2530283, "Round start blocked: Round date cannot be in the future.").
 *   The player sees the validation banner and stays on the form.
 *
 * Both are still worth counting, so they become info-level structured Sentry
 * log lines (queryable by `event`) plus a `golf.round` breadcrumb: a genuine
 * error later in the same session still shows the guard fired first. No
 * exception, no issue, no Bridge incident. Genuine start failures
 * (`server_rejected`, network, timeouts) stay on `logError`.
 */

import { helmLog } from '@/lib/observability/structured-log';
import { recordHelmBreadcrumb } from '@/lib/observability/client-breadcrumbs';

export const ROUND_START_DUPLICATE_WARNED_EVENT = 'golf.round_start.duplicate_completed_round_warned';
export const ROUND_START_VALIDATION_BLOCKED_EVENT = 'golf.round_start.validation_blocked';

const BASE_FIELDS = {
  sport: 'golf',
  feature: 'round_tracking',
  component: 'NewRoundClient',
  route: '/golf/dashboard/rounds/new',
} as const;

export interface DuplicateCompletedRoundContext {
  completedRoundId: string | null | undefined;
  courseId: string | null | undefined;
  teeId: string | null | undefined;
  roundType: string | null | undefined;
  roundDate: string | null | undefined;
}

export function reportDuplicateCompletedRoundWarned(context: DuplicateCompletedRoundContext): void {
  helmLog.info(ROUND_START_DUPLICATE_WARNED_EVENT, {
    ...BASE_FIELDS,
    action: 'round_start',
    result: 'duplicate_completed_round_warned',
    completed_round_id: context.completedRoundId,
    course_id: context.courseId,
    tee_id: context.teeId,
    round_type: context.roundType,
    round_date: context.roundDate,
  });
  recordHelmBreadcrumb('golf.round', 'Round start warned: completed round already on this course and date', {
    feature: 'round_tracking',
    action: 'round_start',
    result: 'duplicate_completed_round_warned',
  });
}

export interface RoundStartValidationContext {
  validationError: string;
  roundType: string | null | undefined;
  roundDate: string | null | undefined;
}

export function reportRoundStartValidationBlocked(context: RoundStartValidationContext): void {
  helmLog.info(ROUND_START_VALIDATION_BLOCKED_EVENT, {
    ...BASE_FIELDS,
    action: 'round_start_validation',
    result: 'blocked',
    validation_error: context.validationError,
    round_type: context.roundType,
    round_date: context.roundDate,
  });
  recordHelmBreadcrumb('golf.round', 'Round start blocked by validation', {
    feature: 'round_tracking',
    action: 'round_start_validation',
    result: 'blocked',
  });
}
