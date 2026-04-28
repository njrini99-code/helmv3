'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import { normalizeIncidentRoute } from '@/lib/admin/incident-grouping';

// ============================================
// TYPES
// ============================================

export interface TracerPlayerSummary {
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  total_rounds: number;
  completed_rounds: number;
  in_progress_rounds: number;
  draft_rounds: number;
  last_activity: string | null;
}

export interface TracerRoundDetail {
  round_id: string;
  player_id: string;
  status: string;
  course_name: string | null;
  round_date: string | null;
  expected_holes: number;
  total_score: number | null;
  score_to_par: number | null;
  current_hole: number | null;
  created_at: string | null;
  updated_at: string | null;
  // Data integrity checks
  actual_holes: number;
  total_shots: number;
  putt_details_count: number;
  approach_details_count: number;
  stats_cached: boolean;
  has_strokes_gained: boolean;
  has_putts: boolean;
  has_fairways: boolean;
  has_gir: boolean;
  errors: TracerIncident[];
}

export interface TracerStatsAccuracy {
  player_id: string;
  first_name: string | null;
  last_name: string | null;
  cached_rounds: number;
  live_rounds: number;
  cached_scoring_avg: number | null;
  live_scoring_avg: number | null;
  cached_putts_per_round: number | null;
  live_putts_per_round: number | null;
  cached_fairway_pct: number | null;
  live_fairway_pct: number | null;
  cached_gir_pct: number | null;
  live_gir_pct: number | null;
  is_stale: boolean;
  cache_updated_at: string | null;
}

export interface TracerIncident {
  id: string;
  eventIds: string[];
  status: 'open' | 'resolved';
  severity: 'critical' | 'error' | 'warning' | 'info';
  title: string;
  summary: string;
  whyItHappened: string;
  howToFix: string;
  operatorImpact: string;
  featureArea: string;
  action: string | null;
  route: string | null;
  url: string | null;
  requestId: string | null;
  errorCode: string | null;
  errorHint: string | null;
  errorDetails: string | null;
  source: string | null;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  openOccurrences: number;
  resolvedOccurrences: number;
  sampleMessage: string;
  sampleStack: string | null;
  sampleContext: Record<string, unknown> | null;
  roundIds: string[];
  playerIds: string[];
  userEmails: string[];
  resolvedAt: string | null;
  resolvedBy: string | null;
  copySummary: string;
}

interface TracerAdminEventRecord {
  id: string;
  event_type: string;
  severity: string | null;
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  url: string | null;
  stack_trace: string | null;
  user_id: string | null;
  user_email: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface TracerActivityEvent {
  type: 'round_started' | 'round_completed' | 'round_in_progress' | 'round_stuck' | 'round_error' | 'detail_warning';
  player_name: string;
  player_id: string;
  round_id: string | null;
  course_name: string | null;
  score: number | null;
  score_to_par: number | null;
  error_message: string | null;
  timestamp: string;
  /** Current hole for in-progress/stuck rounds */
  current_hole?: number | null;
  /** Expected holes (9 or 18) */
  expected_holes?: number;
  /** Actual holes recorded so far */
  actual_holes?: number;
  /** Total shots recorded so far */
  total_shots?: number;
  /** Hours stuck (only for round_stuck type) */
  hours_stuck?: number;
}

export interface TracerData {
  playerSummaries: TracerPlayerSummary[];
  roundDetails: Record<string, TracerRoundDetail[]>;
  statsAccuracy: TracerStatsAccuracy[];
  recentErrors: TracerIncident[];
  activityFeed: TracerActivityEvent[];
  errorStats: {
    total7d: number;
    critical7d: number;
    warnings7d: number;
  };
  /** Raw admin_event records (ungrouped) for individual trace inspection */
  rawTraces: {
    id: string;
    severity: string;
    message: string;
    url: string | null;
    user_email: string | null;
    created_at: string;
    metadata: Record<string, unknown> | null;
    resolved: boolean;
  }[];
  /**
   * True if any of the bounded queries (rounds, players, etc.) hit their
   * row limit. UI can surface "showing latest N — older not shown" when set.
   * Tonight: just expose, don't render.
   */
  truncated: boolean;
  /** Per-round integrity data from hole-level aggregation */
  roundIntegrity?: Record<string, {
    round_id: string;
    hole_count: number;
    holes_sum_score: number | null;
    holes_sum_putts: number | null;
    holes_sum_fairways_hit: number;
    holes_sum_fairways_total: number;
    holes_sum_gir: number;
    holes_sum_gir_total: number;
    null_score_count: number;
    null_putts_count: number;
    max_hole_score: number | null;
  }>;
}

interface TracerIncidentContext {
  action: string | null;
  route: string | null;
  url: string | null;
  featureArea: string | null;
  source: string | null;
  requestId: string | null;
  roundId: string | null;
  playerId: string | null;
  userId: string | null;
  userEmail: string | null;
  errorCode: string | null;
  errorHint: string | null;
  errorDetails: string | null;
}

const TRACER_SEVERITY_ORDER: Record<TracerIncident['severity'], number> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

const SHOT_TRACKING_ACTION_PREFIXES = [
  'submitgolfroundcomprehensive',
  'savepartialround',
  'continueroundpage',
  'invalidateonroundcomplete',
];

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function normalizeTracerMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ':uuid')
    .replace(/\b[a-f0-9]{16,}\b/gi, ':id')
    .replace(/\b\d{5,}\b/g, ':id')
    .replace(/\s+/g, ' ');
}

// Delegates to the shared admin helper so the tracer-side route normalisation
// stays in lockstep with the System tab grouping. Keeping the local name lets
// the rest of this file stay untouched while we centralise the implementation.
function normalizeTracerPath(pathOrUrl: string | null): string {
  return normalizeIncidentRoute(pathOrUrl);
}

function normalizeTracerIncidentKey(
  message: string,
  routeOrUrl: string | null,
  action: string | null,
  errorCode: string | null,
): string {
  return [
    normalizeTracerMessage(message),
    normalizeTracerPath(routeOrUrl),
    action ?? '',
    errorCode ?? '',
  ].join('::');
}

function buildTracerIncidentContext(rawContext: unknown): TracerIncidentContext {
  const context = asObject(rawContext);
  return {
    action: asString(context?.action),
    route: asString(context?.route),
    url: asString(context?.url),
    featureArea: asString(context?.featureArea),
    source: asString(context?.source),
    requestId: asString(context?.requestId),
    roundId: asString(context?.roundId),
    playerId: asString(context?.playerId),
    userId: asString(context?.userId),
    userEmail: asString(context?.userEmail),
    errorCode: asString(context?.errorCode),
    errorHint: asString(context?.errorHint),
    errorDetails: asString(context?.errorDetails),
  };
}

function mergeTracerIncidentContext(
  primary: TracerIncidentContext,
  fallback: TracerIncidentContext,
): TracerIncidentContext {
  return {
    action: primary.action ?? fallback.action,
    route: primary.route ?? fallback.route,
    url: primary.url ?? fallback.url,
    featureArea: primary.featureArea ?? fallback.featureArea,
    source: primary.source ?? fallback.source,
    requestId: primary.requestId ?? fallback.requestId,
    roundId: primary.roundId ?? fallback.roundId,
    playerId: primary.playerId ?? fallback.playerId,
    userId: primary.userId ?? fallback.userId,
    userEmail: primary.userEmail ?? fallback.userEmail,
    errorCode: primary.errorCode ?? fallback.errorCode,
    errorHint: primary.errorHint ?? fallback.errorHint,
    errorDetails: primary.errorDetails ?? fallback.errorDetails,
  };
}

