/**
 * Helm Bridge — incident CLASSIFICATION.
 *
 * WHY THIS EXISTS
 * ---------------
 * Until now the Bridge had exactly two axes for an incident: `event_type`
 * ('error') and `severity` ('critical'|'error'|'warning'|'info'). Neither
 * answers the only question an operator actually opens /admin/errors to ask:
 * *is this a bug I have to do something about?*
 *
 * Production bore that out. In the July 2026 feed the single largest
 * "unresolved incident" was `insights.triggerPlayerInsightsAfterRound
 * .gateMetrics` at 596 rows / 575 unresolved — routine threshold telemetry,
 * not a defect. Right behind it sat 129 rows of `Integrity PASS`: integrity
 * checks that PASSED, filed as errors and left unresolved forever. Genuine
 * defects (`documents.handleError … [object Object]`, React #310, a
 * `column … does not exist` query failure) ranked BELOW that noise.
 *
 * Severity could not fix this on its own: routine telemetry and a real bug
 * are both routinely logged at the same severity, and a `warning`-severity
 * handled fallback is categorically different from a `warning`-severity
 * upstream outage. What was missing is a KIND axis, orthogonal to severity.
 *
 * DESIGN
 * ------
 * - READ-TIME, not capture-time. This is a pure function applied when the
 *   feed is built, which means it works retroactively across all ~93k
 *   existing rows with NO migration and NO backfill, and a rule change takes
 *   effect on history immediately. If a rule turns out wrong, nothing was
 *   destructively rewritten — only the derived view changes.
 * - PURE + DETERMINISTIC. No I/O, no clock, no Supabase. Same input → same
 *   output, so it is exhaustively unit-testable and safe to call in a render
 *   path or a cron alike.
 * - ORDERED rules, first match wins. Precedence is explicit and documented;
 *   `explain()` reports which rule fired so a surprising classification is
 *   debuggable from the UI instead of being a black box.
 * - SEVERITY IS THE FALLBACK LADDER, never overridden silently: an unmatched
 *   critical/error is a defect, an unmatched warning is a degradation, an
 *   unmatched info is telemetry. New unanticipated failures therefore default
 *   to VISIBLE (defect) rather than being silently swallowed — the safe
 *   direction for a triage tool.
 */

export type IncidentClass =
  /** A genuine unexpected failure. Belongs in triage. */
  | 'defect'
  /** Handled fallback — the system degraded but continued. Worth watching. */
  | 'degradation'
  /** Upstream/provider fault (quota, rate limit, model error). Not our bug. */
  | 'integration'
  /** Expected access control. Only actionable when it is the RLS tripwire. */
  | 'access'
  /** "Not enough data yet" surfaced through the error path. Never a bug. */
  | 'empty_state'
  /** Routine operational signal (gate metrics, threshold starvation). */
  | 'telemetry'
  /** An integrity check that PASSED. Never actionable, by definition. */
  | 'integrity_ok';

export interface IncidentClassification {
  klass: IncidentClass;
  /**
   * Does this belong in the actionable triage queue? The Errors tab defaults
   * to `actionable === true`; everything else stays one chip away rather than
   * being deleted — nothing is ever hidden irrecoverably.
   */
  actionable: boolean;
  /** Which rule fired, in operator-readable words. Surfaced in the UI. */
  reason: string;
  /**
   * True when the message lost its content on the way in — the classic
   * `String(errorObject)` → "[object Object]" bug. Orthogonal to class: a
   * defect with a degraded message is still a defect, but it is one you
   * cannot debug, so it is worth flagging distinctly.
   */
  hasDegradedMessage: boolean;
}

export interface ClassifiableIncident {
  title?: string | null;
  message?: string | null;
  severity?: string | null;
  source?: string | null;
  errorCode?: string | null;
}

/** Case-insensitive "any of these substrings appears" test. */
function matchesAny(haystack: string, needles: readonly string[]): string | null {
  for (const needle of needles) {
    if (haystack.includes(needle)) return needle;
  }
  return null;
}

