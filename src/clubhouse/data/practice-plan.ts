import 'server-only';
import { formatWith } from '../lib/dates';
import { createClient } from '@/lib/supabase/server';
import { parsePlanBody, parseVersionBody, toPlayerPlan, withOwnLines, type PlanBodyV2, type PlanWhy } from '@/lib/coachhelm/v3/practice-plan/model';
import { practiceTables, type PracticePlanRow, type PracticePlanVersionRow } from '@/lib/golf/practice-db';
import { isPracticeMissing } from '@/lib/golf/practice-errors';
import { chLogServer } from '../lib/track-server';
import { sheetFormat, toSheetModel, type PlanSheetFormat, type PlanSheetModel } from '../screens/coachhelm/plan/sheet/plan-sheet-model';
import type { PlayerPracticeData } from '../screens/coachhelm/plan/player/PlayerPractice';
import type { ChPlanStatus } from '../screens/practice/CoachPlanBar';
import type { PrintDrill } from '../screens/practice/PrintStudio';

/** What a coach's plan page draws around the sheet. */
export interface CoachPlanExtras {
  status: ChPlanStatus;
  body: PlanBodyV2;
  start: Date | null;
  zone: string;
}
export type PlanPageLoad = { status: 'ready'; plan: PlanSheetModel; stops?: ReturnType<typeof toPlayerPlan>; coach?: CoachPlanExtras } | { status: 'gone' } | { status: 'unavailable' };

async function context(sb: Awaited<ReturnType<typeof createClient>>, eventId: string | null) {
  if (!eventId) return null;
  const { data: event, error: eventError } = await sb.from('golf_events').select('start_time, end_time, team_id, location').eq('id', eventId).maybeSingle();
  if (eventError || !event) return null;
  const [{ data: team, error: teamError }, { data: members, error: membersError }] = await Promise.all([
    sb.from('golf_teams').select('name, timezone, organization_id').eq('id', event.team_id).maybeSingle(),
    sb.from('golf_team_members').select('player_id, golf_players(first_name, last_name)').eq('team_id', event.team_id).eq('status', 'active'),
  ]);
  if (teamError || membersError) return null;
  const { data: coaches } = team?.organization_id ? await sb.from('golf_coaches').select('full_name').eq('organization_id', team.organization_id) : { data: [] };
  const names = new Map<string, string>();
  for (const m of members ?? []) {
    const p = m.golf_players as { first_name: string | null; last_name: string | null } | null;
    if (m.player_id && p) names.set(m.player_id, [p.first_name, p.last_name].filter(Boolean).join(' '));
  }
  return { event, team, names, coaches: (coaches ?? []).map((c) => c.full_name).filter((n): n is string => !!n) };
}

/**
 * A published plan carrying edits players don't have. One source, the column the save function keeps (`edited_after_publish`): Practice home, the builder and the
 * plan page all read it. `version` counts saves and `published_version` counts publishes, so comparing them says nothing.
 */
export const editedAfterPublish = (r: Pick<PracticePlanRow, 'status' | 'edited_after_publish'>): boolean => r.status === 'published' && r.edited_after_publish === true;

const stateWord = (r: PracticePlanRow, zone: string, publishedAt: string | null): string => {
  if (r.status !== 'published') return 'Draft · not published';
  return publishedAt ? `Published ${formatWith(new Date(publishedAt), { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: zone })}` : 'Published';
};

