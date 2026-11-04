import 'server-only';
import { formatWith } from '../lib/dates';
import { createClient } from '@/lib/supabase/server';
import { parsePlanBody, toPlayerPlan, type PlanBodyV2, type PlanWhy } from '@/lib/coachhelm/v3/practice-plan/model';
import { practiceTables, type PracticePlanRow, type PracticePlanVersionRow } from '@/lib/golf/practice-db';
import { isPracticeMissing } from '@/lib/golf/practice-errors';
import { toSheetModel, type PlanSheetModel } from '../screens/coachhelm/plan/sheet/plan-sheet-model';
import type { PlayerPracticeData } from '../screens/coachhelm/plan/player/PlayerPractice';

export type PlanPageLoad = { status: 'ready'; plan: PlanSheetModel; stops?: ReturnType<typeof toPlayerPlan> } | { status: 'gone' } | { status: 'unavailable' };

async function context(sb: Awaited<ReturnType<typeof createClient>>, eventId: string | null) {
  if (!eventId) return null;
  const { data: event } = await sb.from('golf_events').select('start_time, end_time, team_id, location').eq('id', eventId).maybeSingle();
  if (!event) return null;
  const [{ data: team }, { data: members }] = await Promise.all([
    sb.from('golf_teams').select('name, timezone, organization_id').eq('id', event.team_id).maybeSingle(),
    sb.from('golf_team_members').select('player_id, golf_players(first_name, last_name)').eq('team_id', event.team_id).eq('status', 'active'),
  ]);
  const { data: coaches } = team?.organization_id ? await sb.from('golf_coaches').select('full_name').eq('organization_id', team.organization_id) : { data: [] };
  const names = new Map<string, string>();
  for (const m of members ?? []) {
    const p = m.golf_players as { first_name: string | null; last_name: string | null } | null;
    if (m.player_id && p) names.set(m.player_id, [p.first_name, p.last_name].filter(Boolean).join(' '));
  }
  return { event, team, names, coaches: (coaches ?? []).map((c) => c.full_name).filter((n): n is string => !!n) };
}

const stateWord = (r: PracticePlanRow): string => (r.status === 'published' ? 'Published' : 'Draft · Only coaches');

/** A coach's copy: the draft body and the Why lines from the coach-only column. */
export async function loadCoachPlan(planId: string): Promise<PlanPageLoad> {
  const sb = await createClient();
  const { data, error } = await practiceTables(sb).from('golf_practice_plans').select('*').eq('id', planId).maybeSingle();
  if (error) return isPracticeMissing(error.code) ? { status: 'unavailable' } : { status: 'gone' };
  const row = data as PracticePlanRow | null;
  const body: PlanBodyV2 | null = row ? parsePlanBody(row.body) : null;
  if (!row || !body) return { status: 'gone' };
  const ctx = await context(sb, row.event_id);
  if (!ctx) return { status: 'gone' };
  return { status: 'ready', plan: toSheetModel({ body, why: (row.coach_why ?? {}) as Record<string, PlanWhy>, title: row.title ?? 'Practice plan', team: ctx.team?.name ?? '', start: new Date(ctx.event.start_time), end: ctx.event.end_time ? new Date(ctx.event.end_time) : null, zone: ctx.team?.timezone ?? 'America/New_York', coaches: ctx.coaches, names: ctx.names, state: stateWord(row) }, 'coach') };
}

/** A player's copy. Only the live version, which RLS already holds to their team: no draft, no Why, no Aim, no read figure. A draft id gets nothing. */
export async function loadPlayerPlan(planId: string, playerId: string): Promise<PlanPageLoad> {
  const sb = await createClient();
  const { data, error } = await practiceTables(sb).from('golf_practice_plan_versions').select('plan_id, version, body, published_at').eq('plan_id', planId).order('version', { ascending: false }).limit(1).maybeSingle();
  if (error) return isPracticeMissing(error.code) ? { status: 'unavailable' } : { status: 'gone' };
  const row = data as PracticePlanVersionRow | null;
  const body = row ? parsePlanBody(row.body) : null;
  if (!body) return { status: 'gone' };
  const { data: parent } = await practiceTables(sb).from('golf_practice_plans').select('title, event_id').eq('id', planId).maybeSingle();
  const eventId = (parent as { event_id?: string | null } | null)?.event_id ?? null;
  const ctx = await context(sb, eventId);
  if (!ctx) return { status: 'gone' };
  const start = new Date(ctx.event.start_time);
  return { status: 'ready', plan: toSheetModel({ body, title: (parent as { title?: string } | null)?.title ?? 'Practice plan', team: ctx.team?.name ?? '', start, end: ctx.event.end_time ? new Date(ctx.event.end_time) : null, zone: ctx.team?.timezone ?? 'America/New_York', coaches: ctx.coaches, names: ctx.names, state: 'Published' }, 'player'), stops: toPlayerPlan(body, playerId, start) };
}

/** A player's Practice page: their own stops only, from the live version. Now and Next by the clock, in the team's zone. */
export async function loadPlayerPractice(planId: string, playerId: string, now: Date = new Date()): Promise<{ status: 'ready'; data: PlayerPracticeData } | { status: 'gone' } | { status: 'unavailable' }> {
  const sb = await createClient();
  const { data, error } = await practiceTables(sb).from('golf_practice_plan_versions').select('plan_id, version, body, published_at').eq('plan_id', planId).order('version', { ascending: false }).limit(1).maybeSingle();
  if (error) return isPracticeMissing(error.code) ? { status: 'unavailable' } : { status: 'gone' };
  const row = data as PracticePlanVersionRow | null;
  const body = row ? parsePlanBody(row.body) : null;
  if (!body) return { status: 'gone' };
  const { data: parent } = await practiceTables(sb).from('golf_practice_plans').select('title, event_id').eq('id', planId).maybeSingle();
  const ctx = await context(sb, (parent as { event_id?: string | null } | null)?.event_id ?? null);
  if (!ctx) return { status: 'gone' };
  const start = new Date(ctx.event.start_time);
  const zone = ctx.team?.timezone ?? 'America/New_York';
  const mine = toPlayerPlan(body, playerId, start);
  const clockOf = (d: Date) => formatWith(d, { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone }).replace(/\s?[AP]M$/, '');
  const group = body.groups.find((g) => g.players.includes(playerId)) ?? null;
  const nowAt = mine.stops.findIndex((s) => s.start <= now && now < s.end);
  const nextAt = nowAt >= 0 ? nowAt + 1 : mine.stops.findIndex((s) => s.start > now);
  const day = formatWith(start, { weekday: 'long', timeZone: zone });
  const end = ctx.event.end_time ? new Date(ctx.event.end_time) : null;
  return {
    status: 'ready',
    data: {
      context: [day, group ? `Group ${group.name}` : null].filter(Boolean).join(' · '),
      title: (parent as { title?: string } | null)?.title ?? 'Practice plan',
      when: [end ? `${clockOf(start)} to ${clockOf(end)}` : clockOf(start), body.place || ctx.event.location].filter(Boolean).join(' · '),
      focus: body.focus,
      group: group ? { name: group.name, mates: group.players.filter((p) => p !== playerId).map((p) => (ctx.names.get(p) ?? '').split(' ')[0]!).filter(Boolean) } : null,
      stops: mine.stops.map((s, i) => ({ time: clockOf(s.start), place: s.place, line: [s.title, s.note].filter(Boolean).join(' · '), now: i === nowAt, next: i === nextAt })),
      documents: 'Team Hub › Practice plans',
      planHref: null,
    },
  };
}
