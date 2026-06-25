// =============================================================================
// src/lib/baseball/read-models/lift-builder.ts
//
// Wave 4 — Lift Builder read model.
//
// Provides three read-only data feeds for the advanced lift plan builder UI:
//
//   getBuilderExerciseLibrary(teamId)
//     — the full exercise catalogue available to a coach when constructing a
//       session plan, including the new stress-profile columns added to
//       helm_lifting_exercises (throwing_arm_stress, spine_loading, etc.).
//
//   getGroupSorenessFlags(scope, date)
//     — per-region soreness aggregates for a group's athletes within the 7-day
//       window ending at `date`. Powers the live conflict surface in the builder.
//
//   getGroupAvailability(scope, weekOf)
//     — best-effort per-player block schedule for the week starting at weekOf.
//       Uses baseball_games + baseball_events + baseball_availability_statuses
//       as sources. Returns 'unknown' blocks for any day where data is absent.
//
// SERVER-ONLY plain async (NOT 'use server'). All helm_lifting_* queries use
// fromUntyped() — the stress-profile columns are LIVE in prod but not yet in
// the generated database.ts types.
//
// DEPENDENCY: shared types are imported with `import type` from
//   '@/lib/baseball/exercise-conflict' (owned by the conflict-engine agent).
//   That file must exist before this module compiles.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';

/** Narrow alias for the resolved server Supabase client — avoids `any` on helper params. */
type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;
import {
  resolveBaseballLiftingOrg,
  resolveBaseballAthleteIds,
} from '@/lib/lifting/resolve-baseball-context';
import type {
  BuilderExercise,
  GroupSorenessFlag,
  GroupAvailabilityCell,
  StressLevel,
} from '@/lib/baseball/exercise-conflict';

// =============================================================================
// Internal helpers
// =============================================================================

/** Scope: caller identifies members by either a strength-group or a team. */
export type LiftBuilderScope = { groupId: string; teamId?: never } | { teamId: string; groupId?: never };

