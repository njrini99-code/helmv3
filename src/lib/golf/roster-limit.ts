import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

/**
 * The roster limit (launch readiness F-05). NCAA Division I Bylaw 17.2 (Manual 2026-27), for a school that opted into the
 * House settlement, caps men's and women's golf at 9 student-athletes on the roster. A designated student-athlete (one whose
 * roster place the settlement protected) and a player with a medically documented incapacitating injury or illness who can
 * never compete again don't count. Some conferences set a lower number (8 in golf), so the limit is the coach's to change,
 * and Division II, Division III, the NAIA and junior colleges have no such cap, so it starts off there.
 *
 * Kept in golf_team_roster_limits (one row a team) and golf_roster_exemptions (one row a player who doesn't count), from
 * migration 20261115250000 (HELD). Until it is applied every read here answers with the defaults: on at 9 for a Division I
 * team, off otherwise, with nobody exempt; nothing can be saved, and the Roster says marking a player arrives with the
 * update. `rosterLimitTables` is the one cast: the tables are untyped until the types regenerate.
 */

export const NCAA_D1_GOLF_ROSTER_LIMIT = 9;
export const ROSTER_LIMIT_SOURCE = 'NCAA Division I Manual 2026-27, Bylaw 17.2';
export const MIN_ROSTER_LIMIT = 1;
export const MAX_ROSTER_LIMIT = 40;

export interface RosterLimit {
  enabled: boolean;
  max: number;
}

export const ROSTER_EXEMPT_REASONS = ['designated', 'medical'] as const;
export type RosterExemptReason = (typeof ROSTER_EXEMPT_REASONS)[number];

export const EXEMPT_REASON_LABEL: Record<RosterExemptReason, string> = {
  designated: 'Designated student-athlete',
  medical: 'Medical, can’t compete again',
};

export interface RosterExemption {
  reason: RosterExemptReason;
  note: string | null;
}

export interface RosterLimitRead {
  limit: RosterLimit;
  /** Where the limit came from: the coach saved it, the team's division set it, or neither is known (off). */
  from: 'saved' | 'division' | 'default';
  /** Player id to their exemption. */
  exemptions: Record<string, RosterExemption>;
  /** The tables aren't there yet (the migration is held): defaults shown, nothing can be saved. */
  missing: boolean;
  /** A read failed for another reason: the limit shown is the default and the exemptions are unknown. */
  error: boolean;
}

export function rosterLimitTables(sb: SupabaseClient<Database>): SupabaseClient {
  return sb as unknown as SupabaseClient;
}

const MISSING = new Set(['42P01', 'PGRST205']);
export const isRosterLimitMissing = (code: string | null | undefined) => !!code && MISSING.has(code);

const REASONS: ReadonlySet<string> = new Set(ROSTER_EXEMPT_REASONS);
export const isExemptReason = (v: unknown): v is RosterExemptReason => typeof v === 'string' && REASONS.has(v);
export const isRosterMax = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= MIN_ROSTER_LIMIT && (v as number) <= MAX_ROSTER_LIMIT;

/**
 * Which NCAA division a team's free-text division names ("NCAA Division I", "D1", "Div. II"), as the practice-hours log reads
 * it (screens/calendar/hours/rules.ts `divisionFromText`); null for the NAIA, a junior college or anything unreadable.
 */
export function ncaaDivisionOf(text: string | null | undefined): 'd1' | 'd2' | 'd3' | null {
  const t = (text ?? '').toLowerCase();
  if (/naia|njcaa|juco|junior|cccaa|nccaa/.test(t)) return null;
  const m = t.match(/(?:division|div|d)[\s._-]*(iii|ii|i|1|2|3)(?![a-z0-9])/) ?? t.trim().match(/^(iii|ii|i|1|2|3)$/);
  const v = m?.[1];
  return v === '1' || v === 'i' ? 'd1' : v === '2' || v === 'ii' ? 'd2' : v === '3' || v === 'iii' ? 'd3' : null;
}

/** The limit a team starts on: on at 9 for Division I, off for anyone else (the cap is Division I's alone). */
export function defaultRosterLimit(division: string | null | undefined): { limit: RosterLimit; from: 'division' | 'default' } {
  const d = ncaaDivisionOf(division);
  return d === 'd1'
    ? { limit: { enabled: true, max: NCAA_D1_GOLF_ROSTER_LIMIT }, from: 'division' }
    : { limit: { enabled: false, max: NCAA_D1_GOLF_ROSTER_LIMIT }, from: d ? 'division' : 'default' };
}

