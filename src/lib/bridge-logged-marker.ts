/**
 * Marker property set on an Error instance once it has gone through
 * logServerException, so instrumentation.ts's onRequestError (which sees the
 * same rethrown Error object escape the server-action/route boundary) can
 * skip writing a duplicate error_logs/admin_events/Sentry entry for it.
 * Non-enumerable so it never leaks into JSON.stringify'd error payloads.
 *
 * Lives in its own module (NOT server-error-logger) because that file is
 * 'use server' — every export there must be an async server action, and
 * exporting these sync helpers from it broke the production build
 * ("Server Actions must be async functions"; same class of bug previously
 * fixed for shouldPersistAdminTables — see telemetry-gate.ts).
 *
 * Also has zero node-only dependencies, so instrumentation.ts can import it
 * statically on both the edge and nodejs paths instead of needing a runtime
 * guard just for this check.
 */
const BRIDGE_LOGGED_MARKER = '__helmBridgeLogged';

export function isAlreadyBridgeLogged(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as Record<string, unknown>)[BRIDGE_LOGGED_MARKER] === true);
}

export function markBridgeLogged(error: Error): void {
  try {
    Object.defineProperty(error, BRIDGE_LOGGED_MARKER, {
      value: true,
      enumerable: false,
      configurable: true,
    });
  } catch {
    // Frozen/sealed error objects — best effort only, never throw here.
  }
}
