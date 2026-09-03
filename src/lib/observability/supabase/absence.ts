/**
 * Absence detection — brief §74, and anti-pattern "no telemetry is not no
 * errors" (§80-86).
 *
 * Every other module in this directory answers "what did the signal SAY".
 * This one answers the harder question: "did the signal STOP". A collector
 * that dies, a cron job that was never registered, a Realtime channel that
 * nobody subscribes to any more, a release that removes the instrumentation
 * from a hot path — none of these produce an error. They produce silence,
 * and silence renders as a clean board.
 *
 * THE FALSE-ALARM PROBLEM IS THE WHOLE PROBLEM
 * ---------------------------------------------
 * Silence has two causes and they look identical from the data alone:
 *
 *   the producer broke        <- an outage
 *   nobody asked it to run    <- a Tuesday in February
 *
 * A golf team does not submit rounds out of season. A collector that is
 * deliberately disabled while its migration is HELD is not failing. Zero
 * active users at 04:00 produces zero of everything. An absence detector
 * that cannot tell these apart will cry wolf until it is muted, and a muted
 * detector is worse than no detector — it is a detector the operator now
 * believes is covering them.
 *
 * So `ActivityContext` is a REQUIRED field on every detector input, not an
 * optional one, and it has three variants rather than two. Omitting it is a
 * compile error rather than a silent "assume active". Where the context is
 * itself unreadable the verdict is `unknown` — never `absent`. This module
 * would rather say nothing than say something false.
 *
 * NO CALENDAR IS HARDCODED HERE. Season windows are an input
 * (`activityFromSeasonWindows`), because this repo serves golf, baseball and
 * lifting on different calendars and a constant in this file would be wrong
 * for at least two of them within a month.
 *
 * Pure: no I/O, no ambient clock (`now` is always supplied), no server-only
 * import.
 */
import type { DbStateSignal } from './db-state';

// ---------------------------------------------------------------------------
// Activity context — the input that stops every detector guessing
// ---------------------------------------------------------------------------

/**
 * Whether the producer of a signal was EXPECTED to be producing during the
 * observed window.
 *
 *   active   something should have been produced (users were online, the
 *            season is open, the collector is enabled).
 *   quiet    nothing was expected (off season, zero active users, the
 *            collector is deliberately off). Silence here is correct.
 *   unknown  we could not tell. Silence here teaches nothing.
 *
 * `evidence` is a short safe sentence naming HOW this was decided, so a
 * surface can show the operator why a detector stayed quiet.
 */
export type ActivityContext =
  | { kind: 'active'; evidence: string }
  | { kind: 'quiet'; evidence: string }
  | { kind: 'unknown'; evidence: string };

export function activityFromActiveUsers(input: { activeUsers: number | null; measured: boolean }): ActivityContext {
  if (!input.measured || input.activeUsers === null || !Number.isFinite(input.activeUsers)) {
    return { kind: 'unknown', evidence: 'active-user count could not be measured' };
  }
  if (input.activeUsers > 0) {
    return { kind: 'active', evidence: `${input.activeUsers} active user(s) in the observed window` };
  }
  return { kind: 'quiet', evidence: 'zero active users in the observed window' };
}

export interface SeasonWindow {
  /** Low-cardinality label, e.g. `fall_2026`. Never a team or user name. */
  label: string;
  startsAt: string;
  endsAt: string;
}

/**
 * An EMPTY window list is `unknown`, not `quiet`. "We were given no
 * calendar" and "we are out of season" are different facts, and collapsing
 * them would let a missing configuration silence every seasonal detector
 * permanently — the quietest possible failure.
 */
export function activityFromSeasonWindows(input: { now: Date; windows: readonly SeasonWindow[] }): ActivityContext {
  if (input.windows.length === 0) {
    return { kind: 'unknown', evidence: 'no season calendar supplied' };
  }

  const nowMs = input.now.getTime();
  for (const window of input.windows) {
    const start = new Date(window.startsAt).getTime();
    const end = new Date(window.endsAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      return { kind: 'unknown', evidence: `season window '${window.label}' has an unparseable date` };
    }
    if (nowMs >= start && nowMs <= end) {
      return { kind: 'active', evidence: `inside season window '${window.label}'` };
    }
  }
  return { kind: 'quiet', evidence: 'outside every supplied season window' };
}