export interface RosterCount {
  /** Active players who count toward the limit. */
  counted: number;
  /** Active players marked as not counting. */
  exempt: number;
  /** How many over the limit (0 at or under, or with the limit off). */
  over: number;
  max: number;
  enabled: boolean;
}

/**
 * The count the Roster header and the lineup builder state. Only active players are on the roster: an inactive one has no
 * team access and is off the roster the coach submits (Mark inactive), so they count toward nothing.
 */
export function countRoster(activePlayerIds: readonly string[], exemptions: Record<string, RosterExemption>, limit: RosterLimit): RosterCount {
  const exempt = activePlayerIds.filter((id) => !!exemptions[id]).length;
  const counted = activePlayerIds.length - exempt;
  return { counted, exempt, over: limit.enabled ? Math.max(0, counted - limit.max) : 0, max: limit.max, enabled: limit.enabled };
}

const players = (n: number) => `${n} player${n === 1 ? '' : 's'}`;

/** "8 of 9 count toward the roster limit. 1 more doesn't count." Null with the limit off. */
export function rosterLimitLine(c: RosterCount): string | null {
  if (!c.enabled) return null;
  const head =
    c.over > 0 ? `${c.counted} count toward the roster limit of ${c.max}: ${c.over} over.` : `${c.counted} of ${c.max} count toward the roster limit.`;
  return c.exempt > 0 ? `${head} ${players(c.exempt)} ${c.exempt === 1 ? 'doesn’t' : 'don’t'} count.` : head;
}

/** The warning when the roster is over: what to do about it. */
export function rosterOverText(c: RosterCount): string {
  return `The roster is ${players(c.over)} over its limit of ${c.max}. Mark a player inactive, or mark one who doesn’t count (a designated student-athlete, or a medical exemption), before the roster is due.`;
}

/** The short chip the lineup builder shows: "Roster 9 of 9", "Roster 10 of 9". Null with the limit off. */
export function rosterChip(c: RosterCount): string | null {
  return c.enabled ? `Roster ${c.counted} of ${c.max}` : null;
}

interface LimitRow {
  enabled: boolean;
  max_players: number;
}
interface ExemptRow {
  player_id: string;
  reason: string;
  note: string | null;
}

async function readTeamDivision(sb: SupabaseClient<Database>, teamId: string): Promise<string | null> {
  const team = await sb.from('golf_teams').select('organization_id').eq('id', teamId).maybeSingle();
  const orgId = team.data?.organization_id;
  if (team.error || !orgId) return null;
  const org = await sb.from('organizations').select('division').eq('id', orgId).maybeSingle();
  if (org.error || !org.data) return null;
  return (org.data as { division: string | null }).division;
}

/**
 * The team's roster limit and who doesn't count, through RLS. Never throws. `withExemptions` is for a coach: a player reads
 * the limit but not the exemption rows (they name a reason about a teammate), so a player's read skips them.
 */
export async function readRosterLimit(sb: SupabaseClient<Database>, teamId: string, opts: { withExemptions: boolean }): Promise<RosterLimitRead> {
  const division = await readTeamDivision(sb, teamId).catch(() => null);
  const base = defaultRosterLimit(division);
  const out: RosterLimitRead = { limit: base.limit, from: base.from, exemptions: {}, missing: false, error: false };
  try {
    const db = rosterLimitTables(sb);
    const [lim, ex] = await Promise.all([
      db.from('golf_team_roster_limits').select('enabled, max_players').eq('team_id', teamId).maybeSingle(),
      opts.withExemptions
        ? db.from('golf_roster_exemptions').select('player_id, reason, note').eq('team_id', teamId)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const codes = [lim.error, ex.error].map((e) => (e as { code?: string } | null)?.code ?? null);
    if (codes.some(isRosterLimitMissing)) return { ...out, missing: true };
    if (lim.error || ex.error) return { ...out, error: true };
    const row = lim.data as LimitRow | null;
    if (row && isRosterMax(row.max_players)) {
      out.limit = { enabled: !!row.enabled, max: row.max_players };
      out.from = 'saved';
    }
    for (const r of (ex.data ?? []) as ExemptRow[]) if (isExemptReason(r.reason)) out.exemptions[r.player_id] = { reason: r.reason, note: r.note };
    return out;
  } catch {
    return { ...out, error: true };
  }
}
