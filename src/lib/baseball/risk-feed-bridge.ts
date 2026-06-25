// =============================================================================
// risk-feed-bridge.ts
//
// Bridges BaseballHelm runtime errors into the local "command-center city" so
// the live build dashboard surfaces real production-shaped risk as it happens.
//
// WHAT IT DOES
//   reportBaseballRiskToCity(entry) POSTs a single risk/error event to the local
//   command center (http://127.0.0.1:4877/api/events) using the same event shape
//   the build CLI emits (see scripts/baseballhelm-build-event.mjs):
//     { type, agent, packet, title, detail, severity, source, pct? }
//
//   - type:      'risk_added' (a runtime error/risk surfaced) or 'test_failed'
//                (an assertion/contract failure surfaced at runtime).
//   - agent:     always 'risk-warden' — the city attributes the event to us.
//   - severity:  derived from the trace level (info|warning|error|critical).
//   - title/detail: drawn from the error message + context.
//   - source:    'runtime' — distinguishes runtime-captured risk from build-time
//                or CLI-emitted events.
//
// HONESTY RULE (V12 PROVENANCE)
//   Per the V12 honesty rule, every risk is tagged with its provenance so the
//   city never blurs intent with evidence:
//     - 'active capture' — the risk was OBSERVED at runtime (an error actually
//        fired through server-error-logger.ts). This bridge ALWAYS reports
//        'active capture': by definition it only runs when a real trace occurs.
//     - 'logged intent'  — a risk that was DECLARED/anticipated but never
//        observed firing. This bridge never fabricates those; callers that want
//        to log a planned-but-unobserved risk must pass provenance:'logged intent'
//        explicitly, and it is carried through verbatim so the dashboard can
//        visually separate "this happened" from "we expect this might."
//   The provenance is embedded in `detail` (human-readable) so it survives even
//   the minimal event schema the city ingests.
//
// FAIL-SILENT CONTRACT
//   The command center is a local dev convenience and is frequently offline. This
//   module NEVER throws and NEVER blocks the request path: a fire-and-forget POST
//   with a short timeout, every error swallowed. If the city is down, the error
//   has already been persisted by server-error-logger.ts (Sentry + admin tables);
//   the city bridge is purely additive observability.
//
// OWNERSHIP: this file only. It is a pure client of the command-center HTTP
// endpoint and imports nothing from the request lifecycle.
// =============================================================================

/** Severity levels shared with server-error-logger.ts (kept structurally local
 *  so this module has no import-time coupling to the shared logger). */
export type BaseballRiskLevel = 'info' | 'warning' | 'error' | 'critical';

/** City event types this bridge is allowed to emit. */
export type BaseballRiskEventType = 'risk_added' | 'test_failed';

/**
 * V12 provenance tag. Defaults to 'active capture' because this bridge only runs
 * in response to a real runtime trace. Pass 'logged intent' only when reporting
 * an anticipated-but-unobserved risk.
 */
export type BaseballRiskProvenance = 'active capture' | 'logged intent';

export interface BaseballRiskEntry {
  /** Short headline for the risk (becomes the city event title). */
  title: string;
  /** Longer human-readable context (becomes the city event detail). */
  detail?: string;
  /** Trace severity; maps 1:1 onto the city event severity. */
  level?: BaseballRiskLevel;
  /** Which city lane the event belongs to. Defaults to 'risk_added'. */
  eventType?: BaseballRiskEventType;
  /** Build packet this risk belongs to (defaults to 'runtime'). */
  packet?: string;
  /** V12 provenance — defaults to 'active capture'. */
  provenance?: BaseballRiskProvenance;
}

const CITY_ENDPOINT = 'http://127.0.0.1:4877/api/events';
const CITY_AGENT = 'risk-warden';
const CITY_SOURCE = 'runtime';
const POST_TIMEOUT_MS = 1500;
const MAX_TITLE = 500;
const MAX_DETAIL = 2000;

