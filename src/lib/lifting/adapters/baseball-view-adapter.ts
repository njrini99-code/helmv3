// =============================================================================
// src/lib/lifting/adapters/baseball-view-adapter.ts
//
// Maps helm_lifting_* row shapes → the EXISTING BaseballLift* prop shapes that
// the baseball performance components consume (src/components/baseball/performance/*).
//
// Purpose: keep component prop types UNCHANGED during the §6 dashboard rewire.
// After the rewire, baseball lifting actions read from helm_lifting_* and pass
// results through these adapters before returning — so components receive the
// same shapes they always expected, and zero component files need prop-type edits.
//
// The helm_lifting_* shapes are structural clones of the V11 baseball shapes, so
// most adapters are near-identity field renames + the athlete_id↔player_id swap.
//
// Ref: Blueprint §6.2 (keeping component props stable — an adapter layer)
// Ref: src/lib/types/baseball-lifting-v11.ts (the TARGET prop shapes)
// =============================================================================

import type {
  BaseballStrengthGroupRow,
  BaseballStrengthGroupMemberRow,
  BaseballLiftExerciseRow,
  BaseballLiftExerciseSubstitutionRow,
  BaseballLiftProgramRow,
  BaseballLiftWeekRow,
  BaseballLiftDayRow,
  BaseballLiftSectionRow,
  BaseballLiftPrescriptionRow,
  BaseballLiftProgramAssignmentRow,
  BaseballLiftSessionRow,
  BaseballLiftSessionExerciseRow,
  BaseballLiftSetResultRow,
  BaseballSorenessMapRow,
  BaseballBodyweightEntryRow,
  BaseballAvailabilityStatusRow,
  BaseballStrengthMaxRow,
  BaseballStrengthPrRow,
  BaseballLiftImportRunRow,
  BaseballLiftImportRowRow,
} from '@/lib/types/baseball-lifting-v11';

import type {
  BaseballLiftAssignmentRow,
  BaseballLiftAssignmentStatus,
  BaseballReadinessCheckinRow,
} from '@/lib/types/baseball-lifting';

import type {
  HelmLiftingGroupRow,
  HelmLiftingGroupMemberRow,
  HelmLiftingExerciseRow,
  HelmLiftingExerciseSubstitutionRow,
  HelmLiftingProgramRow,
  HelmLiftingWeekRow,
  HelmLiftingDayRow,
  HelmLiftingSectionRow,
  HelmLiftingPrescriptionRow,
  HelmLiftingProgramAssignmentRow,
  HelmLiftingSessionRow,
  HelmLiftingSessionExerciseRow,
  HelmLiftingSetResultRow,
  HelmLiftingSorenessMapRow,
  HelmLiftingBodyweightEntryRow,
  HelmLiftingAvailabilityStatusRow,
  HelmLiftingMaxRow,
  HelmLiftingPrRow,
  HelmLiftingImportRunRow,
  HelmLiftingImportRowRow,
  HelmLiftingReadinessCheckinRow,
} from '@/lib/types/helm-lifting-data';

// -----------------------------------------------------------------------------
// The athlete ↔ player id swaps come through a caller-supplied map so the
// adapters remain pure functions (no DB calls inside adapters).
// -----------------------------------------------------------------------------

/**
 * Maps helm_lifting_athletes.id → baseball_players.id (reverse of the
 * baseline map so component code that uses player_id still works).
 */
export type HelmToBaseballIdMap = Record<string, string>;

// -----------------------------------------------------------------------------
// Groups
// -----------------------------------------------------------------------------

