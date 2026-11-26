import 'server-only';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/** A Postgres or PostgREST code on the error, when it carries one (42501, PGRST116). */
function serverCodeOf(error: unknown): string | null {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined;
  return typeof code === 'string' && /^[A-Z0-9]{3,10}$/.test(code) ? code : null;
}

/**
 * Server-side counterpart of chReport: a failed read in a Clubhouse loader.
 * The action name is `clubhouse.<surface>.<read>` so Sentry and error_logs
 * group by screen and read, for example clubhouse.home.rounds.
 *
 * E5 (Bridge plan §4.2): while the `clubhouse_signals` switch is on, the row
 * this already writes carries `metadata.bridge`, a `state` failure from a
 * server read, so the Bridge sees the cause of a loader failure that the page
 * only shows as a toast. No second write: the fields ride on the one row, the
 * way the signal route's fields do while the migration is held.
 */
export function chLogServer(surface: string, read: string, error: unknown, featureArea = 'coach_dashboard'): void {
  let bridge: Record<string, unknown> | null = null;
  try {
    if (isFlagEnabled('clubhouse_signals', { skipTelemetry: true })) {
      bridge = { origin: 'E5', kind: 'state', outcome: 'failure', surface, read, serverCode: serverCodeOf(error) };
    }
  } catch {
    // A flag read never stops the failure from being logged.
  }
  void logServerError(`[clubhouse ${surface}] ${read} failed: ${describeError(error)}`, {
    action: `clubhouse.${surface}.${read}`,
    featureArea,
    // Server events carried no UI tag, so a Clubhouse read failure could not be told from a Fairway one (swap audit §18).
    tags: { ui: 'clubhouse', surface },
    ...(bridge ? { metadata: { bridge } } : {}),
  });
}
