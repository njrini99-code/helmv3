import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type { CoachChatContext } from './context';
import { nowIso, unavailableEnvelope, type ToolEnvelope } from './provenance';
import { practiceTables, type TeamDrillRow } from '@/lib/golf/practice-db';
import { isPracticeMissing } from '@/lib/golf/practice-errors';
import { toClassDay } from '@/lib/golf/class-day-shape';
import { getShotPattern } from './shot-reads';

type Sb = SupabaseClient<Database>;
const env = (summary: string, detail: Record<string, unknown>, coverage: ToolEnvelope['coverage'] = 'complete', note: string | null = null): ToolEnvelope => ({ summary, measurements: [], series: [], detail, coverage, coverage_note: note, as_of: nowIso() });

export async function getClassTimes(sb: Sb, ctx: CoachChatContext, input: { date: string }): Promise<ToolEnvelope> {
  const { data, error } = await sb.rpc('golf_team_class_day' as never, { p_team_id: ctx.team_id, p_on: input.date } as never);
  if (error) return unavailableEnvelope('Could not read class times.', 'The class day read failed.');
  const day = toClassDay(data);
  if (!day) return unavailableEnvelope('Class times aren’t set up for this team.', 'No class day data.');
  return env(`Class times on ${input.date}.`, { day });
}

/** The one bank: team drills once `golf_team_drills` exists, then the GolfHelm library. A drill is never invented. */
export async function getDrillBank(sb: Sb, ctx: CoachChatContext, input: { category?: string }): Promise<ToolEnvelope> {
  const team = await practiceTables(sb).from('golf_team_drills').select('id, name, area, kind, minutes').eq('team_id', ctx.team_id).is('archived_at', null).limit(20);
  const teamRows = team.error ? [] : ((team.data ?? []) as Array<Pick<TeamDrillRow, 'id' | 'name' | 'area' | 'kind' | 'minutes'>>);
  if (team.error && !isPracticeMissing(team.error.code)) return unavailableEnvelope('Could not read the drill bank.', 'The team drill read failed.');
  let q = sb.from('golf_drills').select('id, title, category, duration_min').limit(20);
  if (input.category) q = q.eq('category', input.category);
  const lib = await q;
  if (lib.error) return unavailableEnvelope('Could not read the drill bank.', 'The library read failed.');
  const drills = [...teamRows.map((d) => ({ ref: `team:${d.id}`, title: d.name, category: d.area, minutes: d.minutes })), ...(lib.data ?? []).map((d) => ({ ref: `lib:${d.id}`, title: d.title, category: d.category, minutes: d.duration_min }))];
  if (!drills.length) return env('No drills in the bank yet.', { drills: [] }, 'empty');
  return env(`${drills.length} drills in the bank.`, { drills, ids: drills.map((d) => d.ref) });
}

export async function getTeamStrokesGained(sb: Sb, ctx: CoachChatContext, input: { rounds: number }): Promise<ToolEnvelope> {
  const ids = ctx.roster.map((p) => p.id);
  const { data, error } = await sb.from('golf_rounds').select('round_date, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting').in('player_id', ids).eq('status', 'completed').eq('is_test', false).not('strokes_gained_tee', 'is', null).order('round_date', { ascending: false }).limit(input.rounds * Math.max(1, ids.length));
  if (error) return unavailableEnvelope('Could not read strokes gained.', 'The rounds read failed.');
  const rows = data ?? [];
  const dates = [...new Set(rows.map((r) => r.round_date))].slice(0, input.rounds);
  const inWindow = rows.filter((r) => dates.includes(r.round_date));
  const mean = (k: 'strokes_gained_tee' | 'strokes_gained_approach' | 'strokes_gained_around_green' | 'strokes_gained_putting') => {
    const v = inWindow.map((r) => r[k]).filter((x): x is number => x != null);
    return v.length ? Number((v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)) : null;
  };
  const areas = { tee: mean('strokes_gained_tee'), approach: mean('strokes_gained_approach'), short: mean('strokes_gained_around_green'), putting: mean('strokes_gained_putting') };
  if (!inWindow.length) return env('No rounds with strokes gained yet.', { areas }, 'empty');
  return env(`Team strokes gained over ${inWindow.length} player rounds.`, { areas, sample_size: inWindow.length, window_start: dates[dates.length - 1], window_end: dates[0] }, inWindow.length < 5 ? 'partial' : 'complete', inWindow.length < 5 ? `Only ${inWindow.length} rounds, so this is a lean read.` : null);
}

export async function getTeamPuttingProfile(sb: Sb, ctx: CoachChatContext, input: { rounds: number }): Promise<ToolEnvelope> {
  return getShotPattern(sb, ctx, { mode: 'putting', since_days: Math.max(14, input.rounds * 7) });
}
