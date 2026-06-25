'use server';
import { fromUntyped } from '@/lib/supabase/untyped';

// =============================================================================
// src/app/baseball/actions/development-metrics.ts
//
// Packet: elite-stats (BaseballHelm — stats-integrations)
//
// THE MISSING WRITE PATH. The elite stat EVENT model migration shipped
// baseball_player_development_metrics (calculated, source-attributed snapshots)
// but NOTHING ever computed or wrote a snapshot, and nothing read one back for a
// player. This file closes both ends of the loop:
//
//   1. snapshotPlayerDevelopmentMetrics — STAFF action that recomputes a player's
//      derived metrics from the raw pitch/batted-ball events (via the
//      getEliteStatEvents read model) and UPSERTS one row per (player, metric,
//      context, as-of date) into baseball_player_development_metrics. Each row
//      carries value + sample_size + confidence + trust_tier + data_context +
//      source_id straight off the DerivedMetric — provenance-true, never a fake
//      "high". This is the source -> signal -> snapshot half of the
//      source→signal→action→timeline chain the v9 cross-subsystem map calls for.
//
//   2. snapshotTeamDevelopmentMetrics — recompute the WHOLE roster (the cron /
//      "recompute" entry point a coach hits from Stats Center).
//
//   3. getPlayerDevelopmentSnapshot — the PLAYER-side read. A player sees ONLY
//      their own rows whose visibility = 'player_visible' (RLS enforces it; this
//      action also filters in-process for an honest, small payload). Coaches read
//      the staff view through the read model directly.
//
// CONTRACT / SECURITY (CLAUDE.md hard rules):
//   * Every action runs inside withBaseballAction (auth + server-validated active
//     team + Sentry scope + sanitized errors).
//   * The two compute/write actions require the can_manage_stats capability
//     SERVER-SIDE (the wrapper enforces it). The read action requires no staff
//     capability (a player reads their own snapshots) — RLS + an explicit
//     owner/visibility filter back it.
//   * team_id + player_id are stamped from the resolved server context / verified
//     roster membership, never trusted from the client.
//   * NO destructive writes: snapshots UPSERT on the migration's
//     uq_baseball_dev_metric_snapshot UNIQUE (team_id, player_id, metric_key,
//     data_context, as_of_date) constraint — a recompute overwrites that day's
//     snapshot in place, it never deletes history.
//   * Tables are not yet in generated database.ts -> fromUntyped escape hatch.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { sanitizeDbError } from '@/lib/db-error';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import {
  getEliteStatEvents,
  type DerivedMetric,
  type EliteStatEventsOptions,
} from '@/lib/baseball/read-models/elite-stat-events';
import type {
  BaseballDataContext,
  BaseballPlayerDevelopmentMetric,
} from '@/lib/types/baseball-stat-events';

const FEATURE = { featureArea: 'baseball-development-metrics' } as const;
const STAFF = { ...FEATURE, requiredCapability: 'can_manage_stats' } as const;

const STATS_CENTER_PATH = '/baseball/dashboard/stats-center';
const PLAYER_STATS_PATH = '/baseball/dashboard/players';

type ActionResult<T = unknown> = { success: boolean; error?: string; data?: T };

/** Today's date as YYYY-MM-DD in UTC (the snapshot as-of date). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Project a DerivedMetric into a baseball_player_development_metrics insert row.
 * Visibility is decided here: a rate/quality metric is player-visible by default
 * so it flows to the player snapshot; staff-sensitive contexts stay staff_only.
 */
function toSnapshotRow(
  teamId: string,
  playerId: string,
  asOfDate: string,
  metric: DerivedMetric,
): Record<string, unknown> {
  // Cage/sensor development context is staff-coaching detail until a coach opts
  // to share it; the competitive record is player-visible by default.
  const playerVisible =
    metric.dataContext === 'official_game' || metric.dataContext === 'scrimmage';
  return {
    team_id: teamId,
    player_id: playerId,
    metric_key: metric.metricKey,
    metric_group: metric.metricGroup,
    data_context: metric.dataContext,
    as_of_date: asOfDate,
    window_label: 'season_to_date',
    value_numeric: metric.value,
    sample_size: metric.sampleSize,
    confidence: metric.confidence,
    trust_tier: metric.trustTier,
    source_id: metric.sourceId,
    visibility: playerVisible ? 'player_visible' : 'staff_only',
    computed_at: new Date().toISOString(),
  };
}

