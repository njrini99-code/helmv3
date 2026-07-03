// =============================================================================
// src/lib/baseball/read-models/lift-programs.ts
//
// V11 Program Builder read models. Composes:
//   * getLiftProgramList   — the /performance/programs list (phase/goal/status,
//                            week+day counts, template flag).
//   * getLiftProgramTree   — the /performance/programs/[programId] editor tree:
//                            program -> weeks -> days -> sections -> prescriptions
//                            (+ a resolved exercise-name map for prescription rows).
//   * getAssignContext     — roster + active strength groups for the Assign+Publish
//                            flow (resolve player ids before publishLiftDay).
//
// SERVER-ONLY plain async (NOT 'use server'). RLS backs every query: program-tree
// SELECT is gated to is_baseball_team_staff, so a non-staff caller sees nothing.
//
// Helm Lift Lab unification: every table here reads from the unified
// helm_lifting_* tables (organization_id + sport='baseball' scoped) instead of
// the legacy baseball_lift_* / baseball_strength_* tables, which are write-dead.
// helm_lifting_days.sport_context replaces the legacy baseball_context column;
// this module remaps it back to `baseball_context` on read so the existing
// LiftDayNode contract (and ProgramEditorClient.tsx, which reads
// `day.baseball_context`) never changes. Group membership is athlete_id-keyed
// (helm_lifting_athletes), so it is resolved back to baseball_players.id via
// resolveBaseballLiftingOrg / resolveBaseballAthleteIds before being exposed.
// The V11 tables are not in the generated database.ts (no live apply to regen
// against) — we read via fromUntyped() and lean on the hand-written types as
// the contract, exactly like performance-command.ts.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import {
  resolveBaseballLiftingOrg,
  resolveBaseballAthleteIds,
} from '@/lib/lifting/resolve-baseball-context';
import type {
  BaseballLiftProgramRow,
  BaseballLiftWeekRow,
  BaseballLiftDayRow,
  BaseballLiftSectionRow,
  BaseballLiftPrescriptionRow,
  BaseballLiftExerciseRow,
} from '@/lib/types/baseball-lifting-v11';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

// -----------------------------------------------------------------------------
// Program list
// -----------------------------------------------------------------------------

export interface LiftProgramListItem extends BaseballLiftProgramRow {
  week_count: number;
  day_count: number;
}

export async function getLiftProgramList(teamId: string): Promise<LiftProgramListItem[]> {
  const supabase = (await createClient()) as Db;

  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  if (!liftCtx) return [];

  const { data: programs } = await fromUntyped(supabase, 'helm_lifting_programs')
    .select(
      'id, team_id, name, description, phase, goal, created_by_coach_id, visibility, status, is_template, start_date, end_date, created_at, updated_at',
    )
    .eq('organization_id', liftCtx.organizationId)
    .eq('sport', 'baseball')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false }) as { data: BaseballLiftProgramRow[] | null };
  const list = programs ?? [];
  if (list.length === 0) return [];

  const ids = list.map((p) => p.id);

  // Week + day counts in two scoped reads (small N; avoids N+1).
  const { data: weeks } = await fromUntyped(supabase, 'helm_lifting_weeks')
    .select('id, program_id')
    .in('program_id', ids) as { data: Array<{ id: string; program_id: string }> | null };
  const weekRows = weeks ?? [];
  const weekCountByProgram = new Map<string, number>();
  const programByWeek = new Map<string, string>();
  for (const w of weekRows) {
    weekCountByProgram.set(w.program_id, (weekCountByProgram.get(w.program_id) ?? 0) + 1);
    programByWeek.set(w.id, w.program_id);
  }

  const dayCountByProgram = new Map<string, number>();
  if (weekRows.length) {
    const { data: days } = await fromUntyped(supabase, 'helm_lifting_days')
      .select('week_id')
      .in('week_id', weekRows.map((w) => w.id)) as { data: Array<{ week_id: string }> | null };
    for (const d of days ?? []) {
      const programId = programByWeek.get(d.week_id);
      if (!programId) continue;
      dayCountByProgram.set(programId, (dayCountByProgram.get(programId) ?? 0) + 1);
    }
  }

  return list.map((p) => ({
    ...p,
    week_count: weekCountByProgram.get(p.id) ?? 0,
    day_count: dayCountByProgram.get(p.id) ?? 0,
  }));
}

// -----------------------------------------------------------------------------
// Program tree (the editor)
// -----------------------------------------------------------------------------