function normalizeTracerSeverity(severity: string | null | undefined): TracerIncident['severity'] {
  const normalized = severity?.toLowerCase();
  if (normalized === 'critical' || normalized === 'error' || normalized === 'warning' || normalized === 'info') {
    return normalized;
  }
  return 'error';
}

function getTracerEventMessage(event: TracerAdminEventRecord): string {
  const metadata = asObject(event.metadata);
  return (
    asString(metadata?.originalMessage)
    ?? asString(metadata?.message)
    ?? event.message
    ?? event.title
  );
}

function isShotTrackingAction(action: string | null): boolean {
  const normalizedAction = action?.toLowerCase() ?? '';
  return SHOT_TRACKING_ACTION_PREFIXES.some((prefix) => normalizedAction.startsWith(prefix));
}

function isShotTrackingTracerEvent(
  event: TracerAdminEventRecord,
  context: TracerIncidentContext = buildTracerIncidentContext(event.metadata),
): boolean {
  if (event.event_type !== 'error') return false;

  const featureArea = context.featureArea?.toLowerCase() ?? '';
  const action = context.action?.toLowerCase() ?? '';
  const normalizedUrl = normalizeTracerPath(context.route ?? context.url ?? event.url).toLowerCase();
  const message = `${event.title} ${event.message ?? ''}`.toLowerCase();

  if (featureArea === 'shot_tracking') return true;
  if (isShotTrackingAction(action)) return true;
  if (featureArea === 'stats_cache' && (!!context.roundId || isShotTrackingAction(action) || action.startsWith('invalidateonroundcomplete'))) {
    return true;
  }

  return !!context.roundId && (
    normalizedUrl.includes('/rounds')
    || normalizedUrl.includes('/tracer')
    || message.includes('round')
    || message.includes('shot')
  );
}

function toTracerFeatureAreaLabel(context: TracerIncidentContext): string {
  const featureArea = context.featureArea?.toLowerCase() ?? '';
  const action = context.action?.toLowerCase() ?? '';

  if (featureArea === 'stats_cache' || action.startsWith('invalidateonroundcomplete')) {
    return 'Shot Tracking Cache';
  }

  return 'Shot Tracking';
}

function deriveTracerNarrative(
  message: string,
  featureArea: string,
  action: string | null,
  errorCode: string | null,
): Pick<TracerIncident, 'title' | 'summary' | 'whyItHappened' | 'howToFix' | 'operatorImpact'> {
  const normalized = message.toLowerCase();

  if (normalized.includes('stack depth limit exceeded')) {
    return {
      title: 'Round submit recursion failure',
      summary: 'Shot tracking hit PostgreSQL recursion depth during save or submit.',
      whyItHappened: 'A submit-triggered write path is likely calling into a recursive totals or cache repair path until PostgreSQL aborts the transaction.',
      howToFix: 'Inspect the submit transaction and any post-submit repair chain for recursive writes, then retry the affected round after the loop is removed.',
      operatorImpact: 'Players can get blocked on submit and may retry the same round multiple times.',
    };
  }

  if (normalized.includes('created_at') && normalized.includes('ambiguous')) {
    return {
      title: 'Stats refresh query is ambiguous',
      summary: 'A shot-tracking save path hit SQL that references created_at without a table alias.',
      whyItHappened: 'A joined query in the tracer-side cache refresh path is ordering or filtering on an unqualified created_at column.',
      howToFix: 'Qualify the created_at column in the failing cache refresh query or RPC, then rerun the stats refresh for the affected player.',
      operatorImpact: 'Round submit can fail even when the captured round data itself is valid.',
    };
  }

  if (normalized.includes('putt_details_distance_feet_check')) {
    return {
      title: 'Putt distance rejected by constraint',
      summary: 'Tracer caught a putt detail insert whose distance violated the database check.',
      whyItHappened: 'The save flow derived or converted a putt distance outside the range accepted by the database.',
      howToFix: 'Compare the submitted putt distance with the app-side distance derivation and the live DB constraint, then correct the mapping and replay the round.',
      operatorImpact: 'A player can lose a round submit because one putt detail row is invalid.',
    };
  }

  if (normalized.includes('approach_miss_details_lie_type_check')) {
    return {
      title: 'Approach lie type rejected by constraint',
      summary: 'Tracer found an approach miss detail row whose lie type is no longer accepted by the database.',
      whyItHappened: 'The app emitted a lie label that drifted from the current allowed DB values for approach miss details.',
      howToFix: 'Align the app lie mapping with the live DB constraint or enum values, then retry the failed round write.',
      operatorImpact: 'Players can see a submit failure on otherwise valid approach data.',
    };
  }

  if (normalized.includes('continue round')) {
    return {
      title: 'Continue-round rehydration failed',
      summary: 'Tracer found a failure while trying to reopen an in-progress round.',
      whyItHappened: 'One of the dependent reads for the round, holes, shots, or detail rows failed during the continue-round page load.',
      howToFix: 'Use the round ID to inspect the missing read, repair the broken row or permission issue, then reopen the round to confirm hydration succeeds.',
      operatorImpact: 'Users can hit missing data or a broken session when resuming a round.',
    };
  }

  if (
    normalized.includes('refresh_player_stats_cache')
    || normalized.includes('stats cache')
    || normalized.includes('mark_player_stats_stale')
    || normalized.includes('strokes gained')
  ) {
    return {
      title: 'Post-round cache repair failed',
      summary: 'A shot-tracking flow completed far enough to trigger cache or strokes-gained repair, and that repair failed.',
      whyItHappened: 'A cache RPC or reconciliation step errored, timed out, or rebuilt stale data after the round write.',
      howToFix: 'Check the cache RPC named below, compare live round totals with the cache tables, and rerun the repair after fixing the underlying query or constraint.',
      operatorImpact: 'Round data may exist while derived stats stay stale or wrong.',
    };
  }

  if ((action ?? '').startsWith('savePartialRound') || normalized.includes('save partial')) {
    return {
      title: 'Partial round save failed',
      summary: 'Tracer captured a failure while the player was saving an in-progress round.',
      whyItHappened: 'A validation, detail insert, or supporting update failed before the draft state persisted cleanly.',
      howToFix: 'Inspect the route, action, round ID, and raw context below to locate the failing draft-save step, then replay the save once the write path is repaired.',
      operatorImpact: 'The player can lose progress or see stale in-progress data after a save attempt.',
    };
  }

  if ((action ?? '').startsWith('submitGolfRoundComprehensive') || normalized.includes('round submit')) {
    return {
      title: 'Round submit failed',
      summary: 'Tracer captured a server-side failure in the final shot-tracking submit path.',
      whyItHappened: 'The submit transaction hit a validation failure, DB constraint, trigger issue, or tracer-side cache repair failure.',
      howToFix: 'Start with the raw message, action, round ID, and captured context below, then fix the failing write or RPC before replaying the submission.',
      operatorImpact: 'A player likely saw the round fail to submit and may retry or abandon the save.',
    };
  }

  return {
    title: `${featureArea} incident`,
    summary: 'Tracer captured a shot-tracking-side error that did not match a specialized rule.',
    whyItHappened: action
      ? `The ${action} path threw and logged structured context for review.`
      : 'A tracer-monitored shot-tracking path failed without a more specific pattern match.',
    howToFix: errorCode
      ? `Review the raw message, error code ${errorCode}, and captured context below, then fix the failing step before replaying the round workflow.`
      : 'Review the raw message, captured context, and stack below, then repair the failing step before replaying the round workflow.',
    operatorImpact: 'Players or staff may have seen a failure or stale data in the tracer-monitored flow.',
  };
}

