import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { askTables } from './ask-db';

/** Server config only: never in a client bundle, a response or a string a player can read. */
const PLAYER_ASK_WEEKLY_CAP_USD = 5;
const MICROS = 1_000_000;

export type AllowanceBucket = 'plenty' | 'low' | 'out';

export function bucketFor(usedMicros: number, capMicros: number = PLAYER_ASK_WEEKLY_CAP_USD * MICROS): AllowanceBucket {
  if (usedMicros >= capMicros) return 'out';
  return usedMicros >= capMicros * 0.8 ? 'low' : 'plenty';
}

/** Monday, in the team's zone. */
export function weekStart(now: Date, zone: string): string {
  const local = new Date(now.toLocaleString('en-US', { timeZone: zone }));
  const day = (local.getDay() + 6) % 7;
  local.setDate(local.getDate() - day);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
}

function admin() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}

/** The word only; the amount never leaves this file. A missing table (HM4 not applied) is `null`, and player Ask stays off: no cap, no ship. */
export async function readBucket(playerId: string, zone: string): Promise<AllowanceBucket | null> {
  const sb = admin();
  if (!sb) return null;
  const { data, error } = await askTables(sb).from('ask_usage_weekly').select('cost_micros, cap_micros').eq('player_id', playerId).eq('week_start', weekStart(new Date(), zone)).maybeSingle();
  if (error) return null;
  return bucketFor(Number(data?.cost_micros ?? 0), data?.cap_micros != null ? Number(data.cap_micros) : undefined);
}

export async function recordPlayerSpend(args: { playerId: string; teamId: string; zone: string; usd: number }): Promise<void> {
  const sb = admin();
  if (!sb) return;
  const week = weekStart(new Date(), args.zone);
  const micros = Math.round(args.usd * MICROS);
  const { data, error } = await askTables(sb).from('ask_usage_weekly').select('cost_micros').eq('player_id', args.playerId).eq('week_start', week).maybeSingle();
  // A failed read must not write: the upsert would start this week's count over from this one call.
  if (error) return;
  await askTables(sb).from('ask_usage_weekly').upsert({ player_id: args.playerId, team_id: args.teamId, week_start: week, cost_micros: Number(data?.cost_micros ?? 0) + micros });
}