/** Collect a player's derived metrics (hitter + pitcher) for a context set. */
async function computePlayerMetrics(
  teamId: string,
  playerId: string,
  contexts: BaseballDataContext[],
): Promise<{ metrics: DerivedMetric[]; error: string | null }> {
  const options: EliteStatEventsOptions = { playerId, contexts };
  const model = await getEliteStatEvents(teamId, options);
  if (!model.authorized) {
    return { metrics: [], error: 'Not authorized to compute development metrics.' };
  }
  const hitter = model.hitters.find((h) => h.playerId === playerId);
  const pitcher = model.pitchers.find((p) => p.playerId === playerId);
  const metrics = [...(hitter?.metrics ?? []), ...(pitcher?.metrics ?? [])];
  return { metrics, error: model.error };
}

// -----------------------------------------------------------------------------
// snapshotPlayerDevelopmentMetrics — recompute + persist one player's snapshot.
// -----------------------------------------------------------------------------

export const snapshotPlayerDevelopmentMetrics = withBaseballAction(
  'snapshotPlayerDevelopmentMetrics',
  STAFF,
  async (
    ctx,
    input: { playerId: string; contexts?: BaseballDataContext[] },
  ): Promise<ActionResult<{ snapshotted: number; asOfDate: string }>> => {
    if (!input?.playerId) return { success: false, error: 'A player is required.' };

    const supabase = await createClient();

    // Verify the player is on the active team (defense-in-depth over RLS).
    const { data: membership } = await supabase
      .from('baseball_team_members')
      .select('player_id')
      .eq('team_id', ctx.targetTeamId)
      .eq('player_id', input.playerId)
      .maybeSingle();
    if (!membership) return { success: false, error: 'That player is not on this team.' };

    // Compute BOTH the competitive record and the development (cage/sensor)
    // contexts so the player snapshot has the official line and the staff view
    // has the development detail — each tagged with its own data_context.
    const contextSets: BaseballDataContext[][] = input.contexts
      ? [input.contexts]
      : [['official_game', 'scrimmage'], ['practice', 'cage', 'bullpen', 'sensor']];

    const asOfDate = todayIso();
    const rows: Record<string, unknown>[] = [];
    let computeError: string | null = null;
    for (const contexts of contextSets) {
      const { metrics, error } = await computePlayerMetrics(
        ctx.targetTeamId,
        input.playerId,
        contexts,
      );
      computeError = computeError ?? error;
      for (const m of metrics) {
        // Only snapshot metrics with a real denominator — never persist a null
        // "metric" as if it were measured (honest empty: no row).
        if (m.sampleSize > 0 && m.value !== null) {
          rows.push(toSnapshotRow(ctx.targetTeamId, input.playerId, asOfDate, m));
        }
      }
    }

    if (rows.length === 0) {
      return {
        success: true,
        data: { snapshotted: 0, asOfDate },
        error: computeError ?? undefined,
      };
    }

    const { error } = await fromUntyped(supabase, 'baseball_player_development_metrics')
      .upsert(rows, {
        onConflict: 'team_id,player_id,metric_key,data_context,as_of_date',
        ignoreDuplicates: false,
      });
    if (error) return { success: false, error: sanitizeDbError(error, 'stats') };

    revalidatePath(STATS_CENTER_PATH);
    revalidatePath(`${PLAYER_STATS_PATH}/${input.playerId}`);
    revalidatePath(`${PLAYER_STATS_PATH}/${input.playerId}/stats`);

    return { success: true, data: { snapshotted: rows.length, asOfDate } };
  },
);

// -----------------------------------------------------------------------------
// snapshotTeamDevelopmentMetrics — recompute the whole roster's snapshots.
// -----------------------------------------------------------------------------

