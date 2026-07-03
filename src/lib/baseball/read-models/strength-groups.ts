// =============================================================================
// src/lib/baseball/read-models/strength-groups.ts
//
// V11 Strength Groups read model (spec L151-198 + Packet C). Composes the three
// panes of the group builder:
//   * getStrengthGroupsBoard — the group list (counts + status badges) + the full
//     roster attribute snapshot (powers the center athlete table AND the right-pane
//     live rule preview, via the shared evaluateGroupRule engine).
//   * getStrengthGroupDetail — one group's membership (with sources) + recent audit.
//
// SERVER-ONLY plain async (NOT 'use server'). RLS backs every query (group SELECT
// is staff-scoped). The V11 tables are not in the generated database.ts (no live
// apply to regen against) — we cast the builder and lean on the hand-written types
// as the contract, exactly like performance-command.ts and lift-programs.ts.
//
// The roster snapshot is assembled in a fixed number of scoped passes (roster,
// workload, availability, soreness, bodyweight, lift history) — no N+1. Each
// player's attributes feed the pure rule engine so the preview never drifts from
// what a recompute would actually persist.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import {
  resolveBaseballLiftingOrg,
  resolveBaseballAthleteIds,
} from '@/lib/lifting/resolve-baseball-context';
import type { HelmLiftingReadinessCheckinRow, HelmLiftingSorenessMapRow } from '@/lib/types/helm-lifting-data';
import {
  trainingAgeFromGradYear,
  type PlayerRuleAttributes,
} from '@/lib/baseball/lifting/strength-group-rules';
import type {
  BaseballStrengthGroupRow,
  BaseballStrengthGroupAuditRow,
  BaseballGroupMemberSource,
} from '@/lib/types/baseball-lifting-v11';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export interface StrengthGroupListItem extends BaseballStrengthGroupRow {
  member_count: number;
  /** Member ids (so the client can seed the athlete table without a refetch). */
  member_ids: string[];
}

export interface StrengthGroupsBoardData {
  groups: StrengthGroupListItem[];
  roster: PlayerRuleAttributes[];
  /** How many of the 12 default groups already exist (drives the seed CTA). */
  defaultGroupsPresent: number;
}

export interface StrengthGroupMemberDetail {
  player_id: string;
  source: BaseballGroupMemberSource;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
}

export interface StrengthGroupDetailData {
  group: BaseballStrengthGroupRow;
  members: StrengthGroupMemberDetail[];
  audit: BaseballStrengthGroupAuditRow[];
}

/** The 12 default group names (spec L155-168) — used to detect seed state. */
export const DEFAULT_STRENGTH_GROUP_NAMES = [
  'Pitchers',
  'Starters',
  'Relievers',
  'Catchers',
  'Position Players',
  'Two-Way Players',
  'In-Season Travel Roster',
  'Non-Travel Developmental',
  'Injured / Limited',
  'Return-to-Play',
  'Freshmen / New Players',
  'High Workload Watch',
] as const;

function windowStartYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

interface RosterRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  grad_year: number | null;
  weight_lbs: number | null;
}

/**
 * Assemble the full board: group list + a rich per-player attribute snapshot.
 * `lookbackDays` bounds the workload / lift-history windows so the preview shows
 * the same recency a recompute would use.
 */
