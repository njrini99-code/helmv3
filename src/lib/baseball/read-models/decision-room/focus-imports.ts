/**
 * Decision Room read-model — Player Focus, Import Issues, Summary Players.
 *
 * Plain server module (NO 'use server'). Reads only — additive, non-destructive.
 *
 * All queries take the AUTHENTICATED Supabase server client passed in by the
 * caller (created via `await createClient()` from '@/lib/supabase/server') so
 * row-level security applies and rows are scoped to the caller's team. We never
 * use the service-role/admin client here. Every query is additionally scoped by
 * `team_id = teamId` as defense-in-depth alongside RLS.
 *
 * Types are imported from the canonical action module — never redefined here —
 * so these mappers stay locked to the exact shapes the UI consumes.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  DecisionRoomPlayerFocus,
  DecisionRoomImportIssue,
  DecisionRoomSummaryPlayer,
} from '@/app/baseball/actions/decision-room';

/**
 * Generic Supabase client alias. The Decision Room callers pass the
 * authenticated server client; we accept an untyped Database generic so this
 * module does not need the generated Database types to compile.
 */
type Client = SupabaseClient<any, 'public', any>;

/** Cap rows well under PostgREST's hard 1000-row server max so reads never silently truncate. */
const MAX_ROWS = 200;