export interface LiftPrescriptionNode extends BaseballLiftPrescriptionRow {
  exercise_name: string | null;
}
export interface LiftSectionNode extends BaseballLiftSectionRow {
  prescriptions: LiftPrescriptionNode[];
}
export interface LiftDayNode extends BaseballLiftDayRow {
  sections: LiftSectionNode[];
}
export interface LiftWeekNode extends BaseballLiftWeekRow {
  days: LiftDayNode[];
}
export interface LiftProgramTree {
  program: BaseballLiftProgramRow;
  weeks: LiftWeekNode[];
}

/**
 * Load a full program tree for the editor. Returns null when the program does
 * not exist, the team has no Helm Lifting organization configured, or RLS
 * hides it (caller should 404). Assembles the tree in a fixed number of scoped
 * queries (one per level) — no N+1.
 */
export async function getLiftProgramTree(
  teamId: string,
  programId: string,
): Promise<LiftProgramTree | null> {
  const supabase = (await createClient()) as Db;

  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  if (!liftCtx) return null;

  const { data: program } = await fromUntyped(supabase, 'helm_lifting_programs')
    .select(
      'id, team_id, name, description, phase, goal, created_by_coach_id, visibility, status, is_template, start_date, end_date, created_at, updated_at',
    )
    .eq('id', programId)
    .eq('organization_id', liftCtx.organizationId)
    .eq('team_id', teamId)
    .maybeSingle() as { data: BaseballLiftProgramRow | null };
  if (!program) return null;

  const { data: weekRows } = await fromUntyped(supabase, 'helm_lifting_weeks')
    .select('id, program_id, week_number, name, theme, deload, created_at')
    .eq('program_id', programId)
    .order('week_number', { ascending: true }) as { data: BaseballLiftWeekRow[] | null };
  const weeks = weekRows ?? [];

  const weekIds = weeks.map((w) => w.id);
  const { data: dayRows } = weekIds.length
    ? await fromUntyped(supabase, 'helm_lifting_days')
        .select('id, week_id, day_number, name, day_type, sport_context, estimated_minutes, created_at')
        .in('week_id', weekIds)
        .order('day_number', { ascending: true })
    : { data: [] };
  // helm_lifting_days.sport_context replaces the legacy baseball_context
  // column — remap it back so LiftDayNode keeps its established field name
  // (ProgramEditorClient.tsx reads `day.baseball_context`).
  const days: BaseballLiftDayRow[] = ((dayRows ?? []) as Array<{
    id: string; week_id: string; day_number: number; name: string | null;
    day_type: BaseballLiftDayRow['day_type']; sport_context: BaseballLiftDayRow['baseball_context'];
    estimated_minutes: number | null; created_at: string;
  }>).map((d) => ({
    id: d.id,
    week_id: d.week_id,
    day_number: d.day_number,
    name: d.name,
    day_type: d.day_type,
    baseball_context: d.sport_context,
    estimated_minutes: d.estimated_minutes,
    created_at: d.created_at,
  }));

  const dayIds = days.map((d) => d.id);
  const { data: sectionRows } = dayIds.length
    ? await fromUntyped(supabase, 'helm_lifting_sections')
        .select('id, lift_day_id, section_order, name, section_type, instructions, created_at')
        .in('lift_day_id', dayIds)
        .order('section_order', { ascending: true })
    : { data: [] };
  const sections = (sectionRows ?? []) as BaseballLiftSectionRow[];

  const sectionIds = sections.map((s) => s.id);
  const { data: presRows } = sectionIds.length
    ? await fromUntyped(supabase, 'helm_lifting_prescriptions')
        .select(
          'id, section_id, exercise_id, order_index, prescription_type, sets, reps, load_value, load_unit, percent_1rm, target_rpe, target_rir, target_velocity_min, target_velocity_max, rest_seconds, tempo, coaching_note, substitution_group_id, created_at',
        )
        .in('section_id', sectionIds)
        .order('order_index', { ascending: true })
    : { data: [] };
  const prescriptions = (presRows ?? []) as BaseballLiftPrescriptionRow[];

  // Resolve exercise names for prescription rows (no FK reliance on read path).
  const exIds = Array.from(
    new Set(prescriptions.map((p) => p.exercise_id).filter((x): x is string => Boolean(x))),
  );
  const nameById = new Map<string, string>();
  if (exIds.length) {
    const { data: exs } = await fromUntyped(supabase, 'helm_lifting_exercises')
      .select('id, name')
      .in('id', exIds) as { data: Array<Pick<BaseballLiftExerciseRow, 'id' | 'name'>> | null };
    for (const e of exs ?? []) {
      nameById.set(e.id, e.name);
    }
  }

  // Assemble bottom-up.
  const presBySection = new Map<string, LiftPrescriptionNode[]>();
  for (const p of prescriptions) {
    const arr = presBySection.get(p.section_id) ?? [];
    arr.push({ ...p, exercise_name: p.exercise_id ? nameById.get(p.exercise_id) ?? null : null });
    presBySection.set(p.section_id, arr);
  }
  const sectionsByDay = new Map<string, LiftSectionNode[]>();
  for (const s of sections) {
    const arr = sectionsByDay.get(s.lift_day_id) ?? [];
    arr.push({ ...s, prescriptions: presBySection.get(s.id) ?? [] });
    sectionsByDay.set(s.lift_day_id, arr);
  }
  const daysByWeek = new Map<string, LiftDayNode[]>();
  for (const d of days) {
    const arr = daysByWeek.get(d.week_id) ?? [];
    arr.push({ ...d, sections: sectionsByDay.get(d.id) ?? [] });
    daysByWeek.set(d.week_id, arr);
  }

  return {
    program,
    weeks: weeks.map((w) => ({ ...w, days: daysByWeek.get(w.id) ?? [] })),
  };
}

