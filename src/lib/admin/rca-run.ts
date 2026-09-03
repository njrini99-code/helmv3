import 'server-only';

/**
 * Root-cause analysis — orchestration and persistence, callable from more
 * than one super-admin gate.
 *
 * Extracted from `src/app/admin/actions/analyze-error.ts` so a Vercel cron
 * (`src/app/api/cron/selfheal-triage/route.ts`) can run the exact same
 * analysis a human triggers from the Bridge, without going through a
 * `requireSuperAdmin()` check that assumes an authenticated browser session.
 * `analyzeErrorFingerprint` keeps its gate and now just calls
 * `runRcaForFingerprint`; nothing about that server action's behaviour
 * changed.
 *
 * Also adds a second entry point, `runRcaForReliabilitySignal`, for the
 * `rel:<signature>` groups the cron's collection sees that have no
 * `admin_events` rows at all — a Sentry/Supabase/Vercel signal the
 * reliability collector correlated. It builds the same kind of
 * `RcaSourceContext` from the signal's own fields instead of from
 * `fetchFingerprintDetail`, and calls the same `runRcaAnalysis`.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { fetchFingerprintDetail } from '@/lib/admin/data/errors';
import { classifyIncident } from '@/lib/admin/incident-classification';
import {
  buildIncidentReport,
  extractActionName,
  extractCollapsedCount,
  extractErrorCode,
  extractRoute,
  resolveActionFilePath,
} from '@/lib/admin/incident-report';
import { runRcaAnalysis, type RcaAnalysis, type RcaResult } from '@/lib/admin/rca';
import type { IncidentSeverity } from '@/lib/admin/incident-grouping';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import type { Json } from '@/lib/types/database';

type FingerprintEvent = Awaited<ReturnType<typeof fetchFingerprintDetail>>['events'][number];

/**
 * Written into every persisted analysis row's title. Shared with
 * `isOwnRcaAnalysisRow` below so the write and the filter can never drift
 * apart, and re-exported so `analyze-error.ts` keeps using the same constant
 * rather than growing a second copy.
 */
export const RCA_TITLE_PREFIX = 'RCA analysis: ';

/**
 * Defence in depth against an `rca_analysis` row reading back as an
 * occurrence of the incident it explains. See `analyzeErrorFingerprint`'s
 * original doc comment (now here) for why `fetchFingerprintDetail`'s own
 * `event_type` filter is the real fix and this is the second line.
 */
export function isOwnRcaAnalysisRow(
  event: Pick<FingerprintEvent, 'source' | 'feature' | 'title'>,
): boolean {
  return (
    event.source === 'system' &&
    event.feature === 'admin_dashboard' &&
    event.title.startsWith(RCA_TITLE_PREFIX)
  );
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, error: 1, warning: 2, info: 3 };

/**
 * Rebuild the incident report from an already-filtered event list rather than
 * trust `detail.report` (data/errors.ts bakes that string from the SAME
 * unfiltered rows `isOwnRcaAnalysisRow` exists to strip).
 */
export function buildCleanIncidentReport(fingerprint: string, events: FingerprintEvent[]): string {
  const last = events[0]!;
  const worst = events.reduce(
    (acc, e) => ((SEVERITY_RANK[e.severity] ?? 3) < (SEVERITY_RANK[acc] ?? 3) ? e.severity : acc),
    'info',
  );
  const actionName = events.map((e) => extractActionName(e.metadata)).find((a) => a !== null) ?? null;
  const stackTrace = events.map((e) => e.stack_trace).find((s) => !!s) ?? null;
  const collapsedCount = events.reduce((sum, e) => sum + extractCollapsedCount(e.metadata), 0);

  return buildIncidentReport({
    title: last.title,
    message: last.message,
    fingerprint,
    source: last.source ?? null,
    severity: worst,
    sport: last.sport ?? null,
    featureKey: last.feature ?? null,
    actionName,
    eventCount: events.length,
    collapsedCount,
    affectedUserCount: new Set(events.filter((e) => e.user_id).map((e) => e.user_id)).size,
    firstSeen: events[events.length - 1]?.created_at ?? null,
    lastSeen: events[0]?.created_at ?? null,
    windowLabel: `${events.length} occurrence${events.length === 1 ? '' : 's'} inspected (RCA analysis rows excluded)`,
    stackTrace,
    occurrences: events.slice(0, 20).map((e) => ({
      timestamp: e.created_at ?? 'unknown',
      route: e.url ?? extractRoute(e.metadata),
      userId: e.user_id,
    })),
  });
}

export interface PersistOutcome {
  persisted: boolean;
  error?: string;
}

/**
 * Persist a completed analysis onto `admin_events`. Returns whether the write
 * actually landed rather than swallowing the outcome — the original server
 * action never needed to know (the operator already has the result on
 * screen), but a cron's heartbeat counts `analysed` from this, and reporting
 * a row as analysed when the INSERT failed is exactly the STEP 5 failure
 * `triage-contract.md` was written against: a heartbeat's counts must be
 * true, and "the model answered" is not "the board changed".
 *
 * Still never throws — a persist failure must not fail the analysis the
 * caller already has in hand.
 */
