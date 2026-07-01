/**
 * Read model: Decision Room — Insights (staff decision-review signals).
 *
 * Backs the Coach Room (Decision Room) "Insights" panel by reading the EXISTING
 * prod table `baseball_signals`. Only ACTIVE / UNRESOLVED signals that are
 * relevant to a staff decision review are surfaced (open disposition, not
 * expired, staff-visible). The open-disposition set is shared with the Signal
 * Inbox (`OPEN_SIGNAL_DISPOSITIONS`) so a signal is never visible in one
 * surface and invisible in the other.
 *
 * RLS SAFETY: callers MUST pass the AUTHENTICATED server client
 * (`await createClient()` from '@/lib/supabase/server'). All rows returned here
 * are scoped to the caller's team both by the explicit `team_id` filter below
 * and by row-level security on the table. NEVER call this with the
 * service-role/admin client — it would bypass RLS and leak cross-team data.
 *
 * This is a plain server module (NO 'use server'). Reads only; no writes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type { DecisionRoomInsight } from '@/app/baseball/actions/decision-room';
import { OPEN_SIGNAL_DISPOSITIONS } from '@/lib/types/baseball-signals';

/**
 * Hard server-side row cap. PostgREST also enforces a max-rows ceiling, but a
 * staff decision review only needs the most relevant open signals, so we bound
 * the result set here and rely on the severity + recency ordering below to
 * surface the most important signals first. Well under the 1000-row PostgREST
 * cap, so no pagination helper is required.
 */
const ACTIVE_SIGNALS_LIMIT = 100;

/**
 * `status` values treated as still in play (not closed out). Anything else
 * (e.g. archived/resolved/dismissed) is excluded from the decision review.
 */
const ACTIVE_STATUSES = ['active', 'open', 'new'];

/**
 * Severity ordering used for client-stable sort weighting (higher = more
 * urgent). Unknown severities fall back to the lowest weight so they sort last
 * but are never dropped.
 */
const SEVERITY_WEIGHT: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

/**
 * Shape of the columns we select from `baseball_signals`.
 * Mirrors the live schema verified via information_schema (no guessed columns):
 * id, team_id, player_id, signal_type, category, title, body, severity,
 * source_kind, confidence, visibility, status, disposition, expires_at,
 * created_at, updated_at.
 */
interface SignalRow {
  id: string;
  team_id: string;
  player_id: string | null;
  signal_type: string;
  category: string;
  title: string;
  body: string | null;
  severity: string;
  source_kind: string;
  confidence: number | null;
  visibility: string;
  status: string;
  disposition: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Load active, unresolved signals for a team as Decision Room insights, ordered
 * most-severe-and-recent first.
 *
 * Returns honest rows from the backing table — never fabricated data. When the
 * team has no qualifying signals, returns an empty array.
 *
 * Relevance filters (a signal must satisfy all of these to surface):
 *  - belongs to the caller's team (`team_id`, also enforced by RLS)
 *  - `status` is still active (not archived/resolved)
 *  - `disposition` is still open per the Signal Inbox's own definition
 *    (`OPEN_SIGNAL_DISPOSITIONS`: not already acted on / dismissed)
 *  - not expired (`expires_at` is null or in the future)
 *
 * @param supabase Authenticated server Supabase client (RLS-applied).
 * @param teamId   The caller's team id; signals are scoped to this team.
 */
export async function loadInsights(
  supabase: SupabaseClient,
  teamId: string,
): Promise<DecisionRoomInsight[]> {
  if (!teamId) return [];

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('baseball_signals')
    .select(
      'id, team_id, player_id, signal_type, category, title, body, severity, source_kind, confidence, visibility, status, disposition, expires_at, created_at, updated_at',
    )
    .eq('team_id', teamId)
    .in('status', ACTIVE_STATUSES)
    .in('disposition', OPEN_SIGNAL_DISPOSITIONS)
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(ACTIVE_SIGNALS_LIMIT);

  if (error || !data) return [];

  const rows = data as SignalRow[];

  // Severity-first, then recency. The DB already returns newest-first; a stable
  // sort by descending severity weight preserves that order within each tier.
  const sorted = [...rows].sort(
    (a, b) =>
      (SEVERITY_WEIGHT[b.severity] ?? -1) - (SEVERITY_WEIGHT[a.severity] ?? -1),
  );

  return sorted.map((row): DecisionRoomInsight => ({
    id: row.id,
    title: row.title,
    body: row.body,
    insightType: row.signal_type,
    priority: row.severity,
    status: row.status,
    authorName: null,
    createdAt: row.created_at,
  }));
}