function buildTracerIncidentCopySummary(incident: TracerIncident): string {
  return [
    `Severity: ${incident.severity.toUpperCase()}`,
    `Status: ${incident.status.toUpperCase()}`,
    `Title: ${incident.title}`,
    `Area: ${incident.featureArea}`,
    `Summary: ${incident.summary}`,
    `Why it happened: ${incident.whyItHappened}`,
    `How to fix: ${incident.howToFix}`,
    `Operator impact: ${incident.operatorImpact}`,
    `Occurrences: ${incident.occurrences}`,
    `Open occurrences: ${incident.openOccurrences}`,
    `Resolved occurrences: ${incident.resolvedOccurrences}`,
    `First seen: ${incident.firstSeen}`,
    `Last seen: ${incident.lastSeen}`,
    incident.action ? `Action: ${incident.action}` : null,
    incident.route ? `Route: ${incident.route}` : null,
    incident.url ? `URL: ${incident.url}` : null,
    incident.errorCode ? `Error code: ${incident.errorCode}` : null,
    incident.errorHint ? `Hint: ${incident.errorHint}` : null,
    incident.errorDetails ? `Details: ${incident.errorDetails}` : null,
    incident.requestId ? `Request ID: ${incident.requestId}` : null,
    incident.source ? `Trace source: ${incident.source}` : null,
    incident.roundIds.length > 0 ? `Round IDs: ${incident.roundIds.join(', ')}` : null,
    incident.playerIds.length > 0 ? `Player IDs: ${incident.playerIds.join(', ')}` : null,
    incident.userEmails.length > 0 ? `User emails: ${incident.userEmails.join(', ')}` : null,
    incident.resolvedAt ? `Resolved at: ${incident.resolvedAt}` : null,
    incident.resolvedBy ? `Resolved by: ${incident.resolvedBy}` : null,
    `Raw message: ${incident.sampleMessage}`,
    incident.sampleContext ? `Context JSON:\n${JSON.stringify(incident.sampleContext, null, 2)}` : null,
    incident.sampleStack ? `Stack:\n${incident.sampleStack}` : null,
  ].filter(Boolean).join('\n');
}

function buildTracerIncidents(events: TracerAdminEventRecord[]): TracerIncident[] {
  const groups = new Map<string, {
    eventIds: string[];
    severity: TracerIncident['severity'];
    latestEvent: TracerAdminEventRecord;
    latestContext: TracerIncidentContext;
    sampleContext: Record<string, unknown> | null;
    firstSeen: string;
    lastSeen: string;
    occurrences: number;
    openOccurrences: number;
    resolvedOccurrences: number;
    roundIds: Set<string>;
    playerIds: Set<string>;
    userEmails: Set<string>;
    sampleStack: string | null;
    resolvedAt: string | null;
    resolvedBy: string | null;
  }>();

  for (const event of events) {
    const context = buildTracerIncidentContext(event.metadata);
    if (!isShotTrackingTracerEvent(event, context)) continue;

    const keyMessage = getTracerEventMessage(event);
    const key = normalizeTracerIncidentKey(
      keyMessage,
      context.route ?? event.url ?? context.url,
      context.action,
      context.errorCode,
    );
    const createdAt = event.created_at;
    const severity = normalizeTracerSeverity(event.severity);
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        eventIds: [event.id],
        severity,
        latestEvent: event,
        latestContext: context,
        sampleContext: asObject(event.metadata),
        firstSeen: createdAt,
        lastSeen: createdAt,
        occurrences: 1,
        openOccurrences: event.resolved ? 0 : 1,
        resolvedOccurrences: event.resolved ? 1 : 0,
        roundIds: new Set(context.roundId ? [context.roundId] : []),
        playerIds: new Set(context.playerId ? [context.playerId] : []),
        userEmails: new Set([
          context.userEmail ?? event.user_email ?? '',
        ].filter(Boolean)),
        sampleStack: event.stack_trace,
        resolvedAt: event.resolved_at,
        resolvedBy: event.resolved_by,
      });
      continue;
    }

    existing.eventIds.push(event.id);
    existing.occurrences += 1;
    existing.openOccurrences += event.resolved ? 0 : 1;
    existing.resolvedOccurrences += event.resolved ? 1 : 0;
    if (context.roundId) existing.roundIds.add(context.roundId);
    if (context.playerId) existing.playerIds.add(context.playerId);
    if (context.userEmail) existing.userEmails.add(context.userEmail);
    if (event.user_email) existing.userEmails.add(event.user_email);
    if (event.stack_trace) existing.sampleStack = event.stack_trace;
    existing.latestContext = mergeTracerIncidentContext(existing.latestContext, context);
    if (!existing.sampleContext && asObject(event.metadata)) existing.sampleContext = asObject(event.metadata);
    if (createdAt < existing.firstSeen) existing.firstSeen = createdAt;

    if (createdAt >= existing.lastSeen) {
      existing.lastSeen = createdAt;
      existing.latestEvent = event;
      existing.latestContext = mergeTracerIncidentContext(context, existing.latestContext);
      existing.sampleContext = asObject(event.metadata) ?? existing.sampleContext;
    }

    if (event.resolved_at && (!existing.resolvedAt || event.resolved_at > existing.resolvedAt)) {
      existing.resolvedAt = event.resolved_at;
      existing.resolvedBy = event.resolved_by;
    }

    if (TRACER_SEVERITY_ORDER[severity] < TRACER_SEVERITY_ORDER[existing.severity]) {
      existing.severity = severity;
    }
  }

  return Array.from(groups.entries())
    .map(([id, group]) => {
      const featureArea = toTracerFeatureAreaLabel(group.latestContext);
      const route = normalizeTracerPath(group.latestContext.route ?? group.latestContext.url ?? group.latestEvent.url) || null;
      const narrative = deriveTracerNarrative(
        getTracerEventMessage(group.latestEvent),
        featureArea,
        group.latestContext.action,
        group.latestContext.errorCode,
      );

      const incident: TracerIncident = {
        id,
        eventIds: group.eventIds,
        status: group.openOccurrences > 0 ? 'open' : 'resolved',
        severity: group.severity,
        title: narrative.title,
        summary: narrative.summary,
        whyItHappened: narrative.whyItHappened,
        howToFix: narrative.howToFix,
        operatorImpact: narrative.operatorImpact,
        featureArea,
        action: group.latestContext.action,
        route,
        url: group.latestContext.url ?? group.latestEvent.url,
        requestId: group.latestContext.requestId,
        errorCode: group.latestContext.errorCode,
        errorHint: group.latestContext.errorHint,
        errorDetails: group.latestContext.errorDetails,
        source: group.latestContext.source,
        firstSeen: group.firstSeen,
        lastSeen: group.lastSeen,
        occurrences: group.occurrences,
        openOccurrences: group.openOccurrences,
        resolvedOccurrences: group.resolvedOccurrences,
        sampleMessage: getTracerEventMessage(group.latestEvent),
        sampleStack: group.sampleStack,
        sampleContext: group.sampleContext,
        roundIds: Array.from(group.roundIds).slice(0, 12),
        playerIds: Array.from(group.playerIds).slice(0, 12),
        userEmails: Array.from(group.userEmails).slice(0, 12),
        resolvedAt: group.openOccurrences > 0 ? null : group.resolvedAt,
        resolvedBy: group.openOccurrences > 0 ? null : group.resolvedBy,
        copySummary: '',
      };

      incident.copySummary = buildTracerIncidentCopySummary(incident);
      return incident;
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'open' ? -1 : 1;

      const severityDiff = TRACER_SEVERITY_ORDER[a.severity] - TRACER_SEVERITY_ORDER[b.severity];
      if (severityDiff !== 0) return severityDiff;

      const lastSeenDiff = new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
      if (lastSeenDiff !== 0) return lastSeenDiff;

      return b.occurrences - a.occurrences;
    });
}

// ============================================
// MAIN DATA FETCHER
// ============================================