export async function persistRcaAnalysis(fingerprint: string, analysis: RcaAnalysis): Promise<PersistOutcome> {
  try {
    const admin = createAdminClient();
    const nowIso = new Date().toISOString();
    const { error } = await admin.from('admin_events').insert({
      event_type: 'rca_analysis',
      title: `${RCA_TITLE_PREFIX}${fingerprint}`,
      severity: 'info',
      source: 'system',
      feature: 'admin_dashboard',
      fingerprint,
      // RcaAnalysis is a plain JSON-shaped object; the cast is needed because
      // an interface with optional properties doesn't structurally satisfy
      // Json's index-signature form even though every value it can hold does.
      metadata: analysis as unknown as Json,
      resolved: true,
      resolved_at: nowIso,
    });
    if (error) throw new Error(error.message);
    return { persisted: true };
  } catch (error) {
    const message = describeError(error);
    await logServerError(
      `[persistRcaAnalysis] failed to persist RCA analysis for ${fingerprint}: ${message}`,
      { action: 'admin.analyzeErrorFingerprint', featureArea: 'admin' },
    );
    return { persisted: false, error: message };
  }
}

/**
 * Run a fresh root-cause analysis for an `admin_events`-origin fingerprint.
 * Never throws — every failure path (bad input, missing events, unconfigured
 * provider, model error) returns a typed `RcaResult`.
 *
 * Callers: `analyzeErrorFingerprint` (after its own `requireSuperAdmin()`
 * gate) and the `selfheal-triage` cron (no gate — a Vercel cron authenticates
 * via `requireCronAuth`, not a user session).
 */
export async function runRcaForFingerprint(fingerprint: string): Promise<RcaResult> {
  const trimmed = (fingerprint ?? '').trim();
  if (!trimmed) return { status: 'error', message: 'A fingerprint is required.' };

  let detail: Awaited<ReturnType<typeof fetchFingerprintDetail>>;
  try {
    detail = await fetchFingerprintDetail(trimmed);
  } catch (error) {
    return { status: 'error', message: `Could not load incident detail: ${describeError(error)}` };
  }

  // Strip this fingerprint's own prior analyses before deriving anything —
  // see isOwnRcaAnalysisRow's doc comment for why fetchFingerprintDetail can
  // hand them back at all.
  const events = detail.events.filter((e) => !isOwnRcaAnalysisRow(e));
  if (events.length === 0) {
    return { status: 'error', message: 'No events found for this fingerprint.' };
  }

  // Query orders created_at desc, so events[0] is the most recent occurrence
  // — same assumption buildFingerprintIncidentReport (data/errors.ts) makes.
  const mostRecentFirst = events;
  const last = mostRecentFirst[0]!;
  const errorCode =
    mostRecentFirst.map((e) => extractErrorCode(e.metadata)).find((c) => c !== null) ?? null;
  const classification = classifyIncident({
    title: last.title,
    message: last.message,
    severity: last.severity,
    source: last.source ?? null,
    errorCode,
  });
  const actionName =
    mostRecentFirst.map((e) => extractActionName(e.metadata)).find((a) => a !== null) ?? null;
  const sourceFilePath = resolveActionFilePath(last.feature ?? null, actionName);
  const rawStacks = mostRecentFirst
    .map((e) => e.stack_trace)
    .filter((s): s is string => !!s)
    .slice(0, 3);

  return runRcaAnalysis({
    fingerprint: trimmed,
    // Rebuilt from the filtered events, NOT `detail.report` — see
    // buildCleanIncidentReport's doc comment.
    incidentReport: buildCleanIncidentReport(trimmed, events),
    rawStacks,
    classificationKind: classification.klass,
    sourceFilePath,
    nearbyDeploys: detail.summary.nearbyDeploys,
  });
}

/** Everything a `rel:<signature>` reliability-signal group carries — assembled
 *  by the cron route from a `TriageGroup`, not imported from `triage-engine`
 *  here, so this module stays decoupled from that one's types. */
export interface ReliabilitySignalContext {
  title: string;
  message: string | null;
  route: string | null;
  severity: IncidentSeverity;
  errorCode: string | null;
  feature: string | null;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  evidenceUrls: readonly string[];
}

/**
 * Run root-cause analysis for a reliability-origin group — a correlated
 * Sentry/Supabase/Vercel signal with no `admin_events` rows to read. Builds
 * the same kind of context `runRcaForFingerprint` assembles from
 * `fetchFingerprintDetail`, but from the signal's own fields: there is no
 * feature-registry action name to resolve a source file from, and no raw
 * stack beyond whatever evidence URL the signal carries.
 */
export async function runRcaForReliabilitySignal(
  fingerprint: string,
  ctx: ReliabilitySignalContext,
): Promise<RcaResult> {
  const report = buildIncidentReport({
    title: ctx.title,
    message: ctx.message,
    fingerprint,
    severity: ctx.severity,
    featureKey: ctx.feature,
    errorCode: ctx.errorCode,
    eventCount: ctx.occurrences,
    firstSeen: ctx.firstSeen,
    lastSeen: ctx.lastSeen,
    windowLabel: '72h triage window (reliability signal, no admin_events occurrences)',
    sentryUrl: ctx.evidenceUrls.find((u) => u.includes('sentry')) ?? null,
    occurrences: [],
  });

  return runRcaAnalysis({
    fingerprint,
    incidentReport: report,
    rawStacks: [],
    classificationKind: null,
    sourceFilePath: null,
  });
}