export async function getStrengthGroupsBoard(
  teamId: string,
  lookbackDays = 14,
): Promise<StrengthGroupsBoardData> {
  const supabase = (await createClient()) as Db;
  const sinceYmd = windowStartYmd(lookbackDays);

  // ---- Roster (RLS-scoped) -------------------------------------------------
  const { data: members } = await supabase
    .from('baseball_team_members')
    .select(
      'player_id, baseball_players!inner ( id, first_name, last_name, primary_position, secondary_position, grad_year, weight_lbs )',
    )
    .eq('team_id', teamId);
  const roster: RosterRow[] = (members ?? [])
    .map((m: { baseball_players: RosterRow }) => m.baseball_players)
    .filter((p: RosterRow | null): p is RosterRow => Boolean(p?.id))
    .sort((a: RosterRow, b: RosterRow) => (a.last_name ?? '').localeCompare(b.last_name ?? ''));
  const playerIds = roster.map((p) => p.id);

  // ---- Groups + members ----------------------------------------------------
  const { data: groupRows } = await supabase
    .from('baseball_strength_groups')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: true });
  const groups = (groupRows ?? []) as BaseballStrengthGroupRow[];

  const membersByGroup = new Map<string, string[]>();
  if (groups.length) {
    const { data: gm } = await supabase
      .from('baseball_strength_group_members')
      .select('group_id, player_id')
      .in('group_id', groups.map((g) => g.id));
    for (const row of (gm ?? []) as Array<{ group_id: string; player_id: string }>) {
      const arr = membersByGroup.get(row.group_id) ?? [];
      arr.push(row.player_id);
      membersByGroup.set(row.group_id, arr);
    }
  }

  // ---- Workload: recent pitch count + game appearances (window) ------------
  const pitchByPlayer = new Map<string, number>();
  const gamesByPlayer = new Map<string, Set<string>>();
  if (playerIds.length) {
    // Resolve this window's games for the team, then sum/count box-score rows.
    const { data: games } = await supabase
      .from('baseball_games')
      .select('id')
      .eq('team_id', teamId)
      .gte('game_date', sinceYmd);
    const gameIds = (games ?? []).map((g: { id: string }) => g.id);
    if (gameIds.length) {
      const { data: pitching } = await supabase
        .from('baseball_box_score_pitching')
        .select('player_id, game_id, pitch_count')
        .in('game_id', gameIds);
      for (const r of (pitching ?? []) as Array<{
        player_id: string; game_id: string; pitch_count: number | null;
      }>) {
        pitchByPlayer.set(r.player_id, (pitchByPlayer.get(r.player_id) ?? 0) + (r.pitch_count ?? 0));
        const set = gamesByPlayer.get(r.player_id) ?? new Set<string>();
        set.add(r.game_id);
        gamesByPlayer.set(r.player_id, set);
      }
      const { data: batting } = await supabase
        .from('baseball_box_score_batting')
        .select('player_id, game_id')
        .in('game_id', gameIds);
      for (const r of (batting ?? []) as Array<{ player_id: string; game_id: string }>) {
        const set = gamesByPlayer.get(r.player_id) ?? new Set<string>();
        set.add(r.game_id);
        gamesByPlayer.set(r.player_id, set);
      }
    }
  }

  // ---- Availability (latest per player) ------------------------------------
  const availByPlayer = new Map<string, PlayerRuleAttributes['availability_status']>();
  {
    const { data: avail } = await supabase
      .from('baseball_availability_statuses')
      .select('player_id, status, starts_at')
      .eq('team_id', teamId)
      .order('starts_at', { ascending: false });
    for (const a of (avail ?? []) as Array<{ player_id: string; status: string }>) {
      if (!availByPlayer.has(a.player_id)) {
        availByPlayer.set(a.player_id, a.status as PlayerRuleAttributes['availability_status']);
      }
    }
  }

  // ---- Helm Lifting Lab org + athlete-id map (resolved once, reused below) --
  // W2-G rewire: submitReadinessCheckin / createLiftAssignment / logLiftResult
  // (lifting.ts) write ONLY to the unified helm_lifting_* tables now — the
  // legacy baseball_readiness_checkins / baseball_lift_sessions tables are
  // write-dead. Resolved once here and reused for both the soreness section
  // and the lift-history section below.
  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  const athleteMap = liftCtx && playerIds.length
    ? await resolveBaseballAthleteIds(liftCtx.organizationId, playerIds)
    : {};
  const athleteToPlayer = new Map<string, string>();
  for (const [pid, aid] of Object.entries(athleteMap)) athleteToPlayer.set(aid, pid);
  const teamAthleteIds = Object.values(athleteMap);

  // ---- Soreness: max severity on each player's latest check-in -------------
  const sorenessByPlayer = new Map<string, number>();
  {
    const latestCheckin = new Map<string, string>();
    if (liftCtx && teamAthleteIds.length) {
      const { data: checkins } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
        .select('id, athlete_id, checkin_date')
        .eq('organization_id', liftCtx.organizationId)
        .in('athlete_id', teamAthleteIds)
        .gte('checkin_date', sinceYmd)
        .order('checkin_date', { ascending: false }) as { data: Pick<HelmLiftingReadinessCheckinRow, 'id' | 'athlete_id' | 'checkin_date'>[] | null };
      for (const c of checkins ?? []) {
        const pid = athleteToPlayer.get(c.athlete_id);
        if (pid && !latestCheckin.has(pid)) latestCheckin.set(pid, c.id);
      }
    }

    // helm_lifting_soreness_maps FKs checkin_id -> helm_lifting_readiness_checkins(id),
    // matching the ids selected above.
    const checkinIds = Array.from(latestCheckin.values());
    if (checkinIds.length) {
      const { data: sm } = await fromUntyped(supabase, 'helm_lifting_soreness_maps')
        .select('checkin_id, severity')
        .in('checkin_id', checkinIds) as { data: Pick<HelmLiftingSorenessMapRow, 'checkin_id' | 'severity'>[] | null };
      const byCheckin = new Map<string, number>();
      for (const s of sm ?? []) {
        byCheckin.set(s.checkin_id, Math.max(byCheckin.get(s.checkin_id) ?? 0, s.severity));
      }
      for (const [pid, cid] of latestCheckin) {
        const sev = byCheckin.get(cid);
        if (sev != null) sorenessByPlayer.set(pid, sev);
      }
    }
  }

  // ---- Bodyweight: latest entry per player (fallback to profile weight) -----
  const bwByPlayer = new Map<string, number>();
  {
    const { data: bw } = await supabase
      .from('baseball_bodyweight_entries')
      .select('player_id, entry_date, weight_lbs')
      .eq('team_id', teamId)
      .order('entry_date', { ascending: false });
    for (const e of (bw ?? []) as Array<{ player_id: string; weight_lbs: number }>) {
      if (!bwByPlayer.has(e.player_id)) bwByPlayer.set(e.player_id, e.weight_lbs);
    }
  }

  // ---- Lift history in window: completed vs incomplete ----------------------
  const completedLift = new Set<string>();
  const incompleteLift = new Set<string>();
  if (liftCtx && teamAthleteIds.length) {
    const { data: sessions } = await fromUntyped(supabase, 'helm_lifting_sessions')
      .select('athlete_id, status, scheduled_date')
      .eq('organization_id', liftCtx.organizationId)
      .in('athlete_id', teamAthleteIds)
      .gte('scheduled_date', sinceYmd) as { data: Array<{ athlete_id: string; status: string }> | null };
    for (const s of sessions ?? []) {
      const pid = athleteToPlayer.get(s.athlete_id);
      if (!pid) continue;
      if (s.status === 'completed') completedLift.add(pid);
      else if (s.status === 'assigned' || s.status === 'missed') incompleteLift.add(pid);
    }
  }

  // ---- Compose the per-player attribute snapshot ---------------------------
  const rosterAttrs: PlayerRuleAttributes[] = roster.map((p) => ({
    player_id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    primary_position: p.primary_position,
    secondary_position: p.secondary_position,
    grad_year: p.grad_year,
    availability_status: availByPlayer.get(p.id) ?? null,
    recent_pitch_count: pitchByPlayer.get(p.id) ?? 0,
    recent_game_starts: gamesByPlayer.get(p.id)?.size ?? 0,
    latest_soreness_severity: sorenessByPlayer.get(p.id) ?? null,
    bodyweight_lbs: bwByPlayer.get(p.id) ?? p.weight_lbs ?? null,
    training_age_years: trainingAgeFromGradYear(p.grad_year),
    has_incomplete_lift: incompleteLift.has(p.id),
    has_completed_lift: completedLift.has(p.id),
  }));

  const presentNames = new Set(groups.map((g) => g.name.toLowerCase()));
  const defaultGroupsPresent = DEFAULT_STRENGTH_GROUP_NAMES.filter((n) =>
    presentNames.has(n.toLowerCase()),
  ).length;

  return {
    groups: groups.map((g) => ({
      ...g,
      member_count: membersByGroup.get(g.id)?.length ?? 0,
      member_ids: membersByGroup.get(g.id) ?? [],
    })),
    roster: rosterAttrs,
    defaultGroupsPresent,
  };
}

