// =============================================================================
// src/lib/baseball/read-models/command-center.ts
//
// Wave 3 / packet P3.2 — Coach Command Center read model.
//
// The staff-facing operations feed. Composes three honest sub-feeds for a team:
//
//   1. riskFeed   — open AI/coach insights (baseball_coach_insights) ranked by
//                   priority, each source-labeled (AI vs manual) + confidence.
//   2. rosterPulse— per-player recent-activity pulse (sessions, trend, last
//                   session) from baseball_player_aggregates + members.
//   3. todayEvents— today's calendar events (baseball_events) for the team.
//
// STAFF ONLY: the Command Center is a coaching surface. This read model resolves
// the viewer server-side and returns an authorized:false envelope (NOT an
// error, NOT partial data) when the current user is not staff on the team. RLS
// backs every query; this is the in-process gate + honest envelope on top.
//
// HONESTY: insights carry their real source + confidence (no fabricated 100%);
// roster pulse marks players with zero captured sessions as 'no_data' rather
// than implying a 0.000 average; counts are real counts, never padded.
//
// 'server-only' + plain async functions (NOT 'use server') so server components
// and other read models can import it.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type {
  BaseballInsightPriority,
  BaseballTrend,
} from '@/lib/types';
import {
  buildSourceRef,
  normalizeConfidence,
  type SourceRef,
} from '@/lib/baseball/source-record';

// -----------------------------------------------------------------------------
// Public shapes
// -----------------------------------------------------------------------------

/** Severity buckets the Command Center risk strip renders. */
export type RiskSeverity = 'critical' | 'warning' | 'info';

/** A single evidence reference from the engine evidence trail. */
export interface EvidenceRef {
  /** The insight / signal id that sourced this. */
  id: string;
  /** Human-readable label for the evidence (e.g. "Session #42", "Stat event"). */
  label: string;
  /** Underlying record kind ("session" | "stat_event" | "video" | "signal"). */
  kind: string;
}

export interface RiskFeedItem {
  id: string;
  playerId: string | null;
  insightType: string;
  title: string;
  body: string | null;
  priority: BaseballInsightPriority;
  severity: RiskSeverity;
  createdAt: string | null;
  /** Provenance: AI engine vs coach-authored. */
  sourceRef: SourceRef;
  /** Normalized [0,1] confidence, or null when none stored. */
  confidence: number | null;
  /**
   * Evidence trail from the engine (source_refs column). Present when the
   * insight was produced by the CoachHelm engine and the column is populated.
   * Empty array when coach-authored or no evidence recorded.
   */
  evidenceRefs: EvidenceRef[];
}

/** Per-player activity pulse for the roster strip. */
export interface RosterPulseItem {
  playerId: string;
  firstName: string | null;
  lastName: string | null;
  jerseyNumber: number | null;
  primaryPosition: string | null;
  totalSessions: number;
  /** Most recent trend, or null when not enough data. */
  recentTrend: BaseballTrend | null;
  careerAvg: number | null;
  lastSessionAt: string | null;
  /** True when the player has zero captured sessions (honest empty, not 0.000). */
  noData: boolean;
}

export interface CommandCenterEvent {
  id: string;
  title: string;
  eventType: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  isMandatory: boolean;
}

export interface CommandCenterReadModel {
  teamId: string;
  /** False when the current user is not staff on this team. */
  authorized: boolean;
  riskFeed: RiskFeedItem[];
  rosterPulse: RosterPulseItem[];
  todayEvents: CommandCenterEvent[];
  summary: {
    openRisks: number;
    criticalRisks: number;
    rosterSize: number;
    playersWithData: number;
    eventsToday: number;
  };
  /** Honest error string when a sub-read failed; arrays are still safe ([]). */
  error: string | null;
}

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

export interface CommandCenterOptions {
  /** Max risk items (default 25). */
  riskLimit?: number;
  /** ISO date (YYYY-MM-DD) to treat as "today"; defaults to server now. */
  forDate?: string;
}

