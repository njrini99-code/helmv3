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
import { OPEN_SIGNAL_DISPOSITIONS } from '@/lib/types/baseball-signals';

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

/** Row shape selected from `baseball_signals` for the open-signal aggregation. */
interface OpenSignalRow {
  player_id: string | null;
  severity: string | null;
}

/** Row shape selected from `baseball_players`, joined in a second round-trip. */
interface PlayerNameRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
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
 * PLAYER FOCUS — players with open signals that need staff attention,
 * surfaced as the "who to discuss in this meeting" rail.
 *
 * Source: baseball_signals (team_id, player_id, severity, disposition),
 * filtered to `OPEN_SIGNAL_DISPOSITIONS` (the same "still on the triage
 * board" definition the signal inbox uses) and grouped by player_id to
 * compute `openCount` (total open signals) and `criticalCount` (open signals
 * with severity='critical'). Player names are resolved in a second
 * round-trip to `baseball_players`. Sorted by criticalCount desc, then
 * openCount desc, so the players most in need of discussion lead the rail.
 */
export async function loadPlayerFocus(
  supabase: Client,
  teamId: string,
): Promise<DecisionRoomPlayerFocus[]> {
  if (!teamId) return [];

  const { data, error } = await supabase
    .from('baseball_signals')
    .select('player_id, severity')
    .eq('team_id', teamId)
    .not('player_id', 'is', null)
    .in('disposition', Array.from(OPEN_SIGNAL_DISPOSITIONS))
    .limit(MAX_ROWS);

  if (error) {
    throw new Error(`loadPlayerFocus: signals query failed — ${error.message}`);
  }

  const rows = (data ?? []) as OpenSignalRow[];

  const counts = new Map<string, { open: number; critical: number }>();
  for (const row of rows) {
    if (!row.player_id) continue;
    const entry = counts.get(row.player_id) ?? { open: 0, critical: 0 };
    entry.open += 1;
    if (row.severity === 'critical') entry.critical += 1;
    counts.set(row.player_id, entry);
  }

  if (counts.size === 0) return [];

  const playerIds = Array.from(counts.keys());
  const { data: playerRows, error: playerErr } = await supabase
    .from('baseball_players')
    .select('id, first_name, last_name')
    .in('id', playerIds);

  if (playerErr) {
    throw new Error(`loadPlayerFocus: players query failed — ${playerErr.message}`);
  }

  const names = new Map<string, string>();
  for (const p of (playerRows ?? []) as PlayerNameRow[]) {
    const name = fullName(p.first_name, p.last_name);
    if (name) names.set(p.id, name);
  }

  return playerIds
    .map((playerId) => {
      const c = counts.get(playerId) as { open: number; critical: number };
      return {
        playerId,
        name: names.get(playerId) ?? 'Unnamed player',
        openCount: c.open,
        criticalCount: c.critical,
      };
    })
    .sort((a, b) => b.criticalCount - a.criticalCount || b.openCount - a.openCount);
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
