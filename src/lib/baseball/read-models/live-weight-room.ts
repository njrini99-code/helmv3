// =============================================================================
// src/lib/baseball/read-models/live-weight-room.ts
//
// V11 Live Weight Room read model (spec L522-573 + Packet G). This is the
// flagship premium staff surface: a strength coach runs a room of 20-60 athletes
// from ONE screen — full athlete grid, right-rail queues, and a per-athlete set
// logger drawer — without opening individual profiles.
//
// Source -> signal -> action wiring:
//   source : today's materialized helm_lifting_sessions + session_exercises +
//            set_results (the unified Helm Lifting Lab tables — see the
//            W2-G rewire note below), plus readiness bands + availability +
//            soreness.
//   signal : the right-rail queues (needs-coach / readiness flags / load changes /
//            missing check-ins) are DERIVED here from those sources — they are not
//            stored, so they can never drift from the truth.
//   action : the client logs sets / adjusts load / substitutes / marks observed /
//            marks limited / messages / creates tasks via lifting-v11 actions; a
//            poll re-runs THIS read model so the grid reflects the new state.
//
// HONESTY: readiness is only composed when the caller passes canViewReadiness
// (the V11 gate). Bands come from the transparent readiness-compute — never a
// medical claim, never a false "high" on sparse data. Every signal cites its
// reason so the right rail is explainable, not a black box.
//
// SERVER-ONLY plain async — NOT 'use server'. RLS backs every query (staff scope).
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { computeReadiness } from '@/lib/baseball/lifting/readiness-compute';
import { getFullName } from '@/lib/utils';
import {
  resolveBaseballLiftingOrg,
  resolveBaseballAthleteIds,
} from '@/lib/lifting/resolve-baseball-context';
import { extractArmStatusFromNotes, sleepQualityToHours } from '@/lib/lifting/adapters/baseball-view-adapter';
import type { HelmLiftingReadinessCheckinRow, HelmLiftingSorenessMapRow } from '@/lib/types/helm-lifting-data';
import type {
  BaseballLiveWeightRoomData,
  BaseballLiveAthleteRow,
  BaseballLiveExerciseRow,
  BaseballLiveSetRow,
  BaseballLiveQueues,
  BaseballReadinessBand,
  BaseballReadinessComputation,
  BaseballAvailabilityStatus,
  BaseballLiftSessionStatus,
  BaseballLiftSessionExerciseStatus,
} from '@/lib/types/baseball-lifting-v11';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

