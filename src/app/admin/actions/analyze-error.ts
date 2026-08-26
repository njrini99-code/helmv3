'use server';

/**
 * Root-cause analysis for one incident fingerprint.
 *
 * Thin orchestration only: gather the same context a human would paste into
 * Claude (the fingerprint's Copy-for-Claude incident report, its raw stacks,
 * its derived classification, and its resolved source-file hint), hand it to
 * @/lib/admin/rca's model call, and persist a successful result so the next
 * visit to this fingerprint doesn't re-spend on the same question.
 *
 * `analyzeErrorFingerprint` always runs a fresh analysis — `getStoredRcaAnalysis`
 * is the separate read path a page loads on mount to show the last one without
 * spending anything.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
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
import { runRcaAnalysis, rcaAnalysisSchema, type RcaAnalysis, type RcaResult } from '@/lib/admin/rca';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import type { Json } from '@/lib/types/database';

type FingerprintEvent = Awaited<ReturnType<typeof fetchFingerprintDetail>>['events'][number];

/**
 * Written into every persisted analysis row's title, and used below to
 * recognize one. Shared between the write and the filter so they can never
 * drift apart.
 */
const RCA_TITLE_PREFIX = 'RCA analysis: ';

/**
 * `fetchFingerprintDetail` (data/errors.ts) scopes every one of its three
 * queries by fingerprint alone — its select never includes `event_type` and
 * applies no `resolved` filter — so an `rca_analysis` row this action
 * persists under the SAME fingerprint comes back on the next run as just
 * another occurrence: it can become `last` (a self-referential report titled
 * "RCA analysis: …", classified `telemetry` off its own `severity: 'info'`
 * instead of the real incident's severity), inflate the occurrence count,
 * and shift `lastSeen`. errors.ts needs a real `event_type` fix (flagged
 * crossFile — this file cannot filter what it was never selected: no
 * `event_type` column is fetched). This recognizes rows by the exact
 * source/feature/title-prefix shape `persistRcaAnalysis` below writes — data
 * this action fully controls, so the recognition can't collide with a real
 * incident, but it is a defensive backstop, not the fix.
 */
function isOwnRcaAnalysisRow(event: Pick<FingerprintEvent, 'source' | 'feature' | 'title'>): boolean {
  return (
    event.source === 'system' &&
    event.feature === 'admin_dashboard' &&
    event.title.startsWith(RCA_TITLE_PREFIX)
  );
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, error: 1, warning: 2, info: 3 };

/**
 * Rebuild the incident report from an already-filtered event list rather
 * than trust `detail.report` (data/errors.ts bakes that string from the SAME
 * unfiltered rows `isOwnRcaAnalysisRow` above exists to strip). Mirrors
 * errors.ts's private `buildFingerprintIncidentReport` field-for-field —
 * same "existing builder" (`buildIncidentReport`), same shape — so the two
 * reports read identically for a fingerprint with no prior RCA runs, and
 * only diverge once one exists, which is exactly the case this must not get
 * wrong.
 */
function buildCleanIncidentReport(fingerprint: string, events: FingerprintEvent[]): string {
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

/**
 * Persist a completed analysis onto `admin_events`. Same convention as every
 * other non-incident record this table holds (deploy markers, activity
 * records — see admin-logger.ts's ACTIVITY_RECORD_EVENT_TYPES /
 * deploy-marker.ts): born resolved, because nothing is ever going to triage
 * or resolve an analysis row, and `event_type: 'rca_analysis'` (never
 * `'error'`) so the incident feed's `event_type = 'error'` filter excludes it
 * by construction — see incident-feed.ts's queryAppErrorEvents.
 *
 * Failure here must never fail the analysis itself — the operator already has
 * the result on screen; losing the ability to re-load it later is a smaller
 * harm than losing the analysis they just paid for.
 */
async function persistRcaAnalysis(fingerprint: string, analysis: RcaAnalysis): Promise<void> {
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
  } catch (error) {
    await logServerError(
      `[analyzeErrorFingerprint] failed to persist RCA analysis for ${fingerprint}: ${describeError(error)}`,
      { action: 'admin.analyzeErrorFingerprint', featureArea: 'admin' },
    );
  }
}

/**
 * Run a fresh root-cause analysis for a fingerprint and persist it on success.
 * Super-admin only. Never throws — every failure path (bad input, missing
 * events, unconfigured provider, model error) returns a typed `RcaResult`.
 */
export async function analyzeErrorFingerprint(fingerprint: string): Promise<RcaResult> {
  await requireSuperAdmin();

  const trimmed = (fingerprint ?? '').trim();
  if (!trimmed) return { status: 'error', message: 'A fingerprint is required.' };

  let detail: Awaited<ReturnType<typeof fetchFingerprintDetail>>;
  try {
    detail = await fetchFingerprintDetail(trimmed);
  } catch (error) {
    return { status: 'error', message: `Could not load incident detail: ${describeError(error)}` };
  }

  // Strip this fingerprint's own prior analyses before deriving anything —
  // see isOwnRcaAnalysisRow's doc comment for why fetchFingerprintDetail
  // can hand them back at all.
  const events = detail.events.filter((e) => !isOwnRcaAnalysisRow(e));
  if (events.length === 0) {
    return { status: 'error', message: 'No events found for this fingerprint.' };
  }

  // Query orders created_at desc, so events[0] is the most recent occurrence —
  // same assumption buildFingerprintIncidentReport (data/errors.ts) makes.
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

  const result = await runRcaAnalysis({
    fingerprint: trimmed,
    // Rebuilt from the filtered events, NOT `detail.report` — see
    // buildCleanIncidentReport's doc comment.
    incidentReport: buildCleanIncidentReport(trimmed, events),
    rawStacks,
    classificationKind: classification.klass,
    sourceFilePath,
    nearbyDeploys: detail.summary.nearbyDeploys,
  });

  if (result.status === 'ok') {
    await persistRcaAnalysis(trimmed, result.analysis);
  }

  return result;
}

/**
 * Read the most recent stored analysis for a fingerprint, or `null` when none
 * exists yet (a genuinely-empty state, not an error). Super-admin only, same
 * gate as the write path — this reads `admin_events` with the service-role
 * client.
 */
export async function getStoredRcaAnalysis(fingerprint: string): Promise<RcaAnalysis | null> {
  await requireSuperAdmin();

  const trimmed = (fingerprint ?? '').trim();
  if (!trimmed) return null;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('admin_events')
    .select('metadata')
    .eq('event_type', 'rca_analysis')
    .eq('fingerprint', trimmed)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.metadata) return null;

  // Validate rather than trust — this is JSON out of a column, not a value
  // this module just constructed.
  const parsed = rcaAnalysisSchema.safeParse(data.metadata);
  return parsed.success ? parsed.data : null;
}
