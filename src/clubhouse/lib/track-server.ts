import 'server-only';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Server-side counterpart of chReport: a failed read in a Clubhouse loader.
 * The action name is `clubhouse.<surface>.<read>` so Sentry and error_logs
 * group by screen and read, for example clubhouse.home.rounds.
 */
export function chLogServer(surface: string, read: string, error: unknown, featureArea = 'coach_dashboard'): void {
  void logServerError(`[clubhouse ${surface}] ${read} failed: ${describeError(error)}`, {
    action: `clubhouse.${surface}.${read}`,
    featureArea,
    // Server events carried no UI tag, so a Clubhouse read failure could not be told from a Fairway one (swap audit §18).
    tags: { ui: 'clubhouse', surface },
  });
}