// -----------------------------------------------------------------------------
// Severity mapping (priority -> strip bucket)
// -----------------------------------------------------------------------------

const PRIORITY_SEVERITY: Record<BaseballInsightPriority, RiskSeverity> = {
  critical: 'critical',
  urgent: 'critical',
  high: 'warning',
  medium: 'warning',
  low: 'info',
};

function severityFor(priority: string | null): RiskSeverity {
  if (priority && priority in PRIORITY_SEVERITY) {
    return PRIORITY_SEVERITY[priority as BaseballInsightPriority];
  }
  return 'info';
}

// -----------------------------------------------------------------------------
// Staff authorization
// -----------------------------------------------------------------------------

async function isTeamStaff(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: coach } = await supabase
    .from('baseball_coaches')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!coach) return false;

  const { data: staff } = await supabase
    .from('baseball_team_coach_staff')
    .select('id')
    .eq('team_id', teamId)
    .eq('coach_id', coach.id)
    .maybeSingle();

  return !!staff;
}

// -----------------------------------------------------------------------------
// getCommandCenter
// -----------------------------------------------------------------------------

/**
 * Build the Command Center read model for a team. Staff-only: returns
 * `authorized:false` with empty feeds when the current user is not staff.
 * Never throws — sub-read failures degrade to empty arrays + an `error` string.
 */