interface RosterRow {
  id: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function isRiskBand(band: BaseballReadinessBand | null): boolean {
  return band === 'red' || band === 'orange_lower' || band === 'orange_upper';
}

/**
 * Build the full Live Weight Room payload for a team. One call materializes the
 * grid, drawer detail, and right-rail queues so the client polls a single source.
 *
 * @param teamId           active team (server-validated by the caller)
 * @param canViewReadiness V11 gate — withholds readiness sub-feeds when false
 * @param groupFilter      optional strength-group id; restricts the grid + queues
 */
export async function getLiveWeightRoomData(
  teamId: string,
  canViewReadiness: boolean,
  groupFilter?: string | null,
): Promise<BaseballLiveWeightRoomData> {
  const supabase = (await createClient()) as Db;
  const today = todayYmd();
  const generatedAt = new Date().toISOString();

  // ---- Roster (RLS-scoped to viewable players) ----------------------------
  const { data: members } = await supabase
    .from('baseball_team_members')
    .select('player_id, baseball_players!inner ( id, user_id, first_name, last_name, primary_position )')
    .eq('team_id', teamId);
  const roster: RosterRow[] = (members ?? [])
    .map((m: { baseball_players: RosterRow }) => m.baseball_players)
    .filter((p: RosterRow | null): p is RosterRow => Boolean(p?.id));
  const rosterById = new Map(roster.map((p) => [p.id, p]));

  // ---- Helm Lifting Lab org + athlete-id map (resolved once, reused below) --
  // W2-G rewire: createLiftAssignment / publishLiftDay / logLiftResult write
  // sessions + session_exercises + set_results ONLY to the unified
  // helm_lifting_* tables now — the legacy baseball_lift_sessions /
  // _session_exercises / _set_results tables are write-dead (this flagship
  // staff screen rendered empty for real activity while reading them).
  // helm_lifting_athletes.id is the join key; player_id-shaped downstream code
  // is preserved by mapping athlete_id -> player_id immediately on read.
  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  const rosterPlayerIds = roster.map((p) => p.id);
  const athleteMap = liftCtx && rosterPlayerIds.length
    ? await resolveBaseballAthleteIds(liftCtx.organizationId, rosterPlayerIds)
    : {};
  const athleteToPlayer = new Map<string, string>();
  for (const [pid, aid] of Object.entries(athleteMap)) athleteToPlayer.set(aid, pid);
  const teamAthleteIds = Object.values(athleteMap);

  // ---- Today's materialized sessions --------------------------------------
  let sessions: Array<{
    id: string; player_id: string; status: BaseballLiftSessionStatus;
    scheduled_date: string; title: string | null;
  }> = [];
  if (liftCtx && teamAthleteIds.length) {
    const { data: helmSessionRows } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .select('id, athlete_id, status, scheduled_date, title')
      .eq('organization_id', liftCtx.organizationId)
      .eq('team_id', teamId)
      .eq('scheduled_date', today)
      .in('athlete_id', teamAthleteIds) as {
      data: Array<{
        id: string; athlete_id: string; status: BaseballLiftSessionStatus;
        scheduled_date: string; title: string | null;
      }> | null;
    };
    for (const s of helmSessionRows ?? []) {
      const playerId = athleteToPlayer.get(s.athlete_id);
      if (!playerId) continue; // athlete not on this team's resolved roster — skip.
      sessions.push({
        id: s.id,
        player_id: playerId,
        status: s.status,
        scheduled_date: s.scheduled_date,
        title: s.title,
      });
    }
  }

  // ---- Strength-group names per player + the group filter ------------------
  // Groups + membership live in the unified helm_lifting_groups /
  // helm_lifting_group_members tables (organization_id + sport scoped);
  // membership is athlete_id-keyed, so it is mapped back to baseball_players.id
  // via the athleteToPlayer map resolved above (sessions section).
  const groups: Array<{ id: string; name: string }> = [];
  if (liftCtx) {
    const { data: groupRows } = await fromUntyped(supabase, 'helm_lifting_groups')
      .select('id, name')
      .eq('organization_id', liftCtx.organizationId)
      .eq('sport', 'baseball')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('name', { ascending: true }) as { data: Array<{ id: string; name: string }> | null };
    groups.push(...(groupRows ?? []));
  }
  const groupNameById = new Map<string, string>(groups.map((g) => [g.id, g.name]));

  const groupsByPlayer = new Map<string, string[]>();
  const playersInFilterGroup = new Set<string>();
  if (groups.length) {
    const { data: memberRows } = await fromUntyped(supabase, 'helm_lifting_group_members')
      .select('group_id, athlete_id')
      .in('group_id', groups.map((g) => g.id)) as { data: Array<{ group_id: string; athlete_id: string }> | null };
    for (const m of memberRows ?? []) {
      const pid = athleteToPlayer.get(m.athlete_id);
      if (!pid) continue; // athlete not resolved to a roster player — skip honestly.
      const name = groupNameById.get(m.group_id);
      if (name) {
        const arr = groupsByPlayer.get(pid) ?? [];
        arr.push(name);
        groupsByPlayer.set(pid, arr);
      }
      if (groupFilter && m.group_id === groupFilter) playersInFilterGroup.add(pid);
    }
  }

  // Apply the group filter to the session set (top bar still reflects the filter).
  if (groupFilter) {
    sessions = sessions.filter((s) => playersInFilterGroup.has(s.player_id));
  }
  const sessionIds = sessions.map((s) => s.id);

  // ---- Session exercises (the stations) -----------------------------------
  const exercisesBySession = new Map<string, BaseballLiveExerciseRow[]>();
  const seToSession = new Map<string, string>();
  if (sessionIds.length) {
    // helm_lifting_session_exercises mirrors the legacy column vocabulary
    // exactly, so the select list + downstream mapping is unchanged.
    const { data: seRows } = await fromUntyped(supabase, 'helm_lifting_session_exercises')
      .select('id, session_id, exercise_id, exercise_name_snapshot, section_name_snapshot, section_type_snapshot, order_index, prescribed_sets, prescribed_reps, prescribed_load, prescribed_load_unit, prescribed_rpe, modification_reason, status')
      .in('session_id', sessionIds)
      .order('order_index', { ascending: true });
    for (const se of seRows ?? []) {
      const r = se as {
        id: string; session_id: string; exercise_id: string | null;
        exercise_name_snapshot: string; section_name_snapshot: string | null;
        section_type_snapshot: string | null; order_index: number;
        prescribed_sets: number | null; prescribed_reps: number | null;
        prescribed_load: number | null; prescribed_load_unit: string | null;
        prescribed_rpe: number | null; modification_reason: string | null;
        status: BaseballLiftSessionExerciseStatus;
      };
      seToSession.set(r.id, r.session_id);
      const arr = exercisesBySession.get(r.session_id) ?? [];
      arr.push({
        session_exercise_id: r.id,
        exercise_id: r.exercise_id,
        exercise_name: r.exercise_name_snapshot,
        section_name: r.section_name_snapshot,
        section_type: r.section_type_snapshot,
        order_index: r.order_index,
        prescribed_sets: r.prescribed_sets,
        prescribed_reps: r.prescribed_reps,
        prescribed_load: r.prescribed_load,
        prescribed_load_unit: r.prescribed_load_unit,
        prescribed_rpe: r.prescribed_rpe,
        modification_reason: r.modification_reason,
        was_modified: Boolean(r.modification_reason),
        status: r.status,
        sets: [],
        sets_logged: 0,
      });
      exercisesBySession.set(r.session_id, arr);
    }
  }

  // ---- Set results (the logged work) --------------------------------------
  const seIds = Array.from(seToSession.keys());
  const setsBySe = new Map<string, BaseballLiveSetRow[]>();
  if (seIds.length) {
    const { data: setRows } = await fromUntyped(supabase, 'helm_lifting_set_results')
      .select('session_exercise_id, set_number, prescribed_reps, actual_reps, prescribed_load, actual_load, load_unit, rpe, velocity, coach_observed, completed_at, player_note')
      .in('session_exercise_id', seIds)
      .order('set_number', { ascending: true });
    for (const st of setRows ?? []) {
      const r = st as BaseballLiveSetRow & { session_exercise_id: string };
      const arr = setsBySe.get(r.session_exercise_id) ?? [];
      arr.push({
        set_number: r.set_number,
        prescribed_reps: r.prescribed_reps,
        actual_reps: r.actual_reps,
        prescribed_load: r.prescribed_load,
        actual_load: r.actual_load,
        load_unit: r.load_unit,
        rpe: r.rpe,
        velocity: r.velocity,
        coach_observed: r.coach_observed,
        completed_at: r.completed_at,
        player_note: r.player_note,
      });
      setsBySe.set(r.session_exercise_id, arr);
    }
  }
  // Attach sets to their exercise + count logged.
  for (const list of exercisesBySession.values()) {
    for (const ex of list) {
      ex.sets = setsBySe.get(ex.session_exercise_id) ?? [];
      ex.sets_logged = ex.sets.filter((s) => s.actual_reps != null || s.actual_load != null).length;
    }
  }

  // ---- Readiness (gated) — band + reasons + availability ------------------
  const bandByPlayer = new Map<string, BaseballReadinessComputation>();
  const availByPlayer = new Map<string, BaseballAvailabilityStatus>();
  const hasCheckinByPlayer = new Set<string>();

  if (canViewReadiness) {
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceYmd = since.toISOString().slice(0, 10);

    // W2-G rewire: submitReadinessCheckin (lifting.ts) writes ONLY to
    // helm_lifting_readiness_checkins now — the legacy baseball_readiness_
    // checkins table is write-dead. Reuse the org + athlete-id map resolved
    // above (sessions section) and remap results back into the SAME
    // Record<string, unknown> shape (keyed with legacy field names) the
    // computeReadiness() call below already expects.
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
        if (c.checkin_date === today) hasCheckinByPlayer.add(pid);
      }
    }