export function activityFromCollectorEnablement(input: { enabled: boolean | null }): ActivityContext {
  if (input.enabled === null) {
    return { kind: 'unknown', evidence: 'collector enablement could not be determined' };
  }
  return input.enabled
    ? { kind: 'active', evidence: 'collector is deployed and enabled' }
    : { kind: 'quiet', evidence: 'collector is deliberately disabled' };
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/**
 *   present           the signal is still arriving.
 *   absent            it stopped, and it was expected to be arriving.
 *   expected_silence  it stopped, and nothing was expected to arrive.
 *   unknown           we cannot tell. Never rendered as healthy.
 */
export type AbsenceVerdict = 'present' | 'absent' | 'expected_silence' | 'unknown';

export interface AbsenceFinding {
  /** Stable low-cardinality detector id. */
  detector: string;
  verdict: AbsenceVerdict;
  /** Safe one-sentence explanation, including the activity evidence. */
  reason: string;
}

/**
 * The single place the context gate is applied, so no detector can
 * accidentally implement it differently. Reached ONLY after a detector has
 * established that the signal really is missing and that its own inputs
 * were readable.
 */
function gateOnContext(detector: string, context: ActivityContext, missingDescription: string): AbsenceFinding {
  if (context.kind === 'unknown') {
    return {
      detector,
      verdict: 'unknown',
      reason: `${missingDescription}, but whether it was expected is unknown (${context.evidence}).`,
    };
  }
  if (context.kind === 'quiet') {
    return { detector, verdict: 'expected_silence', reason: `${missingDescription}, as expected (${context.evidence}).` };
  }
  return { detector, verdict: 'absent', reason: `${missingDescription} while activity was expected (${context.evidence}).` };
}

// ---------------------------------------------------------------------------
// 1. Health samples ceased
// ---------------------------------------------------------------------------

/** Matches `freshness.ts`'s STALE_MULTIPLIER on purpose: one missed tick is
 *  scheduler jitter, three is a stopped collector. Deliberately NOT tighter
 *  — a detector that fires on jitter is a detector that gets muted. */
const CEASED_INTERVAL_MULTIPLIER = 3;

export interface HealthSamplesCeasedInput {
  lastSampleAt: string | null;
  expectedIntervalMs: number;
  now: Date;
  /** `false` when the store itself could not be read — distinct from
   *  "read fine, no rows". */
  readable: boolean;
  context: ActivityContext;
}

export function detectHealthSamplesCeased(input: HealthSamplesCeasedInput): AbsenceFinding {
  const detector = 'health_samples_ceased';

  if (!input.readable) {
    return { detector, verdict: 'unknown', reason: 'The health sample store could not be read this refresh.' };
  }
  if (!input.lastSampleAt) {
    // A signal that never started did not stop. This is a
    // not-yet-deployed/HELD state, and reporting it as an outage would make
    // every pre-launch board red.
    return { detector, verdict: 'unknown', reason: 'No health sample has ever been recorded, so nothing has ceased.' };
  }

  const ageMs = input.now.getTime() - new Date(input.lastSampleAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return { detector, verdict: 'unknown', reason: 'The last health sample timestamp is unusable or in the future.' };
  }
  if (ageMs <= input.expectedIntervalMs * CEASED_INTERVAL_MULTIPLIER) {
    return { detector, verdict: 'present', reason: 'Health samples are still arriving within the expected interval.' };
  }

  const intervals = Math.floor(ageMs / Math.max(input.expectedIntervalMs, 1));
  return gateOnContext(detector, input.context, `Health samples stopped roughly ${intervals} intervals ago`);
}

// ---------------------------------------------------------------------------
// 2. Zero submit attempts in season
// ---------------------------------------------------------------------------

/** Below this, a zero is meaningless: no product in this repo is expected to
 *  produce a submit every few minutes. */
export const MIN_SUBMIT_WINDOW_MINUTES = 60;

export interface ZeroSubmitAttemptsInput {
  /** Attempts observed in the window, or `null` when the counter could not
   *  be read (never coerce a failed read to 0 — brief §6/§86). */
  attemptCount: number | null;
  windowMinutes: number;
  context: ActivityContext;
}

export function detectZeroSubmitAttempts(input: ZeroSubmitAttemptsInput): AbsenceFinding {
  const detector = 'zero_submit_attempts';

  if (input.attemptCount === null || !Number.isFinite(input.attemptCount)) {
    return { detector, verdict: 'unknown', reason: 'The submit-attempt counter could not be read.' };
  }
  if (input.attemptCount > 0) {
    return { detector, verdict: 'present', reason: `${input.attemptCount} submit attempt(s) observed in the window.` };
  }
  if (input.windowMinutes < MIN_SUBMIT_WINDOW_MINUTES) {
    return {
      detector,
      verdict: 'unknown',
      reason: `A ${input.windowMinutes}-minute window is too short to conclude anything from zero submit attempts.`,
    };
  }

  return gateOnContext(detector, input.context, `Zero submit attempts over ${input.windowMinutes} minutes`);
}

// ---------------------------------------------------------------------------
// 3. Subscriptions at zero
// ---------------------------------------------------------------------------

export interface ZeroSubscriptionsInput {
  subscriptionCount: number | null;
  context: ActivityContext;
}

export function detectZeroSubscriptions(input: ZeroSubscriptionsInput): AbsenceFinding {
  const detector = 'zero_subscriptions';

  if (input.subscriptionCount === null || !Number.isFinite(input.subscriptionCount)) {
    return { detector, verdict: 'unknown', reason: 'The Realtime subscription count could not be read.' };
  }
  if (input.subscriptionCount > 0) {
    return { detector, verdict: 'present', reason: `${input.subscriptionCount} Realtime subscription(s) observed.` };
  }

  return gateOnContext(detector, input.context, 'Zero Realtime subscriptions observed');
}

// ---------------------------------------------------------------------------
// 4. Cron job absent
// ---------------------------------------------------------------------------

export interface CronJobAbsentInput {
  expectedJobName: string;
  registeredJobNames: readonly string[];
  /** `false` when the job catalog could not be read. An unreadable catalog
   *  is not an empty one — the single easiest way to manufacture a false
   *  "the job is gone" alarm. */
  catalogReadable: boolean;
  context: ActivityContext;
}

export function detectCronJobAbsent(input: CronJobAbsentInput): AbsenceFinding {
  const detector = 'cron_job_absent';

  if (!input.catalogReadable) {
    return { detector, verdict: 'unknown', reason: 'The scheduled-job catalog could not be read this refresh.' };
  }
  if (input.registeredJobNames.includes(input.expectedJobName)) {
    return { detector, verdict: 'present', reason: `Job '${input.expectedJobName}' is registered.` };
  }

  return gateOnContext(detector, input.context, `Job '${input.expectedJobName}' is not registered`);
}

// ---------------------------------------------------------------------------
// 5. DB spans vanished after a release
// ---------------------------------------------------------------------------

/** A deploy window shorter than this cannot distinguish "instrumentation
 *  gone" from "the first pods have not served a request yet". */
export const MIN_SPAN_WINDOW_MINUTES = 15;

export interface DbSpansVanishedInput {
  /** Span counts either side of a release boundary, or `null` where the
   *  count could not be read. */
  spansBefore: number | null;
  spansAfter: number | null;
  /** Length of the POST-release observation window. */
  windowMinutes: number;
  context: ActivityContext;
}

export function detectDbSpansVanished(input: DbSpansVanishedInput): AbsenceFinding {
  const detector = 'db_spans_vanished';

  if (
    input.spansBefore === null ||
    input.spansAfter === null ||
    !Number.isFinite(input.spansBefore) ||
    !Number.isFinite(input.spansAfter)
  ) {
    return { detector, verdict: 'unknown', reason: 'Database span counts either side of the release could not be read.' };
  }
  if (input.spansAfter > 0) {
    return { detector, verdict: 'present', reason: `${input.spansAfter} database span(s) observed after the release.` };
  }
  if (input.spansBefore <= 0) {
    // Zero after zero is not a regression. Without a pre-release baseline
    // there is nothing to have lost.
    return {
      detector,
      verdict: 'unknown',
      reason: 'No database spans were recorded before the release either, so there is no baseline to compare against.',
    };
  }
  if (input.windowMinutes < MIN_SPAN_WINDOW_MINUTES) {
    return {
      detector,
      verdict: 'unknown',
      reason: `A ${input.windowMinutes}-minute post-release window is too short to conclude spans have vanished.`,
    };
  }

  return gateOnContext(
    detector,
    input.context,
    `Database spans fell from ${input.spansBefore} to zero after the release`,
  );
}

// ---------------------------------------------------------------------------
// Composition into the Bridge state model
// ---------------------------------------------------------------------------

/**
 * Absence findings become `db-state.ts` signals so the Bridge header folds
 * them with every other rule instead of rendering a second, parallel status.
 *
 * `unknown` maps to an `unknown` LEVEL rather than to `ok`. That mapping is
 * the whole contract: an absence detector that could not decide must not be
 * able to contribute to a GREEN.
 */
export function absenceFindingsToSignals(findings: readonly AbsenceFinding[]): DbStateSignal[] {
  return findings.map((finding) => ({
    id: `absence.${finding.detector}`,
    level: finding.verdict === 'absent' ? 'critical' : finding.verdict === 'unknown' ? 'unknown' : 'ok',
    summary: finding.reason,
  }));
}