export function adaptGroup(
  r: HelmLiftingGroupRow,
  fallbackTeamId: string,
): BaseballStrengthGroupRow {
  return {
    id: r.id,
    team_id: r.team_id ?? fallbackTeamId,
    name: r.name,
    description: r.description,
    group_type: r.group_type as BaseballStrengthGroupRow['group_type'],
    rule_json: r.rule_json,
    created_by_coach_id: r.created_by_coach_id,
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function adaptGroupMember(
  r: HelmLiftingGroupMemberRow,
  athleteToPlayer: HelmToBaseballIdMap,
): BaseballStrengthGroupMemberRow {
  return {
    id: r.id,
    group_id: r.group_id,
    player_id: athleteToPlayer[r.athlete_id] ?? r.athlete_id,
    source: r.source as BaseballStrengthGroupMemberRow['source'],
    added_by_coach_id: r.added_by_coach_id,
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    created_at: r.created_at,
  };
}

// -----------------------------------------------------------------------------
// Exercises
// -----------------------------------------------------------------------------

export function adaptExercise(
  r: HelmLiftingExerciseRow,
  fallbackTeamId: string | null,
): BaseballLiftExerciseRow {
  // helm_lifting_exercises has NO team_id — scoping lives on the parent
  // program/group/session context, threaded in via `fallbackTeamId`.
  return {
    id: r.id,
    team_id: fallbackTeamId,
    created_by_coach_id: r.created_by_coach_id,
    name: r.name,
    category: r.category as BaseballLiftExerciseRow['category'],
    primary_pattern: r.primary_pattern as BaseballLiftExerciseRow['primary_pattern'],
    body_region: r.body_region as BaseballLiftExerciseRow['body_region'],
    equipment: r.equipment,
    unilateral: r.unilateral,
    baseball_constraints: r.sport_constraints,
    baseball_tags: r.sport_tags,
    default_unit: r.default_unit as BaseballLiftExerciseRow['default_unit'],
    track_load: r.track_load,
    track_reps: r.track_reps,
    track_sets: r.track_sets,
    track_velocity: r.track_velocity,
    track_distance: r.track_distance,
    track_time: r.track_time,
    track_rpe: r.track_rpe,
    video_url: r.video_url,
    instructions: r.instructions,
    coaching_cues: r.coaching_cues,
    contraindication_notes: r.contraindication_notes,
    is_global: r.is_global,
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function adaptExerciseSubstitution(
  r: HelmLiftingExerciseSubstitutionRow,
  fallbackTeamId: string,
): BaseballLiftExerciseSubstitutionRow {
  // helm_lifting_exercise_substitutions has NO team_id — required team scope
  // is threaded in from the parent context via `fallbackTeamId`.
  return {
    id: r.id,
    team_id: fallbackTeamId,
    exercise_id: r.exercise_id,
    substitute_exercise_id: r.substitute_exercise_id,
    reason: r.reason,
    created_by_coach_id: r.created_by_coach_id,
    created_at: r.created_at,
  };
}

// -----------------------------------------------------------------------------
// Programs
// -----------------------------------------------------------------------------

export function adaptProgram(
  r: HelmLiftingProgramRow,
  fallbackTeamId: string,
): BaseballLiftProgramRow {
  return {
    id: r.id,
    team_id: r.team_id ?? fallbackTeamId,
    name: r.name,
    description: r.description,
    phase: r.phase as BaseballLiftProgramRow['phase'],
    goal: r.goal as BaseballLiftProgramRow['goal'],
    created_by_coach_id: r.created_by_coach_id,
    visibility: r.visibility as BaseballLiftProgramRow['visibility'],
    status: r.status as BaseballLiftProgramRow['status'],
    is_template: r.is_template,
    start_date: r.start_date,
    end_date: r.end_date,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function adaptWeek(r: HelmLiftingWeekRow): BaseballLiftWeekRow {
  return {
    id: r.id,
    program_id: r.program_id,
    week_number: r.week_number,
    name: r.name,
    theme: r.theme,
    deload: r.deload,
    created_at: r.created_at,
  };
}

export function adaptDay(r: HelmLiftingDayRow): BaseballLiftDayRow {
  return {
    id: r.id,
    week_id: r.week_id,
    day_number: r.day_number,
    name: r.name,
    day_type: r.day_type as BaseballLiftDayRow['day_type'],
    baseball_context: r.sport_context as BaseballLiftDayRow['baseball_context'],
    estimated_minutes: r.estimated_minutes,
    created_at: r.created_at,
  };
}

export function adaptSection(r: HelmLiftingSectionRow): BaseballLiftSectionRow {
  return {
    id: r.id,
    lift_day_id: r.lift_day_id,
    section_order: r.section_order,
    name: r.name,
    section_type: r.section_type as BaseballLiftSectionRow['section_type'],
    instructions: r.instructions,
    created_at: r.created_at,
  };
}

export function adaptPrescription(r: HelmLiftingPrescriptionRow): BaseballLiftPrescriptionRow {
  return {
    id: r.id,
    section_id: r.section_id,
    exercise_id: r.exercise_id,
    order_index: r.order_index,
    prescription_type: r.prescription_type as BaseballLiftPrescriptionRow['prescription_type'],
    sets: r.sets,
    reps: r.reps,
    load_value: r.load_value,
    load_unit: r.load_unit,
    percent_1rm: r.percent_1rm,
    target_rpe: r.target_rpe,
    target_rir: r.target_rir,
    target_velocity_min: r.target_velocity_min,
    target_velocity_max: r.target_velocity_max,
    rest_seconds: r.rest_seconds,
    tempo: r.tempo,
    coaching_note: r.coaching_note,
    substitution_group_id: r.substitution_group_id,
    created_at: r.created_at,
  };
}

// -----------------------------------------------------------------------------
// Program assignment + materialized sessions
// -----------------------------------------------------------------------------

export function adaptProgramAssignment(
  r: HelmLiftingProgramAssignmentRow,
  fallbackTeamId: string,
  athleteToPlayer: HelmToBaseballIdMap,
): BaseballLiftProgramAssignmentRow {
  return {
    id: r.id,
    team_id: r.team_id ?? fallbackTeamId,
    program_id: r.program_id,
    lift_day_id: r.lift_day_id,
    assigned_by_coach_id: r.assigned_by_coach_id,
    assignment_type: r.assignment_type as BaseballLiftProgramAssignmentRow['assignment_type'],
    group_id: r.group_id,
    player_id: r.athlete_id ? (athleteToPlayer[r.athlete_id] ?? r.athlete_id) : null,
    event_id: null, // Lab assignments don't have a baseball_events FK
    scheduled_date: r.scheduled_date,
    scheduled_start: r.scheduled_start,
    scheduled_end: r.scheduled_end,
    status: r.status as BaseballLiftProgramAssignmentRow['status'],
    player_visible_at: r.player_visible_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function adaptSession(
  r: HelmLiftingSessionRow,
  fallbackTeamId: string,
  athleteToPlayer: HelmToBaseballIdMap,
): BaseballLiftSessionRow {
  return {
    id: r.id,
    program_assignment_id: r.program_assignment_id,
    team_id: r.team_id ?? fallbackTeamId,
    player_id: athleteToPlayer[r.athlete_id] ?? r.athlete_id,
    event_id: null,
    title: r.title,
    day_type: r.day_type,
    baseball_context: r.sport_context,
    scheduled_date: r.scheduled_date,
    estimated_minutes: r.estimated_minutes,
    status: r.status as BaseballLiftSessionRow['status'],
    started_at: r.started_at,
    completed_at: r.completed_at,
    readiness_checkin_id: r.readiness_checkin_id,
    coach_review_status: r.coach_review_status as BaseballLiftSessionRow['coach_review_status'],
    player_note: r.player_note,
    coach_note: r.coach_note,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function adaptSessionExercise(
  r: HelmLiftingSessionExerciseRow,
): BaseballLiftSessionExerciseRow {
  return {
    id: r.id,
    session_id: r.session_id,
    prescription_id: r.prescription_id,
    exercise_id: r.exercise_id,
    exercise_name_snapshot: r.exercise_name_snapshot,
    section_name_snapshot: r.section_name_snapshot,
    section_type_snapshot: r.section_type_snapshot,
    order_index: r.order_index,
    prescribed_sets: r.prescribed_sets,
    prescribed_reps: r.prescribed_reps,
    prescribed_load: r.prescribed_load,
    prescribed_load_unit: r.prescribed_load_unit,
    prescribed_rpe: r.prescribed_rpe,
    modified_by_coach_id: r.modified_by_coach_id,
    modification_reason: r.modification_reason,
    status: r.status as BaseballLiftSessionExerciseRow['status'],
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function adaptSetResult(
  r: HelmLiftingSetResultRow,
  // set_results carry organization_id, not a team scope — fallback unused, kept
  // for positional-signature parity with the other id-mapped adapters.
  _fallbackTeamId: string,
  athleteToPlayer: HelmToBaseballIdMap,
): BaseballLiftSetResultRow {
  return {
    id: r.id,
    session_exercise_id: r.session_exercise_id,
    team_id: r.organization_id, // best approximation when team_id isn't on set_results
    player_id: athleteToPlayer[r.athlete_id] ?? r.athlete_id,
    set_number: r.set_number,
    prescribed_reps: r.prescribed_reps,
    actual_reps: r.actual_reps,
    prescribed_load: r.prescribed_load,
    actual_load: r.actual_load,
    load_unit: r.load_unit,
    rpe: r.rpe,
    rir: r.rir,
    velocity: r.velocity,
    completed_at: r.completed_at,
    player_note: r.player_note,
    coach_observed: r.coach_observed,
    created_at: r.created_at,
  };
}

// -----------------------------------------------------------------------------
// Readiness family
// -----------------------------------------------------------------------------

export function adaptSorenessMap(
  r: HelmLiftingSorenessMapRow,
  // soreness maps carry organization_id, not a team scope — fallback unused.
  _fallbackTeamId: string,
  athleteToPlayer: HelmToBaseballIdMap,
): BaseballSorenessMapRow {
  return {
    id: r.id,
    checkin_id: r.checkin_id,
    team_id: r.organization_id,
    player_id: athleteToPlayer[r.athlete_id] ?? r.athlete_id,
    body_region: r.body_region,
    side: r.side as BaseballSorenessMapRow['side'],
    severity: r.severity,
    note: r.note,
    created_at: r.created_at,
  };
}

export function adaptBodyweightEntry(
  r: HelmLiftingBodyweightEntryRow,
  // bodyweight entries carry organization_id, not a team scope — fallback unused.
  _fallbackTeamId: string,
  athleteToPlayer: HelmToBaseballIdMap,
): BaseballBodyweightEntryRow {
  return {
    id: r.id,
    team_id: r.organization_id,
    player_id: athleteToPlayer[r.athlete_id] ?? r.athlete_id,
    entry_date: r.entry_date,
    weight_lbs: r.weight_lbs,
    source: r.source as BaseballBodyweightEntryRow['source'],
    created_at: r.created_at,
  };
}

export function adaptAvailabilityStatus(
  r: HelmLiftingAvailabilityStatusRow,
  athleteToPlayer: HelmToBaseballIdMap,
): BaseballAvailabilityStatusRow {
  return {
    id: r.id,
    team_id: r.organization_id,
    player_id: athleteToPlayer[r.athlete_id] ?? r.athlete_id,
    status: r.status as BaseballAvailabilityStatusRow['status'],
    reason_category: r.reason_category as BaseballAvailabilityStatusRow['reason_category'],
    note: r.note,
    visibility: r.visibility as BaseballAvailabilityStatusRow['visibility'],
    starts_at: r.starts_at,
    ends_at: r.ends_at,
    created_by_coach_id: r.created_by_coach_id,
    created_at: r.created_at,
  };
}

// -----------------------------------------------------------------------------
// Progression
// -----------------------------------------------------------------------------

export function adaptMax(
  r: HelmLiftingMaxRow,
  athleteToPlayer: HelmToBaseballIdMap,
): BaseballStrengthMaxRow {
  return {
    id: r.id,
    team_id: r.organization_id,
    player_id: athleteToPlayer[r.athlete_id] ?? r.athlete_id,
    exercise_id: r.exercise_id,
    max_type: r.max_type as BaseballStrengthMaxRow['max_type'],
    value: r.value,
    unit: r.unit,
    test_date: r.test_date,
    source: r.source as BaseballStrengthMaxRow['source'],
    confidence: r.confidence,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function adaptPr(
  r: HelmLiftingPrRow,
  athleteToPlayer: HelmToBaseballIdMap,
): BaseballStrengthPrRow {
  return {
    id: r.id,
    team_id: r.organization_id,
    player_id: athleteToPlayer[r.athlete_id] ?? r.athlete_id,
    exercise_id: r.exercise_id,
    pr_type: r.pr_type as BaseballStrengthPrRow['pr_type'],
    value: r.value,
    unit: r.unit,
    achieved_at: r.achieved_at,
    lift_session_id: r.lift_session_id,
    verified_by_coach_id: r.verified_by_coach_id,
    created_at: r.created_at,
  };
}

// -----------------------------------------------------------------------------
// Imports
// -----------------------------------------------------------------------------

export function adaptImportRun(
  r: HelmLiftingImportRunRow,
  // import runs carry organization_id, not a team scope — fallback unused.
  _fallbackTeamId: string,
): BaseballLiftImportRunRow {
  return {
    id: r.id,
    team_id: r.organization_id,
    created_by_coach_id: r.created_by_coach_id,
    source: r.source as BaseballLiftImportRunRow['source'],
    import_kind: r.import_kind as BaseballLiftImportRunRow['import_kind'],
    file_name: r.file_name,
    file_hash: r.file_hash,
    mapping_json: r.mapping_json,
    units_json: r.units_json,
    total_rows: r.total_rows,
    matched_rows: r.matched_rows,
    unmatched_rows: r.unmatched_rows,
    status: r.status as BaseballLiftImportRunRow['status'],
    source_confidence: r.source_confidence as BaseballLiftImportRunRow['source_confidence'],
    committed_at: r.committed_at,
    rolled_back_at: r.rolled_back_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function adaptImportRow(
  r: HelmLiftingImportRowRow,
  athleteToPlayer: HelmToBaseballIdMap,
): BaseballLiftImportRowRow {
  return {
    id: r.id,
    import_run_id: r.import_run_id,
    team_id: r.organization_id,
    row_number: r.row_number,
    raw_json: r.raw_json,
    matched_player_id: r.matched_athlete_id
      ? (athleteToPlayer[r.matched_athlete_id] ?? r.matched_athlete_id)
      : null,
    match_status: r.match_status as BaseballLiftImportRowRow['match_status'],
    validation_error: r.validation_error,
    created_at: r.created_at,
  };
}

// -----------------------------------------------------------------------------
// Session → Assignment (used by the performance dashboard's Assignments tab)
//
// The unified helm model has no separate assignments table — a quick-assigned
// session IS the assignment. This adapter maps a helm_lifting_sessions row back
// to the BaseballLiftAssignmentRow shape the performance dashboard consumes.
// The inverse status map mirrors lifting.ts:toHelmSessionStatus in reverse.
// -----------------------------------------------------------------------------

function helmSessionStatusToAssignment(
  helmStatus: string,
): BaseballLiftAssignmentStatus {
  switch (helmStatus) {
    case 'started': return 'in_progress';
    case 'completed': return 'completed';
    case 'missed':
    case 'excused': return 'skipped';
    case 'modified': return 'in_progress';
    default: return 'assigned'; // 'assigned' and any unknown value
  }
}

export function adaptSessionToAssignment(
  r: HelmLiftingSessionRow,
  fallbackTeamId: string,
  athleteToPlayer: HelmToBaseballIdMap,
  exerciseId: string | null = null,
): BaseballLiftAssignmentRow {
  return {
    id: r.id,
    team_id: r.team_id ?? fallbackTeamId,
    player_id: athleteToPlayer[r.athlete_id] ?? r.athlete_id,
    group_scope: null,
    assigned_by_coach_id: null,
    exercise_id: exerciseId,
    title: r.title,
    due_date: r.scheduled_date,
    prescription: {},
    status: helmSessionStatusToAssignment(r.status),
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

// -----------------------------------------------------------------------------
// HelmLiftingReadinessCheckinRow → BaseballReadinessCheckinRow
//
// Field mapping:
//   checkin_date    → check_date
//   sleep_quality   → sleep_hours  (reverse quintile: quality*2 hours, capped at
//                     9 as a round-trip approximation; null stays null)
//   energy_level    → energy_level (1-5 scale; same semantics)
//   soreness_overall→ soreness_level (1-5; same semantics)
//   notes           → notes (may contain "arm_status: X | ..." encoded by
//                     submitReadinessCheckin in lifting.ts — we surface the raw
//                     notes to the UI rather than trying to re-parse it, since
//                     the readiness tab only renders the structured numeric fields
//                     + arm_status; arm_status is extracted via regex below)
// -----------------------------------------------------------------------------

/**
 * Extract arm_status from a helm_lifting_readiness_checkins.notes string, if it
 * was encoded there by submitReadinessCheckin (format: "arm_status: <value> | ...").
 * Shared by every readiness read model that needs arm_status but reads columns
 * directly (i.e. does not route through adaptHelmReadinessCheckin) because it
 * also needs helm-native fields (readiness_score/band/illness_flag/stress_level/
 * lower_body_status) the adapter's BaseballReadinessCheckinRow output shape does
 * not carry.
 */
export function extractArmStatusFromNotes(
  notes: string | null | undefined,
): BaseballReadinessCheckinRow['arm_status'] {
  if (!notes) return null;
  const m = notes.match(/arm_status:\s*(fresh|normal|tight|sore|pain)/i);
  return m?.[1] ? (m[1].toLowerCase() as BaseballReadinessCheckinRow['arm_status']) : null;
}

/** Reverse the sleep_quality 1-5 quintile → approximate hours (quintile * 2). Null-safe. */
export function sleepQualityToHours(sleepQuality: number | null | undefined): number | null {
  return sleepQuality != null ? sleepQuality * 2 : null;
}

export function adaptHelmReadinessCheckin(
  r: HelmLiftingReadinessCheckinRow,
  fallbackTeamId: string,
  athleteToPlayer: HelmToBaseballIdMap,
): BaseballReadinessCheckinRow {
  return {
    id: r.id,
    team_id: fallbackTeamId,
    player_id: athleteToPlayer[r.athlete_id] ?? r.athlete_id,
    check_date: r.checkin_date,
    sleep_hours: sleepQualityToHours(r.sleep_quality),
    energy_level: r.energy_level,
    soreness_level: r.soreness_overall,
    arm_status: extractArmStatusFromNotes(r.notes),
    mood: null,
    notes: r.notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}