    // helm_lifting_soreness_maps FKs checkin_id -> helm_lifting_readiness_checkins(id),
    // matching the ids selected above.
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

    const bwDeltaByPlayer = new Map<string, number>();
    const bwByPlayer = new Map<string, Array<{ date: string; w: number }>>();
    if (liftCtx && teamAthleteIds.length) {
      const { data: bw } = await fromUntyped(supabase, 'helm_lifting_bodyweight_entries')
        .select('athlete_id, entry_date, weight_lbs')
        .eq('organization_id', liftCtx.organizationId)
        .in('athlete_id', teamAthleteIds)
        .gte('entry_date', sinceYmd)
        .order('entry_date', { ascending: false }) as {
        data: Array<{ athlete_id: string; entry_date: string; weight_lbs: number }> | null;
      };
      for (const e of bw ?? []) {
        const pid = athleteToPlayer.get(e.athlete_id);
        if (!pid) continue;
        const arr = bwByPlayer.get(pid) ?? [];
        arr.push({ date: e.entry_date, w: e.weight_lbs });
        bwByPlayer.set(pid, arr);
      }
    }
    for (const [pid, list] of bwByPlayer) {
      const newest = list[0];
      const oldest = list[list.length - 1];
      if (newest && oldest && list.length >= 2) {
        bwDeltaByPlayer.set(pid, Math.round((newest.w - oldest.w) * 10) / 10);
      }
    }