// --- Rule vocabularies -----------------------------------------------------
// Every entry below was taken from a real admin_events title observed in
// production, not invented. Keep them lowercase — inputs are folded first.

/** Integrity checks that passed. `Integrity PASS: <name> (0)`. */
const INTEGRITY_PASS = ['integrity pass'];

/**
 * Expected authorization outcomes. NOTE the deliberate specificity of
 * 'you do not have access': the broader 'do not have access' would swallow
 * "Free tier users do not have access to this model", which is a BILLING
 * fault (classified `integration` below), not an access-control outcome.
 */
const ACCESS_PHRASES = [
  'you do not have access',
  'unauthorized',
  'not authorized',
  'forbidden',
  'not authenticated',
  'permission denied',
  'not a super admin',
  'invalid email or password',
  'you must be signed in',
  'must be signed in',
  'only coaches can',
  "isn't available in the live demo",
];

/** "Not enough data yet" — a product empty state, not a failure. */
const EMPTY_STATE_PHRASES = [
  'no rounds found',
  'no completed rounds',
  'no data found',
  'need at least',
  'not enough data',
  'no patterns produced',
  'insufficient data',
  'no results',
];

/**
 * Routine operational instrumentation — plus known-benign browser noise.
 * `ResizeObserver loop completed with undelivered notifications` is the
 * canonical example: it is emitted at error severity by the browser, is
 * famously harmless, and would otherwise rank as a defect forever.
 */
const TELEMETRY_PHRASES = [
  '.gatemetrics',
  '.starvation',
  '.thresholds',
  'belowroundfloor',
  'dynamic server usage',
  'threshold starvation',
  'refusing to emit',
  'resizeobserver loop',
  'cron 24h sent=',
];

/** Upstream provider faults — quota, billing, rate limiting, model errors. */
const INTEGRATION_PHRASES = [
  'credit balance',
  'rate limit',
  'rate-limit',
  'quota',
  'too many requests',
  'model error',
  'upstream',
  'service unavailable',
  'bad gateway',
  'econnreset',
  'etimedout',
  'network error',
  'paid credits',
  'free tier',
  'inngest api error',
];

/** Handled fallbacks — the call site explicitly continued. */
const DEGRADATION_PHRASES = [
  '(continuing',
  'continuing without',
  'falling back',
  'fallback',
  'degraded',
  'skipping',
];

/** The message lost its content on the way in. */
const DEGRADED_MESSAGE_MARKERS = [
  '[object object]',
  'undefined: undefined',
  '{"message":""}',
  ': {}',
];

/**
 * Classify one incident. Ordered — FIRST MATCH WINS. Precedence is deliberate:
 * a passing integrity check that happens to contain the word "denied" must
 * classify as integrity_ok, so the most specific rules run first.
 */
