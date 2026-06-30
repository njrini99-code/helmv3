/**
 * Decision Room read-model — Agenda + Decision Ledger.
 *
 * Backs the Coach Room (Decision Room) agenda rail and the decision ledger by
 * reading the EXISTING prod tables:
 *   - `baseball_meeting_items`  -> DecisionRoomAgendaItem[]
 *   - `baseball_decision_log`   -> DecisionRoomLedgerEntry[]
 *
 * RLS SAFETY: callers MUST pass the AUTHENTICATED Supabase server client
 * (`await createClient()` from '@/lib/supabase/server') so row-level security
 * applies. Every query is additionally `.eq('team_id', teamId)` as
 * defense-in-depth so rows are scoped to the caller's team and never leak
 * cross-team data. Do NOT pass the service-role/admin client here.
 *
 * HONESTY: returns real rows or honest empty arrays. No fabricated data. When a
 * concept has no backing column it is omitted (see task followups).
 *
 * TYPES: `DecisionRoomAgendaItem` / `DecisionRoomLedgerEntry` are imported from
 * the canonical action module — never redefined here — so these mappers stay
 * locked to the exact shapes the UI consumes. The final `as unknown as T[]`
 * cast mirrors the sibling read-models (effectiveness/focus-imports/lift) in
 * this directory and is the repo's sanctioned bridge between a snake_case row
 * and the camelCase UI type.
 *
 * This is a plain server module — NO 'use server'. Reads only; no writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  DecisionRoomAgendaItem,
  DecisionRoomLedgerEntry,
} from '@/lib/baseball/decision-room/types';

/**
 * Generic Supabase client alias. The Decision Room callers pass the
 * authenticated server client; we accept an untyped Database generic so this
 * module does not need the generated Database types to compile. Matches the
 * sibling read-models in this directory.
 */
type Client = SupabaseClient<any, 'public', any>;

/**
 * Hard server-side row cap, well under PostgREST's 1000-row server max so reads
 * never silently truncate. The Decision Room only surfaces the live agenda and
 * the most recent ledger entries, so this bound is generous.
 */
const MAX_ROWS = 200;

/** Trim to a non-empty string or null (no empty-string noise into the UI). */
function nonEmpty(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Coerce a Postgres text/uuid array column into a plain string[] (honest empty). */
function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string' && v.length > 0);
  }
  return [];
}

/**
 * Open agenda statuses sort ahead of resolved ones. `baseball_meeting_items`
 * has no numeric priority column, so we derive an ordering rank from `status`
 * (verified columns: status, resolution, discussed_at, resolved_at). Lower rank
 * surfaces first.
 */
function agendaStatusRank(status: string | null): number {
  const s = (status ?? '').toLowerCase();
  switch (s) {
    case 'open':
    case 'new':
    case 'pending':
      return 0;
    case 'in_progress':
    case 'in-progress':
    case 'discussing':
    case 'discussed':
      return 1;
    case 'deferred':
    case 'parked':
    case 'tabled':
      return 2;
    case 'resolved':
    case 'closed':
    case 'done':
      return 3;
    default:
      return 1; // unknown / future statuses sort with active work, not resolved
  }
}

/**
 * Row shape selected from `baseball_meeting_items` (mirrors the live schema
 * verified via information_schema — no guessed columns).
 */