/** One group's membership (resolved to player names + source) + recent audit. */
export async function getStrengthGroupDetail(
  teamId: string,
  groupId: string,
): Promise<StrengthGroupDetailData | null> {
  const supabase = (await createClient()) as Db;

  const { data: group } = await supabase
    .from('baseball_strength_groups')
    .select('*')
    .eq('id', groupId)
    .eq('team_id', teamId)
    .maybeSingle();
  if (!group) return null;

  const { data: memberRows } = await supabase
    .from('baseball_strength_group_members')
    .select('player_id, source, baseball_players!inner ( first_name, last_name, primary_position )')
    .eq('group_id', groupId);
  const members: StrengthGroupMemberDetail[] = (memberRows ?? [])
    .map((m: {
      player_id: string;
      source: BaseballGroupMemberSource;
      baseball_players: { first_name: string | null; last_name: string | null; primary_position: string | null };
    }) => ({
      player_id: m.player_id,
      source: m.source,
      first_name: m.baseball_players?.first_name ?? null,
      last_name: m.baseball_players?.last_name ?? null,
      primary_position: m.baseball_players?.primary_position ?? null,
    }))
    .sort((a: StrengthGroupMemberDetail, b: StrengthGroupMemberDetail) =>
      (a.last_name ?? '').localeCompare(b.last_name ?? ''),
    );

  const { data: auditRows } = await supabase
    .from('baseball_strength_group_audit')
    .select('*')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(50);

  return {
    group: group as BaseballStrengthGroupRow,
    members,
    audit: (auditRows ?? []) as BaseballStrengthGroupAuditRow[],
  };
}