export function classifyIncident(input: ClassifiableIncident): IncidentClassification {
  const title = (input.title ?? '').toLowerCase();
  const message = (input.message ?? '').toLowerCase();
  const haystack = `${title} ${message}`;
  const severity = (input.severity ?? 'error').toLowerCase();
  const source = (input.source ?? '').toLowerCase();
  const errorCode = (input.errorCode ?? '').toLowerCase();

  const hasDegradedMessage = matchesAny(haystack, DEGRADED_MESSAGE_MARKERS) !== null;

  const done = (klass: IncidentClass, actionable: boolean, reason: string): IncidentClassification => ({
    klass,
    actionable,
    reason,
    hasDegradedMessage,
  });

  // 1. Integrity checks that PASSED. Most specific rule, runs first — these
  //    were 129 unresolved rows sitting at the top of the July queue.
  if (matchesAny(haystack, INTEGRITY_PASS)) {
    return done('integrity_ok', false, 'Integrity check passed');
  }

  // 2. The RLS tripwire is an access event but IS actionable — it exists
  //    precisely to catch a permission regression, so it must never be
  //    filtered out with ordinary expected denials below.
  if (source === 'rls_denial') {
    return done('access', true, 'RLS denial tripwire — possible permission regression');
  }

  // 3. Expected access control. Not a bug: the system correctly said no.
  const accessHit = matchesAny(haystack, ACCESS_PHRASES);
  if (accessHit) {
    return done('access', false, `Expected access control ("${accessHit}")`);
  }

  // 4. Provider/upstream faults. Checked before empty-state and telemetry
  //    because a quota error can otherwise read as "no results".
  //
  //    Actionability is source-dependent, and this distinction matters a lot
  //    at this codebase's scale: a SERVER-side provider fault (expired token,
  //    exhausted credits, Inngest key missing) is ours to fix, but a
  //    CLIENT-reported network fault is the visitor's connectivity. The
  //    historical feed contains 71,821 rows of "Client error: network error"
  //    — a single browser-connectivity class that would swamp the actionable
  //    queue on its own if treated the same as a server-side outage.
  const integrationActionable = source !== 'client';
  if (errorCode.startsWith('provider_')) {
    return done('integration', integrationActionable, `Provider fault (${errorCode})`);
  }
  const integrationHit = matchesAny(haystack, INTEGRATION_PHRASES);
  if (integrationHit) {
    return done(
      'integration',
      integrationActionable,
      integrationActionable
        ? `Upstream/provider fault ("${integrationHit}")`
        : `Client-side connectivity ("${integrationHit}") — not server-actionable`,
    );
  }

  // 5. Product empty states surfaced through the error path.
  const emptyHit = matchesAny(haystack, EMPTY_STATE_PHRASES);
  if (emptyHit) {
    return done('empty_state', false, `Empty state, not a failure ("${emptyHit}")`);
  }

  // 6. Routine operational instrumentation.
  const telemetryHit = matchesAny(haystack, TELEMETRY_PHRASES);
  if (telemetryHit) {
    return done('telemetry', false, `Routine operational telemetry ("${telemetryHit}")`);
  }

  // 7. Explicitly handled fallbacks.
  const degradationHit = matchesAny(haystack, DEGRADATION_PHRASES);
  if (degradationHit) {
    return done('degradation', true, `Handled fallback ("${degradationHit}")`);
  }

  // 8. Severity fallback ladder. Anything unmatched defaults by severity, and
  //    critically an unmatched error/critical defaults to a VISIBLE defect —
  //    a new unanticipated failure must never be silently filtered away.
  if (severity === 'critical' || severity === 'error') {
    return done('defect', true, 'Unexpected failure (severity-derived)');
  }
  if (severity === 'warning') {
    return done('degradation', true, 'Warning-level degradation (severity-derived)');
  }
  return done('telemetry', false, 'Informational (severity-derived)');
}

/** Human label for a class — used by chips, the detail page, and the report. */
export const INCIDENT_CLASS_LABEL: Record<IncidentClass, string> = {
  defect: 'Defect',
  degradation: 'Degradation',
  integration: 'Integration',
  access: 'Access',
  empty_state: 'Empty state',
  telemetry: 'Telemetry',
  integrity_ok: 'Integrity OK',
};

/**
 * One-line explanation of what a class MEANS, for the filter chip tooltip —
 * an operator should never have to read this source file to use the filter.
 */
export const INCIDENT_CLASS_DESCRIPTION: Record<IncidentClass, string> = {
  defect: 'An unexpected failure. These are the bugs.',
  degradation: 'Handled fallback — the system continued in a reduced mode.',
  integration: 'An upstream provider failed (quota, rate limit, model error).',
  access: 'Access control said no. Only RLS-tripwire rows are actionable.',
  empty_state: '"Not enough data yet" surfaced through the error path.',
  telemetry: 'Routine operational signal, not a failure.',
  integrity_ok: 'An integrity check that passed.',
};

/** Every class, in the order chips should render (actionable first). */
export const INCIDENT_CLASS_ORDER: readonly IncidentClass[] = [
  'defect',
  'integration',
  'degradation',
  'access',
  'empty_state',
  'telemetry',
  'integrity_ok',
];

export function isIncidentClass(value: string): value is IncidentClass {
  return (INCIDENT_CLASS_ORDER as readonly string[]).includes(value);
}