export async function getCommandCenter(
  teamId: string,
  options: CommandCenterOptions = {},
): Promise<CommandCenterReadModel> {
  const { riskLimit = 25, forDate } = options;

  const base = (
    authorized: boolean,
    error: string | null,
  ): CommandCenterReadModel => ({
    teamId,
    authorized,
    riskFeed: [],
    rosterPulse: [],
    todayEvents: [],
    summary: {
      openRisks: 0,
      criticalRisks: 0,
      rosterSize: 0,
      playersWithData: 0,
      eventsToday: 0,
    },
    error,
  });

  if (!teamId) return base(false, 'A team id is required.');

  const supabase = await createClient();
  if (!(await isTeamStaff(supabase, teamId))) {
    return base(false, null); // not staff — honest unauthorized envelope
  }

  // Day window for "today" (UTC day; callers can pass forDate to override).
  const day = forDate ?? new Date().toISOString().slice(0, 10);
  const dayStart = `${day}T00:00:00.000Z`;
  const dayEnd = `${day}T23:59:59.999Z`;

  const [insightsRes, membersRes, eventsRes] = await Promise.all([
    // Risk feed: open insights (active/acknowledged), newest first.
    // source_refs is included so the UI can render expandable evidence chips.
    supabase
      .from('baseball_coach_insights')
      .select(
        'id, player_id, insight_type, title, body, priority, status, metadata, source_refs, created_at',
      )
      .eq('team_id', teamId)
      .in('status', ['active', 'acknowledged'])
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(riskLimit, 1), 100)),
    // Roster pulse: members + their aggregates + player bio in one shaped read.
    supabase
      .from('baseball_team_members')
      .select(
        `player_id, jersey_number,
         baseball_players!inner ( id, first_name, last_name, primary_position ),
         baseball_player_aggregates ( total_sessions, recent_trend, career_avg, last_session_at )`,
      )
      .eq('team_id', teamId),
    // Today's events.
    supabase
      .from('baseball_events')
      .select('id, title, event_type, start_time, end_time, location, is_mandatory')
      .eq('team_id', teamId)
      .gte('start_time', dayStart)
      .lte('start_time', dayEnd)
      .order('start_time', { ascending: true }),
  ]);

  let error: string | null = null;

  // ---- Risk feed ----
  const riskFeed: RiskFeedItem[] = [];
  if (insightsRes.error) {
    error = 'Some risk signals could not be loaded.';
  } else {
    for (const r of insightsRes.data ?? []) {
      const meta = (r.metadata ?? null) as { confidence?: number | string } | null;
      // insight_type encodes provenance loosely; engine insights are AI.
      const isAi =
        typeof r.insight_type === 'string' &&
        /ai|engine|coachhelm|prediction|forecast/i.test(r.insight_type);
      // Normalize source_refs from the jsonb column into EvidenceRef[].
      // The engine stores an array of {id, kind, label?} objects; we defensively
      // coerce them so malformed rows never crash the read model.
      const rawRefs = (r as Record<string, unknown>).source_refs;
      const evidenceRefs: EvidenceRef[] = [];
      if (Array.isArray(rawRefs)) {
        for (const ref of rawRefs) {
          if (ref && typeof ref === 'object') {
            const r2 = ref as Record<string, unknown>;
            const id = typeof r2.id === 'string' ? r2.id : typeof r2.signal_id === 'string' ? r2.signal_id : null;
            if (id) {
              evidenceRefs.push({
                id,
                kind: typeof r2.kind === 'string' ? r2.kind : 'signal',
                label: typeof r2.label === 'string' ? r2.label : typeof r2.source_table === 'string' ? r2.source_table : `ref:${id.slice(0, 8)}`,
              });
            }
          }
        }
      }
      riskFeed.push({
        id: r.id,
        playerId: r.player_id,
        insightType: r.insight_type,
        title: r.title,
        body: r.body,
        priority: (r.priority as BaseballInsightPriority) ?? 'low',
        severity: severityFor(r.priority),
        createdAt: r.created_at,
        sourceRef: buildSourceRef({
          source: isAi ? 'ai' : 'manual',
          label: isAi ? 'CoachHelm engine' : 'Coach insight',
        }),
        confidence: normalizeConfidence(meta?.confidence ?? null),
        evidenceRefs,
      });
    }
  }

  // ---- Roster pulse ----
  const rosterPulse: RosterPulseItem[] = [];
  if (membersRes.error) {
    error = error ?? 'The roster pulse could not be loaded.';
  } else {
    for (const m of membersRes.data ?? []) {
      const player = m.baseball_players as unknown as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        primary_position: string | null;
      } | null;
      if (!player) continue;
      // aggregates may be returned as an array (0/1) from the embedded select.
      const aggRaw = m.baseball_player_aggregates as unknown;
      const agg = (Array.isArray(aggRaw) ? aggRaw[0] : aggRaw) as
        | {
            total_sessions: number | null;
            recent_trend: string | null;
            career_avg: number | null;
            last_session_at: string | null;
          }
        | null
        | undefined;
      const totalSessions = agg?.total_sessions ?? 0;
      rosterPulse.push({
        playerId: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
        jerseyNumber: m.jersey_number ?? null,
        primaryPosition: player.primary_position,
        totalSessions,
        recentTrend: (agg?.recent_trend as BaseballTrend | null) ?? null,
        careerAvg: agg?.career_avg ?? null,
        lastSessionAt: agg?.last_session_at ?? null,
        noData: totalSessions === 0,
      });
    }
    // Sort: most recent activity first, no-data players last.
    rosterPulse.sort((a, b) => {
      if (a.noData !== b.noData) return a.noData ? 1 : -1;
      return (b.lastSessionAt ?? '').localeCompare(a.lastSessionAt ?? '');
    });
  }

  // ---- Today's events ----
  const todayEvents: CommandCenterEvent[] = [];
  if (eventsRes.error) {
    error = error ?? "Today's events could not be loaded.";
  } else {
    for (const e of eventsRes.data ?? []) {
      todayEvents.push({
        id: e.id,
        title: e.title,
        eventType: e.event_type,
        startTime: e.start_time,
        endTime: e.end_time,
        location: e.location,
        isMandatory: e.is_mandatory === true,
      });
    }
  }

  const playersWithData = rosterPulse.filter((p) => !p.noData).length;
  const criticalRisks = riskFeed.filter((r) => r.severity === 'critical').length;

  return {
    teamId,
    authorized: true,
    riskFeed,
    rosterPulse,
    todayEvents,
    summary: {
      openRisks: riskFeed.length,
      criticalRisks,
      rosterSize: rosterPulse.length,
      playersWithData,
      eventsToday: todayEvents.length,
    },
    error,
  };
}
