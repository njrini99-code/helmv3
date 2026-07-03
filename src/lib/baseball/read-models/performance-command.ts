// =============================================================================
// src/lib/baseball/read-models/performance-command.ts
//
// V11 Performance Command Center read model. Composes the strength-coach
// dashboard's first viewport (spec L41-65): KPI strip + Today Weight Room board +
// readiness queue. SERVER-ONLY; RLS backs every query (staff scope).
//
// HONESTY: readiness/soreness/bodyweight are only loaded when the caller passes
// canViewReadiness=true (V11 gate). Bands come from the transparent
// readiness-compute (never a medical claim, never a false "high" on sparse data).
//
// 'server-only' plain async — NOT 'use server'.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { computeReadiness } from '@/lib/baseball/lifting/readiness-compute';
import {
  resolveBaseballLiftingOrg,
  resolveBaseballAthleteIds,
} from '@/lib/lifting/resolve-baseball-context';
import { extractArmStatusFromNotes, sleepQualityToHours } from '@/lib/lifting/adapters/baseball-view-adapter';
import type { HelmLiftingReadinessCheckinRow, HelmLiftingSorenessMapRow } from '@/lib/types/helm-lifting-data';
import type {
  BaseballPerformanceKpis,
  BaseballWeightRoomBoardRow,
  BaseballReadinessComputation,
  BaseballReadinessBand,
} from '@/lib/types/baseball-lifting-v11';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface PerformanceCommandData {
  kpis: BaseballPerformanceKpis;
  board: BaseballWeightRoomBoardRow[];
  readiness: BaseballReadinessComputation[];
  /** True when readiness sub-feeds were intentionally withheld (no gate). */
  readinessWithheld: boolean;
}