export async function getTracerData(): Promise<TracerData> {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userData?.role !== 'admin') throw new Error('Forbidden');

  const adminDb = createAdminClient();
  const ago7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const ago45d = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  // Batch 1: Core data
  // Bounded queries: silent 10K truncation is dangerous because the caller
  // can't tell if data is complete. Tightened caps:
  //   - players: 1000 (any realistic team size fits)
  //   - rounds:  500 most recent by round_date DESC (Tracer surfaces recent
  //              activity; older rounds aren't actionable)
  //   - stats:   1000 (one row per player; matches player cap)
  // golf_shots is fetched chunked-by-round-id below, so it's already bounded
  // by the round count above — no separate cap needed.
  const ROUNDS_LIMIT = 500;
  const PLAYERS_LIMIT = 1000;
  const STATS_LIMIT = 1000;
  const [allPlayersResult, allRoundsResult, statsAccuracyResult] = await Promise.all([
    adminDb.from('golf_players').select('id, first_name, last_name').limit(PLAYERS_LIMIT),
    adminDb
      .from('golf_rounds')
      .select(`
        id,
        player_id,
        status,
        course_name,
        round_date,
        holes_played,
        total_score,
        score_to_par,
        total_putts,
        total_fairways_hit,
        total_fairways,
        total_gir,
        total_gir_possible,
        strokes_gained_total,
        current_hole,
        created_at,
        updated_at
      `)
      .order('round_date', { ascending: false })
      .limit(ROUNDS_LIMIT),
    adminDb
      .from('golf_player_stats_cache')
      .select(`
        player_id,
        rounds_played,
        scoring_average,
        putts_per_round,
        driving_accuracy_percentage,
        gir_percentage,
        is_stale,
        updated_at
      `)
      .limit(STATS_LIMIT),
  ]);

  // Detect truncation: if any leg returned exactly its limit, more rows
  // likely exist beyond the cap. UI can surface this via the `truncated`
  // flag on the returned TracerData.
  const truncated =
    (allPlayersResult.data?.length ?? 0) >= PLAYERS_LIMIT ||
    (allRoundsResult.data?.length ?? 0) >= ROUNDS_LIMIT ||
    (statsAccuracyResult.data?.length ?? 0) >= STATS_LIMIT;

  // Surface query errors instead of silently returning empty data
  // NOTE: console.warn used (not console.log) because production build strips console.log
  if (allPlayersResult.error) {
    console.warn('[Tracer] golf_players query failed:', allPlayersResult.error.message);
  }
  if (allRoundsResult.error) {
    await logServerError(`[Tracer] golf_rounds query failed: ${allRoundsResult.error.message}`, { action: 'admin_tracer_data.getTracerData' });
    throw new Error(`Tracer: golf_rounds query failed — ${allRoundsResult.error.message}`);
  }
  if (statsAccuracyResult.error) {
    console.warn('[Tracer] golf_player_stats_cache query failed:', statsAccuracyResult.error.message);
  }

  console.warn(`[Tracer] Batch 1: ${allPlayersResult.data?.length ?? 0} players, ${allRoundsResult.data?.length ?? 0} rounds, ${statsAccuracyResult.data?.length ?? 0} stats cache`);

  // Build player map
  const playerMap = new Map<string, TracerPlayerSummary>();
  const playerNameMap = new Map<string, string>();
  for (const p of allPlayersResult.data || []) {
    const fullName = `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown';
    playerNameMap.set(p.id, fullName);
    playerMap.set(p.id, {
      player_id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      total_rounds: 0,
      completed_rounds: 0,
      in_progress_rounds: 0,
      draft_rounds: 0,
      last_activity: null,
    });
  }

  // Aggregate rounds per player + build activity feed
  const roundsByPlayer: Record<string, TracerRoundDetail[]> = {};
  const activityFeed: TracerActivityEvent[] = [];

  for (const r of allRoundsResult.data || []) {
    const summary = playerMap.get(r.player_id);
    const playerName = playerNameMap.get(r.player_id) || 'Unknown';
    if (summary) {
      summary.total_rounds++;
      if (r.status === 'completed') summary.completed_rounds++;
      else if (r.status === 'in_progress') summary.in_progress_rounds++;
      else if (r.status === 'draft') summary.draft_rounds++;
      if (r.updated_at && (!summary.last_activity || r.updated_at > summary.last_activity)) {
        summary.last_activity = r.updated_at;
      }
    }

    if (!roundsByPlayer[r.player_id]) roundsByPlayer[r.player_id] = [];
    roundsByPlayer[r.player_id]!.push({
      round_id: r.id,
      player_id: r.player_id,
      status: r.status as string,
      course_name: r.course_name,
      round_date: r.round_date,
      expected_holes: r.holes_played || 18,
      current_hole: r.current_hole ?? null,
      total_score: r.total_score,
      score_to_par: r.score_to_par,
      created_at: r.created_at,
      updated_at: r.updated_at,
      actual_holes: 0,
      total_shots: 0,
      putt_details_count: 0,
      approach_details_count: 0,
      stats_cached: false,
      has_strokes_gained: r.strokes_gained_total != null,
      has_putts: r.total_putts != null && r.total_putts > 0,
      has_fairways: r.total_fairways != null && r.total_fairways > 0,
      has_gir: r.total_gir_possible != null && r.total_gir_possible > 0,
      errors: [],
    });

    // Activity: round started (only show for rounds created in the last 30 days to avoid stale feed)
    const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    if (r.created_at && new Date(r.created_at).getTime() > thirtyDaysAgoMs) {
      activityFeed.push({
        type: 'round_started',
        player_name: playerName,
        player_id: r.player_id,
        round_id: r.id,
        course_name: r.course_name,
        score: null,
        score_to_par: null,
        error_message: null,
        timestamp: r.created_at,
        current_hole: r.current_hole ?? null,
        expected_holes: r.holes_played || 18,
      });
    }

    // Activity: round completed (submitted)
    if (r.status === 'completed' && r.updated_at) {
      activityFeed.push({
        type: 'round_completed',
        player_name: playerName,
        player_id: r.player_id,
        round_id: r.id,
        course_name: r.course_name,
        score: r.total_score,
        score_to_par: r.score_to_par,
        error_message: null,
        timestamp: r.updated_at,
      });
    }

    // Activity: round in progress or stuck
    if (r.status === 'in_progress' && r.updated_at) {
      const hoursInactive = (Date.now() - new Date(r.updated_at).getTime()) / (1000 * 60 * 60);
      const isStuck = hoursInactive >= 1; // 1+ hours = stuck
      activityFeed.push({
        type: isStuck ? 'round_stuck' : 'round_in_progress',
        player_name: playerName,
        player_id: r.player_id,
        round_id: r.id,
        course_name: r.course_name,
        score: null,
        score_to_par: null,
        error_message: isStuck
          ? `Stuck at hole ${r.current_hole ?? '?'} for ${Math.round(hoursInactive)}h — no activity since ${new Date(r.updated_at).toLocaleString()}`
          : null,
        timestamp: r.updated_at,
        current_hole: r.current_hole ?? null,
        expected_holes: r.holes_played || 18,
        hours_stuck: isStuck ? hoursInactive : undefined,
      });
    }
  }

  // Batch 2: Hole/shot/detail counts + stats cache + tracer incidents
  // Chunk .in() queries to avoid PostgREST URL length overflow with many round IDs.
  //
  // IMPORTANT: Supabase's PostgREST enforces a server-side `max-rows` limit
  // (typically 1000) that caps the result set regardless of the client-side
  // `.limit()` value.  Previously a single chunk of 200 round IDs could produce
  // 200 × 18 = 3 600 hole rows or 200 × 75 = 15 000 shot rows, silently
  // truncated to 1 000 — causing many rounds to report 0 holes / 0 shots.
  //
  // Fix: use per-query chunk sizes small enough that each chunk's result stays
  // well within the 1 000-row PostgREST ceiling, and remove the misleading
  // `.limit()` overrides.
  const roundIds = (allRoundsResult.data || []).map((r) => r.id);

  // Chunk size constants — tuned so each chunk query returns < 1 000 rows.
  // Holes:  50 rounds × 18 holes  = 900 rows  (< 1 000)
  // Shots:  10 rounds × ~100 shots = ~1 000    (safe margin)
  // Cache:  200 rounds × 1 row     = 200 rows  (fine)
  const HOLE_CHUNK_SIZE = 50;
  const SHOT_CHUNK_SIZE = 10;
  const DEFAULT_CHUNK_SIZE = 200;

  async function chunkedIn<T>(
    queryFn: (ids: string[]) => PromiseLike<{ data: T[] | null; error?: { message: string } | null }>,
    chunkSize: number = DEFAULT_CHUNK_SIZE,
  ): Promise<{ data: T[] }> {
    if (roundIds.length === 0) return { data: [] };
    const chunks: string[][] = [];
    for (let i = 0; i < roundIds.length; i += chunkSize) {
      chunks.push(roundIds.slice(i, i + chunkSize));
    }
    const results = await Promise.all(chunks.map((ids) => queryFn(ids)));
    for (const r of results) {
      if (r.error) console.warn('[Tracer] chunkedIn query error:', r.error.message);
    }
    return { data: results.flatMap((r) => r.data || []) };
  }

  const [
    holeCounts, shotCounts, puttDetailCounts, approachDetailCounts,
    statsCacheResult,
    tracerEventsResult,
  ] = await Promise.all([
    chunkedIn((ids) => adminDb.from('golf_holes').select('round_id, score, putts, fairway_hit, gir, par').in('round_id', ids), HOLE_CHUNK_SIZE),
    chunkedIn((ids) => adminDb.from('golf_shots').select('round_id').in('round_id', ids), SHOT_CHUNK_SIZE),
    chunkedIn((ids) => adminDb.from('golf_shots').select('round_id, putt_details!inner(id)').in('round_id', ids), SHOT_CHUNK_SIZE),
    chunkedIn((ids) => adminDb.from('golf_shots').select('round_id, approach_miss_details!inner(id)').in('round_id', ids), SHOT_CHUNK_SIZE),
    chunkedIn((ids) => adminDb.from('golf_round_stats_cache').select('round_id').in('round_id', ids)),
    // Tracer error events — already filtered to event_type='error' in SQL.
    // JS-side isShotTrackingTracerEvent() further filters to shot-tracking context.
    // Limit reduced from 800 to 300 (sufficient for 45-day error window at current volume).
    adminDb
      .from('admin_events')
      .select('id, event_type, severity, title, message, metadata, url, stack_trace, user_id, user_email, resolved, resolved_at, resolved_by, created_at')
      .eq('event_type', 'error')
      .gte('created_at', ago45d)
      .order('created_at', { ascending: false })
      .limit(300),
  ]);

  // Count per round
  const holeCountMap = new Map<string, number>();
  const shotCountMap = new Map<string, number>();
  const puttDetailMap = new Map<string, number>();
  const approachDetailMap = new Map<string, number>();
  const statsCachedSet = new Set<string>();

  for (const h of (holeCounts as { data: { round_id: string }[] | null }).data || []) {
    holeCountMap.set(h.round_id, (holeCountMap.get(h.round_id) || 0) + 1);
  }

  // Build round integrity map from raw hole data
  interface RoundIntegrityEntry {
    round_id: string;
    hole_count: number;
    holes_sum_score: number | null;
    holes_sum_putts: number | null;
    holes_sum_fairways_hit: number;
    holes_sum_fairways_total: number;
    holes_sum_gir: number;
    holes_sum_gir_total: number;
    null_score_count: number;
    null_putts_count: number;
    max_hole_score: number | null;
  }
  const roundIntegrity: Record<string, RoundIntegrityEntry> = {};
  type HoleRow = { round_id: string; score: number | null; putts: number | null; fairway_hit: boolean | null; gir: boolean | null; par: number | null };
  for (const h of (holeCounts as { data: HoleRow[] | null }).data || []) {
    if (!roundIntegrity[h.round_id]) {
      roundIntegrity[h.round_id] = {
        round_id: h.round_id,
        hole_count: 0,
        holes_sum_score: null,
        holes_sum_putts: null,
        holes_sum_fairways_hit: 0,
        holes_sum_fairways_total: 0,
        holes_sum_gir: 0,
        holes_sum_gir_total: 0,
        null_score_count: 0,
        null_putts_count: 0,
        max_hole_score: null,
      };
    }
    const ri = roundIntegrity[h.round_id]!;
    ri.hole_count++;
    if (h.score != null) {
      ri.holes_sum_score = (ri.holes_sum_score ?? 0) + h.score;
      if (ri.max_hole_score === null || h.score > ri.max_hole_score) {
        ri.max_hole_score = h.score;
      }
    } else {
      ri.null_score_count++;
    }
    if (h.putts != null) {
      ri.holes_sum_putts = (ri.holes_sum_putts ?? 0) + h.putts;
    } else {
      ri.null_putts_count++;
    }
    if (h.fairway_hit != null) {
      ri.holes_sum_fairways_total++;
      if (h.fairway_hit) ri.holes_sum_fairways_hit++;
    }
    if (h.gir != null) {
      ri.holes_sum_gir_total++;
      if (h.gir) ri.holes_sum_gir++;
    }
  }

  for (const s of (shotCounts as { data: { round_id: string }[] | null }).data || []) {
    shotCountMap.set(s.round_id, (shotCountMap.get(s.round_id) || 0) + 1);
  }
  for (const p of (puttDetailCounts as { data: { round_id: string }[] | null }).data || []) {
    puttDetailMap.set(p.round_id, (puttDetailMap.get(p.round_id) || 0) + 1);
  }
  for (const a of (approachDetailCounts as { data: { round_id: string }[] | null }).data || []) {
    approachDetailMap.set(a.round_id, (approachDetailMap.get(a.round_id) || 0) + 1);
  }
  for (const sc of (statsCacheResult as { data: { round_id: string }[] | null }).data || []) {
    statsCachedSet.add(sc.round_id);
  }

  const tracerEvents = ((tracerEventsResult.data || []) as TracerAdminEventRecord[])
    .filter((event) => isShotTrackingTracerEvent(event));
  const errors = buildTracerIncidents(tracerEvents);
  const openErrors = errors.filter((incident) => incident.status === 'open');
  const errorsByRound = new Map<string, TracerIncident[]>();

  for (const incident of openErrors) {
    for (const roundId of incident.roundIds) {
      if (!errorsByRound.has(roundId)) errorsByRound.set(roundId, []);
      errorsByRound.get(roundId)!.push(incident);
    }
  }

  for (const event of tracerEvents) {
    const context = buildTracerIncidentContext(event.metadata);
    const roundId = context.roundId;
    const playerId = context.playerId;
    const playerName = playerId ? (playerNameMap.get(playerId) || 'Unknown') : 'Unknown';
    const linkedRound = roundId
      ? (allRoundsResult.data || []).find((round) => round.id === roundId)
      : null;

    activityFeed.push({
      type: normalizeTracerSeverity(event.severity) === 'warning' || normalizeTracerSeverity(event.severity) === 'info'
        ? 'detail_warning'
        : 'round_error',
      player_name: playerName,
      player_id: playerId || '',
      round_id: roundId || null,
      course_name: linkedRound?.course_name ?? null,
      score: null,
      score_to_par: null,
      error_message: getTracerEventMessage(event),
      timestamp: event.created_at,
    });
  }

  const recentEventCount7d = tracerEvents.filter((event) => event.created_at >= ago7d).length;
  const recentCriticalCount7d = tracerEvents.filter((event) => event.created_at >= ago7d && normalizeTracerSeverity(event.severity) === 'critical').length;
  const recentWarningCount7d = tracerEvents.filter((event) => event.created_at >= ago7d && normalizeTracerSeverity(event.severity) === 'warning').length;

  // Apply counts + errors to round details
  for (const rounds of Object.values(roundsByPlayer)) {
    for (const rd of rounds) {
      rd.actual_holes = holeCountMap.get(rd.round_id) || 0;
      rd.total_shots = shotCountMap.get(rd.round_id) || 0;
      rd.putt_details_count = puttDetailMap.get(rd.round_id) || 0;
      rd.approach_details_count = approachDetailMap.get(rd.round_id) || 0;
      rd.stats_cached = statsCachedSet.has(rd.round_id);
      rd.errors = errorsByRound.get(rd.round_id) || [];
    }
  }

  // Build stats accuracy with the same 18-hole normalization used by the cache.
  const statsAccuracy: TracerStatsAccuracy[] = [];
  for (const cached of statsAccuracyResult.data || []) {
    const player = playerMap.get(cached.player_id);
    if (!player) continue;

    const completedRounds = (allRoundsResult.data || []).filter(
      (r) => r.player_id === cached.player_id && r.status === 'completed'
    );
    const liveRounds = completedRounds.length;
    const totalHolesPlayed = completedRounds.reduce((sum, r) => sum + Math.max(r.holes_played || 18, 1), 0);
    const totalScore = completedRounds.reduce((sum, r) => sum + (r.total_score || 0), 0);
    const totalPutts = completedRounds.reduce((sum, r) => sum + (r.total_putts || 0), 0);
    const totalFairwaysHit = completedRounds.reduce((sum, r) => sum + (r.total_fairways_hit || 0), 0);
    const totalFairways = completedRounds.reduce((sum, r) => sum + (r.total_fairways || 0), 0);
    const totalGir = completedRounds.reduce((sum, r) => sum + (r.total_gir || 0), 0);
    const totalGirPossible = completedRounds.reduce((sum, r) => sum + (r.total_gir_possible || 0), 0);

    statsAccuracy.push({
      player_id: cached.player_id,
      first_name: player.first_name,
      last_name: player.last_name,
      cached_rounds: cached.rounds_played || 0,
      live_rounds: liveRounds,
      cached_scoring_avg: cached.scoring_average ? Number(cached.scoring_average) : null,
      live_scoring_avg: totalHolesPlayed > 0
        ? Math.round(((totalScore / totalHolesPlayed) * 18) * 10) / 10
        : null,
      cached_putts_per_round: cached.putts_per_round ? Number(cached.putts_per_round) : null,
      live_putts_per_round: totalHolesPlayed > 0
        ? Math.round(((totalPutts / totalHolesPlayed) * 18) * 10) / 10
        : null,
      cached_fairway_pct: cached.driving_accuracy_percentage ? Number(cached.driving_accuracy_percentage) : null,
      live_fairway_pct: totalFairways > 0
        ? Math.round((totalFairwaysHit / totalFairways * 100) * 10) / 10
        : null,
      cached_gir_pct: cached.gir_percentage ? Number(cached.gir_percentage) : null,
      live_gir_pct: totalGirPossible > 0
        ? Math.round((totalGir / totalGirPossible * 100) * 10) / 10
        : null,
      is_stale: cached.is_stale || false,
      cache_updated_at: cached.updated_at || '',
    });
  }

  // Sort activity feed by timestamp (newest first)
  activityFeed.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Sort player summaries: most rounds first, then by name
  const playerSummaries = Array.from(playerMap.values())
    .filter((p) => p.total_rounds > 0)
    .sort((a, b) => b.total_rounds - a.total_rounds || (a.last_name ?? '').localeCompare(b.last_name ?? ''));

  const roundDetailEntries = Object.keys(roundsByPlayer).length;
  const totalRoundCount = Object.values(roundsByPlayer).reduce((sum, arr) => sum + arr.length, 0);
  console.warn(`[Tracer] Result: ${playerSummaries.length} summaries, ${roundDetailEntries} players w/ rounds, ${totalRoundCount} rounds, ${activityFeed.length} activity, ${errors.length} incidents`);

  return {
    playerSummaries,
    roundDetails: roundsByPlayer,
    statsAccuracy: statsAccuracy.sort((a, b) => b.cached_rounds - a.cached_rounds),
    recentErrors: errors,
    activityFeed: activityFeed.slice(0, 50),
    errorStats: {
      total7d: recentEventCount7d,
      critical7d: recentCriticalCount7d,
      warnings7d: recentWarningCount7d,
    },
    truncated,
    roundIntegrity,
    rawTraces: tracerEvents
      .filter((event) => event.created_at >= ago7d)
      .map((event) => ({
        id: event.id,
        severity: normalizeTracerSeverity(event.severity),
        message: getTracerEventMessage(event),
        url: event.url,
        user_email: event.user_email,
        created_at: event.created_at,
        metadata: event.metadata,
        resolved: event.resolved,
      })),
  };
}

// ============================================
// ENRICHED DATA (sparklines, trends, stuck rounds)
// ============================================

export interface TracerEnrichedData {
  dailyRoundCounts: { date: string; count: number }[];
  dailyErrorCounts: { date: string; count: number }[];
  stuckRounds: {
    round_id: string;
    player_id: string;
    player_name: string;
    course_name: string | null;
    current_hole: number | null;
    expected_holes: number;
    updated_at: string;
    hours_stuck: number;
  }[];
}

export async function getTracerEnrichedData(): Promise<TracerEnrichedData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userData?.role !== 'admin') throw new Error('Forbidden');

  const adminDb = createAdminClient();
  const ago30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

  const [roundsResult, tracerEventsResult, stuckResult] = await Promise.all([
    // Daily round counts (last 30 days)
    adminDb
      .from('golf_rounds')
      .select('created_at')
      .gte('created_at', ago30d)
      .order('created_at', { ascending: true }),

    adminDb
      .from('admin_events')
      .select('id, event_type, severity, title, message, metadata, url, stack_trace, user_id, user_email, resolved, resolved_at, resolved_by, created_at')
      .eq('event_type', 'error')
      .gte('created_at', ago30d)
      .order('created_at', { ascending: true }),

    // Stuck rounds (in_progress with updated_at > 1 hour ago)
    adminDb
      .from('golf_rounds')
      .select('id, player_id, course_name, current_hole, holes_played, updated_at')
      .eq('status', 'in_progress')
      .lt('updated_at', oneHourAgo),
  ]);

  // Aggregate into daily counts
  function toDailyCounts(rows: { created_at: string | null }[] | null): { date: string; count: number }[] {
    const map = new Map<string, number>();
    // Pre-fill last 30 days
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      map.set(key, 0);
    }
    for (const row of rows || []) {
      if (!row.created_at) continue;
      const key = row.created_at.slice(0, 10);
      if (map.has(key)) {
        map.set(key, (map.get(key) || 0) + 1);
      }
    }
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  }

  const tracerEvents = ((tracerEventsResult.data || []) as TracerAdminEventRecord[])
    .filter((event) => isShotTrackingTracerEvent(event));

  // Resolve player names for stuck rounds
  const stuckData = stuckResult.data || [];
  const stuckPlayerIds = [...new Set(stuckData.map((r) => r.player_id))];
  const playerNameMap = new Map<string, string>();
  if (stuckPlayerIds.length > 0) {
    const { data: players } = await adminDb
      .from('golf_players')
      .select('id, first_name, last_name')
      .in('id', stuckPlayerIds);
    for (const p of players || []) {
      playerNameMap.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown');
    }
  }

  const stuckRounds = stuckData
    .filter((r): r is typeof r & { updated_at: string } => r.updated_at != null)
    .map((r) => ({
      round_id: r.id,
      player_id: r.player_id,
      player_name: playerNameMap.get(r.player_id) || 'Unknown',
      course_name: r.course_name,
      current_hole: r.current_hole ?? null,
      expected_holes: r.holes_played || 18,
      updated_at: r.updated_at,
      hours_stuck: (Date.now() - new Date(r.updated_at).getTime()) / (1000 * 60 * 60),
    }));

  return {
    dailyRoundCounts: toDailyCounts(roundsResult.data),
    dailyErrorCounts: toDailyCounts(tracerEvents),
    stuckRounds,
  };
}

// ============================================
// ROUND DIAGNOSTIC (lazy-loaded for drill-down modal)
// ============================================

export interface TracerHoleDiagnostic {
  hole_number: number;
  par: number | null;
  score: number | null;
  putts: number | null;
  fairway_hit: boolean | null;
  gir: boolean | null;
}

export interface TracerShotDiagnostic {
  shot_number: number;
  hole_number: number;
  club: string | null;
  shot_type: string | null;
  distance: number | null;
}

export interface TracerRoundDiagnosticData {
  holes: TracerHoleDiagnostic[];
  shots: TracerShotDiagnostic[];
  errors: TracerIncident[];
  playerName: string;
}

export async function getTracerRoundDiagnostic(roundId: string): Promise<TracerRoundDiagnosticData> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userData?.role !== 'admin') throw new Error('Forbidden');

  const adminDb = createAdminClient();
  const ago45d = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();

  // Get round info to resolve player name
  const { data: round } = await adminDb
    .from('golf_rounds')
    .select('player_id')
    .eq('id', roundId)
    .single();

  let playerName = 'Unknown';
  if (round?.player_id) {
    const { data: player } = await adminDb
      .from('golf_players')
      .select('first_name, last_name')
      .eq('id', round.player_id)
      .single();
    if (player) {
      playerName = `${player.first_name || ''} ${player.last_name || ''}`.trim() || 'Unknown';
    }
  }

  const [holesResult, shotsResult, errorsResult] = await Promise.all([
    adminDb
      .from('golf_holes')
      .select('hole_number, par, score, putts, fairway_hit, gir')
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true }),

    adminDb
      .from('golf_shots')
      .select('shot_number, hole_number, club_type, shot_type, shot_distance')
      .eq('round_id', roundId)
      .order('hole_number', { ascending: true })
      .order('shot_number', { ascending: true }),

    adminDb
      .from('admin_events')
      .select('id, event_type, severity, title, message, metadata, url, stack_trace, user_id, user_email, resolved, resolved_at, resolved_by, created_at')
      .eq('event_type', 'error')
      .eq('metadata->>roundId', roundId)
      .gte('created_at', ago45d)
      .order('created_at', { ascending: false }),
  ]);

  const holes: TracerHoleDiagnostic[] = (holesResult.data || []).map((h) => ({
    hole_number: h.hole_number,
    par: h.par,
    score: h.score,
    putts: h.putts,
    fairway_hit: h.fairway_hit,
    gir: h.gir,
  }));

  const shots: TracerShotDiagnostic[] = (shotsResult.data || []).map((s) => ({
    shot_number: s.shot_number,
    hole_number: s.hole_number,
    club: s.club_type,
    shot_type: s.shot_type,
    distance: s.shot_distance != null ? Number(s.shot_distance) : null,
  }));

  return {
    holes,
    shots,
    errors: buildTracerIncidents((errorsResult.data || []) as TracerAdminEventRecord[]),
    playerName,
  };
}

// ============================================
// AUTO-FIX ACTIONS (admin only)
// ============================================

export async function fixRoundData(
  roundId: string,
  fixType: 'recalculate_round_totals' | 'recalculate_round_gir' | 'refresh_player_stats_cache' | 'recalculate_strokes_gained' | 'resolve_stuck_round',
  playerId?: string
): Promise<{
  success: boolean;
  fix_type: string;
  round_id: string | null;
  player_id: string | null;
  message: string;
  changes?: Record<string, { before: string | number | null; after: string | number | null }>;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userData?.role !== 'admin') throw new Error('Forbidden');

  const adminDb = createAdminClient();

  switch (fixType) {
    case 'recalculate_round_totals': {
      const { data: round } = await adminDb
        .from('golf_rounds')
        .select('total_score, score_to_par, total_putts, total_fairways_hit, total_fairways, total_gir, total_gir_possible, player_id')
        .eq('id', roundId)
        .single();
      if (!round) return { success: false, fix_type: fixType, round_id: roundId, player_id: null, message: 'Round not found' };

      const { data: holes } = await adminDb
        .from('golf_holes')
        .select('score, putts, fairway_hit, gir, par')
        .eq('round_id', roundId);

      if (!holes || holes.length === 0) {
        return { success: false, fix_type: fixType, round_id: roundId, player_id: round.player_id, message: 'No hole data found for this round' };
      }

      // Refuse to recalculate if any holes have null scores — would produce garbage totals
      const holesWithNullScore = holes.filter(h => h.score == null);
      if (holesWithNullScore.length > 0) {
        return { success: false, fix_type: fixType, round_id: roundId, player_id: round.player_id, message: `Cannot recalculate: ${holesWithNullScore.length} of ${holes.length} holes have null scores` };
      }

      const newTotalScore = holes.reduce((sum, h) => sum + h.score!, 0);
      const newScoreToPar = holes.reduce((sum, h) => sum + (h.score! - (h.par || 0)), 0);
      const newTotalPutts = holes.reduce((sum, h) => sum + (h.putts || 0), 0);
      const newFairwaysHit = holes.filter(h => h.fairway_hit === true).length;
      const newFairwaysTotal = holes.filter(h => h.fairway_hit != null).length;
      const newGir = holes.filter(h => h.gir === true).length;
      const newGirTotal = holes.filter(h => h.gir != null).length;

      const { error } = await adminDb
        .from('golf_rounds')
        .update({
          total_score: newTotalScore,
          score_to_par: newScoreToPar,
          total_putts: newTotalPutts,
          total_fairways_hit: newFairwaysHit,
          total_fairways: newFairwaysTotal,
          total_gir: newGir,
          total_gir_possible: newGirTotal,
        })
        .eq('id', roundId);

      if (error) return { success: false, fix_type: fixType, round_id: roundId, player_id: round.player_id, message: `DB update failed: ${error.message}` };

      revalidatePath('/golf/admin');
      return {
        success: true,
        fix_type: fixType,
        round_id: roundId,
        player_id: round.player_id,
        message: 'Round totals recalculated from hole data',
        changes: {
          total_score: { before: round.total_score, after: newTotalScore },
          total_putts: { before: round.total_putts, after: newTotalPutts },
          total_fairways_hit: { before: round.total_fairways_hit, after: newFairwaysHit },
          total_gir: { before: round.total_gir, after: newGir },
        },
      };
    }

    case 'recalculate_round_gir': {
      const { data: holes } = await adminDb
        .from('golf_holes')
        .select('id, score, putts, par, gir')
        .eq('round_id', roundId);

      if (!holes || holes.length === 0) {
        return { success: false, fix_type: fixType, round_id: roundId, player_id: playerId || null, message: 'No hole data found' };
      }

      // Batch GIR updates to avoid N+1 sequential writes
      const toTrue: string[] = [];
      const toFalse: string[] = [];
      for (const hole of holes) {
        if (hole.score == null || hole.putts == null || hole.par == null) continue;
        const correctGir = (hole.score - hole.putts) <= (hole.par - 2);
        if (hole.gir !== correctGir) {
          (correctGir ? toTrue : toFalse).push(hole.id);
        }
      }
      if (toTrue.length > 0) {
        await adminDb.from('golf_holes').update({ gir: true }).in('id', toTrue);
      }
      if (toFalse.length > 0) {
        await adminDb.from('golf_holes').update({ gir: false }).in('id', toFalse);
      }
      const fixedCount = toTrue.length + toFalse.length;

      const { data: updatedHoles } = await adminDb
        .from('golf_holes')
        .select('gir')
        .eq('round_id', roundId);
      const newGir = (updatedHoles || []).filter(h => h.gir === true).length;
      const newGirTotal = (updatedHoles || []).filter(h => h.gir != null).length;
      await adminDb
        .from('golf_rounds')
        .update({ total_gir: newGir, total_gir_possible: newGirTotal })
        .eq('id', roundId);

      revalidatePath('/golf/admin');
      return {
        success: true,
        fix_type: fixType,
        round_id: roundId,
        player_id: playerId || null,
        message: `Recalculated GIR for ${holes.length} holes, fixed ${fixedCount}`,
        changes: { gir_holes_fixed: { before: null, after: fixedCount } },
      };
    }

    case 'refresh_player_stats_cache': {
      if (!playerId) return { success: false, fix_type: fixType, round_id: null, player_id: null, message: 'playerId required' };

      const { data: beforeCache } = await adminDb
        .from('golf_player_stats_cache')
        .select('rounds_played, scoring_average, putts_per_round, driving_accuracy_percentage, gir_percentage, is_stale, updated_at')
        .eq('player_id', playerId)
        .maybeSingle();

      const { error } = await adminDb.rpc('refresh_player_stats_cache', { p_player_id: playerId });

      if (error) return { success: false, fix_type: fixType, round_id: null, player_id: playerId, message: `Cache refresh failed: ${error.message}` };

      const { data: afterCache } = await adminDb
        .from('golf_player_stats_cache')
        .select('rounds_played, scoring_average, putts_per_round, driving_accuracy_percentage, gir_percentage, is_stale, updated_at')
        .eq('player_id', playerId)
        .maybeSingle();

      const changes: Record<string, { before: string | number | null; after: string | number | null }> = {};
      const comparisons = [
        ['rounds_played', beforeCache?.rounds_played ?? null, afterCache?.rounds_played ?? null],
        ['scoring_average', beforeCache?.scoring_average != null ? Number(beforeCache.scoring_average) : null, afterCache?.scoring_average != null ? Number(afterCache.scoring_average) : null],
        ['putts_per_round', beforeCache?.putts_per_round != null ? Number(beforeCache.putts_per_round) : null, afterCache?.putts_per_round != null ? Number(afterCache.putts_per_round) : null],
        ['driving_accuracy_percentage', beforeCache?.driving_accuracy_percentage != null ? Number(beforeCache.driving_accuracy_percentage) : null, afterCache?.driving_accuracy_percentage != null ? Number(afterCache.driving_accuracy_percentage) : null],
        ['gir_percentage', beforeCache?.gir_percentage != null ? Number(beforeCache.gir_percentage) : null, afterCache?.gir_percentage != null ? Number(afterCache.gir_percentage) : null],
        ['is_stale', beforeCache?.is_stale ? 'stale' : 'fresh', afterCache?.is_stale ? 'stale' : 'fresh'],
      ] as const;
      for (const [field, before, after] of comparisons) {
        if (before !== after) {
          changes[field] = { before, after };
        }
      }

      revalidatePath('/golf/admin');
      return {
        success: true,
        fix_type: fixType,
        round_id: null,
        player_id: playerId,
        message: Object.keys(changes).length > 0
          ? `Stats cache refreshed (${Object.keys(changes).length} field${Object.keys(changes).length === 1 ? '' : 's'} updated)`
          : 'Stats cache refreshed; no cache fields changed',
        changes: Object.keys(changes).length > 0 ? changes : undefined,
      };
    }

    case 'recalculate_strokes_gained': {
      const { error } = await adminDb.rpc('recalculate_round_strokes_gained', { p_round_id: roundId });

      if (error) return { success: false, fix_type: fixType, round_id: roundId, player_id: playerId || null, message: `SG recalc failed: ${error.message}` };

      // Sync the cached SG total back to golf_rounds so the data quality check sees it
      const { data: cached } = await adminDb
        .from('golf_round_stats_cache')
        .select('strokes_gained_total')
        .eq('round_id', roundId)
        .single();

      if (cached?.strokes_gained_total != null) {
        await adminDb
          .from('golf_rounds')
          .update({ strokes_gained_total: cached.strokes_gained_total })
          .eq('id', roundId);
      }

      revalidatePath('/golf/admin');
      return {
        success: true,
        fix_type: fixType,
        round_id: roundId,
        player_id: playerId || null,
        message: 'Strokes gained recalculated for round',
      };
    }

    case 'resolve_stuck_round': {
      const { data: round } = await adminDb
        .from('golf_rounds')
        .select('id, player_id, status, updated_at, course_name')
        .eq('id', roundId)
        .maybeSingle();

      if (!round) {
        return { success: false, fix_type: fixType, round_id: roundId, player_id: playerId || null, message: 'Round not found' };
      }

      if (round.status !== 'in_progress') {
        return { success: false, fix_type: fixType, round_id: roundId, player_id: round.player_id, message: `Round status is ${round.status}, not in_progress` };
      }

      if (!round.updated_at) {
        return { success: false, fix_type: fixType, round_id: roundId, player_id: round.player_id, message: 'Round has no updated_at timestamp' };
      }

      const hoursStale = (Date.now() - new Date(round.updated_at).getTime()) / (1000 * 60 * 60);
      if (hoursStale < 24) {
        return {
          success: false,
          fix_type: fixType,
          round_id: roundId,
          player_id: round.player_id,
          message: `Round was updated ${hoursStale.toFixed(1)} hours ago; only rounds stale for 24+ hours can be auto-resolved`,
        };
      }

      const [{ count: scoredHoleCount }, { count: shotCount }] = await Promise.all([
        adminDb
          .from('golf_holes')
          .select('id', { count: 'exact', head: true })
          .eq('round_id', roundId)
          .not('score', 'is', null),
        adminDb
          .from('golf_shots')
          .select('id', { count: 'exact', head: true })
          .eq('round_id', roundId),
      ]);

      if ((scoredHoleCount || 0) > 1 || (shotCount || 0) > 8) {
        return {
          success: false,
          fix_type: fixType,
          round_id: roundId,
          player_id: round.player_id,
          message: 'Round has too much recorded activity for auto-resolution; review manually before deleting it',
        };
      }

      const { error } = await adminDb
        .from('golf_rounds')
        .delete()
        .eq('id', roundId)
        .eq('status', 'in_progress');

      if (error) {
        return { success: false, fix_type: fixType, round_id: roundId, player_id: round.player_id, message: `Failed to remove stale round: ${error.message}` };
      }

      revalidatePath('/golf/admin');
      return {
        success: true,
        fix_type: fixType,
        round_id: roundId,
        player_id: round.player_id,
        message: `Removed stale in-progress round from ${round.course_name || 'unknown course'}`,
        changes: {
          round_status: { before: 'in_progress', after: 'deleted' },
          scored_holes: { before: scoredHoleCount || 0, after: 0 },
          shots: { before: shotCount || 0, after: 0 },
        },
      };
    }

    default:
      return { success: false, fix_type: fixType, round_id: roundId, player_id: playerId || null, message: `Unknown fix type: ${fixType}` };
  }
}