export const snapshotTeamDevelopmentMetrics = withBaseballAction(
  'snapshotTeamDevelopmentMetrics',
  STAFF,
  async (ctx): Promise<ActionResult<{ players: number; snapshotted: number; asOfDate: string }>> => {
    const supabase = await createClient();

    const { data: members, error: rosterErr } = await supabase
      .from('baseball_team_members')
      .select('player_id')
      .eq('team_id', ctx.targetTeamId);
    if (rosterErr) return { success: false, error: sanitizeDbError(rosterErr, 'stats') };

    const asOfDate = todayIso();
    const contextSets: BaseballDataContext[][] = [
      ['official_game', 'scrimmage'],
      ['practice', 'cage', 'bullpen', 'sensor'],
    ];

    const allRows: Record<string, unknown>[] = [];
    let players = 0;
    for (const m of members ?? []) {
      const pid = (m as { player_id: string }).player_id;
      if (!pid) continue;
      let any = false;
      for (const contexts of contextSets) {
        const { metrics } = await computePlayerMetrics(ctx.targetTeamId, pid, contexts);
        for (const metric of metrics) {
          if (metric.sampleSize > 0 && metric.value !== null) {
            allRows.push(toSnapshotRow(ctx.targetTeamId, pid, asOfDate, metric));
            any = true;
          }
        }
      }
      if (any) players += 1;
    }

    if (allRows.length === 0) {
      return { success: true, data: { players: 0, snapshotted: 0, asOfDate } };
    }

    // Chunk the upsert so a large roster's snapshot set doesn't exceed limits.
    const CHUNK = 500;
    for (let i = 0; i < allRows.length; i += CHUNK) {
      const { error } = await fromUntyped(supabase, 'baseball_player_development_metrics')
        .upsert(allRows.slice(i, i + CHUNK), {
          onConflict: 'team_id,player_id,metric_key,data_context,as_of_date',
          ignoreDuplicates: false,
        });
      if (error) return { success: false, error: sanitizeDbError(error, 'stats') };
    }

    revalidatePath(STATS_CENTER_PATH);

    return {
      success: true,
      data: { players, snapshotted: allRows.length, asOfDate },
    };
  },
);

// -----------------------------------------------------------------------------
// getPlayerDevelopmentSnapshot — the PLAYER-side read (own player_visible rows).
// -----------------------------------------------------------------------------

export interface PlayerDevelopmentSnapshotRow {
  metricKey: string;
  metricGroup: string | null;
  dataContext: BaseballDataContext;
  value: number | null;
  sampleSize: number | null;
  confidence: string;
  trustTier: string;
  asOfDate: string;
  windowLabel: string | null;
}

export const getPlayerDevelopmentSnapshot = withBaseballAction(
  'getPlayerDevelopmentSnapshot',
  FEATURE, // no staff capability: a player reads their OWN player_visible rows
  async (
    ctx,
    input?: { playerId?: string | null },
  ): Promise<ActionResult<PlayerDevelopmentSnapshotRow[]>> => {
    const supabase = await createClient();

    // Resolve the target player: explicit (staff viewing) or the viewer's own
    // player id (player viewing themselves). RLS enforces visibility either way.
    const playerId = input?.playerId ?? ctx.activePlayerId;
    if (!playerId) {
      return { success: false, error: 'No player to load development metrics for.' };
    }

    // Latest as-of snapshot per metric: order by as_of_date desc and dedupe in
    // code (one row per metric_key + context = the freshest snapshot).
    const { data, error } = await fromUntyped(supabase, 'baseball_player_development_metrics')
      .select(
        'metric_key, metric_group, data_context, value_numeric, sample_size, confidence, trust_tier, as_of_date, window_label, visibility',
      )
      .eq('team_id', ctx.targetTeamId)
      .eq('player_id', playerId)
      .order('as_of_date', { ascending: false })
      .limit(500);
    if (error) return { success: false, error: sanitizeDbError(error, 'stats') };

    const seen = new Set<string>();
    const rows: PlayerDevelopmentSnapshotRow[] = [];
    for (const r of (data ?? []) as BaseballPlayerDevelopmentMetric[]) {
      const key = `${r.metric_key}::${r.data_context}`;
      if (seen.has(key)) continue; // keep only the freshest snapshot per metric
      seen.add(key);
      rows.push({
        metricKey: r.metric_key,
        metricGroup: r.metric_group ?? null,
        dataContext: r.data_context,
        value: r.value_numeric ?? null,
        sampleSize: r.sample_size ?? null,
        confidence: r.confidence,
        trustTier: r.trust_tier,
        asOfDate: r.as_of_date,
        windowLabel: r.window_label ?? null,
      });
    }

    return { success: true, data: rows };
  },
);
