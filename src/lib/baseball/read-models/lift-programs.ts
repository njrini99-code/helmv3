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
// The V11 tables are not in the generated database.ts (no live apply to regen
// against) — we cast the builder and lean on the hand-written types as the
// contract, exactly like performance-command.ts.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
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

  const { data: programs } = await supabase
    .from('baseball_lift_programs')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  const list = (programs ?? []) as BaseballLiftProgramRow[];
  if (list.length === 0) return [];

  const ids = list.map((p) => p.id);

  // Week + day counts in two scoped reads (small N; avoids N+1).
  const { data: weeks } = await supabase
    .from('baseball_lift_weeks')
    .select('id, program_id')
    .in('program_id', ids);
  const weekRows = (weeks ?? []) as Array<{ id: string; program_id: string }>;
  const weekCountByProgram = new Map<string, number>();
  const programByWeek = new Map<string, string>();
  for (const w of weekRows) {
    weekCountByProgram.set(w.program_id, (weekCountByProgram.get(w.program_id) ?? 0) + 1);
    programByWeek.set(w.id, w.program_id);
  }

  const dayCountByProgram = new Map<string, number>();
  if (weekRows.length) {
    const { data: days } = await supabase
      .from('baseball_lift_days')
      .select('week_id')
      .in('week_id', weekRows.map((w) => w.id));
    for (const d of (days ?? []) as Array<{ week_id: string }>) {
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
 * not exist or RLS hides it (caller should 404). Assembles the tree in a fixed
 * number of scoped queries (one per level) — no N+1.
 */
export async function getLiftProgramTree(
  teamId: string,
  programId: string,
): Promise<LiftProgramTree | null> {
  const supabase = (await createClient()) as Db;

  const { data: program } = await supabase
    .from('baseball_lift_programs')
    .select('*')
    .eq('id', programId)
    .eq('team_id', teamId)
    .maybeSingle();
  if (!program) return null;
  const prog = program as BaseballLiftProgramRow;

  const { data: weekRows } = await supabase
    .from('baseball_lift_weeks')
    .select('*')
    .eq('program_id', programId)
    .order('week_number', { ascending: true });
  const weeks = (weekRows ?? []) as BaseballLiftWeekRow[];

  const weekIds = weeks.map((w) => w.id);
  const { data: dayRows } = weekIds.length
    ? await supabase
        .from('baseball_lift_days')
        .select('*')
        .in('week_id', weekIds)
        .order('day_number', { ascending: true })
    : { data: [] };
  const days = (dayRows ?? []) as BaseballLiftDayRow[];

  const dayIds = days.map((d) => d.id);
  const { data: sectionRows } = dayIds.length
    ? await supabase
        .from('baseball_lift_sections')
        .select('*')
        .in('lift_day_id', dayIds)
        .order('section_order', { ascending: true })
    : { data: [] };
  const sections = (sectionRows ?? []) as BaseballLiftSectionRow[];

  const sectionIds = sections.map((s) => s.id);
  const { data: presRows } = sectionIds.length
    ? await supabase
        .from('baseball_lift_prescriptions')
        .select('*')
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
    const { data: exs } = await supabase
      .from('baseball_lift_exercises')
      .select('id, name')
      .in('id', exIds);
    for (const e of (exs ?? []) as Array<Pick<BaseballLiftExerciseRow, 'id' | 'name'>>) {
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
    program: prog,
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

  const { data: groupRows } = await supabase
    .from('baseball_strength_groups')
    .select('id, name')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .order('name', { ascending: true });
  const groups = (groupRows ?? []) as Array<{ id: string; name: string }>;

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

  const { data: exRows } = await supabase
    .from('baseball_lift_exercises')
    .select('id, name, category, default_unit')
    .or(`team_id.eq.${teamId},is_global.eq.true`)
    .eq('is_active', true)
    .order('name', { ascending: true });

  return {
    roster,
    groups: groups.map((g) => ({ ...g, member_ids: membersByGroup.get(g.id) ?? [] })),
    exercises: (exRows ?? []) as AssignContext['exercises'],
  };
}
