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
 * locked to the exact shapes the UI consumes. Both mappers below produce the
 * EXACT declared fields (no `as unknown as` cast): `loadAgendaItems` sets
 * `kind: 'meeting_item'` for every row (there is no signal-sourced agenda item
 * today) and `loadDecisionLedger` selects the real `baseball_decision_log`
 * columns (`title`/`detail`/`created_at`, not the nonexistent
 * `rationale`/`decided_at`) and maps them onto `{kind,label,detail,at}`.
 *
 * This is a plain server module — NO 'use server'. Reads only; no writes.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  DecisionRoomAgendaItem,
  DecisionRoomLedgerEntry,
  DecisionRoomSourceRef,
} from '@/app/baseball/actions/decision-room';
import type { Database } from '@/lib/types/database';

/**
 * Supabase client typed against the generated Database schema. The Decision
 * Room callers pass the authenticated server client. Matches the sibling
 * read-models in this directory.
 */
type Client = SupabaseClient<Database>;

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

function fullName(
  first: string | null | undefined,
  last: string | null | undefined,
): string | null {
  const parts = [nonEmpty(first), nonEmpty(last)].filter(
    (p): p is string => p != null,
  );
  return parts.length > 0 ? parts.join(' ') : null;
}

/**
 * One entry persisted in `baseball_meeting_items.source_refs` /
 * `baseball_signals.source_refs` (jsonb). Mirrors `BaseballSignalSourceRef` —
 * duplicated here (rather than imported) since this module intentionally has
 * no dependency on the signals type module; only the fields we read are typed.
 */
interface SourceRefJson {
  source_table?: string;
  column?: string;
  sample_n?: number;
  label?: string;
}

/** Coerce a jsonb `source_refs` column into the UI's `{label, detail}` shape. */
function toSourceRefs(value: unknown): DecisionRoomSourceRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is SourceRefJson => v != null && typeof v === 'object')
    .map((ref) => {
      const label = nonEmpty(ref.label ?? null) ?? nonEmpty(ref.source_table ?? null) ?? 'Source';
      const detailParts: string[] = [];
      if (nonEmpty(ref.column ?? null)) detailParts.push(ref.column as string);
      if (typeof ref.sample_n === 'number') detailParts.push(`n=${ref.sample_n}`);
      return {
        label,
        detail: detailParts.length > 0 ? detailParts.join(' · ') : null,
      };
    });
}

/**
 * Row shape selected from `baseball_meeting_items` (mirrors the live schema —
 * verified against `supabase/migrations/20260624000230_baseball_signal_action_materialization.sql`
 * and `20260624000310_baseball_decision_log.sql`).
 */
interface MeetingItemRow {
  id: string;
  team_id: string;
  source_signal_id: string | null;
  player_id: string | null;
  title: string;
  detail: string | null;
  source_refs: unknown;
  status: string;
}

/** Row shape selected from `baseball_players`, joined in a second round-trip. */
interface PlayerNameRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

/**
 * AGENDA — the Decision Room meeting agenda for a team.
 *
 * Source: `baseball_meeting_items`, scoped by team_id under RLS. Only 'open'
 * and 'discussed' items are surfaced — a 'resolved'/'archived' item has left
 * the active agenda (its resolution is already recorded in the Decision
 * Ledger via `resolveMeetingItem`). Every row maps to `kind: 'meeting_item'`
 * (there is no signal-sourced agenda item in this read model today), open
 * items sort ahead of discussed ones, newest-created first within each group.
 *
 * `severityHint` is always null: `baseball_meeting_items` has no severity
 * column (severity only exists on `baseball_signals`, which this loader does
 * not read from) — honestly omitted rather than guessed.
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
    .select('id, team_id, source_signal_id, player_id, title, detail, source_refs, status')
    .eq('team_id', teamId)
    .in('status', ['open', 'discussed'])
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(MAX_ROWS);

  if (error || !data) return [];

  const rows = data as MeetingItemRow[];

  const playerIds = Array.from(
    new Set(rows.map((r) => r.player_id).filter((id): id is string => Boolean(id))),
  );

  const playerNames = new Map<string, string>();
  if (playerIds.length > 0) {
    const { data: playerRows } = await supabase
      .from('baseball_players')
      .select('id, first_name, last_name')
      .in('id', playerIds);
    for (const p of (playerRows ?? []) as PlayerNameRow[]) {
      const name = fullName(p.first_name, p.last_name);
      if (name) playerNames.set(p.id, name);
    }
  }

  const items: DecisionRoomAgendaItem[] = rows.map((row) => {
    const sourceRefs = toSourceRefs(row.source_refs);
    return {
      id: row.id,
      kind: 'meeting_item',
      title: nonEmpty(row.title) ?? 'Agenda item',
      detail: nonEmpty(row.detail),
      status: row.status === 'discussed' ? 'discussed' : 'open',
      severityHint: null,
      playerId: row.player_id,
      playerName: row.player_id ? (playerNames.get(row.player_id) ?? null) : null,
      sourceSignalId: row.source_signal_id,
      sourceRefCount: sourceRefs.length,
      sourceRefs,
    };
  });

  // Stable sort: open items before discussed ones. Array.prototype.sort is
  // spec-guaranteed stable, so within each group the query's newest-first
  // `created_at` order is preserved.
  return items.sort(
    (a, b) => (a.status === 'discussed' ? 1 : 0) - (b.status === 'discussed' ? 1 : 0),
  );
}

/**
 * Set of `decision_kind` values the `baseball_decision_log` CHECK constraint
 * allows (see `20260624000310_baseball_decision_log.sql`). Matches the
 * non-invite members of `DecisionRoomLedgerEntry['kind']` exactly.
 */
const VALID_LEDGER_KINDS = new Set<DecisionRoomLedgerEntry['kind']>([
  'discussed',
  'resolved',
  'converted_task',
  'converted_note',
  'converted_practice',
  'raised',
  'reopened',
  'note',
]);

function toLedgerKind(value: string | null): DecisionRoomLedgerEntry['kind'] {
  if (value && VALID_LEDGER_KINDS.has(value as DecisionRoomLedgerEntry['kind'])) {
    return value as DecisionRoomLedgerEntry['kind'];
  }
  return 'note';
}

/**
 * Row shape selected from `baseball_decision_log` (mirrors the live schema —
 * verified against `supabase/migrations/20260624000310_baseball_decision_log.sql`).
 * The table has no `rationale`, `decided_at`, `meeting_item_id`,
 * `participants`, `outcome_summary`, `tags`, or `created_by` columns — the
 * decision body is `detail`, and the only timestamp is `created_at`.
 */
interface DecisionLogRow {
  id: string;
  decision_kind: string;
  title: string;
  detail: string | null;
  created_at: string;
}

/**
 * DECISION LEDGER — the team's logged decisions, most recent first.
 *
 * Source: `baseball_decision_log`, scoped by team_id under RLS. Ordered by
 * `created_at` (the only timestamp the table has) newest first.
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
    .select('id, decision_kind, title, detail, created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(MAX_ROWS);

  if (error || !data) return [];

  const rows = data as DecisionLogRow[];

  return rows.map((row) => ({
    id: row.id,
    kind: toLedgerKind(row.decision_kind),
    label: nonEmpty(row.title) ?? 'Decision',
    detail: nonEmpty(row.detail),
    at: row.created_at,
  }));
}
