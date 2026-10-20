'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { classifyInProgressActivity } from '@/lib/golf/tracer-round-activity';
import { buildAdminEventIncidentKey, normalizeDashboardSeverity } from './admin-data-shared';
import type { AdminEventIncidentRecord } from './admin-data-shared';

async function resolveDashboardIncidentImpl(input: {
  incidentKey: string;
  title: string;
  message: string;
  severity: string;
  route: string | null;
  url: string | null;
  action: string | null;
  featureArea: string;
  errorCode: string | null;
  source: string | null;
  eventIds?: string[];
}): Promise<{
  success: boolean;
  resolvedCount: number;
  message: string;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userData, error: userErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (userErr || (userData?.role as string) !== 'admin') throw new Error('Forbidden');

  const adminDb = createAdminClient();

  // If caller provided event IDs directly (e.g. from tracer incidents which
  // already know the exact events), resolve them without re-fetching + key matching.
  let matchingIds: string[];
  if (input.eventIds && input.eventIds.length > 0) {
    matchingIds = input.eventIds;
  } else {
    const { data, error } = await adminDb
      .from('admin_events')
      .select('id, event_type, severity, title, message, metadata, user_id, user_email, url, resolved, resolved_at, resolved_by, created_at')
      .eq('event_type', 'error')
      .eq('resolved', false)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      return { success: false, resolvedCount: 0, message: `Could not load incident events: ${error.message}` };
    }

    matchingIds = ((data ?? []) as AdminEventIncidentRecord[])
      .filter((event) => buildAdminEventIncidentKey(event) === input.incidentKey)
      .map((event) => event.id);
  }

  const resolvedAt = new Date().toISOString();
  if (matchingIds.length > 0) {
    const { error: updateError } = await adminDb
      .from('admin_events')
      .update({
        resolved: true,
        resolved_at: resolvedAt,
        resolved_by: user.id,
      })
      .in('id', matchingIds);

    if (updateError) {
      return { success: false, resolvedCount: 0, message: `Could not resolve incident: ${updateError.message}` };
    }

    revalidatePath('/golf/admin');
    return {
      success: true,
      resolvedCount: matchingIds.length,
      message: `Marked incident resolved and closed ${matchingIds.length} admin event${matchingIds.length === 1 ? '' : 's'}.`,
    };
  }

  const { error: insertError } = await adminDb
    .from('admin_events')
    .insert({
      event_type: 'error',
      severity: normalizeDashboardSeverity(input.severity),
      title: input.title,
      message: input.message,
      metadata: {
        originalMessage: input.message,
        message: input.message,
        route: input.route,
        url: input.url,
        action: input.action,
        featureArea: input.featureArea,
        errorCode: input.errorCode,
        source: input.source ?? 'admin_dashboard_manual_resolution',
        resolutionSource: 'admin_dashboard',
        manualResolved: true,
      },
      user_id: user.id,
      user_email: user.email ?? null,
      url: input.url,
      resolved: true,
      resolved_at: resolvedAt,
      resolved_by: user.id,
    });

  if (insertError) {
    return { success: false, resolvedCount: 0, message: `Could not create resolution record: ${insertError.message}` };
  }

  revalidatePath('/golf/admin');
  return {
    success: true,
    resolvedCount: 1,
    message: 'Marked incident resolved and created a manual resolution record for the dashboard feed.',
  };
}
/**
 * Observed wrapper — logging never alters behavior (see observed-action
 * tests). `'use server'` requires exported server actions to be async
 * function declarations (const-export form breaks Next's build), so the
 * wrapped closure is built once at module scope and the export just
 * delegates to it.
 */
const observedResolveDashboardIncident = withAdminObserved(
  'resolveDashboardIncident',
  { sport: 'shared', feature: 'admin_dashboard' },
  resolveDashboardIncidentImpl,
);
// UNCALLED as of 2026-08-26. Its only consumer was the legacy /golf/admin
// ErrorFeed, deleted with the rest of that dashboard; the Bridge resolves
// through resolve_admin_event (src/app/admin/actions/triage.ts) instead, which
// is the single write path documented in memory/features/admin-platform.md.
// Left in place rather than deleted in the same change: removing exports here
// moves the count that src/lib/admin/__tests__/coverage-contract.foundation.test.ts
// pins, so it belongs in a deliberate dead-action sweep rather than as a
// side effect of a UI deletion. Do not build anything new on it.