interface MeetingItemRow {
  id: string;
  team_id: string;
  source_signal_id: string | null;
  source_action_id: string | null;
  player_id: string | null;
  title: string;
  detail: string | null;
  source_refs: unknown;
  owner_coach_id: string | null;
  status: string;
  resolution: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  discussed_at: string | null;
  discussed_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * AGENDA — the Decision Room meeting agenda for a team.
 *
 * Source: `baseball_meeting_items`, scoped by team_id under RLS. Ordered by
 * status (open/active first, resolved last) then by recency of creation so the
 * freshest open items lead the rail.
 *
 * @param supabase AUTHENTICATED server client (RLS-bound to the caller).
 * @param teamId   The caller's team id; rows are additionally scoped to it.
 */
export async function loadAgendaItems(
  supabase: Client,
  teamId: string,
): Promise<DecisionRoomAgendaItem[]> {
  if (!teamId) return [];

  const { data, error } = await supabase
    .from('baseball_meeting_items')
    .select(
      'id, team_id, source_signal_id, source_action_id, player_id, title, detail, source_refs, owner_coach_id, status, resolution, resolved_at, resolved_by, discussed_at, discussed_by, created_by, created_at, updated_at',
    )
    .eq('team_id', teamId)
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(MAX_ROWS);

  if (error || !data) return [];

  const rows = data as MeetingItemRow[];

  return rows
    .map((row) => ({
      id: row.id,
      teamId: row.team_id,
      playerId: row.player_id,
      title: nonEmpty(row.title) ?? 'Agenda item',
      detail: nonEmpty(row.detail),
      status: nonEmpty(row.status) ?? 'open',
      resolution: nonEmpty(row.resolution),
      ownerCoachId: row.owner_coach_id,
      sourceSignalId: row.source_signal_id,
      sourceActionId: row.source_action_id,
      sourceRefs: row.source_refs ?? null,
      discussedAt: row.discussed_at,
      discussedBy: row.discussed_by,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
    // Stable client-side ordering: open/active items before resolved ones, then
    // newest-created first within each rank.
    .sort((a, b) => {
      const rankDelta = agendaStatusRank(a.status) - agendaStatusRank(b.status);
      if (rankDelta !== 0) return rankDelta;
      const at = a.createdAt ? Date.parse(a.createdAt) : 0;
      const bt = b.createdAt ? Date.parse(b.createdAt) : 0;
      return bt - at;
    }) as unknown as DecisionRoomAgendaItem[];
}

/**
 * Row shape selected from `baseball_decision_log` (mirrors the live schema
 * verified via information_schema — no guessed columns). `participants` is a
 * uuid[], `tags` is a text[], `source_refs` is jsonb.
 */
interface DecisionLogRow {
  id: string;
  team_id: string;
  player_id: string | null;
  meeting_item_id: string | null;
  signal_id: string | null;
  action_id: string | null;
  decision_kind: string;
  title: string;
  rationale: string | null;
  decided_by: string | null;
  decided_at: string;
  participants: string[] | null;
  outcome_summary: string | null;
  source_refs: unknown;
  tags: string[] | null;
  created_by: string | null;
  created_at: string;
}

/**
 * DECISION LEDGER — the team's logged decisions, most recent first.
 *
 * Source: `baseball_decision_log`, scoped by team_id under RLS. Ordered by
 * `decided_at` (the canonical "when the decision was made" timestamp) newest
 * first, falling back to `created_at` for ties.
 *
 * @param supabase AUTHENTICATED server client (RLS-bound to the caller).
 * @param teamId   The caller's team id; rows are additionally scoped to it.
 */
export async function loadDecisionLedger(
  supabase: Client,
  teamId: string,
): Promise<DecisionRoomLedgerEntry[]> {
  if (!teamId) return [];

  const { data, error } = await supabase
    .from('baseball_decision_log')
    .select(
      'id, team_id, player_id, meeting_item_id, signal_id, action_id, decision_kind, title, rationale, decided_by, decided_at, participants, outcome_summary, source_refs, tags, created_by, created_at',
    )
    .eq('team_id', teamId)
    .order('decided_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(MAX_ROWS);

  if (error || !data) return [];

  const rows = data as DecisionLogRow[];

  return rows.map((row) => ({
    id: row.id,
    teamId: row.team_id,
    playerId: row.player_id,
    meetingItemId: row.meeting_item_id,
    signalId: row.signal_id,
    actionId: row.action_id,
    decisionKind: nonEmpty(row.decision_kind) ?? 'decision',
    title: nonEmpty(row.title) ?? 'Decision',
    rationale: nonEmpty(row.rationale),
    outcomeSummary: nonEmpty(row.outcome_summary),
    decidedBy: row.decided_by,
    decidedAt: row.decided_at,
    participants: toStringArray(row.participants),
    tags: toStringArray(row.tags),
    sourceRefs: row.source_refs ?? null,
    createdBy: row.created_by,
    createdAt: row.created_at,
  })) as unknown as DecisionRoomLedgerEntry[];
}