/** The team's format, for the sheet (S-FMT). A missing table, or none set, is the standard sheet. */
async function readFormat(sb: Awaited<ReturnType<typeof createClient>>, teamId: string): Promise<PlanSheetFormat | null> {
  const { data, error } = await practiceTables(sb).from('golf_practice_plan_formats').select('name, sections').eq('team_id', teamId).maybeSingle();
  if (error || !data) return null;
  return sheetFormat(data as { name: string; sections: Array<{ key: string; name: string }> });
}

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
  const opens = row.status === 'published' ? await practiceTables(sb).from('golf_practice_plan_opens').select('player_id').eq('plan_id', planId) : null;
  const seen = opens && !opens.error ? { names: ((opens.data ?? []) as Array<{ player_id: string }>).map((o) => ctx.names.get(o.player_id)).filter((n): n is string => !!n), of: ctx.names.size } : null;
  const zone = ctx.team?.timezone ?? 'America/New_York';
  const [format, live] = await Promise.all([
    readFormat(sb, ctx.event.team_id),
    row.status === 'published' && row.published_version != null ? practiceTables(sb).from('golf_practice_plan_versions').select('published_at').eq('plan_id', planId).eq('version', row.published_version).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  // When the plan went out is decoration on a plan known to be published (the plan row says so). Unread, the sheet says "Published"
  // with no time, which is still true; it never falls back to "Draft".
  if (live.error) chLogServer('practice.plan', 'published at', live.error, 'practice_plans');
  const publishedAt = live.error ? null : ((live.data as { published_at: string } | null)?.published_at ?? null);
  const coach: CoachPlanExtras = { body, zone, start: new Date(ctx.event.start_time), status: { planId, title: row.title ?? 'Practice plan', version: row.version, status: row.status === 'published' ? 'published' : 'draft', edited: editedAfterPublish(row), seen } };
  return { status: 'ready', coach, plan: toSheetModel({ body, why: (row.coach_why ?? {}) as Record<string, PlanWhy>, title: row.title ?? 'Practice plan', team: ctx.team?.name ?? '', start: new Date(ctx.event.start_time), end: ctx.event.end_time ? new Date(ctx.event.end_time) : null, zone: ctx.team?.timezone ?? 'America/New_York', coaches: ctx.coaches, names: ctx.names, state: stateWord(row, zone, publishedAt), format }, 'coach') };
}

/**
 * The live version a player may read, with their own Own work lines. RLS holds the version to the live one of their team, and `golf_practice_plans` answers coaches only,
 * so the title and event come from the version row. A draft id, or a plan taken down, gets nothing.
 */
async function liveVersionFor(sb: Awaited<ReturnType<typeof createClient>>, planId: string, playerId: string): Promise<{ status: 'ready'; row: PracticePlanVersionRow; body: PlanBodyV2; ctx: NonNullable<Awaited<ReturnType<typeof context>>> } | { status: 'gone' } | { status: 'unavailable' }> {
  const { data, error } = await practiceTables(sb).from('golf_practice_plan_versions').select('plan_id, version, title, event_id, body, published_at').eq('plan_id', planId).eq('is_live', true).maybeSingle();
  if (error) return isPracticeMissing(error.code) ? { status: 'unavailable' } : { status: 'gone' };
  const row = data as PracticePlanVersionRow | null;
  const parsed = row ? parseVersionBody(row.body) : null;
  if (!row || !parsed) return { status: 'gone' };
  const ctx = await context(sb, row.event_id);
  if (!ctx) return { status: 'gone' };
  // No lines to read leaves an Own work stop with its title; the plan still opens.
  const { data: lines, error: linesError } = await practiceTables(sb).from('golf_practice_plan_lines').select('block_id, line').eq('plan_id', planId).eq('version', row.version).eq('player_id', playerId);
  const body = withOwnLines(parsed, playerId, linesError ? [] : ((lines ?? []) as Array<{ block_id: string; line: string }>));
  return { status: 'ready', row, body, ctx };
}

/** A player's copy of the sheet: no draft, no Why, no Aim, no read figure, and of the groups only their own. */
export async function loadPlayerPlan(planId: string, playerId: string): Promise<PlanPageLoad> {
  const sb = await createClient();
  const live = await liveVersionFor(sb, planId, playerId);
  if (live.status !== 'ready') return live;
  const { row, body, ctx } = live;
  const start = new Date(ctx.event.start_time);
  const format = await readFormat(sb, ctx.event.team_id);
  return { status: 'ready', plan: toSheetModel({ body, title: row.title || 'Practice plan', team: ctx.team?.name ?? '', start, end: ctx.event.end_time ? new Date(ctx.event.end_time) : null, zone: ctx.team?.timezone ?? 'America/New_York', coaches: ctx.coaches, names: ctx.names, state: `Published ${formatWith(new Date(row.published_at), { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: ctx.team?.timezone ?? 'America/New_York' })}`, format }, 'player', playerId), stops: toPlayerPlan(body, playerId, start) };
}

/** A player's Practice page: their own stops only, from the live version. Now and Next by the clock, in the team's zone. */
export async function loadPlayerPractice(planId: string, playerId: string, now: Date = new Date()): Promise<{ status: 'ready'; data: PlayerPracticeData } | { status: 'gone' } | { status: 'unavailable' }> {
  const sb = await createClient();
  const live = await liveVersionFor(sb, planId, playerId);
  if (live.status !== 'ready') return live;
  const { row, body, ctx } = live;
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
      title: row.title || 'Practice plan',
      when: [end ? `${clockOf(start)} to ${clockOf(end)}` : clockOf(start), body.place || ctx.event.location].filter(Boolean).join(' · '),
      focus: body.focus,
      group: group ? { name: group.name, me: (ctx.names.get(playerId) ?? '').split(' ')[0] || undefined, mates: group.players.filter((p) => p !== playerId).map((p) => (ctx.names.get(p) ?? '').split(' ')[0]!).filter(Boolean) } : null,
      stops: mine.stops.map((s, i) => ({ startsAt: +s.start, endsAt: +s.end, time: clockOf(s.start), place: s.place, line: [s.title, s.note].filter(Boolean).join(' · '), now: i === nowAt, next: i === nextAt })),
      documents: { label: 'Team Hub › Documents › Practice plans', href: '/golf/dashboard/team?tab=documents' },
      planHref: `/golf/dashboard/practice/plan/${planId}?view=sheet`,
    },
  };
}