// -----------------------------------------------------------------------------
// Assign + Publish context
// -----------------------------------------------------------------------------

export interface AssignRosterPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
}
export interface AssignGroup {
  id: string;
  name: string;
  member_ids: string[];
}
export interface AssignContext {
  roster: AssignRosterPlayer[];
  groups: AssignGroup[];
  exercises: Array<Pick<BaseballLiftExerciseRow, 'id' | 'name' | 'category' | 'default_unit'>>;
}

/**
 * Roster + active strength groups (with resolved member ids) + the exercise
 * library for the Assign+Publish flow and the prescription editor. The publish
 * action re-resolves players server-side; this just powers the picker.
 *
 * Group membership + the exercise library live in the unified Helm Lifting Lab
 * tables (org+sport scoped). Group members are athlete_id-keyed, so they are
 * resolved back to baseball_players.id here via the same org/athlete-id bridge
 * used across the rewired read models. A team with no Helm Lifting
 * organization configured yet degrades to an honest empty groups/exercises
 * list — the roster (unrelated to lifting) is unaffected.
 */
export async function getAssignContext(teamId: string): Promise<AssignContext> {
  const supabase = (await createClient()) as Db;

  const { data: members } = await supabase
    .from('baseball_team_members')
    .select('player_id, baseball_players!inner ( id, first_name, last_name, primary_position )')
    .eq('team_id', teamId);
  const roster: AssignRosterPlayer[] = (members ?? [])
    .map((m: { baseball_players: AssignRosterPlayer }) => m.baseball_players)
    .filter((p: AssignRosterPlayer | null): p is AssignRosterPlayer => Boolean(p?.id))
    .sort((a: AssignRosterPlayer, b: AssignRosterPlayer) =>
      (a.last_name ?? '').localeCompare(b.last_name ?? ''),
    );

  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  if (!liftCtx) {
    return { roster, groups: [], exercises: [] };
  }

  const rosterPlayerIds = roster.map((p) => p.id);
  const athleteMap = rosterPlayerIds.length
    ? await resolveBaseballAthleteIds(liftCtx.organizationId, rosterPlayerIds)
    : {};
  const athleteToPlayer = new Map<string, string>();
  for (const [pid, aid] of Object.entries(athleteMap)) athleteToPlayer.set(aid, pid);

  const { data: groupRows } = await fromUntyped(supabase, 'helm_lifting_groups')
    .select('id, name')
    .eq('organization_id', liftCtx.organizationId)
    .eq('sport', 'baseball')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('name', { ascending: true }) as { data: Array<{ id: string; name: string }> | null };
  const groups = groupRows ?? [];

  const membersByGroup = new Map<string, string[]>();
  if (groups.length) {
    const { data: gm } = await fromUntyped(supabase, 'helm_lifting_group_members')
      .select('group_id, athlete_id')
      .in('group_id', groups.map((g) => g.id)) as { data: Array<{ group_id: string; athlete_id: string }> | null };
    for (const row of gm ?? []) {
      const pid = athleteToPlayer.get(row.athlete_id);
      if (!pid) continue; // athlete not resolved to a roster player — skip honestly.
      const arr = membersByGroup.get(row.group_id) ?? [];
      arr.push(pid);
      membersByGroup.set(row.group_id, arr);
    }
  }

  const { data: exRows } = await fromUntyped(supabase, 'helm_lifting_exercises')
    .select('id, name, category, default_unit')
    .eq('sport', 'baseball')
    .eq('is_active', true)
    .or(`organization_id.eq.${liftCtx.organizationId},is_global.eq.true`)
    .order('name', { ascending: true }) as { data: AssignContext['exercises'] | null };

  return {
    roster,
    groups: groups.map((g) => ({ ...g, member_ids: membersByGroup.get(g.id) ?? [] })),
    exercises: exRows ?? [],
  };
}