/** ISO date helper. */
function ymdOffset(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Parse a DB text value into a StressLevel, defaulting to 'none'. */
function toStressLevel(raw: unknown): StressLevel {
  if (raw === 'low' || raw === 'medium' || raw === 'high') return raw;
  return 'none';
}

/** Parse a DB text[] or comma-joined string into a string[]. */
function toStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  if (typeof raw === 'string' && raw.length > 0) return raw.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

type AnyRow = Record<string, unknown>;

/** Map a raw helm_lifting_exercises row (including stress columns) to BuilderExercise. */
function mapExerciseRow(row: AnyRow): BuilderExercise {
  return {
    id: row.id as string,
    name: row.name as string,
    category: (row.category as string) ?? 'accessory',
    movementPattern: (row.primary_pattern as string) ?? '',
    primaryBodyRegions: toStringArray(row.primary_body_regions),
    secondaryBodyRegions: toStringArray(row.secondary_body_regions),
    stressRegions: toStringArray(row.stress_regions),
    throwingArmStress: toStressLevel(row.throwing_arm_stress),
    spineLoading: toStressLevel(row.spine_loading),
    lowerBodyLoading: toStressLevel(row.lower_body_loading),
    rotationalStress: toStressLevel(row.rotational_stress),
    gripStress: toStressLevel(row.grip_stress),
    isPitcherSensitive: Boolean(row.is_pitcher_sensitive),
    equipment: toStringArray(row.equipment),
    demoVideoUrl: (row.video_url as string | null) ?? null,
  };
}

/**
 * Resolve player IDs from a scope (group members or team members).
 * Returns { playerIds, teamId } — teamId is needed for downstream queries.
 */
async function resolveScope(
  supabase: SupabaseServerClient,
  scope: LiftBuilderScope,
): Promise<{ playerIds: string[]; teamId: string | null }> {
  if ('groupId' in scope && scope.groupId) {
    // Resolve group → team (for org lookup) + member player IDs.
    const { data: groupRow } = await supabase
      .from('baseball_strength_groups')
      .select('team_id')
      .eq('id', scope.groupId)
      .maybeSingle();
    const teamId = (groupRow as { team_id: string } | null)?.team_id ?? null;

    const { data: members } = await supabase
      .from('baseball_strength_group_members')
      .select('player_id')
      .eq('group_id', scope.groupId);
    const playerIds = [...new Set(
      ((members ?? []) as Array<{ player_id: string }>).map((m) => m.player_id),
    )];

    return { playerIds, teamId };
  }

  // Team-scoped: all active roster members.
  const teamId: string | null = (scope as { teamId: string }).teamId ?? null;
  const { data: members } = await supabase
    .from('baseball_team_members')
    .select('player_id')
    .eq('team_id', teamId);
  const playerIds = [...new Set(
    ((members ?? []) as Array<{ player_id: string }>).map((m) => m.player_id),
  )];

  return { playerIds, teamId };
}

// =============================================================================
// getBuilderExerciseLibrary
// =============================================================================

/**
 * Return the full exercise catalogue available to a coach on this team,
 * including the new stress-profile columns. Combines:
 *   - Team / org-specific exercises (organization_id scoped)
 *   - Globally seeded exercises (is_global = true)
 *
 * All queries use fromUntyped because the stress-profile columns are not yet
 * in the generated database.ts.
 */
export async function getBuilderExerciseLibrary(teamId: string): Promise<BuilderExercise[]> {
  const supabase = await createClient();

  // Resolve org context to scope the exercise query.
  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  if (!liftCtx) return [];

  const { organizationId } = liftCtx;

  // Select both stress columns (LIVE in prod) and the base columns.
  // The DB may return null for stress columns on older rows — mapExerciseRow handles this.
  const selectCols = [
    'id', 'name', 'category', 'primary_pattern',
    'equipment', 'video_url', 'is_global', 'is_active',
    // Stress-profile columns (LIVE in prod, not in generated types):
    'throwing_arm_stress', 'spine_loading', 'lower_body_loading',
    'rotational_stress', 'grip_stress', 'is_pitcher_sensitive',
    'primary_body_regions', 'secondary_body_regions', 'stress_regions',
  ].join(', ');

  const { data: rows } = await fromUntyped(supabase, 'helm_lifting_exercises')
    .select(selectCols)
    .eq('sport', 'baseball')
    .eq('is_active', true)
    .or(`organization_id.eq.${organizationId},is_global.eq.true`)
    .order('name', { ascending: true }) as { data: AnyRow[] | null };

  return (rows ?? []).map(mapExerciseRow);
}

// =============================================================================
// getGroupSorenessFlags
// =============================================================================

/**
 * Aggregate recent soreness for a group's athletes into per-region flags.
 * Looks back 7 days from `date` (inclusive). Returns one GroupSorenessFlag
 * per body region where at least one athlete reported soreness.
 *
 * Resolves soreness via:
 *   helm_lifting_readiness_checkins (date filter) →
 *   helm_lifting_soreness_maps (region + severity per athlete)
 */
export async function getGroupSorenessFlags(
  scope: LiftBuilderScope,
  date: string,
): Promise<GroupSorenessFlag[]> {
  const supabase = await createClient();

  const { playerIds, teamId } = await resolveScope(supabase, scope);
  if (playerIds.length === 0 || !teamId) return [];

  const liftCtx = await resolveBaseballLiftingOrg(teamId);
  if (!liftCtx) return [];

  // Resolve baseball_players.id → helm_lifting_athletes.id
  const athleteMap = await resolveBaseballAthleteIds(liftCtx.organizationId, playerIds);
  const athleteIds = Object.values(athleteMap);
  if (athleteIds.length === 0) return [];

  const windowStart = ymdOffset(date, -7);

  // Step 1: fetch checkins in the window for these athletes.
  const { data: checkinRows } = await fromUntyped(supabase, 'helm_lifting_readiness_checkins')
    .select('id, athlete_id, checkin_date')
    .in('athlete_id', athleteIds)
    .gte('checkin_date', windowStart)
    .lte('checkin_date', date) as {
    data: Array<{ id: string; athlete_id: string; checkin_date: string }> | null;
  };

  const checkinIds = (checkinRows ?? []).map((c) => c.id);
  if (checkinIds.length === 0) return [];

  // Step 2: fetch soreness maps for those checkins.
  const { data: sorenessRows } = await fromUntyped(supabase, 'helm_lifting_soreness_maps')
    .select('checkin_id, athlete_id, body_region, severity')
    .in('checkin_id', checkinIds) as {
    data: Array<{ checkin_id: string; athlete_id: string; body_region: string; severity: number }> | null;
  };

  if (!sorenessRows || sorenessRows.length === 0) return [];

  // Aggregate: per body_region → { athleteSet, maxSeverity }
  const regionMap = new Map<string, { athletes: Set<string>; maxSeverity: number }>();
  for (const row of sorenessRows) {
    const region = row.body_region;
    if (!region) continue;
    const existing = regionMap.get(region) ?? { athletes: new Set<string>(), maxSeverity: 0 };
    existing.athletes.add(row.athlete_id);
    existing.maxSeverity = Math.max(existing.maxSeverity, row.severity ?? 0);
    regionMap.set(region, existing);
  }

  const flags: GroupSorenessFlag[] = [];
  for (const [bodyRegion, agg] of regionMap) {
    flags.push({
      bodyRegion,
      count: agg.athletes.size,
      maxSeverity: agg.maxSeverity,
    });
  }

  // Sort descending by maxSeverity, then alphabetically.
  flags.sort((a, b) => b.maxSeverity - a.maxSeverity || a.bodyRegion.localeCompare(b.bodyRegion));

  return flags;
}

// =============================================================================
// getGroupAvailability
// =============================================================================

/**
 * Best-effort weekly schedule for all players in scope.
 *
 * Slot keys are the 7 ISO date strings for the week beginning at `weekOf`.
 * Status priority (highest wins for a slot):
 *   'game'        — team has a game on that date (baseball_games)
 *   'practice'    — team has a practice or mandatory event (baseball_events)
 *   'unavailable' — player has an active availability hold covering the slot
 *   'available'   — default when no conflicting source is found
 *
 * NOTE: 'class' status is not populated — there is no class-schedule source
 * for baseball athletes. All class blocks will appear as 'unknown' (or
 * 'available') until such a source is integrated.
 *
 * If resolving org or members fails, returns cells with all-'unknown' blocks.
 */
export async function getGroupAvailability(
  scope: LiftBuilderScope,
  weekOf: string,
): Promise<GroupAvailabilityCell[]> {
  const supabase = await createClient();

  const { playerIds, teamId } = await resolveScope(supabase, scope);

  // Build the 7 date slots for the week.
  const slots: string[] = Array.from({ length: 7 }, (_, i) => ymdOffset(weekOf, i));
  const weekEnd: string = ymdOffset(weekOf, 6);

  // If we have no players, return empty.
  if (playerIds.length === 0) return [];

  // Resolve player names for the cells.
  const { data: playerRows } = await supabase
    .from('baseball_players')
    .select('id, first_name, last_name')
    .in('id', playerIds) as {
    data: Array<{ id: string; first_name: string | null; last_name: string | null }> | null;
  };
  const nameByPlayer = new Map<string, string>(
    (playerRows ?? []).map((p) => [
      p.id,
      [p.first_name, p.last_name].filter(Boolean).join(' ') || p.id,
    ]),
  );

  // If no teamId, return all-unknown blocks.
  if (!teamId) {
    return playerIds.map((pid) => ({
      playerId: pid,
      playerName: nameByPlayer.get(pid) ?? pid,
      blocks: slots.map((slot) => ({ slot, status: 'unknown' as const })),
    }));
  }

  // Fetch team game dates for the week.
  const gameDates = new Set<string>();
  {
    const { data: games } = await supabase
      .from('baseball_games')
      .select('game_date')
      .eq('team_id', teamId)
      .gte('game_date', weekOf)
      .lte('game_date', weekEnd) as { data: Array<{ game_date: string }> | null };
    for (const g of games ?? []) {
      if (g.game_date) gameDates.add(g.game_date.slice(0, 10));
    }
  }

  // Fetch team practice / mandatory events for the week.
  const practiceDates = new Set<string>();
  {
    const { data: events } = await supabase
      .from('baseball_events')
      .select('start_time, event_type, status')
      .eq('team_id', teamId)
      .gte('start_time', `${weekOf}T00:00:00`)
      .lte('start_time', `${weekEnd}T23:59:59`)
      .neq('status', 'cancelled') as {
      data: Array<{ start_time: string; event_type: string; status: string | null }> | null;
    };
    for (const ev of events ?? []) {
      const evType = (ev.event_type ?? '').toLowerCase();
      if (evType === 'practice' || evType === 'mandatory' || evType === 'workout') {
        practiceDates.add((ev.start_time ?? '').slice(0, 10));
      }
    }
  }

  // Fetch player-level availability holds for the week.
  // baseball_availability_statuses: player_id, status, starts_at, (optional ends_at)
  type AvailRow = { player_id: string; status: string; starts_at: string; ends_at?: string | null };
  const unavailByPlayer = new Map<string, Set<string>>();
  {
    const { data: availRows } = await supabase
      .from('baseball_availability_statuses')
      .select('player_id, status, starts_at, ends_at')
      .eq('team_id', teamId)
      .in('player_id', playerIds)
      .in('status', ['hold', 'injured', 'suspended', 'unavailable', 'limited']) as {
      data: AvailRow[] | null;
    };
    for (const av of availRows ?? []) {
      if (!av.player_id || !av.starts_at) continue;
      // Expand each hold across its full date range within the visible week.
      // Open-ended holds (no ends_at) are treated as ongoing through week's end.
      const start = av.starts_at.slice(0, 10);
      const end = av.ends_at ? av.ends_at.slice(0, 10) : weekEnd;
      const from = start > weekOf ? start : weekOf;
      const to = end < weekEnd ? end : weekEnd;
      if (from > to) continue;
      const set = unavailByPlayer.get(av.player_id) ?? new Set<string>();
      for (const slot of slots) {
        if (slot >= from && slot <= to) set.add(slot);
      }
      unavailByPlayer.set(av.player_id, set);
    }
  }

  // Build the cells.
  return playerIds.map((pid): GroupAvailabilityCell => {
    const playerUnavailDates = unavailByPlayer.get(pid) ?? new Set<string>();
    const blocks = slots.map((slot) => {
      let status: GroupAvailabilityCell['blocks'][number]['status'] = 'available';
      if (gameDates.has(slot)) {
        status = 'game';
      } else if (practiceDates.has(slot)) {
        status = 'practice';
      } else if (playerUnavailDates.has(slot)) {
        status = 'unavailable';
      }
      return { slot, status };
    });

    return {
      playerId: pid,
      playerName: nameByPlayer.get(pid) ?? pid,
      blocks,
    };
  });
}
