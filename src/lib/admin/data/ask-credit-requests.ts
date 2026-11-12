import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { askTables } from '@/lib/coachhelm/v3/chat/ask-db';

/**
 * Players' "Request more" for CoachHelm Ask, newest first, for the admin console.
 *
 * The ops e-mail for a request carries only the request id and the team (security review 2026-11-11, finding 5: a player's
 * name and free-text note must not travel by e-mail). This is where ops reads who asked and what they wrote. Service role:
 * no client role reads `ask_credit_requests`. The table comes with a held CoachHelm migration (20261101090300), so "not
 * there" is an expected answer and reads as `unavailable`, not an error.
 */
export interface AskCreditRequestRow {
  id: string;
  createdAt: string;
  weekStart: string;
  playerName: string | null;
  teamName: string | null;
  note: string;
  /** null while the 8-second Undo is open; then when it was released, and when the ops e-mail went (if it did). */
  releasedAt: string | null;
  sentAt: string | null;
}

export type AskCreditRequests =
  | { status: 'ok'; rows: AskCreditRequestRow[] }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204', '42703']);

type Raw = { id: string; created_at: string; week_start: string; player_id: string; team_id: string; note: string | null; released_at: string | null; sent_at: string | null };

export async function fetchAskCreditRequests(limit = 50): Promise<AskCreditRequests> {
  const admin = createAdminClient();
  const res = await askTables(admin)
    .from('ask_credit_requests')
    .select('id, created_at, week_start, player_id, team_id, note, released_at, sent_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (res.error) return MISSING.has(String(res.error.code)) ? { status: 'unavailable' } : { status: 'error', message: res.error.message };
  const raw = (res.data ?? []) as Raw[];
  if (raw.length === 0) return { status: 'ok', rows: [] };

  const playerIds = [...new Set(raw.map((r) => r.player_id))];
  const teamIds = [...new Set(raw.map((r) => r.team_id))];
  const [players, teams] = await Promise.all([
    admin.from('golf_players').select('id, first_name, last_name').in('id', playerIds),
    admin.from('golf_teams').select('id, name').in('id', teamIds),
  ]);
  // A failed name read leaves the name blank (the request and its note still show); the panel says "Unknown".
  const nameById = new Map(
    ((players.error ? [] : players.data) ?? []).map((p) => [p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || null] as const),
  );
  const teamById = new Map(((teams.error ? [] : teams.data) ?? []).map((t) => [t.id, t.name ?? null] as const));

  return {
    status: 'ok',
    rows: raw.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      weekStart: r.week_start,
      playerName: nameById.get(r.player_id) ?? null,
      teamName: teamById.get(r.team_id) ?? null,
      note: r.note ?? '',
      releasedAt: r.released_at,
      sentAt: r.sent_at,
    })),
  };
}