    if (liftCtx && teamAthleteIds.length) {
      const { data: avail } = await fromUntyped(supabase, 'helm_lifting_availability_statuses')
        .select('athlete_id, status, starts_at')
        .eq('organization_id', liftCtx.organizationId)
        .in('athlete_id', teamAthleteIds)
        .order('starts_at', { ascending: false }) as {
        data: Array<{ athlete_id: string; status: BaseballAvailabilityStatus }> | null;
      };
      for (const a of avail ?? []) {
        const pid = athleteToPlayer.get(a.athlete_id);
        if (pid && !availByPlayer.has(pid)) availByPlayer.set(pid, a.status);
      }
    }

    for (const p of roster) {
      const c = latestCheckin.get(p.id) as Record<string, unknown> | undefined;
      const checkinId = c?.id as string | undefined;
      const soreList = checkinId ? sorenessByCheckin.get(checkinId) ?? [] : [];
      const maxSeverity = soreList.length ? Math.max(...soreList.map((s) => s.severity)) : null;
      const hasUpper = soreList.some((s) => /arm|shoulder|elbow|chest|upper|back/i.test(s.region));
      const hasLower = soreList.some((s) => /leg|knee|hip|quad|hamstring|calf|ankle|lower/i.test(s.region));
      const comp = computeReadiness({
        playerId: p.id,
        checkDate: (c?.check_date as string) ?? null,
        today,
        sleepHours: (c?.sleep_hours as number) ?? null,
        energyLevel: (c?.energy_level as number) ?? null,
        stressLevel: (c?.stress_level as number) ?? null,
        sorenessLevel: (c?.soreness_level as number) ?? null,
        armStatus: (c?.arm_status as never) ?? null,
        lowerBodyStatus: (c?.lower_body_status as number) ?? null,
        illnessFlag: Boolean(c?.illness_flag),
        maxSorenessSeverity: maxSeverity,
        hasUpperSoreness: hasUpper,
        hasLowerSoreness: hasLower,
        bodyweightDelta7d: bwDeltaByPlayer.get(p.id) ?? null,
        availabilityStatus: (availByPlayer.get(p.id) as never) ?? null,
      });
      bandByPlayer.set(p.id, comp);
    }
  }

  // ---- Build per-athlete grid rows ----------------------------------------
  const athletes: BaseballLiveAthleteRow[] = sessions.map((s) => {
    const p = rosterById.get(s.player_id);
    const list = (exercisesBySession.get(s.id) ?? []).slice().sort((a, b) => a.order_index - b.order_index);
    const comp = bandByPlayer.get(s.player_id) ?? null;
    const band = comp?.band ?? null;
    const availability = availByPlayer.get(s.player_id) ?? null;

    // Current station = first exercise not yet fully logged; else the last one.
    const current =
      list.find((ex) => ex.status !== 'completed' && (ex.prescribed_sets == null || ex.sets_logged < (ex.prescribed_sets ?? 0))) ??
      list[list.length - 1] ??
      null;

    // Prescribed/actual/RPE columns track the first main_strength lift if present,
    // otherwise the current station — so the grid shows the lift that matters.
    const mainEx = list.find((ex) => ex.section_type === 'main_strength') ?? current;
    const mainSets = mainEx?.sets ?? [];
    const actualLoad = mainSets.reduce<number | null>(
      (best, st) => (st.actual_load != null ? Math.max(best ?? 0, st.actual_load) : best),
      null,
    );
    const lastRpeSet = [...mainSets].reverse().find((st) => st.rpe != null);

    // Last update = newest completed_at across every set on this session.
    let lastUpdate: string | null = null;
    for (const ex of list) {
      for (const st of ex.sets) {
        if (st.completed_at && (!lastUpdate || st.completed_at > lastUpdate)) lastUpdate = st.completed_at;
      }
    }

    const hasLoadChange = list.some((ex) => ex.was_modified);
    const missingCheckin = canViewReadiness && !hasCheckinByPlayer.has(s.player_id);
    const completedExercises = list.filter((ex) => ex.status === 'completed').length;

    const needsCoach =
      isRiskBand(band) ||
      availability === 'limited' ||
      availability === 'hold' ||
      s.status === 'missed' ||
      missingCheckin;

    return {
      session_id: s.id,
      player_id: s.player_id,
      user_id: p?.user_id ?? null,
      first_name: p?.first_name ?? null,
      last_name: p?.last_name ?? null,
      primary_position: p?.primary_position ?? null,
      group_names: groupsByPlayer.get(s.player_id) ?? [],
      session_status: s.status,
      readiness_band: band,
      readiness_reasons: comp?.reasons ?? [],
      availability_status: availability,
      current_station: current?.section_name ?? null,
      current_exercise: current?.exercise_name ?? null,
      prescribed_load: mainEx?.prescribed_load ?? null,
      actual_load: actualLoad,
      rpe: lastRpeSet?.rpe ?? null,
      last_update: lastUpdate,
      has_load_change: hasLoadChange,
      needs_coach: needsCoach,
      exercises: list,
      total_exercises: list.length,
      completed_exercises: completedExercises,
    };
  });

  // Sort: athletes who need a coach first, then in-progress, then by name.
  const statusRank: Record<BaseballLiftSessionStatus, number> = {
    started: 0, assigned: 1, modified: 1, missed: 0, excused: 3, completed: 4,
  };
  athletes.sort((a, b) => {
    if (a.needs_coach !== b.needs_coach) return a.needs_coach ? -1 : 1;
    const sr = (statusRank[a.session_status] ?? 2) - (statusRank[b.session_status] ?? 2);
    if (sr !== 0) return sr;
    return getFullName(a.first_name, a.last_name).localeCompare(getFullName(b.first_name, b.last_name));
  });

  // ---- Right-rail queues (derived signals) --------------------------------
  const queues: BaseballLiveQueues = {
    needs_coach: [],
    readiness_flags: [],
    load_changes: [],
    missing_checkins: [],
  };
  for (const a of athletes) {
    if (isRiskBand(a.readiness_band) && a.readiness_band) {
      queues.readiness_flags.push({ player_id: a.player_id, band: a.readiness_band });
    }
    if (a.has_load_change) {
      const modEx = a.exercises.find((ex) => ex.was_modified);
      queues.load_changes.push({
        player_id: a.player_id,
        reason: modEx?.modification_reason ?? 'Load adjusted',
      });
    }
    if (canViewReadiness && !hasCheckinByPlayer.has(a.player_id)) {
      queues.missing_checkins.push(a.player_id);
    }
    if (a.needs_coach) {
      let reason = 'Needs attention';
      if (a.session_status === 'missed') reason = 'Missed session';
      else if (a.readiness_band === 'red') reason = 'Hold and review';
      else if (a.readiness_band === 'orange_lower') reason = 'Modify lower body';
      else if (a.readiness_band === 'orange_upper') reason = 'Modify upper body';
      else if (a.availability_status === 'limited') reason = 'Marked limited';
      else if (a.availability_status === 'hold') reason = 'On hold';
      else if (canViewReadiness && !hasCheckinByPlayer.has(a.player_id)) reason = 'No check-in today';
      queues.needs_coach.push({ player_id: a.player_id, reason });
    }
  }

  // ---- Top bar ------------------------------------------------------------
  const { data: teamRow } = await supabase
    .from('baseball_teams')
    .select('name')
    .eq('id', teamId)
    .maybeSingle();
  const total = athletes.length;
  const completed = athletes.filter((a) => a.session_status === 'completed').length;
  const inProgress = athletes.filter((a) => a.session_status === 'started').length;
  const notStarted = athletes.filter((a) => a.session_status === 'assigned' || a.session_status === 'modified').length;
  const riskCount = athletes.filter((a) => isRiskBand(a.readiness_band)).length;
  // The lift-day label: dominant session title today (they share a published day).
  const titleCounts = new Map<string, number>();
  for (const s of sessions) {
    const t = s.title ?? 'Lift';
    titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
  }
  const liftDayLabel =
    [...titleCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Lift';

  return {
    top_bar: {
      team_name: (teamRow as { name?: string } | null)?.name ?? 'Team',
      lift_day_label: liftDayLabel,
      active_group: groupFilter ? groupNameById.get(groupFilter) ?? null : null,
      total,
      completed,
      in_progress: inProgress,
      not_started: notStarted,
      risk_count: riskCount,
    },
    athletes,
    queues,
    groups,
    readiness_withheld: !canViewReadiness,
    generated_at: generatedAt,
  };
}