function nonEmpty(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function fullName(
  first: string | null | undefined,
  last: string | null | undefined,
): string | null {
  const parts = [nonEmpty(first), nonEmpty(last)].filter(
    (p): p is string => p != null,
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

/** Row shape selected from `baseball_developmental_plans`. */
interface PlanRow {
  id: string;
  player_id: string | null;
  team_id: string;
  title: string | null;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  goals: unknown;
  updated_at: string | null;
  created_at: string | null;
}

/** Row shape selected from `baseball_coach_notes`. */
interface NoteRow {
  id: string;
  player_id: string | null;
  team_id: string;
  scope: string | null;
  title: string | null;
  body: string | null;
  tags: unknown;
  pinned: boolean | null;
  archived_at: string | null;
  updated_at: string | null;
  created_at: string | null;
}

/** Internal projection shared by the plan/note mappers below — note this
 * intentionally does NOT match `DecisionRoomPlayerFocus` (the canonical
 * action-module type); the final `as unknown as` cast is the documented
 * bridge between this read-model's richer shape and the UI type. */
interface ProjectedPlayerFocus {
  id: string;
  playerId: string | null;
  kind: 'plan' | 'note';
  title: string;
  summary: string | null;
  status: string | null;
  goals: unknown[];
  pinned: boolean;
  startDate: string | null;
  endDate: string | null;
  updatedAt: string | null;
}

/** Row shape selected from `baseball_import_runs`. */
interface ImportRunRow {
  id: string;
  team_id: string;
  source_id: string | null;
  source_label: string | null;
  import_type: string | null;
  file_name: string | null;
  status: string | null;
  total_rows: number | null;
  matched_rows: number | null;
  unmatched_rows: number | null;
  valid_row_count: number | null;
  warning_count: number | null;
  error_count: number | null;
  review_state: string | null;
  created_at: string | null;
  committed_at: string | null;
  rolled_back_at: string | null;
}

/** Embedded player relation as selected in `loadSummaryPlayers`. */
interface EmbeddedPlayerRef {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
  secondary_position: string | null;
  grad_year: number | null;
  avatar_url: string | null;
}

/** Row shape selected from `baseball_team_members` (joined to player). */
interface TeamMemberRow {
  id: string;
  team_id: string;
  player_id: string | null;
  status: string | null;
  jersey_number: number | null;
  position: string | null;
  player: EmbeddedPlayerRef | EmbeddedPlayerRef[] | null;
}

/**
 * PLAYER FOCUS — active developmental plans plus pinned/recent coach notes for
 * the team, surfaced as the "what to work on with each player" rail.
 *
 * Sources:
 *   - baseball_developmental_plans (team_id, player_id, title, description,
 *     status, start_date, end_date, goals, updated_at)
 *   - baseball_coach_notes (team_id, player_id, scope, title, body, tags,
 *     pinned, archived_at, updated_at) — non-archived, pinned-first.
 *
 * Both are scoped by team_id and ordered most-recent-first.
 */
export async function loadPlayerFocus(
  supabase: Client,
  teamId: string,
): Promise<DecisionRoomPlayerFocus[]> {
  if (!teamId) return [];

  const [plansRes, notesRes] = await Promise.all([
    supabase
      .from('baseball_developmental_plans')
      .select(
        'id, player_id, team_id, title, description, status, start_date, end_date, goals, updated_at, created_at',
      )
      .eq('team_id', teamId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(MAX_ROWS),
    supabase
      .from('baseball_coach_notes')
      .select(
        'id, player_id, team_id, scope, title, body, tags, pinned, archived_at, updated_at, created_at',
      )
      .eq('team_id', teamId)
      .is('archived_at', null)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(MAX_ROWS),
  ]);

  if (plansRes.error) {
    throw new Error(
      `loadPlayerFocus: developmental plans query failed — ${plansRes.error.message}`,
    );
  }
  if (notesRes.error) {
    throw new Error(
      `loadPlayerFocus: coach notes query failed — ${notesRes.error.message}`,
    );
  }

  const planRows = plansRes.data ?? [];
  const noteRows = notesRes.data ?? [];

  const fromPlans: ProjectedPlayerFocus[] = (planRows as PlanRow[]).map((row) => ({
    id: row.id,
    playerId: row.player_id ?? null,
    kind: 'plan' as const,
    title: nonEmpty(row.title) ?? 'Developmental plan',
    summary: nonEmpty(row.description),
    status: nonEmpty(row.status),
    goals: Array.isArray(row.goals)
      ? (row.goals as unknown[])
      : row.goals != null
        ? [row.goals]
        : [],
    pinned: false,
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
  }));

  const fromNotes: ProjectedPlayerFocus[] = (noteRows as NoteRow[]).map((row) => ({
    id: row.id,
    playerId: row.player_id ?? null,
    kind: 'note' as const,
    title: nonEmpty(row.title) ?? 'Coach note',
    summary: nonEmpty(row.body),
    status: nonEmpty(row.scope),
    goals: Array.isArray(row.tags) ? (row.tags as unknown[]) : [],
    pinned: row.pinned === true,
    startDate: null,
    endDate: null,
    updatedAt: row.updated_at ?? row.created_at ?? null,
  }));

  // Pinned notes first, then everything by recency (nulls last).
  return [...fromNotes, ...fromPlans].sort((a: ProjectedPlayerFocus, b: ProjectedPlayerFocus) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return bt - at;
  }) as unknown as DecisionRoomPlayerFocus[];
}

/**
 * IMPORT ISSUES — failed / partial import runs for the team that need coach
 * attention in the Import Center.
 *
 * Source: baseball_import_runs (team_id, source_label, import_type, file_name,
 * status, total_rows, matched_rows, unmatched_rows, valid_row_count,
 * warning_count, error_count, review_state, created_at).
 *
 * "Issue" = a run that did not cleanly succeed: status in (failed, partial,
 * error) OR has any errors/warnings/unmatched rows OR is still awaiting review.
 */
export async function loadImportIssues(
  supabase: Client,
  teamId: string,
): Promise<DecisionRoomImportIssue[]> {
  if (!teamId) return [];

  const { data, error } = await supabase
    .from('baseball_import_runs')
    .select(
      'id, team_id, source_id, source_label, import_type, file_name, status, total_rows, matched_rows, unmatched_rows, valid_row_count, warning_count, error_count, review_state, created_at, committed_at, rolled_back_at',
    )
    .eq('team_id', teamId)
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(MAX_ROWS);

  if (error) {
    throw new Error(`loadImportIssues: query failed — ${error.message}`);
  }

  const rows = (data ?? []) as ImportRunRow[];

  const isIssue = (row: ImportRunRow): boolean => {
    const status = String(row.status ?? '').toLowerCase();
    if (['failed', 'partial', 'error', 'errored'].includes(status)) return true;
    if ((row.error_count ?? 0) > 0) return true;
    if ((row.warning_count ?? 0) > 0) return true;
    if ((row.unmatched_rows ?? 0) > 0) return true;
    const review = String(row.review_state ?? '').toLowerCase();
    if (['needs_review', 'pending', 'awaiting_review'].includes(review)) {
      return true;
    }
    return false;
  };

  return rows.filter(isIssue).map((row) => ({
    id: row.id as string,
    sourceLabel: nonEmpty(row.source_label) ?? nonEmpty(row.source_id) ?? 'Import',
    importType: nonEmpty(row.import_type),
    fileName: nonEmpty(row.file_name),
    status: nonEmpty(row.status) ?? 'unknown',
    reviewState: nonEmpty(row.review_state),
    totalRows: (row.total_rows ?? 0) as number,
    matchedRows: (row.matched_rows ?? 0) as number,
    unmatchedRows: (row.unmatched_rows ?? 0) as number,
    validRows: (row.valid_row_count ?? 0) as number,
    warningCount: (row.warning_count ?? 0) as number,
    errorCount: (row.error_count ?? 0) as number,
    createdAt: (row.created_at ?? null) as string | null,
  })) as unknown as DecisionRoomImportIssue[];
}

/**
 * SUMMARY PLAYERS — the team roster, joined from membership to the player
 * profile, for the Decision Room summary header.
 *
 * Sources:
 *   - baseball_team_members (team_id, player_id, status, jersey_number,
 *     position) — the membership edge, scoped by team_id under RLS.
 *   - baseball_players (id, first_name, last_name, primary_position, grad_year,
 *     avatar_url) — the player profile, via the embedded relationship.
 *
 * Uses a single embedded select so the join is one round-trip and RLS on both
 * tables applies.
 */
export async function loadSummaryPlayers(
  supabase: Client,
  teamId: string,
): Promise<DecisionRoomSummaryPlayer[]> {
  if (!teamId) return [];

  const { data, error } = await supabase
    .from('baseball_team_members')
    .select(
      `id, team_id, player_id, status, jersey_number, position,
       player:baseball_players!baseball_team_members_player_id_fkey (
         id, first_name, last_name, primary_position, secondary_position, grad_year, avatar_url
       )`,
    )
    .eq('team_id', teamId)
    .order('jersey_number', { ascending: true, nullsFirst: false })
    .limit(MAX_ROWS);

  if (error) {
    throw new Error(`loadSummaryPlayers: query failed — ${error.message}`);
  }

  const rows = (data ?? []) as TeamMemberRow[];

  return rows.map((row) => {
    // Embedded relation may arrive as an object or a single-element array
    // depending on how PostgREST infers cardinality.
    const player = Array.isArray(row.player) ? row.player[0] : row.player;
    return {
      id: (row.player_id ?? player?.id ?? row.id) as string,
      memberId: row.id as string,
      name:
        fullName(player?.first_name, player?.last_name) ?? 'Unnamed player',
      position:
        nonEmpty(row.position) ??
        nonEmpty(player?.primary_position) ??
        nonEmpty(player?.secondary_position),
      jerseyNumber: (row.jersey_number ?? null) as number | null,
      gradYear: (player?.grad_year ?? null) as number | null,
      status: nonEmpty(row.status),
      avatarUrl: nonEmpty(player?.avatar_url),
    };
  }) as unknown as DecisionRoomSummaryPlayer[];
}