/** A drills read for the print appendix failed. Thrown, never answered with an empty list: "this plan has no drills" is a different fact. */
export class PlanDrillsUnreadError extends Error {
  constructor(what: string) {
    super(`The plan's drills could not be read (${what}).`);
    this.name = 'PlanDrillsUnreadError';
  }
}

/** One failed drills read: logged unless Practice simply is not there yet (the held block), then thrown for the caller to decide. */
function drillsUnread(what: string, error: { code?: string; message: string }): never {
  if (!isPracticeMissing(error.code)) chLogServer('practice.plan', `drills ${what}`, error, 'practice_plans');
  throw new PlanDrillsUnreadError(what);
}

/**
 * The print studio's extra read: the plan's drills, by the refs in its body. An empty list means the plan names no drills (or the plan
 * is not this coach's to read). A read that FAILS throws `PlanDrillsUnreadError`: the caller decides what a print without its appendix
 * is, and the appendix is never a partial list that looks whole.
 */
export async function loadPlanDrills(planId: string): Promise<PrintDrill[]> {
  const sb = await createClient();
  const db = practiceTables(sb);
  const { data, error } = await db.from('golf_practice_plans').select('body').eq('id', planId).maybeSingle();
  if (error) drillsUnread('plan', error);
  const body = data ? parsePlanBody((data as { body: unknown }).body) : null;
  if (!body) return [];
  const refs = body.variants.main.blocks.flatMap((b) => (b.kind === 'team' ? [b.drill] : b.kind === 'stations' ? b.stations.map((s) => s.drill) : [])).filter((d): d is NonNullable<typeof d> => !!d);
  const teamIds = [...new Set(refs.filter((r) => r.src === 'team').map((r) => r.id))];
  const libIds = [...new Set(refs.filter((r) => r.src === 'lib').map((r) => r.id))];
  const [team, lib] = await Promise.all([
    teamIds.length ? db.from('golf_team_drills').select('name, area, minutes, setup, goal, diagram, scoring, levels').in('id', teamIds) : Promise.resolve({ data: [], error: null }),
    libIds.length ? sb.from('golf_drills').select('title, category, duration_min, description').in('id', libIds) : Promise.resolve({ data: [], error: null }),
  ]);
  if (team.error) drillsUnread('team drills', team.error);
  if (lib.error) drillsUnread('library drills', lib.error);
  return [
    ...(((team.data ?? []) as Array<{ name: string; area: string; minutes: number; setup: string; goal: string; diagram: PrintDrill['diagram']; scoring: PrintDrill['scoring'] | null; levels: { par?: string; birdie?: string; eagle?: string } | null }>).map((d) => ({
      name: d.name,
      line: `${d.area.replace('_', ' ')} · ${d.minutes} min`,
      setup: d.setup,
      goal: d.goal,
      area: d.area,
      diagram: d.diagram,
      scoring: d.scoring ?? [],
      levels: [d.levels?.par ? `Par ${d.levels.par}` : null, d.levels?.birdie ? `Birdie ${d.levels.birdie}` : null, d.levels?.eagle ? `Eagle ${d.levels.eagle}` : null].filter(Boolean).join('  ') || null,
    }))),
    ...(((lib.data ?? []) as Array<{ title: string; category: string | null; duration_min: number | null; description: string | null }>).map((d) => ({ name: d.title, line: [d.category?.replace('_', ' '), d.duration_min ? `${d.duration_min} min` : null].filter(Boolean).join(' · '), setup: d.description ?? '', goal: '' }))),
  ];
}
