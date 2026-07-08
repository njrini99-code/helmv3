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
  BaseballPlayerAggregates,
  BaseballRosterPlayer,
  BaseballTrend,
} from '@/lib/types';
import {
  buildSourceRef,
  normalizeConfidence,
  type SourceRef,
} from '@/lib/baseball/source-record';
import {
  isoMinusDays,
  localDayBoundsUtc,
  resolveTeamTimezone,
  todayIsoInTz,
} from '@/lib/baseball/daily-contract/contract-day';

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
  /** Full roster rows for client cards (same membership source as rosterPulse). */
  rosterPlayers: BaseballRosterPlayer[];
  todayEvents: CommandCenterEvent[];
  /** Current-week events for the calendar strip when requested. */
  weekEvents: CommandCenterEvent[];
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
  /** Include Sunday–Saturday week events for the calendar strip. */
  includeWeekEvents?: boolean;
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
  const { riskLimit = 25, forDate, includeWeekEvents = false } = options;

  const base = (
    authorized: boolean,
    error: string | null,
  ): CommandCenterReadModel => ({
    teamId,
    authorized,
    riskFeed: [],
    rosterPulse: [],
    rosterPlayers: [],
    todayEvents: [],
    weekEvents: [],
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

  // Day window for "today" — TEAM-LOCAL (mirrors player-today.ts / contract-day.ts),
  // never the server's UTC day: a 9pm-local coach otherwise saw "today" roll to
  // tomorrow's UTC date. `dayStart`/`dayEnd` filter `baseball_events.start_time`
  // (a timestamptz column), so the boundary itself must be team-local midnight
  // expressed in UTC, not a literal `${day}T00:00:00.000Z`.
  const teamTz = await resolveTeamTimezone(supabase, teamId);
  const day = forDate ?? todayIsoInTz(teamTz);
  const { startUtcIso: dayStart, endUtcIso: dayEnd } = localDayBoundsUtc(day, teamTz);

  let weekStartIso: string | null = null;
  let weekEndIso: string | null = null;
  if (includeWeekEvents) {
    // Team-local Sunday–Saturday week window anchored on the same team-local
    // "today" (`day`) computed above. The previous server-local `new Date()` +
    // `.getDay()`/`.setDate()` computed the week boundary from the server's
    // wall clock (effectively UTC in prod), drifting the week start by a day
    // for non-UTC teams near local midnight — same bug the day window above
    // was fixed for. Bare calendar-date arithmetic (`getUTCDay`/`isoMinusDays`)
    // is tz-independent (Sunday is Sunday regardless of clock), then
    // `localDayBoundsUtc` anchors the actual UTC instant boundaries in
    // team-local time, mirroring the day-window pattern above.
    const dayOfWeek = new Date(`${day}T00:00:00.000Z`).getUTCDay(); // 0=Sun..6=Sat
    const weekStartDateIso = isoMinusDays(day, dayOfWeek);
    const weekEndDateIso = isoMinusDays(weekStartDateIso, -7);
    weekStartIso = localDayBoundsUtc(weekStartDateIso, teamTz).startUtcIso;
    weekEndIso = localDayBoundsUtc(weekEndDateIso, teamTz).startUtcIso;
  }

  // NOTE: baseball_player_aggregates has FKs to baseball_players and
  // baseball_teams, but NOT to baseball_team_members — there is no direct
  // foreign key between these two tables. PostgREST's nested-embed syntax
  // (`baseball_player_aggregates ( ... )` inlined under a `baseball_team_members`
  // select) needs a direct FK to resolve the relationship and fails every time
  // with PGRST200 ("Could not find a relationship between 'baseball_team_members'
  // and 'baseball_player_aggregates' in the schema cache"), which surfaced as
  // "The roster pulse could not be loaded." and zeroed every hero KPI on the
  // Command Center. Fetch the two tables separately (same pattern already used
  // by roster.ts and coach-daily-contracts.ts) and join them in JS by player_id.
  const memberSelect = `
    player_id, jersey_number, position, status, joined_at,
    baseball_players!inner (
      id, first_name, last_name, avatar_url, primary_position, secondary_position,
      grad_year, bats, throws, height_feet, height_inches, weight_lbs, gpa, city, state
    )`;

  const [insightsRes, membersRes, aggregatesRes, eventsRes] = await Promise.all([
    supabase
      .from('baseball_coach_insights')
      .select(
        'id, player_id, insight_type, title, body, priority, status, metadata, source_refs, created_at',
      )
      .eq('team_id', teamId)
      .in('status', ['active', 'acknowledged'])
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(riskLimit, 1), 100)),
    supabase
      .from('baseball_team_members')
      .select(memberSelect)
      .eq('team_id', teamId),
    supabase
      .from('baseball_player_aggregates')
      .select(
        'player_id, team_id, total_sessions, total_at_bats, total_hits, career_avg, practice_avg, game_avg, pressure_gap, recent_trend, trend_data, last_5_avg, last_10_avg, last_session_at',
      )
      .eq('team_id', teamId),
    supabase
      .from('baseball_events')
      .select('id, title, event_type, start_time, end_time, location, is_mandatory')
      .eq('team_id', teamId)
      .gte('start_time', dayStart)
      .lte('start_time', dayEnd)
      .order('start_time', { ascending: true }),
  ]);

  // Aggregates are a nice-to-have enrichment of the roster pulse (session
  // counts / trends), not a blocker: if this query fails we still render the
  // real roster with honest `noData: true` rows rather than failing the whole
  // pulse the way the broken nested embed used to.
  const aggregatesByPlayerId = new Map<string, BaseballPlayerAggregates & { last_session_at?: string | null }>();
  if (!aggregatesRes.error) {
    for (const agg of aggregatesRes.data ?? []) {
      aggregatesByPlayerId.set(
        agg.player_id,
        agg as unknown as BaseballPlayerAggregates & { last_session_at?: string | null },
      );
    }
  }

  const weekEventsRes =
    includeWeekEvents && weekStartIso && weekEndIso
      ? await supabase
          .from('baseball_events')
          .select('id, title, event_type, start_time, end_time, location, is_mandatory')
          .eq('team_id', teamId)
          .gte('start_time', weekStartIso)
          .lt('start_time', weekEndIso)
          .order('start_time', { ascending: true })
      : { data: [], error: null };

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

  // ---- Roster pulse + full roster players (one membership read) ----
  const rosterPulse: RosterPulseItem[] = [];
  const rosterPlayers: BaseballRosterPlayer[] = [];
  if (membersRes.error) {
    error = error ?? 'The roster pulse could not be loaded.';
  } else {
    for (const m of membersRes.data ?? []) {
      const player = m.baseball_players as unknown as {
        id: string;
        first_name: string | null;
        last_name: string | null;
        avatar_url: string | null;
        primary_position: string | null;
        secondary_position: string | null;
        grad_year: number | null;
        bats: string | null;
        throws: string | null;
        height_feet: number | null;
        height_inches: number | null;
        weight_lbs: number | null;
        gpa: number | null;
        city: string | null;
        state: string | null;
      } | null;
      if (!player) continue;
      const agg = aggregatesByPlayerId.get(player.id);
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
      rosterPlayers.push({
        ...player,
        aggregates: agg ?? undefined,
        jersey_number: m.jersey_number,
        team_position: m.position,
        team_status: m.status,
        joined_at: m.joined_at,
      } as BaseballRosterPlayer);
    }
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

  const weekEvents: CommandCenterEvent[] = [];
  if (includeWeekEvents && weekEventsRes.error) {
    error = error ?? "This week's events could not be loaded.";
  } else if (includeWeekEvents) {
    for (const e of weekEventsRes.data ?? []) {
      weekEvents.push({
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
    rosterPlayers,
    todayEvents,
    weekEvents,
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
