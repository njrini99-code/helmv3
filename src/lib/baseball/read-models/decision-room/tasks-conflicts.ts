/**
 * Coach Room (Decision Room) read-model: Open Tasks + Class/Scheduling Conflicts.
 *
 * Plain server module (NO 'use server') consumed by the Decision Room assembler
 * in src/app/baseball/actions/decision-room.ts. Reads are scoped to the caller's
 * team and run through the AUTHENTICATED, RLS-respecting server Supabase client
 * passed in by the caller (never the service-role/admin client).
 *
 * Tables:
 *   - baseball_tasks            -> DecisionRoomOpenTask[]   (open / overdue tasks)
 *   - baseball_class_conflicts  -> DecisionRoomConflict[]   (unresolved conflicts)
 *
 * Additive, read-only. No mutations.
 */

import type { createClient } from '@/lib/supabase/server';
import type {
  DecisionRoomOpenTask,
  DecisionRoomConflict,
} from '@/app/baseball/actions/decision-room';

/**
 * The authenticated, cookie-bound server client (RLS applies). The Decision Room
 * assembler creates this via `await createClient()` and threads it into each
 * read-model so every query is scoped to the signed-in coach's team.
 */
type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Defensive cap — a single team's open task / conflict set is tiny; stay well
 *  under the PostgREST 1000-row hard cap without needing pagination. */
const MAX_ROWS = 200;

/**
 * baseball_tasks.status CHECK = pending | in_progress | completed | overdue | cancelled.
 * "Open / overdue" = anything still actionable, i.e. NOT completed and NOT cancelled.
 */
const OPEN_TASK_STATUSES = ['pending', 'in_progress', 'overdue'] as const;

/**
 * baseball_class_conflicts.disposition CHECK = open | acknowledged | resolved | dismissed | expired.
 * "Unresolved" = still needs a coach decision, i.e. open or acknowledged.
 */
const UNRESOLVED_DISPOSITIONS = ['open', 'acknowledged'] as const;

/**
 * Map the DB severity vocabulary (hard | soft | watch | informational) onto the
 * tri-level severity the Decision Room UI renders (critical | warning | info).
 *   hard          -> critical (hard academic/travel conflict; must resolve)
 *   soft          -> warning  (resolvable overlap)
 *   watch / info  -> info
 */
function mapConflictSeverity(dbSeverity: string | null): DecisionRoomConflict['severity'] {
  switch (dbSeverity) {
    case 'hard':
      return 'critical';
    case 'soft':
      return 'warning';
    case 'watch':
    case 'informational':
    default:
      return 'info';
  }
}

function fullName(first: string | null | undefined, last: string | null | undefined): string | null {
  const name = [first ?? '', last ?? ''].join(' ').trim();
  return name.length > 0 ? name : null;
}

/**
 * Open / overdue tasks for a team, soonest-due first.
 *
 * Returns an honest empty array when the team has no actionable tasks.
 */
export async function loadOpenTasks(
  supabase: ServerSupabaseClient,
  teamId: string,
): Promise<DecisionRoomOpenTask[]> {
  if (!teamId) return [];

  const { data, error } = await supabase
    .from('baseball_tasks')
    .select('id, title, due_date, status, priority')
    .eq('team_id', teamId)
    .in('status', OPEN_TASK_STATUSES as unknown as string[])
    // Soonest due first; rows with no due date sort last so dated work surfaces.
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (error || !data) return [];

  return data.map((row): DecisionRoomOpenTask => ({
    id: row.id as string,
    title: (row.title as string | null) ?? 'Untitled task',
    dueDate: (row.due_date as string | null) ?? null,
    status: (row.status as string | null) ?? 'pending',
    priority: (row.priority as string | null) ?? null,
  }));
}

/**
 * Unresolved class / scheduling conflicts for a team, most-severe first.
 *
 * Excludes resolved / dismissed / expired dispositions and any row whose
 * `expires_at` has already passed. Player name is read through the FK-embedded
 * baseball_players row (RLS still applies — invisible players resolve to null,
 * which the UI renders as "Unknown").
 */
export async function loadConflicts(
  supabase: ServerSupabaseClient,
  teamId: string,
): Promise<DecisionRoomConflict[]> {
  if (!teamId) return [];

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('baseball_class_conflicts')
    .select(
      `
        id,
        severity,
        obligation_kind,
        obligation_label,
        obligation_start,
        why_it_matters,
        recommended_action_label,
        disposition,
        expires_at,
        created_at,
        player:baseball_players!baseball_class_conflicts_player_id_fkey (
          first_name,
          last_name
        )
      `,
    )
    .eq('team_id', teamId)
    .in('disposition', UNRESOLVED_DISPOSITIONS as unknown as string[])
    // Not yet expired: either no expiry, or expiry still in the future.
    .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (error || !data) return [];

  // Most-severe first (critical > warning > info), preserving recency within a tier.
  const severityRank: Record<DecisionRoomConflict['severity'], number> = {
    critical: 0,
    warning: 1,
    info: 2,
  };

  return data
    .map((row): DecisionRoomConflict => {
      const playerRel = row.player as
        | { first_name: string | null; last_name: string | null }
        | { first_name: string | null; last_name: string | null }[]
        | null;
      // PostgREST may surface a to-one embed as an object or a single-element array.
      const player = Array.isArray(playerRel) ? (playerRel[0] ?? null) : playerRel;

      return {
        id: row.id as string,
        severity: mapConflictSeverity(row.severity as string | null),
        playerName: fullName(player?.first_name, player?.last_name),
        obligationKind: (row.obligation_kind as string | null) ?? 'event',
        obligationLabel: (row.obligation_label as string | null) ?? null,
        whyItMatters: (row.why_it_matters as string | null) ?? null,
        recommendedActionLabel: (row.recommended_action_label as string | null) ?? null,
      };
    })
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}