export async function resolveDashboardIncident(input: {
  incidentKey: string;
  title: string;
  message: string;
  severity: string;
  route: string | null;
  url: string | null;
  action: string | null;
  featureArea: string;
  errorCode: string | null;
  source: string | null;
  eventIds?: string[];
}): Promise<{
  success: boolean;
  resolvedCount: number;
  message: string;
}> {
  return observedResolveDashboardIncident(input);
}
// ============================================
// ADMIN INCIDENTS — cursor-paginated feed
// ============================================
//
// The Overview tab still uses the single-shot fetch baked into the rollup
// pipeline (rawAdminErrorEvents / errorLogs). This separate exported action
// powers the System tab's incident feed where the row count grows unbounded
// over time and pulling everything per render becomes the bottleneck.
//
// Cursor is the `created_at` ISO string of the last row in the previous page.
// The feed is ordered DESC, so paging forward means `created_at < cursor`.
// Limit is clamped to [1, 200]; default is 50.

/** Active, non-info admin_event row in the shape consumed by the System tab
 *  incident list. Shape is camelCased and free of any `any`.
 *
 *  `admin_events` has no `status` column on the DB side — `resolved=false`
 *  is the canonical "active" signal. We surface a synthesized
 *  `status: 'active'` so the consuming UI matches the dashboard's existing
 *  active/open/resolved/historical vocabulary. */
export interface AdminIncident {
  id: string;
  eventType: string;
  severity: 'critical' | 'error' | 'warning';
  status: 'active';
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  userId: string | null;
  userEmail: string | null;
  url: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
}
export interface GetAdminIncidentsParams {
  cursor?: string;
  limit?: number;
}
export interface GetAdminIncidentsResult {
  items: AdminIncident[];
  nextCursor: string | null;
}
/** Raw row shape returned by Supabase before camelCasing. Kept private — the
 *  exported `AdminIncident` is the public contract. */
interface AdminIncidentRow {
  id: string;
  event_type: string;
  severity: string;
  title: string;
  message: string | null;
  metadata: Record<string, unknown> | null;
  user_id: string | null;
  user_email: string | null;
  url: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}
const ADMIN_INCIDENTS_DEFAULT_LIMIT = 50;
const ADMIN_INCIDENTS_MAX_LIMIT = 200;
function clampIncidentLimit(n: number | undefined): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return ADMIN_INCIDENTS_DEFAULT_LIMIT;
  const truncated = Math.trunc(n);
  if (truncated < 1) return 1;
  if (truncated > ADMIN_INCIDENTS_MAX_LIMIT) return ADMIN_INCIDENTS_MAX_LIMIT;
  return truncated;
}
function normalizeIncidentSeverity(input: string): 'critical' | 'error' | 'warning' {
  // The DB filter restricts to these three already; this tightens the type for
  // callers and keeps an unexpected value from leaking through.
  if (input === 'critical' || input === 'error' || input === 'warning') return input;
  return 'error';
}
/** Cursor-paginated incident feed for the System tab. Filters to active
 *  (status='active') admin_events at error/warning/critical severity, ordered
 *  by created_at DESC. The cursor is the created_at of the last item on the
 *  previous page; pass it back in to walk further into the past. */
async function getAdminIncidentsImpl(
  params: GetAdminIncidentsParams = {},
): Promise<GetAdminIncidentsResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userErr || (userRow?.role as string | undefined) !== 'admin') throw new Error('Forbidden');

  const limit = clampIncidentLimit(params.limit);
  const admin = createAdminClient();

  // `admin_events` has no `status` column; `resolved=false` is the active
  // signal. The exported `AdminIncident.status` is synthesized below.
  let query = admin
    .from('admin_events')
    .select(
      'id, event_type, severity, title, message, metadata, user_id, user_email, url, resolved, resolved_at, resolved_by, created_at',
    )
    .in('severity', ['critical', 'error', 'warning'])
    .eq('resolved', false)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (params.cursor) {
    query = query.lt('created_at', params.cursor);
  }

  const { data, error } = await query;
  if (error) {
    // W15: inline logServerError removed here — withAdminObserved now
    // captures this throw at the export boundary (no more double-log).
    throw error instanceof Error ? error : new Error(describeError(error));
  }

  const rows = (data ?? []) as unknown as AdminIncidentRow[];
  const items: AdminIncident[] = rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    severity: normalizeIncidentSeverity(row.severity),
    status: 'active',
    title: row.title,
    message: row.message,
    metadata: row.metadata,
    userId: row.user_id,
    userEmail: row.user_email,
    url: row.url,
    resolved: row.resolved,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    createdAt: row.created_at,
  }));

  // Only emit a cursor when the page filled exactly — a short page means we
  // hit the end and there's nothing left to fetch.
  const lastItem = items[items.length - 1];
  const nextCursor = items.length === limit && lastItem ? lastItem.createdAt : null;

  return { items, nextCursor };
}
/**
 * Observed wrapper — logging never alters behavior (see observed-action
 * tests). `'use server'` requires exported server actions to be async
 * function declarations (const-export form breaks Next's build), so the
 * wrapped closure is built once at module scope and the export just
 * delegates to it.
 */