interface RosterRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getPerformanceCommandData(
  teamId: string,
  canViewReadiness: boolean,
): Promise<PerformanceCommandData> {
  const supabase = (await createClient()) as Db;
  const today = todayYmd();

  // ---- Roster (RLS-scoped to viewable players) ----------------------------
  const { data: members } = await supabase
    .from('baseball_team_members')
    .select('player_id, baseball_players!inner ( id, first_name, last_name, primary_position )')
    .eq('team_id', teamId);
  const roster: RosterRow[] = (members ?? [])
    .map((m: { baseball_players: RosterRow }) => m.baseball_players)
    .filter((p: RosterRow | null): p is RosterRow => Boolean(p?.id));
  const rosterById = new Map(roster.map((p) => [p.id, p]));

  // ---- Today's materialized sessions --------------------------------------
  const { data: sessionRows } = await supabase
    .from('baseball_lift_sessions')
    .select('*')
    .eq('team_id', teamId)
    .eq('scheduled_date', today);
  const sessions = sessionRows ?? [];

  // ---- Strength-group names per player ------------------------------------
  const { data: groupRows } = await supabase
    .from('baseball_strength_groups')
    .select('id, name')
    .eq('team_id', teamId)
    .eq('is_active', true);
  const groupNameById = new Map<string, string>(
    (groupRows ?? []).map((g: { id: string; name: string }) => [g.id, g.name] as [string, string]),
  );
  const { data: memberRows } = await supabase
    .from('baseball_strength_group_members')
    .select('group_id, player_id');
  const groupsByPlayer = new Map<string, string[]>();
  for (const m of memberRows ?? []) {
    const name = groupNameById.get((m as { group_id: string }).group_id);
    if (!name) continue;
    const pid = (m as { player_id: string }).player_id;
    const arr = groupsByPlayer.get(pid) ?? [];
    arr.push(name);
    groupsByPlayer.set(pid, arr);
  }

  // ---- New PRs today (any player on team) ---------------------------------
  const { data: prRows } = await supabase
    .from('baseball_strength_prs')
    .select('id')
    .eq('team_id', teamId)
    .gte('achieved_at', `${today}T00:00:00Z`);
  const newPrs = (prRows ?? []).length;

  // ---- Pending load modifications (coach-modified session exercises today) -
  // Cheap proxy: session exercises with a modification_reason on today's sessions.
  const sessionIds = sessions.map((s: { id: string }) => s.id);
  let loadModsPending = 0;
  const mainLiftBySession = new Map<string, { name: string | null; load: number | null }>();
  if (sessionIds.length) {
    const { data: seRows } = await supabase
      .from('baseball_lift_session_exercises')
      .select('session_id, exercise_name_snapshot, prescribed_load, section_type_snapshot, modification_reason, order_index')
      .in('session_id', sessionIds)
      .order('order_index', { ascending: true });
    for (const se of seRows ?? []) {
      const r = se as {
        session_id: string; exercise_name_snapshot: string; prescribed_load: number | null;
        section_type_snapshot: string | null; modification_reason: string | null;
      };
      if (r.modification_reason) loadModsPending += 1;
      // First main_strength exercise = the "main lift" surfaced on the board.
      if (r.section_type_snapshot === 'main_strength' && !mainLiftBySession.has(r.session_id)) {
        mainLiftBySession.set(r.session_id, { name: r.exercise_name_snapshot, load: r.prescribed_load });
      }
    }
  }

  // ---- Readiness (gated) ---------------------------------------------------
  const bandByPlayer = new Map<string, BaseballReadinessComputation>();
  const sorenessByPlayer = new Map<string, number>();
  const bwDeltaByPlayer = new Map<string, number>();
  let readiness: BaseballReadinessComputation[] = [];

  if (canViewReadiness) {
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceYmd = since.toISOString().slice(0, 10);

    // W2-G rewire: submitReadinessCheckin (lifting.ts) writes ONLY to
    // helm_lifting_readiness_checkins now — the legacy baseball_readiness_
    // checkins table is write-dead. Resolve org + athlete-id map for the
    // roster, then read helm and remap results back into the SAME
    // Record<string, unknown> shape (keyed with legacy field names) that
    // computeReadiness() below already expects, so downstream logic is
    // unchanged.
    const liftCtx = await resolveBaseballLiftingOrg(teamId);
    const rosterPlayerIds = roster.map((p) => p.id);
    const athleteMap = liftCtx && rosterPlayerIds.length
      ? await resolveBaseballAthleteIds(liftCtx.organizationId, rosterPlayerIds)
      : {};
    const athleteToPlayer = new Map<string, string>();
    for (const [pid, aid] of Object.entries(athleteMap)) athleteToPlayer.set(aid, pid);
    const teamAthleteIds = Object.values(athleteMap);

    // Latest check-in per player (14d window).
    const latestCheckin = new Map<string, Record<string, unknown>>();
    const checkinIds: string[] = [];
    if (liftCtx && teamAthleteIds.length) {
      const { data: checkins } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
        .select(
          'id, athlete_id, checkin_date, sleep_quality, energy_level, soreness_overall, stress_level, lower_body_status, illness_flag, notes',
        )
        .eq('organization_id', liftCtx.organizationId)
        .in('athlete_id', teamAthleteIds)
        .gte('checkin_date', sinceYmd)
        .order('checkin_date', { ascending: false }) as { data: HelmLiftingReadinessCheckinRow[] | null };

      for (const c of checkins ?? []) {
        const pid = athleteToPlayer.get(c.athlete_id);
        if (!pid || latestCheckin.has(pid)) continue;
        latestCheckin.set(pid, {
          id: c.id,
          check_date: c.checkin_date,
          sleep_hours: sleepQualityToHours(c.sleep_quality),
          energy_level: c.energy_level,
          stress_level: c.stress_level,
          soreness_level: c.soreness_overall,
          arm_status: extractArmStatusFromNotes(c.notes),
          lower_body_status: c.lower_body_status,
          illness_flag: c.illness_flag,
        });
        checkinIds.push(c.id);
      }
    }

    // Soreness maps for those check-ins — helm_lifting_soreness_maps FKs
    // checkin_id -> helm_lifting_readiness_checkins(id), matching the ids above.
    const sorenessByCheckin = new Map<string, Array<{ region: string; severity: number }>>();
    if (checkinIds.length) {
      const { data: sm } = await fromUntyped(supabase, 'helm_lifting_soreness_maps')
        .select('checkin_id, body_region, severity')
        .in('checkin_id', checkinIds) as { data: Pick<HelmLiftingSorenessMapRow, 'checkin_id' | 'body_region' | 'severity'>[] | null };
      for (const s of sm ?? []) {
        const arr = sorenessByCheckin.get(s.checkin_id) ?? [];
        arr.push({ region: s.body_region, severity: s.severity });
        sorenessByCheckin.set(s.checkin_id, arr);
      }
    }

    // Bodyweight 7d delta.
    const { data: bw } = await supabase
      .from('baseball_bodyweight_entries')
      .select('player_id, entry_date, weight_lbs')
      .eq('team_id', teamId)
      .gte('entry_date', sinceYmd)
      .order('entry_date', { ascending: false });
    const bwByPlayer = new Map<string, Array<{ date: string; w: number }>>();
    for (const e of bw ?? []) {
      const r = e as { player_id: string; entry_date: string; weight_lbs: number };
      const arr = bwByPlayer.get(r.player_id) ?? [];
      arr.push({ date: r.entry_date, w: r.weight_lbs });
      bwByPlayer.set(r.player_id, arr);
    }
    for (const [pid, list] of bwByPlayer) {
      const newest = list[0];
      const oldest = list[list.length - 1];
      if (newest && oldest && list.length >= 2) {
        const delta = newest.w - oldest.w;
        bwDeltaByPlayer.set(pid, Math.round(delta * 10) / 10);
      }
    }

    // Active availability status per player.
    const { data: avail } = await supabase
      .from('baseball_availability_statuses')
      .select('player_id, status, starts_at')
      .eq('team_id', teamId)
      .order('starts_at', { ascending: false });
    const availByPlayer = new Map<string, string>();
    for (const a of avail ?? []) {
      const r = a as { player_id: string; status: string };
      if (!availByPlayer.has(r.player_id)) availByPlayer.set(r.player_id, r.status);
    }

    readiness = roster.map((p) => {
      const c = latestCheckin.get(p.id) as Record<string, unknown> | undefined;
      const checkinId = c?.id as string | undefined;
      const soreList = checkinId ? sorenessByCheckin.get(checkinId) ?? [] : [];
      const maxSeverity = soreList.length ? Math.max(...soreList.map((s) => s.severity)) : null;
      const hasUpper = soreList.some((s) => /arm|shoulder|elbow|chest|upper|back/i.test(s.region));
      const hasLower = soreList.some((s) => /leg|knee|hip|quad|hamstring|calf|ankle|lower/i.test(s.region));
      if (maxSeverity != null) sorenessByPlayer.set(p.id, maxSeverity);

      const comp = computeReadiness({
        playerId: p.id,
        checkDate: (c?.check_date as string) ?? null,
        today,
        sleepHours: (c?.sleep_hours as number) ?? null,
        energyLevel: (c?.energy_level as number) ?? null,
        stressLevel: (c?.stress_level as number) ?? null,
        sorenessLevel: (c?.soreness_level as number) ?? null,
        armStatus: (c?.arm_status as ReturnType<typeof String> as never) ?? null,
        lowerBodyStatus: (c?.lower_body_status as number) ?? null,
        illnessFlag: Boolean(c?.illness_flag),
        maxSorenessSeverity: maxSeverity,
        hasUpperSoreness: hasUpper,
        hasLowerSoreness: hasLower,
        bodyweightDelta7d: bwDeltaByPlayer.get(p.id) ?? null,
        availabilityStatus: (availByPlayer.get(p.id) as never) ?? null,
      });
      bandByPlayer.set(p.id, comp);
      return comp;
    });
  }

  // ---- Build the Today Weight Room board ----------------------------------
  const board: BaseballWeightRoomBoardRow[] = sessions.map((s: Record<string, unknown>) => {
    const pid = s.player_id as string;
    const p = rosterById.get(pid);
    const main = mainLiftBySession.get(s.id as string);
    return {
      session: s as never,
      player_id: pid,
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
      primary_position: p?.primary_position ?? null,
      group_names: groupsByPlayer.get(pid) ?? [],
      readiness_band: (bandByPlayer.get(pid)?.band ?? null) as BaseballReadinessBand | null,
      soreness_overall: sorenessByPlayer.get(pid) ?? null,
      bodyweight_delta_7d: bwDeltaByPlayer.get(pid) ?? null,
      prescribed_main_lift: main?.name ?? null,
      actual_main_load: main?.load ?? null,
      main_rpe: null,
    };
  });

  // ---- KPIs ----------------------------------------------------------------
  const total = sessions.length;
  const completed = sessions.filter((s: { status: string }) => s.status === 'completed').length;
  const missed = sessions.filter((s: { status: string }) => s.status === 'missed').length;
  const readinessRisk = readiness.filter(
    (r) => r.band === 'red' || r.band === 'orange_lower' || r.band === 'orange_upper',
  ).length;
  const pitcherRedFlags = board.filter(
    // `^` must wrap the whole alternation, not just the first branch --
    // `/^P|RHP|LHP|pitch/` only anchors "P" and lets RHP/LHP/pitch match
    // anywhere in the string (e.g. would false-positive on any position
    // code that merely contains "pitch" mid-string).
    (b) => b.readiness_band === 'red' && /^(p|rhp|lhp|pitch)/i.test(b.primary_position ?? ''),
  ).length;
  const bwAlerts = Array.from(bwDeltaByPlayer.values()).filter((d) => d <= -3).length;

  const kpis: BaseballPerformanceKpis = {
    today_completion_pct: total ? Math.round((completed / total) * 100) : 0,
    today_total: total,
    today_completed: completed,
    missed_lifts: missed,
    readiness_risk: readinessRisk,
    new_prs: newPrs,
    pitcher_red_flags: pitcherRedFlags,
    load_modifications_pending: loadModsPending,
    bodyweight_alerts: bwAlerts,
  };

  return { kpis, board, readiness, readinessWithheld: !canViewReadiness };
}
