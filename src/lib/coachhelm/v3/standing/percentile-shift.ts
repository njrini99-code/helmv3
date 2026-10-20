/**
 * Standing percentile shift detection (audit row 53, standing_percentile_changed).
 *
 * `refresh_player_standing` overwrites golf_player_standing in place and keeps
 * no history, so the cron snapshots each player's mean team percentile across
 * metrics before and after the refresh and notifies on a real move. The
 * threshold keeps one noisy metric from pinging the player.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export const STANDING_SHIFT_MIN_POINTS = 10;
const PAGE = 1000;

export interface StandingShift {
  player_id: string;
  direction: 'up' | 'down';
  before: number;
  after: number;
}

export function meanTeamPctByPlayer(
  rows: ReadonlyArray<{ player_id: string; team_pct: number | null }>,
): Map<string, number> {
  const acc = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    if (r.team_pct == null || !Number.isFinite(r.team_pct)) continue;
    const a = acc.get(r.player_id) ?? { sum: 0, n: 0 };
    a.sum += r.team_pct;
    a.n += 1;
    acc.set(r.player_id, a);
  }
  const out = new Map<string, number>();
  for (const [id, a] of acc) out.set(id, a.sum / a.n);
  return out;
}

export function detectStandingShifts(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
  minPoints = STANDING_SHIFT_MIN_POINTS,
): StandingShift[] {
  const shifts: StandingShift[] = [];
  for (const [player_id, a] of after) {
    const b = before.get(player_id);
    if (b === undefined) continue; // first standing ever: nothing to compare
    const delta = a - b;
    if (Math.abs(delta) < minPoints) continue;
    shifts.push({ player_id, direction: delta > 0 ? 'up' : 'down', before: b, after: a });
  }
  return shifts;
}

/** Mean team_pct per player, paging past the 1,000-row PostgREST cap. */
export async function loadMeanTeamPct(
  supabase: SupabaseClient,
  playerIds: readonly string[],
): Promise<Map<string, number>> {
  if (playerIds.length === 0) return new Map();
  const rows: Array<{ player_id: string; team_pct: number | null }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('golf_player_standing')
      .select('player_id, team_pct')
      .in('player_id', playerIds as string[])
      .order('player_id', { ascending: true })
      .order('metric_id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`loadMeanTeamPct: ${error.message}`);
    const page = (data ?? []) as Array<{ player_id: string; team_pct: number | null }>;
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return meanTeamPctByPlayer(rows);
}

/**
 * Weekly digest trigger (audit row 53, weekly_digest). Runs from the nightly
 * standing cron on Mondays (UTC): players whose visible insights changed in
 * the last 7 days get one "your week" notification. Pure selector here.
 */
export function isWeeklyDigestDay(now: Date): boolean {
  return now.getUTCDay() === 1;
}

export function playersWithWeeklyActivity(
  rows: ReadonlyArray<{ player_id: string | null }>,
): string[] {
  return [...new Set(rows.map((r) => r.player_id).filter((id): id is string => Boolean(id)))];
}