const observedGetAdminIncidents = withAdminObserved(
  'getAdminIncidents',
  { sport: 'shared', feature: 'admin_dashboard' },
  getAdminIncidentsImpl,
);
export async function getAdminIncidents(
  params: GetAdminIncidentsParams = {},
): Promise<GetAdminIncidentsResult> {
  return observedGetAdminIncidents(params);
}
// ============================================
// STUCK ROUNDS SNAPSHOT (Overview "Rounds" card)
// ============================================
//
// A small, purpose-built query for the admin overview's "Stuck" rounds
// list. Separate from the recent_rounds CTE inside get_admin_dashboard_rollup
// (activity.recentRounds above) — that CTE only selects id/total_score/
// score_to_par/round_type/course_name/created_at, so it can't distinguish
// "still in progress" from "completed with no score", or "halted an hour
// ago" from "abandoned since May". Adding status/updated_at there means
// touching the production rollup RPC via a migration, which this surface
// doesn't need — a direct query is enough.
//
// Mirrors admin-tracer-data.ts's getTracerEnrichedDataImpl (status =
// 'in_progress', idle measured from updated_at, bounded to the last 30
// days) and shares its classifyInProgressActivity tiering so this card and
// the Tracer tab's stuck-rounds surfaces can't drift into disagreement
// again. Only the 'round_stuck' tier (recently active, then halted) is
// returned — an abandoned round shouldn't scream on the very first card an
// admin sees any more than it should on an alert panel.

export interface AdminStuckRound {
  round_id: string;
  player_name: string;
  course_name: string | null;
  current_hole: number | null;
  updated_at: string;
  hours_idle: number;
}
async function getAdminStuckRoundsImpl(): Promise<AdminStuckRound[] | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userErr || (userRow?.role as string) !== 'admin') throw new Error('Forbidden');

  const adminDb = createAdminClient();
  const ago30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await adminDb
    .from('golf_rounds')
    .select('id, player_id, course_name, current_hole, updated_at')
    .eq('status', 'in_progress')
    .lt('updated_at', oneHourAgo)
    .gte('updated_at', ago30d)
    .order('updated_at', { ascending: true });

  if (error) {
    void logServerError(
      `[admin-data] getAdminStuckRounds errored: ${describeError(error)}`,
      { action: 'admin_data.getAdminStuckRounds', featureArea: 'admin' },
    );
    // null (not []) — this list is purely additive display data, not a
    // security allow/exclude set, but a failed read must still be
    // distinguishable from "checked, nothing stuck" rather than silently
    // collapsing into it. The caller decides what null means (currently:
    // treat it the same as empty, since there is no permission at stake).
    return null;
  }

  const candidates = (rows ?? []).filter(
    (r): r is typeof r & { updated_at: string } => r.updated_at != null
  );

  const playerIds = [...new Set(candidates.map((r) => r.player_id))];
  const playerNameMap = new Map<string, string>();
  if (playerIds.length > 0) {
    const { data: players, error: playersError } = await adminDb
      .from('golf_players')
      .select('id, first_name, last_name')
      .in('id', playerIds);
    if (playersError) {
      // Non-fatal: the round-level rows are already fetched, and every
      // lookup below already falls back to 'Unknown' on a missing map entry.
      // Log and degrade rather than fail the whole card over a name lookup.
      void logServerError(
        `[admin-data] getAdminStuckRounds player lookup errored: ${describeError(playersError)}`,
        { action: 'admin_data.getAdminStuckRounds', featureArea: 'admin' },
      );
    }
    for (const p of players || []) {
      playerNameMap.set(p.id, `${p.first_name || ''} ${p.last_name || ''}`.trim() || 'Unknown');
    }
  }

  return candidates
    .filter((r) => classifyInProgressActivity(r.updated_at) === 'round_stuck')
    .map((r) => ({
      round_id: r.id,
      player_name: playerNameMap.get(r.player_id) || 'Unknown',
      course_name: r.course_name,
      current_hole: r.current_hole ?? null,
      updated_at: r.updated_at,
      hours_idle: (Date.now() - new Date(r.updated_at).getTime()) / (1000 * 60 * 60),
    }));
}
const observedGetAdminStuckRounds = withAdminObserved(
  'getAdminStuckRounds',
  { sport: 'shared', feature: 'admin_dashboard' },
  getAdminStuckRoundsImpl,
);
export async function getAdminStuckRounds(): Promise<AdminStuckRound[] | null> {
  return observedGetAdminStuckRounds();
}
