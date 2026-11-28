import type { ErrorEvent, EventHint, StackFrame } from '@sentry/nextjs';
import { isAlreadyBridgeLogged } from '@/lib/bridge-logged-marker';
import { normalizeIncidentRoute } from '@/lib/admin/incident-grouping';

/**
 * Which browser errors Sentry captures by itself, and how each is written to the Bridge.
 *
 * `logError` (error-logging.ts) writes an error to Sentry and to the Bridge together, and the Bridge's window
 * handlers (`setupGlobalErrorHandlers`) take every error the page does not catch. Sentry's SDK also captures on its
 * own: every console.error, every failed request, and what an instrumented SDK such as Supabase's reports. Before
 * this, those reached Sentry and nothing else, so when Sentry dropped them (its error allowance ran out on Nov 19,
 * 2026) they were lost. A copy of each goes to the Bridge, which keeps its own record whether Sentry accepts the event
 * or not. `instrumentation-client.ts` sends the copy from its beforeSend.
 */

/** How the SDK caught the error. The Bridge row says it in its context, so a reader knows what kind of failure it is. */
export type CapturedBy = 'console' | 'failed-request' | 'sdk';

export interface BridgeCopy {
  /** The error to write: the original when the SDK had one, otherwise one built from the event's own message and frames. */
  error: Error;
  severity: 'high' | 'critical';
  context: {
    component: 'SentryCapture';
    action: CapturedBy;
    capturedBy: CapturedBy;
    /** The Sentry event, so the row can be found in Sentry while Sentry still stores events. */
    sentryEventId?: string;
    /** For a failed request: its method, status and where it went, without its query. */
    request?: { method: string | null; status: number | null; target: string | null };
  };
}

/** The Bridge's own report endpoint. A failure there is never copied back to it, or a broken endpoint would loop. */
const BRIDGE_REPORT_PATH = '/api/log-error';

/** error-logging.ts's own console line when a report could not be delivered. Copying it would loop the same way. */
const DELIVERY_FAILURE_PREFIX = '[error-logging]';

/** Sentry's handlers for an error the page did not catch; the Bridge's own window handlers write those. */
const GLOBAL_HANDLER_MECHANISM = /^(?:auto\.browser\.global_handlers\.|onerror$|onunhandledrejection$)/;
const HTTP_CLIENT_MECHANISM = /^(?:auto\.http\.client\.|http\.client$)/;
const CONSOLE_MECHANISM = /^(?:auto\.core\.capture_console$|console$)/;

function mechanismTypes(event: ErrorEvent): string[] {
  return (event.exception?.values ?? [])
    .map((value) => value.mechanism?.type)
    .filter((type): type is string => typeof type === 'string');
}

function capturedByOf(event: ErrorEvent, mechanisms: readonly string[]): CapturedBy {
  if (event.logger === 'console' || mechanisms.some((type) => CONSOLE_MECHANISM.test(type))) return 'console';
  if (mechanisms.some((type) => HTTP_CLIENT_MECHANISM.test(type))) return 'failed-request';
  return 'sdk';
}

function eventMessage(event: ErrorEvent): string {
  const exception = event.exception?.values?.[event.exception.values.length - 1];
  const fromException = exception?.value ?? exception?.type;
  return fromException || event.message || event.logentry?.message || 'Unknown error';
}

/** Sentry lists frames oldest first; a stack reads newest first, one `at` line per frame. */
function stackFromFrames(message: string, frames: readonly StackFrame[] | undefined): string | undefined {
  if (!frames || frames.length === 0) return undefined;
  const lines = [...frames].reverse().map((frame) => {
    const where = [frame.filename ?? frame.abs_path ?? '<anonymous>', frame.lineno, frame.colno]
      .filter((part) => part !== undefined && part !== null)
      .join(':');
    return frame.function ? `    at ${frame.function} (${where})` : `    at ${where}`;
  });
  return [`Error: ${message}`, ...lines].join('\n');
}

/**
 * Where a request went, as its path on this site or host and path elsewhere, never its query or fragment. Ids in the
 * path read `:id`, the way the Bridge groups routes, so every failure of one endpoint is one incident.
 */
function requestTarget(url: string | undefined, origin: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, origin);
    const path = normalizeIncidentRoute(parsed.pathname);
    return parsed.origin === origin ? path : `${parsed.host}${path}`;
  } catch {
    return null;
  }
}

function requestPath(url: string | undefined, origin: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url, origin).pathname;
  } catch {
    return null;
  }
}

function errorFor(event: ErrorEvent, hint: EventHint | undefined, message: string): Error {
  const original = hint?.originalException;
  if (original instanceof Error) return original;
  const error = new Error(message);
  const exception = event.exception?.values?.[event.exception.values.length - 1];
  error.stack = stackFromFrames(message, exception?.stacktrace?.frames) ?? error.stack;
  return error;
}

/**
 * The Bridge copy of a browser event Sentry captured by itself, or null when the Bridge already has it or should not.
 *
 * Copied: a production event at error or fatal level that no Bridge path wrote. Not copied: an event from outside
 * production (the Bridge stores production only); a warning or a notice, such as the browser's deprecation reports;
 * an error `logError` already wrote; an error the page did not catch, which the Bridge's window handlers write with
 * their own filters; and a failure of the Bridge's own reporting.
 *
 * `origin` is the page's origin, so a request to this site is named by its path.
 */
export function bridgeCopyOf(event: ErrorEvent, hint: EventHint | undefined, origin?: string): BridgeCopy | null {
  if (event.environment !== 'production') return null;
  if (event.level !== undefined && event.level !== 'error' && event.level !== 'fatal') return null;
  if (isAlreadyBridgeLogged(hint?.originalException)) return null;

  const mechanisms = mechanismTypes(event);
  if (mechanisms.some((type) => GLOBAL_HANDLER_MECHANISM.test(type))) return null;

  const capturedBy = capturedByOf(event, mechanisms);
  const message = eventMessage(event);
  if (capturedBy === 'console' && message.startsWith(DELIVERY_FAILURE_PREFIX)) return null;

  let request: BridgeCopy['context']['request'];
  if (capturedBy === 'failed-request') {
    if (requestPath(event.request?.url, origin) === BRIDGE_REPORT_PATH) return null;
    const response = event.contexts?.response as { status_code?: unknown } | undefined;
    request = {
      method: typeof event.request?.method === 'string' ? event.request.method : null,
      status: typeof response?.status_code === 'number' ? response.status_code : null,
      target: requestTarget(event.request?.url, origin),
    };
  }

  // A failed request is named by what failed, so each endpoint is its own incident in the Bridge.
  const named =
    request && request.target
      ? `Request failed${request.status ? ` (${request.status})` : ''}: ${request.method ?? 'GET'} ${request.target}`
      : message;

  return {
    error: errorFor(event, hint, named),
    // Error-level copies are filed as errors, like the window handlers' own rows, so they count in the
    // Bridge's failure totals. logCapturedErrorToBridge still caps self-recovering failures (a stale
    // chunk, a dropped request) to 'medium', exactly as it does for logError.
    severity: event.level === 'fatal' ? 'critical' : 'high',
    context: {
      component: 'SentryCapture',
      action: capturedBy,
      capturedBy,
      ...(event.event_id ? { sentryEventId: event.event_id } : {}),
      ...(request ? { request } : {}),
    },
  };
}