function clamp(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Map a trace level onto a city severity. 'critical' is preserved as 'critical'
 * (the city understands the four-level scale the logger uses).
 */
function toCitySeverity(level: BaseballRiskLevel | undefined): BaseballRiskLevel {
  return level ?? 'error';
}

/**
 * Default a city event type from severity when the caller does not specify one.
 * info/warning lean "risk_added"; the explicit eventType always wins.
 */
function resolveEventType(entry: BaseballRiskEntry): BaseballRiskEventType {
  return entry.eventType ?? 'risk_added';
}

/**
 * Report a single BaseballHelm runtime risk to the command-center city.
 *
 * Fire-and-forget: returns a promise that ALWAYS resolves (never rejects). Safe
 * to `void` from a hot request path — it will not block and will not throw if
 * the city is offline.
 */
export async function reportBaseballRiskToCity(entry: BaseballRiskEntry): Promise<void> {
  try {
    const provenance: BaseballRiskProvenance = entry.provenance ?? 'active capture';
    const severity = toCitySeverity(entry.level);
    const type = resolveEventType(entry);

    // Tag provenance into the detail so the V12 honesty distinction survives the
    // city's minimal event schema (which has no dedicated provenance field).
    const detailBody = entry.detail?.trim() ? entry.detail.trim() : entry.title.trim();
    const detail = clamp(`[${provenance}] ${detailBody}`, MAX_DETAIL);

    const payload = {
      type,
      agent: CITY_AGENT,
      packet: entry.packet?.trim() || 'runtime',
      title: clamp(entry.title.trim(), MAX_TITLE),
      detail,
      severity,
      source: CITY_SOURCE,
    };

    await fetch(CITY_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      // Short timeout so a hung listener can't stall the request path.
      signal: AbortSignal.timeout(POST_TIMEOUT_MS),
      // Never let a city POST keep the response open.
      keepalive: true,
    }).catch(() => {
      // City offline / unreachable — swallow. The error is already persisted by
      // server-error-logger.ts; the city is additive-only observability.
    });
  } catch {
    // Defensive: serialization, AbortSignal.timeout unavailability, or any
    // other surprise must never escape into the request path.
  }
}

/**
 * Helper for server-error-logger.ts to bridge sport==='baseball' runtime traces
 * into the city. Call this from the logger's capture path, gated on the trace
 * being a baseball error, e.g.:
 *
 *   if (context.tags?.sport === 'baseball') {
 *     void bridgeBaseballErrorToCity({
 *       message,
 *       level: severity,
 *       action: context.action,
 *       featureArea: context.featureArea,
 *       handled: context.handled,
 *     });
 *   }
 *
 * It is intentionally `void`-friendly (returns a never-rejecting promise) so the
 * logger never has to await it and the request path is never blocked.
 *
 * Provenance is ALWAYS 'active capture' here: by the time the logger calls us,
 * the error has genuinely fired at runtime — never a 'logged intent'.
 */
export function bridgeBaseballErrorToCity(args: {
  message: string;
  level?: BaseballRiskLevel;
  action?: string;
  featureArea?: string | null;
  /** false = an unhandled/escaping error; surfaces as 'test_failed' lane. */
  handled?: boolean;
  packet?: string;
}): Promise<void> {
  const { message, level, action, featureArea, handled, packet } = args;

  const titlePrefix = action ? `[${action}] ` : '';
  const title = `${titlePrefix}${message}`;

  const detailParts: string[] = [];
  if (featureArea) detailParts.push(`area: ${featureArea}`);
  if (action) detailParts.push(`action: ${action}`);
  if (handled === false) detailParts.push('handled: false');

  // An unhandled error reaching the logger reads as a broken contract — surface
  // it in the 'test_failed' lane so it stands out from routine risk telemetry.
  const eventType: BaseballRiskEventType =
    handled === false ? 'test_failed' : 'risk_added';

  return reportBaseballRiskToCity({
    title,
    detail: detailParts.length ? detailParts.join(' · ') : undefined,
    level,
    eventType,
    packet: packet ?? 'runtime',
    provenance: 'active capture',
  });
}
